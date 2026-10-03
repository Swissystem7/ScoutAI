'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const M = require('../mentality.js');
const { aggregateMatch } = require('../tools/build-mentality.js');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_mentality_matches.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'mentality', 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ---- builder: synthetic StatsBomb-shaped events ---------------------------

function ev(over) {
  return Object.assign({ period: 1, minute: 0, second: 0, timestamp: '00:00:00.000' }, over);
}
const A = { name: 'Alpha' };
const B = { name: 'Beta' };
const p1 = { id: 1, name: 'A One' };
const p2 = { id: 2, name: 'A Two' };
const q1 = { id: 11, name: 'B One' };
function lineup(team, players) {
  return ev({ type: { name: 'Starting XI' }, team: team, tactics: { lineup: players.map((p) => ({ player: p, position: { name: 'Center Forward' } })) } });
}
function syntheticMatch() {
  return [
    lineup(A, [p1, p2]),
    lineup(B, [q1]),
    // B scores at 10' -> Alpha trails 10'..90'
    ev({ minute: 10, type: { name: 'Shot' }, team: B, player: q1, location: [110, 40], shot: { outcome: { name: 'Goal' }, statsbomb_xg: 0.3 } }),
    // p1: 2 actions while level (early), then mistake + reaction within 5s while trailing
    ev({ minute: 2, type: { name: 'Pass' }, team: A, player: p1, location: [50, 40], pass: { end_location: [70, 40] } }),
    ev({ minute: 3, type: { name: 'Pressure' }, team: A, player: p1, location: [60, 40], counterpress: true }),
    ev({ minute: 20, second: 0, timestamp: '00:20:00.000', type: { name: 'Dispossessed' }, team: A, player: p1, location: [80, 40] }),
    ev({ minute: 20, second: 3, timestamp: '00:20:03.000', type: { name: 'Pressure' }, team: A, player: p1, location: [80, 40], counterpress: true }),
    // p2 mistake without reaction (reaction arrives after 5s)
    ev({ minute: 30, second: 0, timestamp: '00:30:00.000', type: { name: 'Miscontrol' }, team: A, player: p2, location: [70, 30] }),
    ev({ minute: 30, second: 9, timestamp: '00:30:09.000', type: { name: 'Pressure' }, team: A, player: p2, location: [70, 30] }),
    // second half, late action by p1 at 80'
    ev({ period: 2, minute: 45, timestamp: '00:00:00.000', type: { name: 'Half Start' }, team: A }),
    ev({ period: 2, minute: 80, timestamp: '00:35:00.000', type: { name: 'Carry' }, team: A, player: p1, location: [60, 40], carry: { end_location: [75, 40] } }),
    ev({ period: 2, minute: 90, timestamp: '00:45:00.000', type: { name: 'Half End' }, team: A })
  ];
}

test('builder splits minutes by score state and counts actions per state', () => {
  const rows = aggregateMatch(syntheticMatch(), { matchId: 1, date: 'x', stage: 'Group Stage', home: 'Alpha', away: 'Beta', teamMatchNo: { Alpha: 1, Beta: 1 } });
  const a1 = rows.find((r) => r.playerId === 1);
  assert.equal(a1.actLevel, 2);
  assert.equal(a1.actTrailing, 2, "pressure at 20' and carry at 80'; Dispossessed is not an action");
  assert.ok(Math.abs(a1.minLevel - 10) < 0.2, 'level for the first 10 minutes');
  assert.ok(Math.abs(a1.minTrailing + a1.minLevel + a1.minLeading - a1.minutes) < 0.2);
  assert.equal(a1.teamGoalsAgainst, 1);
  const b1 = rows.find((r) => r.playerId === 11);
  assert.ok(b1.minLeading > 60, "leading from 10' to the end of each half");
});

test('builder counts counter-press, late actions and reactions within 5 seconds of own mistake', () => {
  const rows = aggregateMatch(syntheticMatch(), { matchId: 1, date: 'x', stage: 'Group Stage', home: 'Alpha', away: 'Beta', teamMatchNo: { Alpha: 1, Beta: 1 } });
  const a1 = rows.find((r) => r.playerId === 1);
  const a2 = rows.find((r) => r.playerId === 2);
  assert.equal(a1.counterpress, 2);
  assert.equal(a1.actLate, 1);
  assert.equal(a1.actEarly, 3);
  assert.equal(a1.mistakes, 1);
  assert.equal(a1.mistakesReacted, 1);
  assert.equal(a2.mistakes, 1);
  assert.equal(a2.mistakesReacted, 0, 'a pressure 9s later is not a 5s reaction');
});

// ---- module ---------------------------------------------------------------

function row(over) {
  return Object.assign({
    matchId: 1, teamMatchNo: 1, playerId: 1, name: 'x', team: 'T', position: 'Center Forward',
    minutes: 90, minTrailing: 0, minLevel: 90, minLeading: 0, minEarly: 60, minLate: 15,
    actions: 60, actTrailing: 0, actLevel: 60, actLeading: 0, actEarly: 40, actLate: 10,
    counterpress: 3, mistakes: 2, mistakesReacted: 1
  }, over);
}

