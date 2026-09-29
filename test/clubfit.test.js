'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const C = require('../clubfit.js');
const { aggregateMatch } = require('../tools/build-club-fit.js');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_club_fit.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'club-fit', 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ---- builder: synthetic StatsBomb-shaped events ---------------------------

function ev(over) {
  return Object.assign({ id: 'e' + Math.random(), period: 1, minute: 0, second: 0, timestamp: '00:00:00.000', play_pattern: { name: 'Regular Play' } }, over);
}
const A = { name: 'Alpha' };
const B = { name: 'Beta' };
const cb = { id: 1, name: 'A Back' };
const st = { id: 2, name: 'A Nine' };
const q1 = { id: 11, name: 'B One' };
function lineup(team, slots) {
  return ev({ type: { name: 'Starting XI' }, team: team, tactics: { lineup: slots.map((s) => ({ player: s[0], position: { name: s[1] } })) } });
}
function syntheticMatch() {
  return [
    lineup(A, [[cb, 'Left Center Back'], [st, 'Center Forward']]),
    lineup(B, [[q1, 'Center Midfield']]),
    // CB: short build-up pass under pressure that progresses 12 yards
    ev({ minute: 1, type: { name: 'Pass' }, team: A, possession_team: A, possession: 2, player: cb, location: [20, 40], under_pressure: true, pass: { length: 14, end_location: [32, 40] } }),
    // CB: long ball (not progressive under pressure)
    ev({ minute: 2, type: { name: 'Pass' }, team: A, possession_team: A, possession: 2, player: cb, location: [30, 40], pass: { length: 40, end_location: [70, 40] } }),
    // CB: through ball completed to the striker
    ev({ id: 'tb', minute: 3, type: { name: 'Pass' }, team: A, possession_team: A, possession: 2, player: cb, location: [62, 40], pass: { length: 30, end_location: [92, 40], technique: { name: 'Through Ball' }, recipient: st, shot_assist: true, assisted_shot_id: 'sh1' } }),
    ev({ id: 'sh1', minute: 3, second: 5, type: { name: 'Shot' }, team: A, possession_team: A, possession: 2, player: st, location: [110, 40], shot: { statsbomb_xg: 0.4, outcome: { name: 'Goal' }, body_part: { name: 'Right Foot' }, type: { name: 'Open Play' } } }),
    // Beta passes in their own 60 % and Alpha's pressing in Beta's 60 %
    ev({ minute: 5, type: { name: 'Pass' }, team: B, possession_team: B, possession: 3, player: q1, location: [30, 40], pass: { length: 10, end_location: [40, 40] } }),
    ev({ minute: 5, type: { name: 'Pass' }, team: B, possession_team: B, possession: 3, player: q1, location: [50, 40], pass: { length: 10, end_location: [60, 40] } }),
    ev({ minute: 6, type: { name: 'Interception' }, team: A, possession_team: B, possession: 3, player: st, location: [90, 40], interception: { outcome: { name: 'Won' } } }),
    ev({ minute: 6, type: { name: 'Pressure' }, team: A, possession_team: B, possession: 3, player: st, location: [100, 40], counterpress: true }),
    // Corner -> headed set-piece shot by the CB
    ev({ id: 'sh2', minute: 20, type: { name: 'Shot' }, team: A, possession_team: A, possession: 4, play_pattern: { name: 'From Corner' }, player: cb, location: [112, 40], shot: { statsbomb_xg: 0.1, outcome: { name: 'Saved' }, body_part: { name: 'Head' }, type: { name: 'Open Play' }, aerial_won: true } }),
    // a penalty is excluded from npxG
    ev({ minute: 30, type: { name: 'Shot' }, team: A, possession_team: A, possession: 5, play_pattern: { name: 'Other' }, player: st, location: [108, 40], shot: { statsbomb_xg: 0.76, outcome: { name: 'Off T' }, body_part: { name: 'Right Foot' }, type: { name: 'Penalty' } } }),
    ev({ period: 2, minute: 45, type: { name: 'Half Start' }, team: A }),
    ev({ period: 2, minute: 90, type: { name: 'Half End' }, team: A })
  ];
}
const META = { matchId: 1, date: 'x', stage: 'Group Stage', home: 'Alpha', away: 'Beta', teamMatchNo: { Alpha: 1, Beta: 1 } };

