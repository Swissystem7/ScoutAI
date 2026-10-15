#!/usr/bin/env node
'use strict';

// Builds data/wc2018_mentality_matches.json: one row per player per match,
// with the raw counts the «מדד מנטליות» lab needs (minutes and actions by
// score state and by match phase, counter-press actions, reactions after
// the player's own ball loss, and the surface counts of the main lab).
//
// Source: StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3)
// https://github.com/hudl/open-data — research and public sharing with
// credit; commercial use prohibited (LICENSE.pdf, section 1.2.2).
//
// Usage: node tools/build-mentality.js [cacheDir]
// Events are downloaded once into cacheDir (default: $TMPDIR/scoutai-sb-cache).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';
const COMPETITION = 43;
const SEASON = 3;

// Every on-pitch action the player initiates, on or off the ball.
const ACTIVE_TYPES = new Set([
  'Pass', 'Carry', 'Dribble', 'Shot', 'Pressure', 'Duel', 'Interception',
  'Ball Recovery', 'Block', 'Clearance', '50/50', 'Foul Committed'
]);
// Off-ball effort that counts as «reacting» after losing the ball.
const REACTION_TYPES = new Set([
  'Pressure', 'Duel', 'Interception', 'Ball Recovery', 'Block', 'Clearance',
  '50/50', 'Foul Committed'
]);
const REACTION_WINDOW_S = 5;

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
function round(x, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
function inPenaltyBox(loc) { return Array.isArray(loc) && loc[0] >= 102 && loc[1] >= 18 && loc[1] <= 62; }
function progresses(a, b) { return Array.isArray(a) && Array.isArray(b) && finite(a[0]) && finite(b[0]) && b[0] - a[0] >= 10; }

function eventClock(ev) {
  // StatsBomb «minute» runs on across periods (2nd half starts at 45).
  return (ev.minute || 0) + (ev.second || 0) / 60;
}

function isMistake(ev) {
  const t = ev.type && ev.type.name;
  if (t === 'Dispossessed' || t === 'Miscontrol') return true;
  if (t === 'Dribble' && ev.dribble && ev.dribble.outcome && ev.dribble.outcome.name === 'Incomplete') return true;
  return false;
}

function timestampSeconds(ev) {
  const parts = String(ev.timestamp || '0:0:0').split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Pure function: StatsBomb events of one match -> per-player rows.
function aggregateMatch(events, meta) {
  const inPlay = events.filter((ev) => ev.period && ev.period <= 4);
  const periodEnd = {};
  const periodStart = {};
  inPlay.forEach((ev) => {
    const c = eventClock(ev);
    periodEnd[ev.period] = Math.max(periodEnd[ev.period] || 0, c);
    periodStart[ev.period] = Math.min(periodStart[ev.period] == null ? Infinity : periodStart[ev.period], c);
  });
  const periods = Object.keys(periodEnd).map(Number).sort();

  // Score timeline: [{period, clock, team}] for every goal.
  const goals = [];
  inPlay.forEach((ev) => {
    const t = ev.type && ev.type.name;
    if (t === 'Shot' && ev.shot && ev.shot.outcome && ev.shot.outcome.name === 'Goal') {
      goals.push({ period: ev.period, clock: eventClock(ev), team: ev.team.name });
    } else if (t === 'Own Goal For') {
      goals.push({ period: ev.period, clock: eventClock(ev), team: ev.team.name });
    }
  });

  const teams = [meta.home, meta.away];
  function scoreAt(team, period, clock) {
    let diff = 0;
    goals.forEach((g) => {
      if (g.period < period || (g.period === period && g.clock < clock)) diff += g.team === team ? 1 : -1;
    });
    return diff;
  }

  // On-pitch intervals per player: [{period, from, to}] in clock minutes.
  const players = new Map();
  function ensure(p, team) {
    if (!players.has(p.id)) {
      players.set(p.id, {
        playerId: p.id, name: p.name, team: team, position: null,
        on: null, intervals: [], events: []
      });
    }
    return players.get(p.id);
  }
  function openAt(row, period, clock) { row.on = { period: period, clock: clock }; }
  function closeAt(row, period, clock) {
    if (!row.on) return;
    for (const per of periods) {
      if (per < row.on.period || per > period) continue;
      const from = per === row.on.period ? row.on.clock : periodStart[per];
      const to = per === period ? clock : periodEnd[per];
      if (to > from) row.intervals.push({ period: per, from: from, to: to });
    }
    row.on = null;
  }

  inPlay.forEach((ev) => {
    const t = ev.type && ev.type.name;
    if (t === 'Starting XI' && ev.tactics) {
      ev.tactics.lineup.forEach((slot) => {
        const row = ensure(slot.player, ev.team.name);
        row.position = slot.position && slot.position.name;
        openAt(row, 1, periodStart[1] || 0);
      });
    }
  });
  inPlay.forEach((ev) => {
    const t = ev.type && ev.type.name;
    const c = eventClock(ev);
    if (t === 'Substitution' && ev.player) {
      const off = ensure(ev.player, ev.team.name);
      closeAt(off, ev.period, c);
      const on = ensure(ev.substitution.replacement, ev.team.name);
      if (!on.position && ev.position) on.position = ev.position.name;
      openAt(on, ev.period, c);
    }
    const card = (ev.foul_committed && ev.foul_committed.card) || (ev.bad_behaviour && ev.bad_behaviour.card);
    if (card && /Red|Second Yellow/.test(card.name) && ev.player) {
      closeAt(ensure(ev.player, ev.team.name), ev.period, c);
    }
    if (ev.player) {
      const row = ensure(ev.player, ev.team.name);
      if (!row.position && ev.position) row.position = ev.position.name;
      row.events.push(ev);
    }
  });
  const lastPeriod = periods[periods.length - 1];
  players.forEach((row) => closeAt(row, lastPeriod, periodEnd[lastPeriod]));

  // Split an interval by goal times so each slice has one score state.
  function slices(team, iv) {
    const cuts = goals
      .filter((g) => g.period === iv.period && g.clock > iv.from && g.clock < iv.to)
      .map((g) => g.clock)
      .sort((a, b) => a - b);
    const edges = [iv.from].concat(cuts, [iv.to]);
    const out = [];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const mid = (edges[i] + edges[i + 1]) / 2;
      out.push({ period: iv.period, from: edges[i], to: edges[i + 1], diff: scoreAt(team, iv.period, mid) });
    }
    return out;
  }

  // Phase: early = regulation clock < 60; late = clock >= 75 (incl. extra time).
  function phaseMinutes(iv) {
    const early = Math.max(0, Math.min(iv.to, 60) - iv.from) * (iv.period <= 2 ? 1 : 0);
    const late = iv.period >= 3 ? (iv.to - iv.from) : Math.max(0, iv.to - Math.max(iv.from, 75));
    return { early: early, late: late };
  }
  function phaseOf(ev) {
    const c = eventClock(ev);
    if (ev.period >= 3 || c >= 75) return 'late';
    if (c < 60 && ev.period <= 2) return 'early';
    return 'mid';
  }
  function stateOf(diff) { return diff < 0 ? 'trailing' : diff > 0 ? 'leading' : 'level'; }

  const out = [];
  players.forEach((row) => {
    if (!row.intervals.length) return;
    const r = {
      matchId: meta.matchId, date: meta.date, stage: meta.stage, teamMatchNo: meta.teamMatchNo[row.team],
      playerId: row.playerId, name: row.name, team: row.team, position: row.position,
      minutes: 0, minTrailing: 0, minLevel: 0, minLeading: 0, minEarly: 0, minLate: 0,
      actions: 0, actTrailing: 0, actLevel: 0, actLeading: 0, actEarly: 0, actLate: 0,
      counterpress: 0, mistakes: 0, mistakesReacted: 0,
      teamGoalsFor: 0, teamGoalsAgainst: 0,
      pressures: 0, tackles: 0, interceptions: 0, defensiveActions: 0, progressiveActions: 0,
      keyPasses: 0, passesCompleted: 0, shotXgSum: 0, boxTouches: 0, shotsOnTarget: 0,
      shots: 0, goals: 0, assists: 0
    };
    row.intervals.forEach((iv) => {
      r.minutes += iv.to - iv.from;
      const ph = phaseMinutes(iv);
      r.minEarly += ph.early;
      r.minLate += ph.late;
      slices(row.team, iv).forEach((s) => {
        const key = { trailing: 'minTrailing', level: 'minLevel', leading: 'minLeading' }[stateOf(s.diff)];
        r[key] += s.to - s.from;
      });
    });
    const evs = row.events;
    evs.forEach((ev, i) => {
      const t = ev.type && ev.type.name;
      if (ACTIVE_TYPES.has(t)) {
        r.actions += 1;
        const st = stateOf(scoreAt(row.team, ev.period, eventClock(ev)));
        r[{ trailing: 'actTrailing', level: 'actLevel', leading: 'actLeading' }[st]] += 1;
        const ph = phaseOf(ev);
        if (ph === 'early') r.actEarly += 1;
        if (ph === 'late') r.actLate += 1;
      }
      if (ev.counterpress) r.counterpress += 1;
      if (isMistake(ev)) {
        r.mistakes += 1;
        const t0 = timestampSeconds(ev);
        for (let j = i + 1; j < evs.length; j += 1) {
          const nx = evs[j];
          if (nx.period !== ev.period) break;
          const dt = timestampSeconds(nx) - t0;
          if (dt > REACTION_WINDOW_S) break;
          if (REACTION_TYPES.has(nx.type && nx.type.name)) { r.mistakesReacted += 1; break; }
        }
      }
      // Surface counts, same definitions as the main lab's aggregate file.
      if (inPenaltyBox(ev.location)) r.boxTouches += 1;
      if (t === 'Pass') {
        if (!ev.pass.outcome) r.passesCompleted += 1;
        if (ev.pass.shot_assist || ev.pass.goal_assist) r.keyPasses += 1;
        if (ev.pass.goal_assist) r.assists += 1;
        if (progresses(ev.location, ev.pass.end_location)) r.progressiveActions += 1;
      } else if (t === 'Shot') {
        r.shots += 1;
        r.shotXgSum += finite(ev.shot.statsbomb_xg) ? ev.shot.statsbomb_xg : 0;
        const o = ev.shot.outcome && ev.shot.outcome.name;
        if (/Goal|Saved/i.test(o || '')) r.shotsOnTarget += 1;
        if (o === 'Goal') r.goals += 1;
      } else if (t === 'Carry') {
        if (progresses(ev.location, ev.carry && ev.carry.end_location)) r.progressiveActions += 1;
      } else if (t === 'Duel') {
        const o = ev.duel && ev.duel.outcome && ev.duel.outcome.name;
        if (ev.duel && ev.duel.type && ev.duel.type.name === 'Tackle' && /won|success/i.test(o || '')) {
          r.defensiveActions += 1; r.tackles += 1;
        }
      } else if (t === 'Ball Recovery') r.defensiveActions += 1;
      else if (t === 'Interception') { r.defensiveActions += 1; r.interceptions += 1; }
      else if (t === 'Block') r.defensiveActions += 1;
      else if (t === 'Pressure') r.pressures += 1;
    });
    // Team goals while this player was on the pitch.
    goals.forEach((g) => {
      const on = row.intervals.some((iv) => iv.period === g.period && g.clock >= iv.from && g.clock <= iv.to);
      if (!on) return;
      if (g.team === row.team) r.teamGoalsFor += 1; else r.teamGoalsAgainst += 1;
    });
    ['minutes', 'minTrailing', 'minLevel', 'minLeading', 'minEarly', 'minLate'].forEach((k) => { r[k] = round(r[k], 1); });
    r.shotXgSum = round(r.shotXgSum, 4);
    out.push(r);
  });
  return out;
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
    aggregateMatch(events, meta).forEach((r) => rows.push(r));
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const payload = {
    source: 'StatsBomb Open Data',
    licence: 'Research and public sharing with credit; commercial use prohibited (hudl/open-data LICENSE.pdf s.1.2.2)',
    competitionId: COMPETITION,
    seasonId: SEASON,
    games: matches.length,
    builtBy: 'tools/build-mentality.js',
    definitions: {
      activeTypes: Array.from(ACTIVE_TYPES),
      reactionTypes: Array.from(REACTION_TYPES),
      reactionWindowSeconds: REACTION_WINDOW_S,
      mistakes: 'Dispossessed, Miscontrol, Dribble(Incomplete)',
      early: 'clock < 60, regulation periods',
      late: 'clock >= 75, plus extra time',
      counterpress: 'StatsBomb counterpress flag: pressing actions within 5 seconds of an open-play turnover'
    },
    rows: rows
  };
  const outFile = path.join(__dirname, '..', 'data', 'wc2018_mentality_matches.json');
  fs.writeFileSync(outFile, JSON.stringify(payload));
  process.stderr.write('rows ' + rows.length + ' -> ' + outFile + '\n');
}

module.exports = { aggregateMatch: aggregateMatch, isMistake: isMistake };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
