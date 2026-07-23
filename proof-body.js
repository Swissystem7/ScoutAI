'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { bodyToVideoSignals, loadBodyDataset } = require('./lib/bodyLanguageAdapter.js');
const { runScan } = require('./lib/scanPipeline.js');

const dataset = loadBodyDataset(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/body_v2_SNMOT-116.json'), 'utf8')));
const body = bodyToVideoSignals(dataset);
const stats = [
  { name: 'Track 6', statScore: 61.0 },
  { name: 'Track 7', statScore: 63.0 },
  { name: 'Track 8', statScore: 60.5 },
];
const withoutBody = stats.map((p, i) => ({
  id: 'track-' + body[i].trackId,
  name: p.name,
  source: 'stats',
  statScore: p.statScore,
  statMetrics: { actionValueScore: p.statScore, actionValueProvenance: { measured: true, source: 'demo measured event channel' } },
}));
const withBody = withoutBody.map((p, i) => ({ ...p, videoSignals: body[i].videoSignals }));
const plain = runScan(withoutBody, { mode: 'rank' });
const layered = runScan(withBody, { mode: 'rank' });
const plainById = new Map(plain.board.map(p => [p.id, p]));

console.log('Body language comparison (measured geometry; scanning unvalidated and score=0)');
for (const p of layered.board) {
  console.log(`${p.name}: without=${plainById.get(p.id).index.toFixed(2)} with=${p.index.toFixed(2)} body=${p.contributions.bodyLanguage.value.toFixed(2)} scanningContribution=${p.contributions.scanning.contribution}`);
}

assert(layered.board.every(p => p.contributions.scanning.contribution === 0), 'scanning must contribute exactly zero');
assert(plain.board.every(p => !p.contributions.bodyLanguage && (!p.contributions.scanning.contribution || p.contributions.scanning.contribution === 0)));
assert.notDeepStrictEqual(layered.board.map(p => p.id), plain.board.map(p => p.id), 'body layer must change at least one rank');
layered.board.forEach(p => {
  const primary = plainById.get(p.id).index;
  assert(Math.abs(p.index - (primary * 0.88 + p.contributions.bodyLanguage.value * 0.12)) < 0.02);
  assert(p.contributions.bodyLanguage.weight <= 0.12);
});
assert.deepStrictEqual(runScan(withBody, { mode: 'rank' }), layered, 'determinism');
console.log('ASSERTIONS_OK scanning=0; rankingChanged=true; statFloor=88%; deterministic=true');