test('builder: team style counts (PPDA inputs, possessions, set-piece xG without penalties)', () => {
  const { teamRows } = aggregateMatch(syntheticMatch(), META);
  const a = teamRows.find((r) => r.team === 'Alpha');
  const b = teamRows.find((r) => r.team === 'Beta');
  assert.equal(a.passes, 3);
  assert.equal(a.oppPasses, 2);
  assert.equal(a.oppPassesOwn60, 2, 'both Beta passes start at x <= 72');
  assert.equal(a.defActsOpp60, 1, 'the interception at x=90');
  assert.equal(a.throughBalls, 1);
  assert.equal(a.counterpress, 1);
  assert.equal(a.possessions, 3);
  assert.ok(Math.abs(a.npxg - 0.5) < 1e-9, 'penalty excluded');
  assert.ok(Math.abs(a.setPieceXg - 0.1) < 1e-9);
  assert.equal(a.goalsFor, 1);
  assert.equal(b.goalsAgainst, 1);
  assert.equal(a.ownThirdPasses, 2);
  assert.equal(a.ownThirdShort, 1);
});

test('builder: role actions per player (progressive under pressure, through ball received, xA, aerials)', () => {
  const { playerRows } = aggregateMatch(syntheticMatch(), META);
  const back = playerRows.find((r) => r.playerId === 1);
  const nine = playerRows.find((r) => r.playerId === 2);
  assert.equal(back.position, 'Left Center Back');
  assert.equal(back.progPass, 3);
  assert.equal(back.progPassUP, 1);
  assert.equal(back.buildUpPass, 1);
  assert.equal(back.longPass, 1);
  assert.equal(back.throughBalls, 1);
  assert.ok(Math.abs(back.xA - 0.4) < 1e-9);
  assert.equal(back.setPieceShots, 1);
  assert.equal(back.headedShots, 1);
  assert.equal(back.aerialsWon, 1);
  assert.equal(nine.receivedThrough, 1);
  assert.equal(nine.counterpress, 1);
  assert.equal(nine.pressAtt, 1);
  assert.equal(nine.tacklesInt, 1);
  assert.equal(nine.shots, 1, 'penalty not counted');
  assert.ok(nine.minutes > 70, 'on from kick-off to the last event of each half');
});

// ---- model ----------------------------------------------------------------

test('roles map from StatsBomb positions', () => {
  assert.equal(C.roleOf('Left Center Back'), 'CB');
  assert.equal(C.roleOf('Right Wing Back'), 'FB');
  assert.equal(C.roleOf('Left Back'), 'FB');
  assert.equal(C.roleOf('Center Defensive Midfield'), 'DM');
  assert.equal(C.roleOf('Right Center Midfield'), 'CM');
  assert.equal(C.roleOf('Left Wing'), 'AM');
  assert.equal(C.roleOf('Right Midfield'), 'AM');
  assert.equal(C.roleOf('Center Attacking Midfield'), 'AM');
  assert.equal(C.roleOf('Secondary Striker'), 'ST');
  assert.equal(C.roleOf('Goalkeeper'), 'GK');
});

test('a pressing profile raises the striker counter-press weight; a possession profile raises the CB progressive-pass-under-pressure weight', () => {
  const neutral = C.neutralZ();
  const pressing = Object.assign(C.neutralZ(), { pressIntensity: 2, counterpress: 2, pressHeight: 2 });
  const w = (role, z, metric) => C.weightsFor(role, z).find((x) => x.metric === metric).weight;
  assert.ok(w('ST', pressing, 'counterpress') > w('ST', neutral, 'counterpress') + 1);
  assert.ok(w('ST', pressing, 'pressAtt') > w('ST', neutral, 'pressAtt') + 1);
  const possession = Object.assign(C.neutralZ(), { possession: 2, buildUp: 2 });
  assert.ok(w('CB', possession, 'progPassUP') > w('CB', neutral, 'progPassUP') + 1);
  assert.equal(w('CB', possession, 'longPass'), 0, 'weights never go negative');
});

