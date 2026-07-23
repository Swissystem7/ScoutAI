'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { aggregatePlayers } = require('./lib/statsbombMatch.js');
const { aggregateSeason } = require('./lib/seasonAggregate.js');
const { mergePlayerSignals } = require('./lib/mergeSignals.js');
const { runScan } = require('./lib/scanPipeline.js');

const CACHE = path.join(__dirname, 'data', 'wc2018_event_aggregates.json');
const MATCHES_URL = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/43/3.json';

async function loadEventAggregates() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const matches = await getJson(MATCHES_URL);
  const ids = matches.map(m => m.match_id).sort((a, b) => a - b);
  const perMatch = [];
  for (let i = 0; i < ids.length; i++) {
    process.stderr.write(`fetch ${i + 1}/${ids.length}\r`);
    perMatch.push(aggregatePlayers(await getJson(`https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/${ids[i]}.json`)));
  }
  const cache = { source: 'StatsBomb Open Data', competitionId: 43, seasonId: 3, games: ids.length, matchIds: ids, measured: true, players: aggregateSeason(perMatch) };
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
  return cache;
}
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
function breakdown(row) {
  const m = row.statMetrics || {}, c = m.compositeComponents || {};
  return { xt: m.xtActionValueScore == null ? null : round(m.xtActionValueScore * .2), goalsXg: round((c.goalsXg || 0) * .5), defensive: round((c.defensive || 0) * .15), other: round((c.other || 0) * .15) };
}
function round(n) { return Math.round(n * 100) / 100; }

(async () => {
  const eventData = await loadEventAggregates();
  const xt = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'xt_wc2018.json'), 'utf8'));
  const merged = mergePlayerSignals(eventData.players, xt, { leagueStrength: 1 });
  const ranked = runScan(merged.signals, { mode: 'rank' });
  const again = runScan(merged.signals, { mode: 'rank' });
  const matchedBoard = ranked.board.filter(p => p.provenance && p.provenance.event && p.provenance.actionValue);
  const scorerNames = eventData.players.slice().sort((a,b) => b.goals-a.goals || b.shotXgSum-a.shotXgSum || a.name.localeCompare(b.name)).slice(0,5).map(p=>p.name);
  const ranks = new Map(ranked.board.map(p => [p.name, p.rank]));
  const scorerBands = scorerNames.map(name => ({ name, rank: ranks.get(name) }));
  const scoutInput = merged.signals.map(s => ({ ...s, leagueStrength: s.minutes < 180 ? .6 : 1 }));
  const scoutResult = runScan(scoutInput, { mode: 'scout', opts: { maxLeagueStrength: .65 } });
  const scout = scoutResult.outliers.slice().sort((a,b) => b.index-a.index || a.name.localeCompare(b.name)).slice(0, 5);
  console.log('\nMATCH REPORT', merged.report);
  console.log('\nTOP 20'); ranked.board.slice(0,20).forEach(p => console.log(p.rank, p.name, p.index, breakdown(p)));
  console.log('\nBOTTOM 10'); ranked.board.slice(-10).forEach(p => console.log(p.rank, p.name, p.index));
  console.log('\nHIDDEN GEMS'); scout.forEach(p => console.log(p.scoutRank, p.name, p.index, p.minutes));
  console.log('\nTOP SCORER BANDS', scorerBands);
  assert(merged.report.matched / merged.report.xtPlayers >= .8, '>=80% xT match rate');
  assert(scorerBands.every(x => x.rank && x.rank <= ranked.board.length * .2), 'top five scorers in top 20%');
  assert.deepStrictEqual(ranked, again, 'determinism');
  console.log('\nSANITY OK: match>=80%; top scorers in top 20%; deterministic');
})().catch(e => { console.error(e); process.exitCode = 1; });

module.exports = { loadEventAggregates, breakdown };
