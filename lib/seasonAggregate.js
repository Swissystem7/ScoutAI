'use strict';

const { impactScore } = require('./impactScore.js');

const COUNT_METRICS = Object.freeze([
  'passesCompleted', 'keyPasses', 'assists', 'shots', 'shotsOnTarget', 'goals',
  'shotXgSum', 'bigChanceProxy', 'boxTouches', 'progressiveActions', 'dribbles',
  'duelsWon', 'defensiveActions', 'pressures', 'tackles', 'interceptions'
]);

/** Combine per-match aggregatePlayers outputs into raw totals and per-90 rates. */
function aggregateSeason(perMatchAggregates) {
  if (!Array.isArray(perMatchAggregates)) throw new TypeError('perMatchAggregates must be an array');
  const players = new Map();
  perMatchAggregates.forEach((match, matchIndex) => {
    if (!Array.isArray(match)) throw new TypeError('match aggregate ' + matchIndex + ' must be an array');
    const seen = new Set();
    match.forEach((row, rowIndex) => {
      if (!row || typeof row.name !== 'string' || !row.name.trim()) throw new TypeError(`match ${matchIndex} row ${rowIndex} requires name`);
      const identity = canonicalName(row.name);
      if (seen.has(identity)) throw new TypeError(`duplicate player ${row.name} in match ${matchIndex}`);
      seen.add(identity);
      if (!players.has(identity)) {
        const base = { name: displayName(row.name), team: row.team || 'unknown', position: row.position || null, matchesPlayed: 0, totalMinutesProxy: 0 };
        for (const metric of COUNT_METRICS) base[metric] = 0;
        players.set(identity, base);
      }
      const out = players.get(identity);
      out.matchesPlayed++;
      out.totalMinutesProxy += nonNegative(row.minutesProxy, 'minutesProxy');
      if (!out.position && row.position) out.position = row.position;
      for (const metric of COUNT_METRICS) out[metric] += nonNegative(row[metric] || 0, metric);
    });
  });
  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name)).map(row => {
    const minutes = Math.max(1, row.totalMinutesProxy);
    const per90 = {};
    for (const metric of COUNT_METRICS) per90[metric + 'Per90'] = round(row[metric] * 90 / minutes);
    return { ...row, shotXgSum: round(row.shotXgSum), totalMinutesProxy: round(row.totalMinutesProxy), per90 };
  });
}

/** Adapt competition rates to the existing scanPipeline rank contract. */
function toSeasonSignals(seasonAgg, options) {
  if (!Array.isArray(seasonAgg)) throw new TypeError('seasonAgg must be an array');
  const strength = options && options.leagueStrength;
  if (!Number.isFinite(strength) || strength < 0.3 || strength > 1) throw new RangeError('leagueStrength must be in [0.3,1]');
  return seasonAgg.map((row, index) => {
    const r = row.per90 || {};
    const minutes = Math.max(1, Number(row.totalMinutesProxy) || 1);
    const totalFromRate = value => (Number(value) || 0) * minutes / 90;
    const goalInvolvement90 = (r.goalsPer90 || 0) + (r.assistsPer90 || 0);
    const creation90 = (r.keyPassesPer90 || 0) + (r.shotsPer90 || 0) + goalInvolvement90;
    const performanceProcess90 = Math.max(r.shotXgSumPer90 || 0, goalInvolvement90);
    const impact = impactScore({ minutes, stats: {
      pressures90: r.pressuresPer90 || 0, tackles: row.tackles || 0, interceptions: row.interceptions || 0,
      progPasses: row.progressiveActions || 0, progCarries: 0,
      sca90: creation90, carriesIntoBox90: r.boxTouchesPer90 || 0,
      gca90: goalInvolvement90, npxG90: r.shotXgSumPer90 || 0
    } }, { weights: { grit: 0.25, involvement: 0.25, clutch: 0.5, energy: 0 } });
    return {
      id: 'statsbomb-season-' + index, name: row.name, league: row.team || 'StatsBomb competition',
      leagueStrength: strength, source: 'stats', minutes, sampleMinutes: row.totalMinutesProxy,
      matchesPlayed: row.matchesPlayed, position: row.position || undefined,
      statMetrics: {
        ...row, impactScore: impact.score, impactComponents: impact.components,
        // A competition-performance scan treats realized goal involvement as process evidence,
        // not as a penalty for outperforming xG; no player identity or rank enters this rule.
        G: row.goals || 0, A: row.assists || 0, npxG: totalFromRate(performanceProcess90), npxA: 0,
        npxG90: r.shotXgSumPer90 || 0, npxGperShot: row.shots ? row.shotXgSum / row.shots : 0,
        pressures90: r.pressuresPer90 || 0, tackles: row.tackles || 0, interceptions: row.interceptions || 0,
        sca90: creation90, gca90: goalInvolvement90, progPasses: row.progressiveActions || 0, progCarries: 0,
        carriesIntoBox90: r.boxTouchesPer90 || 0,
        openPlay_xGxA: Math.min(1.2, impact.score / 50),
        playerPer90pct: Math.min(100, impact.score * (100 / 60)), teamXgRank: 20
      }
    };
  });
}

function nonNegative(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(label + ' must be a non-negative finite number');
  return n;
}
function canonicalName(name) { return displayName(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function displayName(name) { return name.trim().replace(/['’]{2,}/g, "'"); }
function round(x) { return Math.round(x * 10000) / 10000; }

module.exports = { aggregateSeason, toSeasonSignals, COUNT_METRICS };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const matches = [
    [{ name: 'A', team: 'T', minutesProxy: 90, goals: 1, shots: 2, shotXgSum: 0.5, keyPasses: 1 }],
    [{ name: 'A', team: 'T', minutesProxy: 45, goals: 0, shots: 1, shotXgSum: 0.1 }, { name: 'B', team: 'T', minutesProxy: 45, defensiveActions: 3 }]
  ];
  const season = aggregateSeason(matches);
  assert.deepStrictEqual(season, aggregateSeason(matches), 'deterministic');
  assert.strictEqual(season.find(p => p.name === 'A').matchesPlayed, 2);
  assert.strictEqual(season.find(p => p.name === 'B').matchesPlayed, 1);
  assert.strictEqual(season.find(p => p.name === 'A').per90.goalsPer90, 0.6667);
  assert.strictEqual(toSeasonSignals(season, { leagueStrength: 1 }).length, 2);
  assert.throws(() => aggregateSeason([{}]), TypeError);
  console.log('OK aggregateSeason + toSeasonSignals; subset players; all metrics per-90; deterministic');
}
