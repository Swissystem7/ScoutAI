'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { loadFbrefDataset, fbrefToSignals } = require('./lib/fbrefAdapter.js');
const { runScan } = require('./lib/scanPipeline.js');

const dataset = loadFbrefDataset(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/fbref_big5_2024-2025.json'), 'utf8')));
const adapted = fbrefToSignals(dataset);
const rank = runScan(adapted.signals, { mode: 'rank' });
const minutes = adapted.signals.map(x => x.minutes).sort((a,b) => a-b);
const medianMinutes = minutes.length % 2 ? minutes[(minutes.length-1)/2] : (minutes[minutes.length/2-1]+minutes[minutes.length/2])/2;
const scoutOpts = { maxMinutes: medianMinutes, maxAge: 23 };
const scout = runScan(adapted.signals, { mode: 'scout', opts: scoutOpts });
const scout15 = scout.outliers.slice(0, 15);

const eligible = adapted.signals.filter(x => x.minutes >= 900).sort((a,b) => b.statMetrics.goalAssistsPer90-a.statMetrics.goalAssistsPer90 || a.id.localeCompare(b.id));
const topProduction = eligible.slice(0, 10);
const ranks = new Map(rank.board.map(x => [x.id, x.rank]));
const topBand = Math.ceil(rank.board.length * .15);
assert(topProduction.every(x => ranks.get(x.id) <= topBand), 'top G+A/90 players must rank in top 15%');
assert(scout15.length === 15 && scout15.every(x => x.minutes < medianMinutes), 'scout outliers must be below median minutes');
assert.deepStrictEqual(runScan(adapted.signals, { mode:'rank' }), rank, 'rank determinism');
assert.deepStrictEqual(runScan(adapted.signals, { mode:'scout', opts:scoutOpts }), scout, 'scout determinism');

console.log(`FBref Big 5 2024/25: input=${adapted.report.input}; kept=${adapted.report.kept}; skipped=${adapted.report.skipped}; minMinutes=${adapted.report.minimumMinutes}; medianMinutes=${medianMinutes}`);
console.log('Columns used: ' + adapted.report.usedColumns.join(', '));
console.log('Unavailable in source: ' + adapted.report.unavailableColumns.join(', '));
console.log('\nRANK TOP 20');
rank.board.slice(0,20).forEach(p => console.log(`#${p.rank} ${p.name} | ${p.league} | age ${p.age} | ${p.minutes} min | G+A/90 ${p.statMetrics.goalAssistsPer90} | ${p.index}`));
console.log('\nSCOUT TOP 15 (below median minutes)');
scout15.forEach(p => console.log(`#${p.scoutRank} ${p.name} | age ${p.age} | ${p.league} | ${p.minutes} min | G/90 ${p.statMetrics.goalsPer90} A/90 ${p.statMetrics.assistsPer90} | ${p.index}`));
console.log(`SANITY OK: top production within rank ${topBand}; scout below ${medianMinutes} median minutes; deterministic`);

module.exports = { adapted, rank, scout, medianMinutes };
