#!/usr/bin/env node
'use strict';
// Real measured data: StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3).
const https = require('node:https');
const { aggregatePlayers } = require('./lib/statsbombMatch.js');
const { aggregateSeason, toSeasonSignals } = require('./lib/seasonAggregate.js');
const { runScan } = require('./lib/scanPipeline.js');

const INDEX_URL = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/43/3.json';
const EVENTS_BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/';
const MATCH_IDS = [7530, 7546, 7563, 7580, 8649, 8655, 8658];
// Offline fallback: real aggregates fetched from the URLs above on 2026-07-22.
// Columns: name, position, matches, minutes, then season totals in FALLBACK_METRICS order.
const FALLBACK_METRICS = ['passesCompleted','keyPasses','assists','shots','shotsOnTarget','goals','shotXgSum','bigChanceProxy','boxTouches','progressiveActions','dribbles','duelsWon','defensiveActions','pressures','tackles','interceptions'];
const FALLBACK_ROWS = [
['Antoine Griezmann','Center Forward',7,580,175,8,2,21,10,4,3.557,4,90,73,9,7,41,172,7,2],['Benjamin Mendy','Left Back',1,44,26,1,0,0,0,0,0,0,0,7,0,0,5,3,0,0],['Benjamin Pavard','Right Back',6,569,261,2,0,4,2,1,.1359,0,6,129,0,5,41,78,5,9],['Blaise Matuidi','Right Center Midfield',5,343,94,3,0,5,1,0,.2992,0,24,31,0,8,38,145,8,7],['Corentin Tolisso','Right Center Midfield',5,211,110,2,1,2,1,0,.2166,0,9,42,1,1,28,55,1,5],['Djibril Sidibé','Right Back',1,93,83,3,0,0,0,0,0,0,2,35,0,0,6,8,0,0],['Florian Thauvin','Right Wing',1,7,1,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0],['Hugo Lloris','Goalkeeper',6,569,85,0,0,0,0,0,0,0,0,142,0,0,24,0,0,0],['Kylian Mbappé Lottin','Right Wing',7,550,123,9,0,8,7,4,1.775,3,86,63,29,4,35,99,4,4],['Lucas Hernández Pi','Left Back',7,618,218,4,2,5,1,0,.2928,0,13,115,6,3,45,127,3,7],['N\'Golo Kanté','Center Defensive Midfield',7,621,313,1,0,1,0,0,.035,0,1,133,5,14,90,183,14,22],['Nabil Fekir','Left Wing',6,97,28,0,0,4,2,0,.0598,0,7,17,5,4,15,32,4,0],['Olivier Giroud','Center Forward',7,566,87,5,1,15,1,0,1.5077,1,127,26,3,4,22,135,4,2],['Ousmane Dembélé','Left Wing',4,174,54,2,0,3,0,0,.0901,0,11,30,7,2,12,40,2,2],['Paul Pogba','Left Center Midfield',6,563,244,9,0,7,2,1,.3594,0,16,161,8,8,50,139,8,5],['Presnel Kimpembe','Left Center Back',1,93,68,0,0,0,0,0,0,0,0,44,0,0,9,5,0,1],['Raphaël Varane','Right Center Back',7,662,289,0,0,4,1,1,.3561,0,11,209,1,1,48,34,1,5],['Samuel Yves Umtiti','Left Center Back',6,569,184,1,0,2,1,1,.0873,0,6,118,2,2,33,34,2,7],['Steve Mandanda','Goalkeeper',1,93,20,0,0,0,0,0,0,0,0,25,0,0,9,0,0,0],['Steven N\'Kemboanza Mike Christopher Nzonzi','Left Center Midfield',5,167,88,1,0,0,0,0,0,0,1,31,0,1,6,13,1,2],['Thomas Lemar','Left Wing',1,93,49,2,0,1,0,0,.0266,0,2,19,3,0,4,10,0,0]
];

function fetchJson(url) {
  return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'ScoutAI-tournament-proof' } }, res => {
    if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
    let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  }).on('error', reject));
}

