#!/usr/bin/env node
'use strict';

// Builds data/radar_tournaments.json for the «רדאר תופעות» page:
//   - one row per team per match (raw sums for 14 team-level tactical metrics)
//   - one row per player per tournament (raw sums for the same actions,
//     plus the surface counts the scouting report reads)
//
// Source: StatsBomb Open Data (https://github.com/hudl/open-data), four men's
// international tournaments — every match that the open data publishes:
//   FIFA World Cup 2018 (43/3), FIFA World Cup 2022 (43/106),
//   UEFA Euro 2020 (55/43, played 2021), UEFA Euro 2024 (55/282).
// Licence: research and public sharing with credit; commercial use prohibited
// (LICENSE.pdf, section 1.2.2). The page says so.
//
// Usage: node tools/build-radar.js [cacheDir]
// The cache dir holds matches/<comp>_<season>.json and events/<matchId>.json;
// missing files are downloaded once.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { aggregateMatch } = require('./build-mentality.js');

const BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';

const TOURNAMENTS = Object.freeze([
  { key: 'wc2018', competitionId: 43, seasonId: 3, label: 'מונדיאל 2018', year: 2018 },
  { key: 'wc2022', competitionId: 43, seasonId: 106, label: 'מונדיאל 2022', year: 2022 },
  { key: 'euro2020', competitionId: 55, seasonId: 43, label: 'יורו 2020 (שוחק ב-2021)', year: 2021 },
  { key: 'euro2024', competitionId: 55, seasonId: 282, label: 'יורו 2024', year: 2024 }
]);

// StatsBomb pitch is 120 x 80 yards; each event is in the acting team's frame.
const LONG_PASS_YD = 35;        // ~32 m, the usual «long ball» cut-off
const LONG_THROW_YD = 22;       // ~20 m, as in public long-throw counts
const SET_PIECE_PASS_TYPES = new Set(['Corner', 'Free Kick', 'Goal Kick', 'Throw-in', 'Kick Off']);
const SET_PIECE_PATTERNS = new Set(['From Corner', 'From Free Kick', 'From Throw In']);

