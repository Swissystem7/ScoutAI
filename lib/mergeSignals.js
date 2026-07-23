'use strict';

const { toSeasonSignals } = require('./seasonAggregate.js');
const { loadXtDataset, xtToSignals } = require('./xtAdapter.js');

/** Normalize only typography: accents, whitespace and case; never identity-specific aliases. */
function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mergePlayerSignals(eventAgg, xtDataset, opts = {}) {
  if (!Array.isArray(eventAgg)) throw new TypeError('eventAgg must be an array');
  const xt = loadXtDataset(xtDataset);
  const eventSignals = toSeasonSignals(eventAgg, { leagueStrength: Number.isFinite(opts.leagueStrength) ? opts.leagueStrength : 1 });
  const xtSignals = xtToSignals(xt, opts);
  const eventScores = componentScores(eventAgg);
  const exact = new Map(eventSignals.map(s => [s.name, s]));
  const normalized = new Map();
  for (const signal of eventSignals) {
    const key = normalizeName(signal.name);
    if (!normalized.has(key)) normalized.set(key, signal);
  }
  const matchedEvent = new Set();
  const signals = xtSignals.map(x => {
    const event = exact.get(x.name) || normalized.get(normalizeName(x.name));
    if (!event) return { ...x, provenance: { event: false, actionValue: true }, missingSignals: ['event'] };
    matchedEvent.add(event.name);
    const components = eventScores.get(event.name);
    // Tournament composite: realized attacking impact is load-bearing, while xT,
    // defensive work and progression retain substantial measured shares.
    const composite = round(x.statMetrics.actionValueScore * .2 + components.goalsXg * .5 + components.defensive * .15 + components.other * .15);
    return {
      ...event, id: x.id, name: x.name, minutes: event.sampleMinutes,
      statMetrics: { ...event.statMetrics, ...x.statMetrics, xtActionValueScore: x.statMetrics.actionValueScore, actionValueScore: composite, compositeComponents: components },
      provenance: { event: true, actionValue: true }, missingSignals: []
    };
  });
  for (const event of eventSignals) if (!matchedEvent.has(event.name)) signals.push({ ...event, provenance: { event: true, actionValue: false }, missingSignals: ['actionValue'] });
  return { signals, report: { matched: matchedEvent.size, unmatchedXt: xtSignals.length - matchedEvent.size, unmatchedEvent: eventSignals.length - matchedEvent.size, xtPlayers: xtSignals.length, eventPlayers: eventSignals.length } };
}

function componentScores(rows) {
  const raw = rows.map(r => ({ name: r.name,
    goalsXg: (r.goals || 0) * 5 + (r.assists || 0) * 3 + (r.shotXgSum || 0) * 2 + (r.keyPasses || 0) * .35,
    defensive: (r.defensiveActions || 0) + (r.duelsWon || 0) * .5 + (r.pressures || 0) * .15,
    other: (r.progressiveActions || 0) + (r.boxTouches || 0) * .25 + (r.dribbles || 0) * .5
  }));
  const keys = ['goalsXg', 'defensive', 'other'];
  const ranks = Object.fromEntries(keys.map(k => [k, percentileMap(raw.map(x => x[k]))]));
  return new Map(raw.map(x => [x.name, Object.fromEntries(keys.map(k => [k, round(ranks[k].get(x[k]))]))]));
}
function percentileMap(values) {
  const sorted = values.slice().sort((a,b) => a-b), out = new Map();
  for (let i=0;i<sorted.length;) { let j=i+1; while(j<sorted.length && sorted[j]===sorted[i]) j++; out.set(sorted[i], sorted.length===1 ? 100 : ((i+j-1)/2)/(sorted.length-1)*100); i=j; }
  return out;
}
function round(n) { return Math.round(n * 100) / 100; }

module.exports = { mergePlayerSignals, normalizeName };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const events = [{ name: 'José  Silva', team: 'T', matchesPlayed: 1, totalMinutesProxy: 90, goals: 1, per90: { goalsPer90: 1 } }, { name: 'Only Event', team: 'T', matchesPlayed: 1, totalMinutesProxy: 90, per90: {} }];
  const xt = { source: 'test xT', competitionId: 1, seasonId: 1, games: 1, totalActions: 1, playerCount: 2, measured: true, players: [
    { playerId: 1, name: 'Jose Silva', teamId: 1, minutes: 90, xtTotal: 1, xtActions: 1, xtPerAction: 1, xtPer90: 1 },
    { playerId: 2, name: 'Only xT', teamId: 2, minutes: 20, xtTotal: 0, xtActions: 0, xtPerAction: 0, xtPer90: 0 }
  ] };
  const out = mergePlayerSignals(events, xt);
  assert.deepStrictEqual(out.report, { matched: 1, unmatchedXt: 1, unmatchedEvent: 1, xtPlayers: 2, eventPlayers: 2 });
  assert(out.signals.find(x => x.name === 'Jose Silva').statMetrics.goals === 1);
  assert.deepStrictEqual(mergePlayerSignals(events, xt), out);
  console.log('OK mergePlayerSignals; exact+accent/whitespace normalization; missing signals retained; deterministic');
}