async function run(teamName = 'France', loader = fetchJson) {
  let matches, season, acquisition = 'fetched live';
  try {
    matches = (await loader(INDEX_URL)).filter(m => m.home_team.home_team_name === teamName || m.away_team.away_team_name === teamName).sort((a, b) => a.match_date.localeCompare(b.match_date) || a.match_id - b.match_id);
    if (!matches.length) throw new Error('No World Cup 2018 matches found for ' + teamName);
    const aggregates = [];
    for (const match of matches) {
      const events = await loader(EVENTS_BASE + match.match_id + '.json');
      aggregates.push(aggregatePlayers(events).filter(row => row.team === teamName));
    }
    season = aggregateSeason(aggregates);
  } catch (error) {
    if (teamName !== 'France') throw error;
    matches = MATCH_IDS.map(match_id => ({ match_id }));
    season = fallbackSeason();
    acquisition = 'offline fallback (real cited aggregates)';
    console.warn('Network unavailable; using cited real StatsBomb aggregates:', error.message);
  }
  const ranked = runScan(toSeasonSignals(season, { leagueStrength: 1 }), { mode: 'rank' });
  const byName = new Map(season.map(p => [p.name, p]));
  const topScorers = season.slice().sort((a, b) => b.goals - a.goals || b.shotXgSum - a.shotXgSum || a.name.localeCompare(b.name)).slice(0, 3);
  const topThird = Math.ceil(ranked.board.length / 3);
  const scorerRanks = topScorers.map(s => ({ name: s.name, goals: s.goals, rank: ranked.board.find(p => p.name === s.name).rank }));
  const forwards = ranked.board.filter(p => /Forward|Wing|Striker/i.test(byName.get(p.name).position || ''));
  const defendersKeepers = ranked.board.filter(p => /Back|Defen|Goalkeeper/i.test(byName.get(p.name).position || ''));
  const assertions = {
    topScorersTopThird: scorerRanks.every(x => x.rank <= topThird),
    forwardNotSwept: forwards.length > 0 && defendersKeepers.length > 0 && Math.min(...forwards.map(p => p.rank)) < Math.min(...defendersKeepers.map(p => p.rank)),
    deterministic: JSON.stringify(ranked) === JSON.stringify(runScan(toSeasonSignals(season, { leagueStrength: 1 }), { mode: 'rank' }))
  };
  assertions.holds = assertions.topScorersTopThird && assertions.forwardNotSwept && assertions.deterministic;

  console.log(`מסע טורניר מלא: ${teamName} · מונדיאל 2018 · ${matches.length} משחקים · StatsBomb Open Data · ${acquisition}`);
  console.log('משחקים:', matches.map(m => m.match_id).join(', '));
  console.log('דירוג | שחקן | ציון | משחקים | דקות | שערים/90 | xG/90');
  ranked.board.forEach(p => { const s = byName.get(p.name); console.log(`${p.rank}. ${p.name} | ${p.index} | ${s.matchesPlayed} | ${s.totalMinutesProxy} | ${s.per90.goalsPer90} | ${s.per90.shotXgSumPer90}`); });
  console.log('TOP 8:', ranked.board.slice(0, 8).map(p => `${p.rank}. ${p.name} (${p.index})`).join(' | '));
  console.log('מלכי השערים:', scorerRanks.map(x => `${x.name}: ${x.goals} שערים, #${x.rank}`).join(' | '));
  console.log('בדיקות שפיות:', JSON.stringify(assertions));
  console.log('הערת כנות: דירוג per-90 על פני טורניר מלא יציב משמעותית מדירוג משחק בודד, אך עונה מלאה היא מדגם טוב עוד יותר.');
  return { teamName, matches, season, ranked, topScorers: scorerRanks, assertions, acquisition };
}

function fallbackSeason() {
  return FALLBACK_ROWS.map(values => {
    const row = { name: values[0], team: 'France', position: values[1], matchesPlayed: values[2], totalMinutesProxy: values[3] };
    FALLBACK_METRICS.forEach((metric, i) => row[metric] = values[i + 4]);
    row.per90 = {}; FALLBACK_METRICS.forEach(metric => row.per90[metric + 'Per90'] = Math.round(row[metric] * 90 / row.totalMinutesProxy * 10000) / 10000);
    return row;
  });
}

if (require.main === module) run(process.argv[2] || 'France').then(x => { if (!x.assertions.holds) process.exitCode = 1; }).catch(e => { console.error(e.stack || e); process.exitCode = 1; });
module.exports = { run, fetchJson, fallbackSeason, INDEX_URL, EVENTS_BASE, MATCH_IDS };
