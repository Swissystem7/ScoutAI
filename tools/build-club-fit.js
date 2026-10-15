#!/usr/bin/env node
'use strict';

// Builds data/wc2018_club_fit.json for the «התאמה לקבוצה» lab:
//   teamMatches[]   one row per team per match: the raw counts behind the
//                   team style profile (possession, PPDA, pressing height,
//                   directness, crosses, through balls, short build-up,
//                   set-piece xG share, counter-press per possession).
//   playerMatches[] one row per player per match: minutes and position (from
//                   tools/build-mentality.js) plus the role actions a system
//                   can ask for (progressive passes under pressure, crosses,
//                   counter-presses, aerials, runs onto through balls ...).
//
// Source: StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3)
// https://github.com/hudl/open-data — research and public sharing with
// credit; commercial use prohibited (LICENSE.pdf, section 1.2.2).
//
// Coordinates: StatsBomb pitch is 120 x 80 yards and every event is in the
// frame of the team that performed it (x = 0 own goal line, 120 opponent's).
//
// Usage: node tools/build-club-fit.js [cacheDir]
// Events are downloaded once into cacheDir (default: $TMPDIR/scoutai-sb-cache).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { aggregateMatch: baseRows } = require('./build-mentality.js');

const BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';
const COMPETITION = 43;
const SEASON = 3;

