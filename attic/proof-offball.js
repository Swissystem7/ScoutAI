'use strict';

const assert = require('node:assert');
const dataset = require('./data/offball_scale.json');
const { offBallToSignals } = require('./lib/offBallAdapter.js');
const { runScan } = require('./lib/scanPipeline.js');

const signals = offBallToSignals(dataset);
const top = signals.slice().sort((a, b) =>
  b.offBallSignals.offBallZ - a.offBallSignals.offBallZ ||
  String(a.sequence).localeCompare(String(b.sequence)) ||
  String(a.trackId).localeCompare(String(b.trackId))
).slice(0, 10);

console.log('TOP 10 WITHIN-SEQUENCE OFF-BALL Z');
top.forEach((p, i) => console.log(
  `${i + 1}. ${p.sequence} track ${p.jersey || p.trackId} | ${p.action} | offBallZ=${p.offBallSignals.offBallZ.toFixed(4)} closingZ=${p.offBallSignals.closingZ.toFixed(4)}`
));

const selected = [top[0], top[1], signals.slice().sort((a, b) => a.offBallSignals.offBallZ - b.offBallSignals.offBallZ)[0]];
const base = selected.map((p, i) => ({
  id: `demo-${i}`, name: `${p.sequence} track ${p.jersey || p.trackId}`,
  source: 'stats', statScore: 60 + i * 0.25, momentum: 50, leagueStrength: 0.8,
}));
const enriched = base.map((p, i) => ({ ...p, offBallSignals: selected[i].offBallSignals }));
const without = runScan(base, { mode: 'rank' });
const withChannel = runScan(enriched, { mode: 'rank' });
const before = new Map(without.board.map(p => [p.id, p]));

console.log('\nWITH / WITHOUT OFF-BALL');
withChannel.board.forEach(p => {
  const old = before.get(p.id);
  console.log(`${p.name}: ${old.index.toFixed(2)} -> ${p.index.toFixed(2)} (rank ${old.rank} -> ${p.rank}; stat=${p.measuredValue.toFixed(2)})`);
  assert.strictEqual(p.contributions.offBall.persistence.contribution, 0);
  assert(p.contributions.stat.value >= 0, 'stat floor remains present');
});

const groups = new Map();
signals.forEach(p => {
  if (!groups.has(p.sequence)) groups.set(p.sequence, []);
  groups.get(p.sequence).push(p);
});
for (const [sequence, rows] of groups) {
  if (rows.length < 8) continue;
  for (const key of ['offBallZ', 'closingZ']) {
    const values = rows.map(p => p.offBallSignals[key]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length);
    assert(Math.abs(mean) < 1e-9, `${sequence} ${key} mean`);
    assert(Math.abs(sd - 1) < 1e-9 || values.every(x => x === 0), `${sequence} ${key} sd`);
  }
}
assert(withChannel.board.some(p => p.rank !== before.get(p.id).rank), 'off-ball channel changes ranking');
assert.deepStrictEqual(runScan(enriched, { mode: 'rank' }), withChannel, 'determinism');
console.log(`\nASSERTIONS OK: persistence=0; z mean≈0/std≈1 across ${groups.size} sequences; ranking changed; stat floor held; deterministic`);

module.exports = { signals, top };
