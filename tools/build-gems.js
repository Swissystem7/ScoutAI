#!/usr/bin/env node
'use strict';

// Builds data/wc2018_gems_matches.json: one row per player per match with the
// counts the «שוברים את הסטטיסטיקה» lab (gems/) needs:
//   - physical / aerial / duel events (aerials won and lost, tackles, 50/50,
//     clearances, blocks, shielding, fouls won, headed-shot xG),
//   - technical / decision events (open-play passes into the box, progressive
//     passes and carries, receptions between the lines (location proxy),
//     passes completed under pressure, counter-press, interceptions, ball
//     recoveries, completed dribbles, key passes, xA, non-headed shot xG),
//   - hold-out outcomes (xGChain, xGBuildup, non-penalty xG + xA),
//   - minutes, position and the main lab's Impact inputs, reused from
//     tools/build-mentality.js so both labs count minutes the same way.
//
// Source: StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3)
// https://github.com/hudl/open-data — research and public sharing with
// credit; commercial use prohibited (LICENSE.pdf, section 1.2.2).
//
// Usage: node tools/build-gems.js [cacheDir]
// Events are downloaded once into cacheDir (default: $TMPDIR/scoutai-sb-cache).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { aggregateMatch } = require('./build-mentality.js');

const BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';
const COMPETITION = 43;
const SEASON = 3;
const GOAL = [120, 40];

// Receptions «between the lines»: WC2018 open data has no 360 freeze frames
// outside shots, so this is a location proxy — a successful ball receipt in
// front of the box, inside the width of the box (x 78–102, y 18–62), the zone
// where a receiver usually stands between the opponent's midfield and back line.
const BETWEEN_LINES = Object.freeze({ xMin: 78, xMax: 102, yMin: 18, yMax: 62 });

const INVOLVEMENT_TYPES = new Set(['Pass', 'Carry', 'Ball Receipt*', 'Dribble', 'Shot']);
const TACKLE_WON = /^(Won|Success|Success In Play|Success Out)$/;
const INTERCEPTION_WON = /^(Won|Success In Play|Success Out)$/;
const FIFTY_WON = /^(Won|Success To Team)$/;

