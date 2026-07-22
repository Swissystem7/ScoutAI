#!/usr/bin/env node
'use strict';
// Real measured event data: StatsBomb Open Data, 2018 World Cup final, match 8658.
// Source: https://github.com/statsbomb/open-data/blob/master/data/events/8658.json
const https = require('node:https');
const { aggregatePlayers, toPlayerSignals } = require('./lib/statsbombMatch.js');
const { runScan } = require('./lib/scanPipeline.js');

const MATCH = { id: 8658, teams: 'France 4–2 Croatia', standout: 'Antoine Griezmann', source: 'https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/8658.json' };

function fetchJson(url) { return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'ScoutAI-real-match-proof' } }, res => { if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode)); let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } }); }).on('error', reject)); }

async function run(events) {
  const raw = events || await fetchJson(MATCH.source);
  const aggregated = aggregatePlayers(raw);
  const result = runScan(toPlayerSignals(aggregated, { leagueStrength: 1 }), { mode: 'rank' });
  const standout = result.board.find(p => p.name === MATCH.standout);
  const quartileLimit = Math.ceil(result.board.length / 4);
  const holds = !!standout && standout.rank <= quartileLimit;
  console.log(`משחק אמיתי מלא: ${MATCH.teams} | StatsBomb match ${MATCH.id}`);
  console.log('דאטת אירועים מדידה בלבד; רכיב intangible הוא משני/ללא קלט וידאו.');
  console.log('דירוג | שחקן | קבוצה | ציון | תרומת סטט מדידה | תרומה משוערת');
  for (const p of result.board) console.log(`${p.rank}. ${p.name} | ${p.league} | ${p.index} | ${p.contributions.stat.contribution} | ${p.contributions.intangible.contribution}`);
  console.log(`טענה ניתנת להפרכה: ${MATCH.standout} בטופ רבעון (${standout ? standout.rank : 'לא נמצא'} <= ${quartileLimit}) — ${holds ? 'עברה' : 'נכשלה'}`);
  return { match: MATCH, aggregated, result, assertion: { holds, rank: standout && standout.rank, quartileLimit } };
}

if (require.main === module) run().then(x => { if (!x.assertion.holds) process.exitCode = 1; }).catch(e => { console.error(e.stack || e); process.exitCode = 1; });
module.exports = { run, MATCH };