function prow(over) {
  return Object.assign({ matchId: 1, teamMatchNo: 1, team: 'T', position: 'Center Forward', minutes: 270 }, over);
}

test('shortlist gives at most 3 reasons, ranks by fit, explains near misses, and follows the profile', () => {
  const rows = [];
  for (let i = 0; i < 16; i += 1) {
    rows.push(prow({ playerId: i, name: 'P' + i, counterpress: i, pressAtt: i, npxg: 16 - i, boxTouches: 16 - i }));
  }
  const model = { players: C.playerProfiles(C.aggregatePlayers(rows)), metrics: C.METRIC_IDS, teams: [] };
  const pressing = Object.assign(C.neutralZ(), { pressIntensity: 2.5, counterpress: 2.5, pressHeight: 2.5 });
  const list = C.shortlist(model, pressing, 'ST', { top: 5, nearMiss: 3, teamName: 'Pressers' });
  assert.equal(list.shortlist.length, 5);
  assert.equal(list.nearMisses.length, 3);
  assert.equal(list.shortlist[0].name, 'P15', 'most counter-pressing striker first for a pressing team');
  list.shortlist.forEach((r) => assert.ok(r.reasons.length <= 3));
  assert.match(list.shortlist[0].reasons[0].text, /Pressers/);
  list.nearMisses.forEach((r) => assert.match(r.whyNot, /^חסרות [\d.]+ נק׳ התאמה למקום 5/));
  const box = Object.assign(C.neutralZ(), { pressIntensity: -2.5, counterpress: -2.5, pressHeight: -2.5 });
  assert.equal(C.shortlist(model, box, 'ST', { top: 5 }).shortlist[0].name, 'P0', 'a low-block team wants the box striker');
  for (let i = 1; i < list.all.length; i += 1) assert.ok(list.all[i - 1].fit >= list.all[i].fit);
});

test('per-90 rates are shrunk toward the role mean: a 20-minute cameo at 1.5x the raw rate of a 450-minute regular ranks below him', () => {
  const rows = [
    prow({ playerId: 1, name: 'cameo', minutes: 20, counterpress: 2 }),
    prow({ playerId: 2, name: 'regular', minutes: 450, counterpress: 30 }),
    prow({ playerId: 3, name: 'other', minutes: 450, counterpress: 10 })
  ];
  const players = C.playerProfiles(C.aggregatePlayers(rows));
  const by = Object.fromEntries(players.map((p) => [p.name, p]));
  assert.ok(by.cameo.rate.counterpress < 2 * 90 / 20);
  assert.ok(2 * 90 / 20 > 30 * 90 / 450, 'raw rate of the cameo is higher');
  assert.ok(by.regular.pct.counterpress > by.cameo.pct.counterpress);
});

test('bring-your-own CSV: required columns, missing actions get weight 0, provenance is USER_LICENSED_DATA', () => {
  assert.equal(C.parseUserCsv('name,team\nx,y').ok, false);
  assert.match(C.parseUserCsv('name,team,position,minutes\nx,y,Center Back,90').errors[0], /עמודת פעולה/);
  const parsed = C.parseUserCsv(C.EXAMPLE_CSV);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 6);
  const teams = C.teamProfiles(data.teamMatches);
  const model = C.buildUserModel(parsed, teams.teams, teams.stats, data.playerMatches);
  assert.equal(model.provenance, C.USER_PROVENANCE);
  const w = C.weightsFor('CB', C.neutralZ(), model.metrics);
  assert.ok(w.every((x) => model.metrics.includes(x.metric) || x.weight === 0));
  const list = C.shortlist(model, C.neutralZ(), 'CB', { minMinutes: 0, top: 3 });
  assert.equal(list.n, 3);
  const bad = C.parseUserCsv('name,team,position,minutes,progPass\nx,y,Goalkeeper,90,3');
  assert.equal(bad.ok, false);
});

test('an uploaded copy of the Open Data players is not labelled as the user\'s own data', () => {
  const lines = ['name,team,position,minutes,progPass'];
  data.playerMatches.slice(0, 20).forEach((r) => lines.push([r.name, r.team, r.position, r.minutes, r.progPass].join(',')));
  const parsed = C.parseUserCsv(lines.join('\n'));
  const teams = C.teamProfiles(data.teamMatches);
  assert.equal(C.buildUserModel(parsed, teams.teams, teams.stats, data.playerMatches).provenance, C.PROVENANCE);
});

