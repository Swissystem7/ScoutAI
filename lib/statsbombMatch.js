'use strict';

/** Aggregate measured StatsBomb events into one deterministic row per player. */
function aggregatePlayers(events) {
  if (!Array.isArray(events)) throw new TypeError('events must be a StatsBomb events array');
  const rows = new Map();
  const starts = new Map();
  const ends = new Map();
  let matchEnd = 90;

  const ensure = (name, team) => {
    if (typeof name !== 'string' || !name.trim()) return null;
    if (!rows.has(name)) rows.set(name, { name, team: team || 'unknown', passesCompleted: 0, keyPasses: 0, shots: 0, goals: 0, dribbles: 0, duelsWon: 0, defensiveActions: 0, pressures: 0, minutesProxy: 0, _tackles: 0, _interceptions: 0, _shotXg: 0 });
    return rows.get(name);
  };

  for (const event of events) {
    if (!event || typeof event !== 'object') throw new TypeError('every event must be an object');
    const minute = finite(event.minute) ? event.minute : 0;
    matchEnd = Math.max(matchEnd, minute);
    if (event.type && event.type.name === 'Starting XI' && event.tactics && Array.isArray(event.tactics.lineup)) {
      for (const slot of event.tactics.lineup) {
        const name = slot && slot.player && slot.player.name;
        if (ensure(name, event.team && event.team.name)) starts.set(name, 0);
      }
    }
    if (event.type && event.type.name === 'Substitution') {
      const off = event.player && event.player.name;
      const on = event.substitution && event.substitution.replacement && event.substitution.replacement.name;
      if (ensure(off, event.team && event.team.name)) ends.set(off, minute);
      if (ensure(on, event.team && event.team.name)) starts.set(on, minute);
    }
    const name = event.player && event.player.name;
    const row = ensure(name, event.team && event.team.name);
    if (!row) continue;
    const type = event.type && event.type.name;
    if (type === 'Pass') {
      if (!(event.pass && event.pass.outcome)) row.passesCompleted++;
      if (event.pass && (event.pass.shot_assist || event.pass.goal_assist)) row.keyPasses++;
    } else if (type === 'Shot') {
      row.shots++;
      row._shotXg += finite(event.shot && event.shot.statsbomb_xg) ? event.shot.statsbomb_xg : 0;
      if (event.shot && event.shot.outcome && event.shot.outcome.name === 'Goal') row.goals++;
    } else if (type === 'Dribble') {
      if (!event.dribble || !event.dribble.outcome || event.dribble.outcome.name === 'Complete') row.dribbles++;
    } else if (type === 'Duel') {
      const outcome = event.duel && event.duel.outcome && event.duel.outcome.name;
      if (/won|success/i.test(outcome || '')) row.duelsWon++;
      if (event.duel && event.duel.type && event.duel.type.name === 'Tackle' && /won|success/i.test(outcome || '')) { row.defensiveActions++; row._tackles++; }
    } else if (type === 'Ball Recovery') row.defensiveActions++;
    else if (type === 'Interception') { row.defensiveActions++; row._interceptions++; }
    else if (type === 'Block') row.defensiveActions++;
    else if (type === 'Pressure') row.pressures++;
  }
  for (const [name, row] of rows) row.minutesProxy = Math.max(1, (ends.get(name) ?? matchEnd) - (starts.get(name) ?? 0));
  return [...rows.values()].sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)).map(publicRow);
}

function toPlayerSignals(aggregated, options) {
  if (!Array.isArray(aggregated)) throw new TypeError('aggregated must be an array');
  const strength = options && options.leagueStrength;
  if (!finite(strength) || strength < 0.3 || strength > 1) throw new RangeError('leagueStrength must be in [0.3,1]');
  return aggregated.map((r, i) => {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) throw new TypeError('aggregated row ' + i + ' requires name');
    const mins = Math.max(1, Number(r.minutesProxy) || 1);
    const per90 = value => (Number(value) || 0) * 90 / mins;
    return { id: 'statsbomb-' + i, name: r.name, league: r.team || 'StatsBomb match', leagueStrength: strength, source: 'stats', minutes: mins,
      statMetrics: { ...r, G: r.goals || 0, pressures90: per90(r.pressures), tackles: r.tackles || 0, interceptions: r.interceptions || 0, sca90: per90((r.keyPasses || 0) + (r.shots || 0)), gca90: per90(r.goals || 0), npxG: r.shotXg || 0, npxG90: per90(r.shotXg || 0), progPasses: r.keyPasses || 0, progCarries: r.dribbles || 0, carriesIntoBox90: per90(r.dribbles || 0) } };
  });
}

function publicRow(r) { return { name: r.name, team: r.team, passesCompleted: r.passesCompleted, keyPasses: r.keyPasses, shots: r.shots, goals: r.goals, dribbles: r.dribbles, duelsWon: r.duelsWon, defensiveActions: r.defensiveActions, pressures: r.pressures, minutesProxy: r.minutesProxy, tackles: r._tackles, interceptions: r._interceptions, shotXg: round(r._shotXg) }; }
function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
function round(x) { return Math.round(x * 10000) / 10000; }

module.exports = { aggregatePlayers, toPlayerSignals };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const events = [
    { minute: 0, type: { name: 'Starting XI' }, team: { name: 'A' }, tactics: { lineup: [{ player: { name: 'P1' } }] } },
    { minute: 3, type: { name: 'Pass' }, team: { name: 'A' }, player: { name: 'P1' }, pass: { shot_assist: true } },
    { minute: 4, type: { name: 'Shot' }, team: { name: 'A' }, player: { name: 'P1' }, shot: { outcome: { name: 'Goal' }, statsbomb_xg: 0.4 } },
    { minute: 60, type: { name: 'Substitution' }, team: { name: 'A' }, player: { name: 'P1' }, substitution: { replacement: { name: 'P2' } } },
    { minute: 92, type: { name: 'Pressure' }, team: { name: 'A' }, player: { name: 'P2' } }
  ];
  const a = aggregatePlayers(events);
  assert.deepStrictEqual(a, aggregatePlayers(events), 'deterministic');
  assert.strictEqual(a.find(x => x.name === 'P1').minutesProxy, 60);
  assert.strictEqual(a.find(x => x.name === 'P2').minutesProxy, 32);
  assert.strictEqual(a.find(x => x.name === 'P1').goals, 1);
  assert.strictEqual(toPlayerSignals(a, { leagueStrength: 1 }).length, 2);
  assert.throws(() => aggregatePlayers({}), TypeError);
  console.log('OK aggregatePlayers + toPlayerSignals; deterministic; lineup/sub minutes covered');
}