// Shared sums: the same keys exist on team-match rows and on player rows.
const SUMS = Object.freeze([
  'minutes', 'passes', 'openPasses', 'openPassLenSum', 'openLong',
  'gkPasses', 'gkLong', 'goalKicks', 'goalKicksLong',
  'pressures', 'highPress', 'counterpress', 'crosses', 'longThrows',
  'corners', 'shortCorners', 'npShots', 'npxg', 'spXg', 'shotDistSum',
  'defActionsHigh'
]);
// Team-only: opponent passes in their own 60% of the pitch (PPDA numerator).
const TEAM_ONLY = Object.freeze(['oppPassesOwn60']);
// Player-only surface counts for the scouting report.
const PLAYER_ONLY = Object.freeze([
  'keyPasses', 'xa', 'progPasses', 'progCarries', 'dribblesWon', 'dribbles',
  'tacklesWon', 'interceptions', 'recoveries', 'boxTouches', 'goals', 'passesCompleted'
]);

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
function round(x, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
function inBox(loc) { return Array.isArray(loc) && loc[0] >= 102 && loc[1] >= 18 && loc[1] <= 62; }
function progresses(a, b) { return Array.isArray(a) && Array.isArray(b) && finite(a[0]) && finite(b[0]) && b[0] - a[0] >= 10 && b[0] >= 60; }
function blank(keys) { const o = {}; keys.forEach((k) => { o[k] = 0; }); return o; }
function isGk(position) { return position === 'Goalkeeper'; }

// Adds the contribution of one event to a sums object (team or player).
function addEvent(s, ev, ctx) {
  const t = ev.type && ev.type.name;
  const loc = ev.location;
  if (t === 'Pass') {
    const p = ev.pass || {};
    const outcome = p.outcome && p.outcome.name;
    if (outcome === 'Injury Clearance') return;
    const ptype = p.type && p.type.name;
    const len = finite(p.length) ? p.length : 0;
    s.passes += 1;
    if (!ptype || !SET_PIECE_PASS_TYPES.has(ptype)) {
      s.openPasses += 1;
      s.openPassLenSum += len;
      if (len >= LONG_PASS_YD) s.openLong += 1;
      if (p.cross) s.crosses += 1;
    }
    if (ctx.gk) { s.gkPasses += 1; if (len >= LONG_PASS_YD) s.gkLong += 1; }
    if (ptype === 'Goal Kick') { s.goalKicks += 1; if (len >= LONG_PASS_YD) s.goalKicksLong += 1; }
    if (ptype === 'Throw-in' && len >= LONG_THROW_YD && inBox(p.end_location)) s.longThrows += 1;
    if (ptype === 'Corner') { s.corners += 1; if (!inBox(p.end_location)) s.shortCorners += 1; }
    if (ctx.player) {
      if (!outcome) s.passesCompleted += 1;
      if (p.shot_assist || p.goal_assist) s.keyPasses += 1;
      if (p.assisted_shot_id && ctx.xgById[p.assisted_shot_id]) s.xa += ctx.xgById[p.assisted_shot_id];
      if (!outcome && progresses(loc, p.end_location)) s.progPasses += 1;
    }
  } else if (t === 'Shot') {
    const sh = ev.shot || {};
    const stype = sh.type && sh.type.name;
    if (stype === 'Penalty') return;
    const xg = finite(sh.statsbomb_xg) ? sh.statsbomb_xg : 0;
    s.npShots += 1;
    s.npxg += xg;
    if (ev.play_pattern && SET_PIECE_PATTERNS.has(ev.play_pattern.name)) s.spXg += xg;
    if (Array.isArray(loc)) s.shotDistSum += Math.hypot(120 - loc[0], 40 - loc[1]);
    if (ctx.player && sh.outcome && sh.outcome.name === 'Goal') s.goals += 1;
  } else if (t === 'Pressure') {
    s.pressures += 1;
    if (Array.isArray(loc) && loc[0] >= 80) s.highPress += 1;
    if (ev.counterpress) s.counterpress += 1;
  } else if (ctx.player && t === 'Carry') {
    if (progresses(loc, ev.carry && ev.carry.end_location)) s.progCarries += 1;
  } else if (ctx.player && t === 'Dribble') {
    s.dribbles += 1;
    if (ev.dribble && ev.dribble.outcome && ev.dribble.outcome.name === 'Complete') s.dribblesWon += 1;
  } else if (ctx.player && t === 'Ball Recovery') {
    s.recoveries += 1;
  }
  // Defensive actions for PPDA: tackles, interceptions, fouls — in the
  // opponent's 60% of the pitch (x >= 48 in the defending team's frame).
  const isTackle = t === 'Duel' && ev.duel && ev.duel.type && ev.duel.type.name === 'Tackle';
  if ((isTackle || t === 'Interception' || t === 'Foul Committed') && Array.isArray(loc) && loc[0] >= 48) s.defActionsHigh += 1;
  if (ctx.player) {
    const o = (ev.duel && ev.duel.outcome && ev.duel.outcome.name) || '';
    if (isTackle && /won|success/i.test(o)) s.tacklesWon += 1;
    if (t === 'Interception') s.interceptions += 1;
    if (inBox(loc) && t !== 'Pressure') s.boxTouches += 1;
  }
}

// Pure: one match's events -> { teamRows, playerRows }.
function buildMatch(events, meta) {
  const inPlay = events.filter((ev) => ev.period && ev.period <= 4);
  const periodEnd = {};
  const periodStart = {};
  inPlay.forEach((ev) => {
    const c = (ev.minute || 0) + (ev.second || 0) / 60;
    periodEnd[ev.period] = Math.max(periodEnd[ev.period] || 0, c);
    periodStart[ev.period] = Math.min(periodStart[ev.period] == null ? Infinity : periodStart[ev.period], c);
  });
  const matchMinutes = Object.keys(periodEnd).reduce((s, k) => s + (periodEnd[k] - periodStart[k]), 0);
  const xgById = {};
  inPlay.forEach((ev) => {
    if (ev.type && ev.type.name === 'Shot' && ev.shot && finite(ev.shot.statsbomb_xg)) xgById[ev.id] = ev.shot.statsbomb_xg;
  });

  // Minutes and main position per player: reuse the mentality builder.
  const minuteRows = aggregateMatch(events, {
    matchId: meta.matchId, date: meta.date, stage: meta.stage,
    home: meta.home, away: meta.away, teamMatchNo: { [meta.home]: 1, [meta.away]: 1 }
  });
  const positionOf = {};
  const players = new Map();
  minuteRows.forEach((r) => {
    positionOf[r.playerId] = r.position;
    const s = blank(SUMS.concat(PLAYER_ONLY));
    s.minutes = r.minutes;
    players.set(r.playerId, { id: r.playerId, name: r.name, team: r.team, position: r.position, sums: s });
  });

  const teams = {};
  [meta.home, meta.away].forEach((name) => {
    teams[name] = blank(SUMS.concat(TEAM_ONLY));
    teams[name].minutes = matchMinutes;
  });

  inPlay.forEach((ev) => {
    const team = ev.team && ev.team.name;
    if (!teams[team]) return;
    const pos = (ev.position && ev.position.name) || (ev.player && positionOf[ev.player.id]);
    const gk = isGk(pos);
    addEvent(teams[team], ev, { gk: gk, player: false, xgById: xgById });
    if (ev.player && players.has(ev.player.id)) {
      addEvent(players.get(ev.player.id).sums, ev, { gk: gk, player: true, xgById: xgById });
    }
    if (ev.type && ev.type.name === 'Pass' && Array.isArray(ev.location) && ev.location[0] < 72) {
      const other = team === meta.home ? meta.away : meta.home;
      const outcome = ev.pass && ev.pass.outcome && ev.pass.outcome.name;
      if (outcome !== 'Injury Clearance') teams[other].oppPassesOwn60 += 1;
    }
  });

  const teamRows = Object.keys(teams).map((name) => Object.assign({ matchId: meta.matchId, team: name, stage: meta.stage }, teams[name]));
  const playerRows = Array.from(players.values()).filter((p) => p.sums.minutes > 0);
  return { teamRows: teamRows, playerRows: playerRows };
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
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }
  return null;
}

