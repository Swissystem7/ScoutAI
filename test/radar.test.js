'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const R = require('../radar.js');
const { buildMatch } = require('../tools/build-radar.js');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'radar_tournaments.json'), 'utf8'));
const data = R.decode(raw);
const html = fs.readFileSync(path.join(root, 'radar', 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ---- builder on synthetic StatsBomb-shaped events --------------------------

function ev(over) { return Object.assign({ period: 1, minute: 0, second: 0, timestamp: '00:00:00.000' }, over); }
const A = { name: 'Alpha' };
const B = { name: 'Beta' };
const gk = { id: 1, name: 'Keeper A' };
const a2 = { id: 2, name: 'Mid A' };
const b1 = { id: 11, name: 'Fwd B' };
function lineup(team, slots) {
  return ev({ type: { name: 'Starting XI' }, team: team, tactics: { lineup: slots.map((s) => ({ player: s[0], position: { name: s[1] } })) } });
}

function synthetic() {
  return [
    lineup(A, [[gk, 'Goalkeeper'], [a2, 'Center Midfield']]),
    lineup(B, [[b1, 'Center Forward']]),
    // goal kick, long (40 yd)
    ev({ minute: 1, type: { name: 'Pass' }, team: A, player: gk, position: { name: 'Goalkeeper' }, location: [6, 40], pass: { length: 40, type: { name: 'Goal Kick' }, end_location: [46, 40] } }),
    // keeper short open-play pass
    ev({ minute: 2, type: { name: 'Pass' }, team: A, player: gk, position: { name: 'Goalkeeper' }, location: [10, 40], pass: { length: 10, end_location: [20, 40] } }),
    // long throw into the box (25 yd, ends in box)
    ev({ minute: 5, type: { name: 'Pass' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [100, 80], pass: { length: 25, type: { name: 'Throw-in' }, end_location: [110, 55] } }),
    // short corner (ends outside the box)
    ev({ minute: 6, type: { name: 'Pass' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [120, 80], pass: { length: 5, type: { name: 'Corner' }, end_location: [115, 76] } }),
    // cross in open play
    ev({ minute: 7, type: { name: 'Pass' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [100, 75], pass: { length: 30, cross: true, end_location: [112, 40] } }),
    // set-piece shot and open-play shot and a penalty (penalty excluded)
    ev({ minute: 8, type: { name: 'Shot' }, team: A, player: a2, position: { name: 'Center Midfield' }, play_pattern: { name: 'From Corner' }, location: [110, 40], shot: { statsbomb_xg: 0.3, type: { name: 'Open Play' } } }),
    ev({ minute: 9, type: { name: 'Shot' }, team: A, player: a2, position: { name: 'Center Midfield' }, play_pattern: { name: 'Regular Play' }, location: [100, 40], shot: { statsbomb_xg: 0.1, type: { name: 'Open Play' } } }),
    ev({ minute: 10, type: { name: 'Shot' }, team: A, player: a2, position: { name: 'Center Midfield' }, play_pattern: { name: 'Other' }, location: [108, 40], shot: { statsbomb_xg: 0.78, type: { name: 'Penalty' } } }),
    // pressures by A: one high + counterpress, one low
    ev({ minute: 11, type: { name: 'Pressure' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [90, 40], counterpress: true }),
    ev({ minute: 12, type: { name: 'Pressure' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [30, 40] }),
    // B passes in own 60% (count for A's PPDA), A interception high
    ev({ minute: 13, type: { name: 'Pass' }, team: B, player: b1, position: { name: 'Center Forward' }, location: [30, 40], pass: { length: 12, end_location: [42, 40] } }),
    ev({ minute: 14, type: { name: 'Pass' }, team: B, player: b1, position: { name: 'Center Forward' }, location: [60, 40], pass: { length: 12, end_location: [72, 40] } }),
    ev({ minute: 15, type: { name: 'Interception' }, team: A, player: a2, position: { name: 'Center Midfield' }, location: [70, 40] }),
    ev({ minute: 90, type: { name: 'Pass' }, team: B, player: b1, position: { name: 'Center Forward' }, location: [90, 40], pass: { length: 5, end_location: [95, 40] } })
  ];
}

test('builder counts every radar ingredient from raw events (long throw, short corner, keeper passes, set-piece xG, PPDA)', () => {
  const out = buildMatch(synthetic(), { matchId: 1, date: '2020-01-01', stage: 'Group Stage', home: 'Alpha', away: 'Beta' });
  const a = out.teamRows.find((r) => r.team === 'Alpha');
  const b = out.teamRows.find((r) => r.team === 'Beta');
  assert.equal(a.goalKicks, 1);
  assert.equal(a.goalKicksLong, 1);
  assert.equal(a.gkPasses, 2);
  assert.equal(a.gkLong, 1);
  assert.equal(a.longThrows, 1);
  assert.equal(a.corners, 1);
  assert.equal(a.shortCorners, 1);
  assert.equal(a.crosses, 1);
  assert.equal(a.openPasses, 2, 'goal kick, throw-in and corner are not open play');
  assert.equal(a.npShots, 2, 'penalty excluded');
  assert.ok(Math.abs(a.npxg - 0.4) < 1e-9);
  assert.ok(Math.abs(a.spXg - 0.3) < 1e-9);
  assert.equal(a.pressures, 2);
  assert.equal(a.highPress, 1);
  assert.equal(a.counterpress, 1);
  assert.equal(a.oppPassesOwn60, 2, 'B passes with x < 72');
  assert.equal(a.defActionsHigh, 1);
  assert.equal(b.oppPassesOwn60, 2, 'A passes with x < 72: the goal kick and the keeper pass');
  const keeper = out.playerRows.find((p) => p.id === 1);
  assert.equal(keeper.sums.gkPasses, 2);
  const mid = out.playerRows.find((p) => p.id === 2);
  assert.equal(mid.sums.longThrows, 1);
  assert.ok(mid.sums.minutes > 80);
});

// ---- statistics -------------------------------------------------------------

function rowsFrom(values, prefix) {
  return values.map((v, i) => ({ matchId: prefix + i, x: v, one: 1 }));
}
const meanMetric = { id: 'x', kind: 'mean', num: (r) => r.x, den: (r) => r.one };

test('identical groups are «within noise»; a clear shift is detected with the right sign', () => {
  const base = [];
  for (let i = 0; i < 40; i += 1) base.push(10 + ((i * 7) % 5));
  const same = R.compareMetric(rowsFrom(base, 'a'), rowsFrom(base, 'b'), meanMetric, { reps: 500 });
  assert.equal(R.direction(same), 'noise');
  assert.ok(same.ci[0] <= 0 && same.ci[1] >= 0);
  const up = R.compareMetric(rowsFrom(base, 'a'), rowsFrom(base.map((v) => v + 3), 'b'), meanMetric, { reps: 500 });
  assert.equal(R.direction(up), 'up');
  assert.ok(up.g > 0.8);
  const down = R.compareMetric(rowsFrom(base, 'a'), rowsFrom(base.map((v) => v - 3), 'b'), meanMetric, { reps: 500 });
  assert.equal(R.direction(down), 'down');
});

test('too few matches is degenerate, never a finding', () => {
  const res = R.compareMetric(rowsFrom([1, 2, 3], 'a'), rowsFrom([7, 8, 9], 'b'), meanMetric, { reps: 200 });
  assert.equal(res.degenerate, true);
  assert.equal(R.direction(res), 'noise');
});

test('verdict rule: both pairs same sign = confirmed; one = hint; opposite = conflict; none = noise', () => {
  assert.deepEqual(R.verdict(['up', 'up']), { id: 'confirmed', dir: 'up' });
  assert.deepEqual(R.verdict(['down', 'noise']), { id: 'hint', dir: 'down' });
  assert.deepEqual(R.verdict(['up', 'down']), { id: 'conflict', dir: null });
  assert.deepEqual(R.verdict(['noise', 'noise']), { id: 'noise', dir: null });
});

// ---- the real open data -----------------------------------------------------

test('coverage: exactly the four published men\'s tournaments, all matches', () => {
  assert.deepEqual(data.tournaments.map((t) => [t.key, t.matches]), [['wc2018', 64], ['wc2022', 64], ['euro2020', 51], ['euro2024', 51]]);
  assert.equal(data.teams.length, (64 + 64 + 51 + 51) * 2);
  assert.ok(!raw.playerFields.some((f) => /height|weight|face|photo/i.test(f)), 'no body or face fields');
});

const rows = R.radar(data, { reps: 2000 });
const byId = {};
rows.forEach((r) => { byId[r.metric.id] = r; });

test('radar on the open data: pinned verdicts (pre-registered rule, 2,000 match-cluster draws)', () => {
  assert.equal(rows.length, 14);
  assert.equal(byId.gkLongShare.verdict, 'confirmed');
  assert.equal(byId.gkLongShare.dir, 'down');
  assert.equal(byId.openLongShare.verdict, 'confirmed');
  assert.equal(byId.openLongShare.dir, 'down');
  assert.equal(byId.highPressShare.verdict, 'confirmed');
  assert.equal(byId.highPressShare.dir, 'up');
  assert.equal(byId.ppda.verdict, 'confirmed');
  assert.equal(byId.crossesPer90.verdict, 'noise');
  assert.equal(byId.longThrowsPer90.verdict, 'noise');
  assert.equal(byId.setPieceXgShare.verdict, 'noise');
  assert.equal(byId.shotDistance.verdict, 'conflict');
  rows.forEach((r) => r.pairs.forEach((p) => {
    assert.ok(p.ci && p.ci[0] <= p.diff && p.diff <= p.ci[1], r.metric.id + ' point estimate inside its CI');
  }));
});

test('placebo: splitting one tournament in half flags about 5% of metrics, not more', () => {
  const res = data.tournaments.map((t) => R.placebo(data, t.key, { reps: 2000 }));
  const flagged = res.reduce((s, r) => s + r.flagged, 0);
  assert.equal(res.reduce((s, r) => s + r.total, 0), 56);
  assert.ok(flagged <= 6, 'placebo flagged ' + flagged + '/56');
});

test('exemplars: earlier tournament only, 180+ minutes, ranked in the direction of change within position', () => {
  const list = R.exemplars(data, 'highPressShare', 'discovery', 'up', 5);
  assert.equal(list.length, 5);
  list.forEach((e) => {
    assert.equal(e.t, 'wc2018');
    assert.ok(e.minutes >= 180);
    assert.notEqual(e.positionGroup, 'GK');
  });
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].z >= list[i].z);
  const keepers = R.exemplars(data, 'gkLongShare', 'discovery', 'down', 5);
  assert.ok(keepers.length > 0);
  keepers.forEach((e) => assert.equal(e.positionGroup, 'GK'));
  for (let i = 1; i < keepers.length; i += 1) assert.ok(keepers[i - 1].z <= keepers[i].z);
  assert.deepEqual(R.exemplars(data, 'ppda', 'discovery', 'up', 5), [], 'team-only metric has no player exemplars');
  assert.ok(R.teamExemplars(data, 'ppda', 'discovery', 'up', 5).length === 5);
  assert.deepEqual(R.exemplars(data, 'highPressShare', 'discovery', null, 5), [], 'no direction, no exemplars');
});

// ---- bring your own data ----------------------------------------------------

test('BYOD CSV: clear Hebrew errors, and a real comparison when the file is valid', () => {
  assert.match(R.byodRadar('a,b\n1,2').error, /group/);
  assert.match(R.byodRadar('group,x\n1,2\n2,3\n3,4').error, /בדיוק שני ערכים/);
  let csv = 'group,match_id,team,val\n';
  for (let i = 0; i < 12; i += 1) csv += '2024,' + i + ',T' + i + ',' + (10 + (i % 3)) + '\n';
  for (let i = 0; i < 12; i += 1) csv += '2025,' + (100 + i) + ',T' + i + ',' + (14 + (i % 3)) + '\n';
  const res = R.byodRadar(csv, { reps: 300 });
  assert.deepEqual(res.groups, ['2024', '2025']);
  assert.equal(res.results.length, 1, 'team column is not a metric');
  assert.equal(res.results[0].dir, 'up');
  const quoted = R.parseCsv('group,"note, with comma"\r\n"a","x ""y"""\r\n');
  assert.equal(quoted.rows[0]['note, with comma'], 'x "y"');
});

// ---- the web-trends panel ---------------------------------------------------

test('«what is changing 2025–2026»: 5–8 dated, linked items from named sources', () => {
  assert.ok(R.WEB_TRENDS.length >= 5 && R.WEB_TRENDS.length <= 8);
  R.WEB_TRENDS.forEach((t) => {
    assert.match(t.url, /^https:\/\//);
    assert.match(t.date, /^20(25|26)-\d\d-\d\d/);
    assert.ok(t.source && t.title && t.text);
    if (t.metric) assert.ok(R.metricById(t.metric), t.metric);
  });
  assert.match(R.TREND_CHECKED, /^\d{4}-\d\d-\d\d$/);
});

// ---- the page ---------------------------------------------------------------

test('radar page: Hebrew RTL, says the open data is limited, loads its scripts, linked from the lab', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /הנתונים הפתוחים מוגבלים/);
  assert.match(html, /אין אף משחק מעונת 2025\/26/);
  assert.match(html, /<script src="\.\.\/radar\.js"><\/script>/);
  assert.match(html, /בדיקת פלצבו/);
  assert.ok(!/<img\b/i.test(html), 'no images on the page');
  assert.match(home, /href="radar\/"/);
  assert.match(home, /href="shortlist\/"/);
});
