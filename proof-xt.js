'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadXtDataset, xtToSignals } = require('./lib/xtAdapter.js');
const { runScan } = require('./lib/scanPipeline.js');

const file = path.join(__dirname, 'data', 'xt_wc2018.json');
const dataset = loadXtDataset(fs.readFileSync(file, 'utf8'));
const signals = xtToSignals(dataset);
const result = runScan(signals, { mode: 'rank' });
const measuredCount = result.board.filter(p => p.contributions.actionValue && p.contributions.actionValue.tag === 'measured').length;

function print(rows) {
  rows.forEach(p => console.log(`${p.rank}. ${p.name} | ציון ${p.index.toFixed(2)} | xT ${p.contributions.actionValue.value.toFixed(2)} | נמדד`));
}
console.log(`סריקת xT מלאה: ${result.total} שחקנים | בעלי ערך פעולה נמדד: ${measuredCount}`);
console.log('\n20 המובילים'); print(result.board.slice(0, 20));
console.log('\n10 האחרונים'); print(result.board.slice(-10));

const rawTopIds = dataset.players.slice().sort((a, b) => b.xtTotal - a.xtTotal || a.playerId - b.playerId).slice(0, 10).map(p => 'xt-' + p.playerId);
const ranks = new Map(result.board.map(p => [p.id, p.rank]));
const cutoff = Math.ceil(result.total * 0.15);
const failures = rawTopIds.filter(id => ranks.get(id) > cutoff);
const holds = failures.length === 0 && measuredCount === dataset.playerCount;
console.log(`\nASSERT: raw top-10 xT בתוך 15% העליונים (<=${cutoff}): ${holds ? 'PASS' : 'FAIL'}`);
if (!holds) process.exitCode = 1;

module.exports = { dataset, signals, result, holds };