function roundSums(obj, keys) {
  keys.forEach((k) => {
    if (k === 'npxg' || k === 'spXg' || k === 'xa') obj[k] = round(obj[k], 3);
    else if (k === 'openPassLenSum' || k === 'shotDistSum' || k === 'minutes') obj[k] = round(obj[k], 1);
  });
  return obj;
}

async function main() {
  const cache = process.argv[2] || path.join(os.tmpdir(), 'scoutai-sb-cache');
  fs.mkdirSync(path.join(cache, 'matches'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'events'), { recursive: true });
  const teamFields = ['t', 'matchId', 'team', 'stage'].concat(SUMS, TEAM_ONLY);
  const playerFields = ['t', 'id', 'name', 'team', 'position', 'matches'].concat(SUMS, PLAYER_ONLY);
  const teamRows = [];
  const playerRows = [];
  const tournaments = [];
  for (const tour of TOURNAMENTS) {
    const matches = await getJson(BASE + '/matches/' + tour.competitionId + '/' + tour.seasonId + '.json',
      path.join(cache, 'matches', tour.competitionId + '_' + tour.seasonId + '.json'));
    matches.sort((a, b) => (a.match_date + a.kick_off).localeCompare(b.match_date + b.kick_off));
    const byPlayer = new Map();
    for (const m of matches) {
      const meta = {
        matchId: m.match_id, date: m.match_date, stage: m.competition_stage.name,
        home: m.home_team.home_team_name, away: m.away_team.away_team_name
      };
      const events = await getJson(BASE + '/events/' + m.match_id + '.json', path.join(cache, 'events', m.match_id + '.json'));
      const out = buildMatch(events, meta);
      out.teamRows.forEach((r) => {
        roundSums(r, SUMS.concat(TEAM_ONLY));
        teamRows.push(teamFields.map((f) => (f === 't' ? tour.key : r[f])));
      });
      out.playerRows.forEach((p) => {
        if (!byPlayer.has(p.id)) byPlayer.set(p.id, { id: p.id, name: p.name, team: p.team, posMinutes: {}, matches: 0, sums: blank(SUMS.concat(PLAYER_ONLY)) });
        const acc = byPlayer.get(p.id);
        acc.matches += 1;
        acc.posMinutes[p.position] = (acc.posMinutes[p.position] || 0) + p.sums.minutes;
        Object.keys(acc.sums).forEach((k) => { acc.sums[k] += p.sums[k]; });
      });
      process.stderr.write('.');
    }
    byPlayer.forEach((acc) => {
      if (acc.sums.minutes < 45) return;
      const position = Object.keys(acc.posMinutes).sort((a, b) => acc.posMinutes[b] - acc.posMinutes[a])[0] || '';
      const row = Object.assign({ t: tour.key, id: acc.id, name: acc.name, team: acc.team, position: position, matches: acc.matches }, roundSums(acc.sums, SUMS.concat(PLAYER_ONLY)));
      playerRows.push(playerFields.map((f) => row[f]));
    });
    tournaments.push({ key: tour.key, label: tour.label, year: tour.year, competitionId: tour.competitionId, seasonId: tour.seasonId, matches: matches.length });
    process.stderr.write(' ' + tour.key + '\n');
  }
  const payload = {
    source: 'StatsBomb Open Data',
    licence: 'Research and public sharing with credit; commercial use prohibited (hudl/open-data LICENSE.pdf s.1.2.2)',
    builtBy: 'tools/build-radar.js',
    tournaments: tournaments,
    definitions: {
      longPassYards: LONG_PASS_YD,
      longThrowYards: LONG_THROW_YD,
      openPlayPasses: 'passes except Corner, Free Kick, Goal Kick, Throw-in, Kick Off; injury clearances excluded',
      highPress: 'Pressure with x >= 80 (attacking third, own frame)',
      ppda: 'opponent passes with x < 72 (their own 60%) / own tackles+interceptions+fouls with x >= 48',
      setPieceXg: 'non-penalty shot xG with play_pattern From Corner / From Free Kick / From Throw In',
      shortCorner: 'corner whose end location is outside the penalty box',
      longThrow: 'throw-in of 22+ yards ending in the penalty box',
      minutes: 'team rows: clock minutes of periods 1-4; player rows: on-pitch minutes from lineups and substitutions'
    },
    teamFields: teamFields,
    teamRows: teamRows,
    playerFields: playerFields,
    playerRows: playerRows
  };
  const outFile = path.join(__dirname, '..', 'data', 'radar_tournaments.json');
  fs.writeFileSync(outFile, JSON.stringify(payload));
  process.stderr.write('team rows ' + teamRows.length + ', player rows ' + playerRows.length + ' -> ' + outFile + '\n');
}

module.exports = { buildMatch: buildMatch, addEvent: addEvent, SUMS: SUMS, TOURNAMENTS: TOURNAMENTS };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