// ---- real data ------------------------------------------------------------

test('data file: 64 matches, 32 teams, licence stated, possession shares add up per match', () => {
  assert.equal(data.games, 64);
  assert.match(data.licence, /commercial use prohibited/);
  assert.equal(data.teamMatches.length, 128);
  const model = C.buildModel(data);
  assert.equal(model.teams.length, 32);
  const byMatch = {};
  data.teamMatches.forEach((r) => { (byMatch[r.matchId] = byMatch[r.matchId] || []).push(r); });
  Object.values(byMatch).forEach(([a, b]) => {
    assert.equal(a.passes, b.oppPasses);
    assert.equal(a.goalsFor, b.goalsAgainst);
  });
  const spain = model.teams.find((t) => t.team === 'Spain');
  assert.ok(spain.z.possession > 1.5, 'Spain 2018 is the possession side');
});

test('validation is deterministic', () => {
  assert.deepEqual(C.teamStability(data, 'oddEven', { reps: 100 }), C.teamStability(data, 'oddEven', { reps: 100 }));
  assert.deepEqual(C.fitStability(data, 'oddEven', { reps: 100 }), C.fitStability(data, 'oddEven', { reps: 100 }));
});

test('honest result — team profiles: build-up is stable in both splits, pressing intensity is noise in both', () => {
  ['oddEven', 'temporal'].forEach((s) => {
    const r = C.teamStability(data, s, { reps: 300 });
    const by = Object.fromEntries(r.dims.map((d) => [d.id, d]));
    assert.equal(by.buildUp.verdict, 'stable', s);
    assert.equal(by.pressIntensity.verdict, 'noise', s);
    assert.equal(by.through.verdict, 'noise', s);
    assert.ok(r.fingerprintHits <= 5, 'the nine dimensions do not fingerprint a team from 1–4 matches');
  });
});

test('honest result — player fit repeats only partly; the team-specific part repeats; own-team recognition fails', () => {
  ['oddEven', 'temporal'].forEach((s) => {
    const f = C.fitStability(data, s, { reps: 300 });
    assert.ok(f.n >= 200);
    assert.equal(f.fitVerdict, 'partial', s);
    assert.equal(f.specificSignal, true, s);
    assert.match(f.verdict, /יציב חלקית/);
    const by = Object.fromEntries(f.items.map((i) => [i.id, i]));
    assert.ok(by.progPass.rho > by.fit.rho, 'a single passing rate repeats better than the composite fit');
    const o = C.ownTeamRecognition(data, s, { reps: 300 });
    assert.equal(o.signal, false, s);
    assert.ok(o.ci[0] < 50 && o.ci[1] > 50);
  });
});

test('lists differ between teams, but mostly at the margin', () => {
  const model = C.buildModel(data);
  C.ROLE_IDS.forEach((r) => {
    const d = C.listDiversity(model, r);
    assert.ok(d.meanRho > 0.5 && d.meanRho < 0.95, r + ' ' + d.meanRho);
    assert.ok(d.meanTop10Overlap < 9, r);
  });
});

// ---- page -----------------------------------------------------------------

test('page: Hebrew RTL, computed verdicts, custom sliders, why-not, BYOD, no faces', () => {
  assert.match(html, /lang="he" dir="rtl"/);
  assert.match(html, /src="\.\.\/clubfit\.js"/);
  assert.match(html, /fs\.verdict/);
  assert.match(html, /ot\.signal/);
  assert.match(html, /type="range"/);
  assert.match(html, /פרופיל מותאם אישית/);
  assert.match(html, /למה לא/);
  assert.match(html, /type="file"/);
  assert.match(html, /NO_FACE_MODEL/);
  assert.match(html, /מה לא נבדק/);
  assert.doesNotMatch(html, /<img\b|<video\b|getUserMedia/i);
});

test('home page links to the club-fit lab', () => {
  assert.match(home, /href="club-fit\/"/);
});