test('trailing response is team-adjusted and shrinks to zero without trailing minutes', () => {
  const rows = [
    // riser: doubles his rate when trailing
    row({ playerId: 1, minTrailing: 45, minLevel: 45, actTrailing: 40, actLevel: 20, actions: 60 }),
    // teammate: flat
    row({ playerId: 2, minTrailing: 45, minLevel: 45, actTrailing: 30, actLevel: 30, actions: 60 }),
    // never trailed
    row({ playerId: 3 })
  ];
  const players = M.computeComponents(rows);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  assert.ok(byId['1'].raw.trailing > 0);
  assert.ok(byId['2'].raw.trailing < 0);
  assert.equal(byId['3'].raw.trailing, 0);
  assert.ok(Math.abs(byId['1'].raw.trailing) < Math.abs(byId['1'].unshrunk.trailing), 'shrunk toward zero');
});

test('goalkeepers are excluded and the index is a within-position percentile', () => {
  const rows = [
    row({ playerId: 1, position: 'Goalkeeper' }),
    row({ playerId: 2, counterpress: 9 }),
    row({ playerId: 3, counterpress: 1 }),
    row({ playerId: 4, position: 'Right Back', counterpress: 5 })
  ];
  const ranked = M.scoreIndex(M.computeComponents(rows), { minMinutes: 0 });
  assert.ok(!ranked.some((p) => p.id === '1'));
  const df = ranked.find((p) => p.id === '4');
  assert.equal(df.index, 100, 'alone in its position group');
  assert.ok(ranked.find((p) => p.id === '2').componentPct.counterpress > ranked.find((p) => p.id === '3').componentPct.counterpress);
});

test('spearman and AUC behave on known inputs', () => {
  assert.ok(Math.abs(M.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9);
  assert.ok(Math.abs(M.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-9);
  assert.equal(M.auc([1, 2, 3, 4], [false, false, true, true]), 1);
  assert.equal(M.auc([1, 1, 1, 1], [false, true, false, true]), 0.5);
});

// ---- real data ------------------------------------------------------------

test('data file: 64 matches, licence stated, state minutes add up', () => {
  assert.equal(data.games, 64);
  assert.match(data.licence, /commercial use prohibited/);
  assert.ok(data.rows.length > 1500);
  const bad = data.rows.filter((r) => Math.abs(r.minTrailing + r.minLevel + r.minLeading - r.minutes) > 0.5);
  assert.equal(bad.length, 0);
});

test('holdout validation is deterministic and compares against minutes, Impact and actions/90', () => {
  const a = M.validate(data, { splitId: 'temporal', outcomeId: 'trailing', reps: 200 });
  const b = M.validate(data, { splitId: 'temporal', outcomeId: 'trailing', reps: 200 });
  assert.deepEqual(a, b);
  assert.ok(a.n >= 100);
  assert.deepEqual(a.predictors.map((p) => p.id), ['index', 'component', 'minutes', 'impact', 'actions90']);
  assert.deepEqual(a.deltas.map((d) => d.vs), ['minutes', 'impact', 'actions90']);
  a.predictors.forEach((p) => {
    assert.ok(p.rhoCi[0] <= p.rho + 0.05 && p.rho - 0.05 <= p.rhoCi[1], p.id + ' point inside CI');
  });
});

test('honest result: no signal in any pre-registered test, and the verdict says so', () => {
  const all = M.validateAll(data, { reps: 300 });
  assert.equal(all.length, 4);
  all.forEach((v) => {
    assert.equal(v.signal, false, v.splitId + '/' + v.outcomeId);
    assert.match(v.verdict, /^לא נמצא אות/);
  });
});

test('only counter-press repeats between halves; adversity components do not', () => {
  const r = M.componentReliability(data, 'oddEven');
  const by = Object.fromEntries(r.items.map((i) => [i.id, i.rho]));
  assert.ok(by.counterpress >= 0.3);
  assert.ok(Math.abs(by.trailing) < 0.2);
  assert.ok(Math.abs(by.reaction) < 0.2);
  assert.ok(by.actions90 >= by.counterpress, 'raw volume repeats at least as well');
});

// ---- page -----------------------------------------------------------------

test('page: no faces, no personality claim, verdict computed not hard-coded', () => {
  assert.match(html, /NO_FACE_MODEL/);
  assert.match(html, /NO_PERSONALITY_CLAIM/);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<video\b|getUserMedia/i);
  assert.match(html, /v\.signal/);
  assert.match(html, /src="\.\.\/mentality\.js"/);
  assert.match(html, /lang="he" dir="rtl"/);
  assert.match(html, /Barrett/);
  assert.match(html, /תיקון 13/);
});

test('home page links to the mentality lab', () => {
  assert.match(home, /href="mentality\/"/);
});