const COUNT_FIELDS = Object.freeze([
  // physical / aerial / duel
  'aerialWon', 'aerialLost', 'tacklesWon', 'tacklesLost', 'fiftyWon', 'clearances',
  'blocks', 'shields', 'foulsWon', 'headedShots', 'headedXg',
  // technical / decision
  'passesIntoBox', 'progPasses', 'progCarries', 'receptionsBetweenLines',
  'pressuredPasses', 'pressuredPassesCompleted', 'counterpress', 'interceptionsWon',
  'recoveries', 'dribblesCompleted', 'keyPassesOpen', 'xa', 'footShots', 'footXg',
  // outcomes
  'xgChain', 'xgBuildup', 'npxg'
]);

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
function round(x, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
function isLoc(a) { return Array.isArray(a) && finite(a[0]) && finite(a[1]); }
function inBox(loc) { return isLoc(loc) && loc[0] >= 102 && loc[1] >= 18 && loc[1] <= 62; }
function distToGoal(loc) { return Math.hypot(GOAL[0] - loc[0], GOAL[1] - loc[1]); }

// «Progressive»: the ball ends at least 25% closer to the centre of the goal.
function isProgressive(from, to, minGain) {
  if (!isLoc(from) || !isLoc(to)) return false;
  const d0 = distToGoal(from);
  const d1 = distToGoal(to);
  return d1 <= 0.75 * d0 && d0 - d1 >= (minGain || 0);
}

function betweenLines(loc) {
  return isLoc(loc) && loc[0] >= BETWEEN_LINES.xMin && loc[0] < BETWEEN_LINES.xMax &&
    loc[1] >= BETWEEN_LINES.yMin && loc[1] <= BETWEEN_LINES.yMax;
}

// Open play = no set-piece pass type (Recovery / Interception are open play).
function openPlayPass(ev) {
  const t = ev.pass && ev.pass.type && ev.pass.type.name;
  return !t || t === 'Recovery' || t === 'Interception';
}

function passCompleted(ev) { return !(ev.pass && ev.pass.outcome); }

function isPenalty(ev) { return ev.shot && ev.shot.type && ev.shot.type.name === 'Penalty'; }

function shotXg(ev) { return ev.shot && finite(ev.shot.statsbomb_xg) ? ev.shot.statsbomb_xg : 0; }

function aerialWonOn(ev) {
  return ['pass', 'clearance', 'shot', 'miscontrol'].some(function (k) { return ev[k] && ev[k].aerial_won; });
}

function emptyCounts() {
  const c = {};
  COUNT_FIELDS.forEach(function (f) { c[f] = 0; });
  return c;
}

// Pure function: StatsBomb events of one match -> Map(playerId -> counts).
function gemsCounts(events) {
  const inPlay = events.filter(function (ev) { return ev.period && ev.period <= 4; });
  const byPlayer = new Map();
  function row(ev) {
    const id = ev.player.id;
    if (!byPlayer.has(id)) byPlayer.set(id, emptyCounts());
    return byPlayer.get(id);
  }

  // xA: shot.key_pass_id -> passer (non-penalty shots only).
  const passById = new Map();
  inPlay.forEach(function (ev) { if (ev.type && ev.type.name === 'Pass') passById.set(ev.id, ev); });

  inPlay.forEach(function (ev) {
    if (!ev.player || !ev.type) return;
    const t = ev.type.name;
    const r = row(ev);
    if (ev.counterpress) r.counterpress += 1;
    if (aerialWonOn(ev)) r.aerialWon += 1;
    if (t === 'Duel') {
      const dt = ev.duel && ev.duel.type && ev.duel.type.name;
      const o = ev.duel && ev.duel.outcome && ev.duel.outcome.name;
      if (dt === 'Aerial Lost') r.aerialLost += 1;
      else if (dt === 'Tackle') {
        if (TACKLE_WON.test(o || '')) r.tacklesWon += 1; else r.tacklesLost += 1;
      }
    } else if (t === '50/50') {
      const o = ev['50_50'] && ev['50_50'].outcome && ev['50_50'].outcome.name;
      if (FIFTY_WON.test(o || '')) r.fiftyWon += 1;
    } else if (t === 'Clearance') {
      if (!aerialWonOn(ev)) r.clearances += 1;
    } else if (t === 'Block') r.blocks += 1;
    else if (t === 'Shield') r.shields += 1;
    else if (t === 'Foul Won') r.foulsWon += 1;
    else if (t === 'Interception') {
      const o = ev.interception && ev.interception.outcome && ev.interception.outcome.name;
      if (INTERCEPTION_WON.test(o || '')) r.interceptionsWon += 1;
    } else if (t === 'Ball Recovery') {
      if (!(ev.ball_recovery && ev.ball_recovery.recovery_failure)) r.recoveries += 1;
    } else if (t === 'Dribble') {
      if (ev.dribble && ev.dribble.outcome && ev.dribble.outcome.name === 'Complete') r.dribblesCompleted += 1;
    } else if (t === 'Ball Receipt*') {
      if (!ev.ball_receipt && betweenLines(ev.location)) r.receptionsBetweenLines += 1;
    } else if (t === 'Carry') {
      if (isProgressive(ev.location, ev.carry && ev.carry.end_location, 5)) r.progCarries += 1;
    } else if (t === 'Pass' && openPlayPass(ev)) {
      const done = passCompleted(ev);
      if (ev.under_pressure) {
        r.pressuredPasses += 1;
        if (done) r.pressuredPassesCompleted += 1;
      }
      if (done && !inBox(ev.location) && inBox(ev.pass.end_location)) r.passesIntoBox += 1;
      if (done && isProgressive(ev.location, ev.pass.end_location, 0)) r.progPasses += 1;
      if (ev.pass.shot_assist || ev.pass.goal_assist) r.keyPassesOpen += 1;
    } else if (t === 'Shot' && !isPenalty(ev)) {
      const xg = shotXg(ev);
      const head = ev.shot.body_part && ev.shot.body_part.name === 'Head';
      if (head) { r.headedShots += 1; r.headedXg += xg; } else { r.footShots += 1; r.footXg += xg; }
      r.npxg += xg;
      const kp = ev.shot.key_pass_id && passById.get(ev.shot.key_pass_id);
      if (kp && kp.player) row(kp).xa += xg;
    }
  });

  // xGChain / xGBuildup per possession (non-penalty xG of the possession team).
  const poss = new Map();
  inPlay.forEach(function (ev) {
    if (ev.possession == null || !ev.possession_team || !ev.team) return;
    if (!poss.has(ev.possession)) poss.set(ev.possession, { team: ev.possession_team.name, xg: 0, players: new Map() });
    const p = poss.get(ev.possession);
    const t = ev.type && ev.type.name;
    if (ev.team.name !== p.team) return;
    if (t === 'Shot' && !isPenalty(ev)) p.xg += shotXg(ev);
    if (!ev.player || !INVOLVEMENT_TYPES.has(t)) return;
    if (t === 'Ball Receipt*' && ev.ball_receipt) return;
    const isShotOrKeyPass = t === 'Shot' || (t === 'Pass' && ev.pass && (ev.pass.shot_assist || ev.pass.goal_assist));
    const cur = p.players.get(ev.player.id) || { endOfChain: false };
    if (isShotOrKeyPass) cur.endOfChain = true;
    p.players.set(ev.player.id, cur);
  });
  poss.forEach(function (p) {
    if (!(p.xg > 0)) return;
    p.players.forEach(function (inv, id) {
      if (!byPlayer.has(id)) byPlayer.set(id, emptyCounts());
      const r = byPlayer.get(id);
      r.xgChain += p.xg;
      if (!inv.endOfChain) r.xgBuildup += p.xg;
    });
  });

  byPlayer.forEach(function (r) {
    ['headedXg', 'footXg', 'xa', 'xgChain', 'xgBuildup', 'npxg'].forEach(function (k) { r[k] = round(r[k], 4); });
  });
  return byPlayer;
}

const BASE_FIELDS = Object.freeze([
  'matchId', 'teamMatchNo', 'playerId', 'name', 'team', 'position', 'minutes',
  // the main lab's Impact inputs (same definitions as the aggregate file)
  'pressures', 'tackles', 'interceptions', 'defensiveActions', 'progressiveActions',
  'keyPasses', 'passesCompleted', 'shotXgSum', 'boxTouches', 'shotsOnTarget'
]);

function buildRows(events, meta) {
  const base = aggregateMatch(events, meta);
  const counts = gemsCounts(events);
  return base.map(function (b) {
    const out = {};
    BASE_FIELDS.forEach(function (f) { out[f] = b[f]; });
    const c = counts.get(b.playerId) || emptyCounts();
    COUNT_FIELDS.forEach(function (f) { out[f] = c[f]; });
    return out;
  });
}

async function getJson(url, cacheFile) {
  if (cacheFile && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + ' -> ' + res.status);
      const text = await res.text();
      if (cacheFile) fs.writeFileSync(cacheFile, text);
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise(function (r) { setTimeout(r, 2000 * Math.pow(2, attempt)); });
    }
  }
  return null;
}