const LONG_PASS = 32;          // yards (~30 m)
const PROGRESSIVE_DX = 10;     // yards toward the opponent goal
const OWN_THIRD_X = 40;
const ATTACKING_THIRD_X = 80;
const OPP_HALF_X = 60;
const PPDA_OWN60_X = 72;       // opponent passes in their own 60 % of the pitch
const PPDA_OUR_X = 48;         // our defensive actions in the opponent's 60 %
const SET_PIECE_PATTERNS = new Set(['From Corner', 'From Free Kick']);
const RESTART_PASS_TYPES = new Set(['Corner', 'Free Kick', 'Throw-in', 'Goal Kick', 'Kick Off']);

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
function round(x, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
function typeName(ev) { return ev.type && ev.type.name; }
function xOf(loc) { return Array.isArray(loc) && finite(loc[0]) ? loc[0] : null; }
function inBox(loc) { return Array.isArray(loc) && loc[0] >= 102 && loc[1] >= 18 && loc[1] <= 62; }
function isPenalty(ev) { return ev.shot && ev.shot.type && ev.shot.type.name === 'Penalty'; }
function passType(ev) { return ev.pass && ev.pass.type && ev.pass.type.name; }
function isOpenPlayPass(ev) { return !RESTART_PASS_TYPES.has(passType(ev)); }
function completed(ev) { return ev.pass && !ev.pass.outcome; }
function isThroughBall(ev) {
  return !!(ev.pass && (ev.pass.through_ball || (ev.pass.technique && ev.pass.technique.name === 'Through Ball')));
}
function isDefensiveAction(ev) {
  const t = typeName(ev);
  if (t === 'Interception' || t === 'Foul Committed') return true;
  return t === 'Duel' && ev.duel && ev.duel.type && ev.duel.type.name === 'Tackle';
}
function wonTackle(ev) {
  if (typeName(ev) !== 'Duel' || !ev.duel || !ev.duel.type || ev.duel.type.name !== 'Tackle') return false;
  const o = ev.duel.outcome && ev.duel.outcome.name;
  return /won|success/i.test(o || '');
}
function aerialWon(ev) {
  return ['pass', 'clearance', 'shot', 'miscontrol'].some((k) => ev[k] && ev[k].aerial_won);
}

const TEAM_FIELDS = [
  'passes', 'oppPasses', 'oppPassesOwn60', 'defActsOpp60', 'defActXSum', 'defActN',
  'fwdDist', 'totDist', 'crosses', 'oppHalfPasses', 'throughBalls', 'ownThirdPasses',
  'ownThirdShort', 'npxg', 'setPieceXg', 'counterpress', 'possessions', 'goalsFor', 'goalsAgainst'
];

const PLAYER_FIELDS = [
  'passesCompleted', 'progPass', 'progPassUP', 'buildUpPass', 'longPass', 'crosses',
  'throughBalls', 'keyPasses', 'xA', 'progCarry', 'dribbles', 'shots', 'npxg', 'headedShots',
  'boxTouches', 'receivedThrough', 'receivedCross', 'pressures', 'pressAtt', 'counterpress',
  'tacklesInt', 'recoveries', 'highRecoveries', 'defActHigh', 'aerialsWon', 'aerialsLost',
  'clearances', 'blocks', 'setPieceShots', 'setPieceChances'
];

// Pure: StatsBomb events of one match -> { teamRows, playerRows }.
function aggregateMatch(events, meta) {
  const inPlay = events.filter((ev) => ev.period && ev.period <= 4);
  const base = baseRows(events, meta);
  const teams = [meta.home, meta.away];
  const opp = { [meta.home]: meta.away, [meta.away]: meta.home };

  const team = {};
  teams.forEach((t) => {
    team[t] = { matchId: meta.matchId, date: meta.date, stage: meta.stage, team: t, opponent: opp[t], teamMatchNo: meta.teamMatchNo[t] };
    TEAM_FIELDS.forEach((f) => { team[t][f] = 0; });
    team[t]._poss = new Set();
  });

  const shotXg = {};
  inPlay.forEach((ev) => {
    if (typeName(ev) === 'Shot' && finite(ev.shot && ev.shot.statsbomb_xg)) shotXg[ev.id] = ev.shot.statsbomb_xg;
  });

  const players = new Map();
  base.forEach((r) => {
    const row = {
      matchId: r.matchId, date: r.date, stage: r.stage, teamMatchNo: r.teamMatchNo,
      playerId: r.playerId, name: r.name, team: r.team, position: r.position, minutes: r.minutes
    };
    PLAYER_FIELDS.forEach((f) => { row[f] = 0; });
    players.set(r.playerId, row);
  });
  function prow(p) { return p ? players.get(p.id) : null; }

  inPlay.forEach((ev) => {
    const t = typeName(ev);
    const tn = ev.team && ev.team.name;
    const T = team[tn];
    if (!T) return;
    const O = team[opp[tn]];
    const x = xOf(ev.location);
    const pr = prow(ev.player);

    if (ev.possession_team && ev.possession_team.name === tn) T._poss.add(ev.possession);
    if (ev.counterpress) { T.counterpress += 1; if (pr) pr.counterpress += 1; }

    if (isDefensiveAction(ev) && x != null && x >= PPDA_OUR_X) T.defActsOpp60 += 1;
    if ((t === 'Pressure' || isDefensiveAction(ev) || t === 'Ball Recovery') && x != null) {
      T.defActXSum += x; T.defActN += 1;
      if (pr && x >= OWN_THIRD_X && t !== 'Foul Committed') pr.defActHigh += 1;
    }

    if (inBox(ev.location) && pr) pr.boxTouches += 1;

    if (t === 'Pass') {
      T.passes += 1;
      O.oppPasses += 1;
      if (x != null && x <= PPDA_OWN60_X) O.oppPassesOwn60 += 1;
      const endX = xOf(ev.pass.end_location);
      const dx = endX != null && x != null ? endX - x : 0;
      const len = finite(ev.pass.length) ? ev.pass.length : 0;
      const open = isOpenPlayPass(ev);
      if (open && completed(ev)) { T.fwdDist += Math.max(0, dx); T.totDist += len; }
      if (x != null && x >= OPP_HALF_X && open) T.oppHalfPasses += 1;
      if (ev.pass.cross) T.crosses += 1;
      if (isThroughBall(ev)) T.throughBalls += 1;
      if (x != null && x < OWN_THIRD_X && passType(ev) !== 'Throw-in' && passType(ev) !== 'Kick Off') {
        T.ownThirdPasses += 1;
        if (len < LONG_PASS) T.ownThirdShort += 1;
      }
      if (pr) {
        if (completed(ev)) {
          pr.passesCompleted += 1;
          if (open && dx >= PROGRESSIVE_DX) {
            pr.progPass += 1;
            if (ev.under_pressure) pr.progPassUP += 1;
          }
          if (x != null && x < OWN_THIRD_X && len < LONG_PASS && open) pr.buildUpPass += 1;
          if (len >= LONG_PASS && open) pr.longPass += 1;
        }
        if (ev.pass.cross) pr.crosses += 1;
        if (isThroughBall(ev)) pr.throughBalls += 1;
        if (ev.pass.shot_assist || ev.pass.goal_assist) {
          pr.keyPasses += 1;
          pr.xA += shotXg[ev.pass.assisted_shot_id] || 0;
          if (SET_PIECE_PATTERNS.has(ev.play_pattern && ev.play_pattern.name) || passType(ev) === 'Corner' || passType(ev) === 'Free Kick') pr.setPieceChances += 1;
        }
      }
      if (completed(ev) && ev.pass.recipient) {
        const rec = players.get(ev.pass.recipient.id);
        if (rec) {
          if (isThroughBall(ev)) rec.receivedThrough += 1;
          if (ev.pass.cross) rec.receivedCross += 1;
        }
      }
    } else if (t === 'Shot') {
      if (!isPenalty(ev)) {
        const xg = finite(ev.shot.statsbomb_xg) ? ev.shot.statsbomb_xg : 0;
        T.npxg += xg;
        const sp = SET_PIECE_PATTERNS.has(ev.play_pattern && ev.play_pattern.name);
        if (sp) T.setPieceXg += xg;
        if (pr) {
          pr.shots += 1; pr.npxg += xg;
          if (sp) pr.setPieceShots += 1;
          if (ev.shot.body_part && ev.shot.body_part.name === 'Head') pr.headedShots += 1;
        }
      }
      if (ev.shot.outcome && ev.shot.outcome.name === 'Goal') { T.goalsFor += 1; O.goalsAgainst += 1; }
    } else if (t === 'Own Goal For') {
      T.goalsFor += 1; O.goalsAgainst += 1;
    } else if (pr) {
      if (t === 'Carry') {
        const endX = xOf(ev.carry && ev.carry.end_location);
        if (endX != null && x != null && endX - x >= PROGRESSIVE_DX) pr.progCarry += 1;
      } else if (t === 'Dribble') {
        if (ev.dribble && ev.dribble.outcome && ev.dribble.outcome.name === 'Complete') pr.dribbles += 1;
      } else if (t === 'Pressure') {
        pr.pressures += 1;
        if (x != null && x >= ATTACKING_THIRD_X) pr.pressAtt += 1;
      } else if (t === 'Interception') {
        pr.tacklesInt += 1;
      } else if (t === 'Ball Recovery') {
        if (!(ev.ball_recovery && ev.ball_recovery.recovery_failure)) {
          pr.recoveries += 1;
          if (x != null && x >= OPP_HALF_X) pr.highRecoveries += 1;
        }
      } else if (t === 'Clearance') {
        pr.clearances += 1;
      } else if (t === 'Block') {
        pr.blocks += 1;
      } else if (t === 'Duel') {
        if (wonTackle(ev)) pr.tacklesInt += 1;
        if (ev.duel && ev.duel.type && ev.duel.type.name === 'Aerial Lost') pr.aerialsLost += 1;
      }
    }
    if (pr && aerialWon(ev)) pr.aerialsWon += 1;
  });

  const teamRows = teams.map((t) => {
    const r = team[t];
    r.possessions = r._poss.size;
    delete r._poss;
    r.fwdDist = round(r.fwdDist, 1);
    r.totDist = round(r.totDist, 1);
    r.npxg = round(r.npxg, 4);
    r.setPieceXg = round(r.setPieceXg, 4);
    return r;
  });
  const playerRows = Array.from(players.values()).map((r) => {
    r.xA = round(r.xA, 4);
    r.npxg = round(r.npxg, 4);
    return r;
  });
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

async function main() {
  const cache = process.argv[2] || path.join(os.tmpdir(), 'scoutai-sb-cache');
  fs.mkdirSync(cache, { recursive: true });
  const matches = await getJson(BASE + '/matches/' + COMPETITION + '/' + SEASON + '.json', path.join(cache, 'matches.json'));
  matches.sort((a, b) => (a.match_date + a.kick_off).localeCompare(b.match_date + b.kick_off));
  const counter = {};
  const teamMatches = [];
  const playerMatches = [];
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
    const out = aggregateMatch(events, meta);
    out.teamRows.forEach((r) => teamMatches.push(r));
    out.playerRows.forEach((r) => playerMatches.push(r));
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const payload = {
    source: 'StatsBomb Open Data',
    licence: 'Research and public sharing with credit; commercial use prohibited (hudl/open-data LICENSE.pdf s.1.2.2)',
    competitionId: COMPETITION,
    seasonId: SEASON,
    games: matches.length,
    builtBy: 'tools/build-club-fit.js',
    definitions: {
      pitch: '120 x 80 yards, every event in the frame of the acting team',
      longPass: 'pass length >= ' + LONG_PASS + ' yards',
      progressive: 'open-play completed pass or carry moving the ball >= ' + PROGRESSIVE_DX + ' yards toward the opponent goal',
      buildUpPass: 'completed open-play pass starting in own third (x < ' + OWN_THIRD_X + ') shorter than ' + LONG_PASS + ' yards',
      ppda: 'opponent passes with x <= ' + PPDA_OWN60_X + ' (their own 60%) / our tackles + interceptions + fouls with x >= ' + PPDA_OUR_X,
      pressHeight: 'mean x of pressures, tackles, interceptions, fouls and ball recoveries',
      directness: 'sum of forward yards / sum of pass length, completed open-play passes',
      setPieceShare: 'non-penalty xG from corners and free kicks / all non-penalty xG',
      counterpress: 'StatsBomb counterpress flag per own possession',
      pressAtt: 'pressures with x >= ' + ATTACKING_THIRD_X,
      defActHigh: 'pressures, tackles, interceptions and recoveries with x >= ' + OWN_THIRD_X,
      highRecoveries: 'ball recoveries with x >= ' + OPP_HALF_X
    },
    teamMatches: teamMatches,
    playerMatches: playerMatches
  };
  const outFile = path.join(__dirname, '..', 'data', 'wc2018_club_fit.json');
  fs.writeFileSync(outFile, JSON.stringify(payload));
  process.stderr.write('team rows ' + teamMatches.length + ', player rows ' + playerMatches.length + ' -> ' + outFile + '\n');
}

module.exports = { aggregateMatch: aggregateMatch, TEAM_FIELDS: TEAM_FIELDS, PLAYER_FIELDS: PLAYER_FIELDS };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