async function main() {
  const cache = process.argv[2] || path.join(os.tmpdir(), 'scoutai-sb-cache');
  fs.mkdirSync(cache, { recursive: true });
  const matches = await getJson(BASE + '/matches/' + COMPETITION + '/' + SEASON + '.json', path.join(cache, 'matches.json'));
  matches.sort(function (a, b) { return (a.match_date + a.kick_off).localeCompare(b.match_date + b.kick_off); });
  const counter = {};
  const rows = [];
  for (const m of matches) {
    const home = m.home_team.home_team_name;
    const away = m.away_team.away_team_name;
    counter[home] = (counter[home] || 0) + 1;
    counter[away] = (counter[away] || 0) + 1;
    const meta = {
      matchId: m.match_id, date: m.match_date, stage: m.competition_stage.name,
      home: home, away: away,
      teamMatchNo: { [home]: counter[home], [away]: counter[away] }
    };
    const events = await getJson(BASE + '/events/' + m.match_id + '.json', path.join(cache, m.match_id + '.json'));
    buildRows(events, meta).forEach(function (r) { rows.push(r); });
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const payload = {
    source: 'StatsBomb Open Data',
    licence: 'Research and public sharing with credit; commercial use prohibited (hudl/open-data LICENSE.pdf s.1.2.2)',
    competitionId: COMPETITION,
    seasonId: SEASON,
    games: matches.length,
    builtBy: 'tools/build-gems.js',
    definitions: {
      aerialWon: 'aerial_won flag on Pass / Clearance / Shot / Miscontrol',
      aerialLost: 'Duel type «Aerial Lost»',
      tacklesWon: 'Duel type Tackle, outcome Won / Success / Success In Play / Success Out',
      clearances: 'Clearance events without aerial_won (aerial clearances count once, as aerialWon)',
      headedXg: 'non-penalty xG of shots with body_part Head',
      passesIntoBox: 'completed open-play pass from outside the box ending inside it (x>=102, 18<=y<=62)',
      progPasses: 'completed open-play pass ending >=25% closer to the goal centre (120,40)',
      progCarries: 'carry ending >=25% and >=5 units closer to the goal centre',
      receptionsBetweenLines: 'successful Ball Receipt at x 78-102, y 18-62 (location proxy; no 360 data)',
      pressuredPasses: 'open-play pass with under_pressure',
      counterpress: 'StatsBomb counterpress flag',
      interceptionsWon: 'Interception outcome Won / Success In Play / Success Out',
      recoveries: 'Ball Recovery without recovery_failure',
      xa: 'non-penalty xG of shots whose key_pass_id is the player\'s pass',
      xgChain: 'non-penalty xG of every possession in which the player had a Pass / Carry / successful Receipt / Dribble / Shot',
      xgBuildup: 'xgChain excluding possessions in which the player took a shot or played the key pass',
      npxg: 'non-penalty xG of the player\'s own shots'
    },
    rows: rows
  };
  const outFile = path.join(__dirname, '..', 'data', 'wc2018_gems_matches.json');
  fs.writeFileSync(outFile, JSON.stringify(payload));
  process.stderr.write('rows ' + rows.length + ' -> ' + outFile + '\n');
}

module.exports = { gemsCounts: gemsCounts, buildRows: buildRows, isProgressive: isProgressive, betweenLines: betweenLines, COUNT_FIELDS: COUNT_FIELDS };

if (require.main === module) {
  main().catch(function (err) { console.error(err); process.exit(1); });
}
