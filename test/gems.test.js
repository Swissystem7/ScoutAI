'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const G = require('../gems.js');
const { gemsCounts, buildRows, isProgressive, betweenLines } = require('../tools/build-gems.js');
const { matchPlayers, candidatesFrom } = require('../tools/build-heights.js');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_gems_matches.json'), 'utf8'));
const heights = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_heights.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'gems', 'index.html'), 'utf8')
  + fs.readFileSync(path.join(root, 'gems', 'page.js'), 'utf8'); // page script lives in page.js
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const template = fs.readFileSync(path.join(root, 'data', 'gems-template.csv'), 'utf8');

// ---- builder: synthetic StatsBomb-shaped events ---------------------------

function ev(over) {
  return Object.assign({ period: 1, minute: 0, second: 0, timestamp: '00:00:00.000', possession: 1, possession_team: { name: 'Alpha' }, team: { name: 'Alpha' } }, over);
}
const A = { name: 'Alpha' };
const B = { name: 'Beta' };
const p1 = { id: 1, name: 'A One' };
const p2 = { id: 2, name: 'A Two' };
const q1 = { id: 11, name: 'B One' };

function syntheticMatch() {
  return [
    ev({ type: { name: 'Starting XI' }, team: A, tactics: { lineup: [{ player: p1, position: { name: 'Center Midfield' } }, { player: p2, position: { name: 'Center Forward' } }] } }),
    ev({ type: { name: 'Starting XI' }, team: B, possession_team: B, tactics: { lineup: [{ player: q1, position: { name: 'Left Center Back' } }] } }),
    // possession 1 (Alpha): p1 receives between the lines, passes into the box under pressure, p2 heads at goal
    ev({ id: 'r1', minute: 5, type: { name: 'Ball Receipt*' }, player: p1, location: [85, 40] }),
    ev({ id: 'c1', minute: 5, type: { name: 'Carry' }, player: p1, location: [60, 40], carry: { end_location: [85, 40] } }),
    ev({ id: 'k1', minute: 5, type: { name: 'Pass' }, player: p1, location: [85, 40], under_pressure: true, pass: { end_location: [110, 40], shot_assist: true } }),
    ev({ id: 's1', minute: 5, type: { name: 'Shot' }, player: p2, location: [110, 40], shot: { statsbomb_xg: 0.3, key_pass_id: 'k1', body_part: { name: 'Head' }, aerial_won: true, outcome: { name: 'Saved' }, type: { name: 'Open Play' } } }),
    // Beta centre-back loses the aerial contest
    ev({ minute: 5, type: { name: 'Duel' }, team: B, player: q1, location: [10, 40], duel: { type: { name: 'Aerial Lost' } } }),
    // possession 2 (Alpha): p2 lays off, p1 shoots with the foot; penalty ignored
    ev({ possession: 2, minute: 20, type: { name: 'Pass' }, player: p2, location: [95, 30], pass: { end_location: [100, 35], outcome: { name: 'Incomplete' } } }),
    ev({ possession: 2, minute: 20, type: { name: 'Shot' }, player: p1, location: [100, 35], shot: { statsbomb_xg: 0.1, body_part: { name: 'Right Foot' }, outcome: { name: 'Off T' }, type: { name: 'Open Play' } } }),
    ev({ possession: 3, minute: 30, type: { name: 'Shot' }, player: p2, location: [108, 40], shot: { statsbomb_xg: 0.76, body_part: { name: 'Right Foot' }, outcome: { name: 'Goal' }, type: { name: 'Penalty' } } }),
    // defensive events
    ev({ possession: 4, possession_team: B, minute: 40, type: { name: 'Interception' }, player: p1, location: [50, 40], interception: { outcome: { name: 'Won' } } }),
    ev({ possession: 4, possession_team: B, minute: 41, type: { name: 'Ball Recovery' }, player: p1, location: [50, 40], ball_recovery: { recovery_failure: true } }),
    ev({ possession: 4, possession_team: B, minute: 42, type: { name: 'Pressure' }, player: p1, location: [50, 40], counterpress: true }),
    ev({ possession: 4, possession_team: B, minute: 43, type: { name: 'Clearance' }, team: B, player: q1, location: [10, 40], clearance: { aerial_won: true } }),
    ev({ possession: 4, possession_team: B, minute: 44, type: { name: 'Clearance' }, team: B, player: q1, location: [10, 40] }),
    ev({ period: 2, minute: 45, type: { name: 'Half Start' } }),
    ev({ period: 2, minute: 90, type: { name: 'Half End' } })
  ];
}

test('builder counts physical and technical events separately', () => {
  const c = gemsCounts(syntheticMatch());
  const a1 = c.get(1);
  const a2 = c.get(2);
  const b1 = c.get(11);
  assert.equal(a1.receptionsBetweenLines, 1);
  assert.equal(a1.passesIntoBox, 1);
  assert.equal(a1.progCarries, 1, 'carry 60->85 on the centre line is progressive');
  assert.equal(a1.pressuredPasses, 1);
  assert.equal(a1.pressuredPassesCompleted, 1);
  assert.equal(a1.keyPassesOpen, 1);
  assert.equal(a1.xa, 0.3);
  assert.equal(a1.interceptionsWon, 1);
  assert.equal(a1.recoveries, 0, 'a failed recovery is not a recovery');
  assert.equal(a1.counterpress, 1);
  assert.equal(a1.footXg, 0.1);
  assert.equal(a2.headedXg, 0.3);
  assert.equal(a2.aerialWon, 1);
  assert.equal(a2.npxg, 0.3, 'penalty xG is excluded');
  assert.equal(b1.aerialLost, 1);
  assert.equal(b1.aerialWon, 1);
  assert.equal(b1.clearances, 1, 'the aerial clearance counts once, as an aerial');
});

test('builder credits xGChain to everyone in the possession and xGBuildup only to non-shooters / non-key-passers', () => {
  const c = gemsCounts(syntheticMatch());
  // possession 1 xG 0.3 (p1 key pass, p2 shot); possession 2 xG 0.1 (p2 lay-off, p1 shot)
  assert.equal(c.get(1).xgChain, 0.4);
  assert.equal(c.get(2).xgChain, 0.4);
  assert.equal(c.get(1).xgBuildup, 0, 'p1 played the key pass in #1 and shot in #2');
  assert.equal(c.get(2).xgBuildup, 0.1, 'p2 only laid off in #2');
});

test('buildRows joins minutes and position from the mentality builder', () => {
  const rows = buildRows(syntheticMatch(), { matchId: 9, date: 'x', stage: 'Group Stage', home: 'Alpha', away: 'Beta', teamMatchNo: { Alpha: 1, Beta: 1 } });
  const a1 = rows.find((r) => r.playerId === 1);
  assert.equal(a1.position, 'Center Midfield');
  assert.ok(a1.minutes > 80);
  assert.equal(a1.passesIntoBox, 1);
});

test('geometry helpers: progressive = 25% closer to goal; between lines = zone in front of the box', () => {
  assert.equal(isProgressive([60, 40], [85, 40], 5), true);
  assert.equal(isProgressive([100, 40], [104, 40], 5), false);
  assert.equal(betweenLines([90, 40]), true);
  assert.equal(betweenLines([104, 40]), false, 'inside the box is not between the lines');
  assert.equal(betweenLines([90, 5]), false, 'the touchline is not between the lines');
});

// ---- module ---------------------------------------------------------------

test('roles split centre-backs from full-backs and holding from attacking midfielders', () => {
  assert.equal(G.roleOf('Left Center Back'), 'CB');
  assert.equal(G.roleOf('Right Wing Back'), 'FB');
  assert.equal(G.roleOf('Left Back'), 'FB');
  assert.equal(G.roleOf('Center Defensive Midfield'), 'CM');
  assert.equal(G.roleOf('Right Center Midfield'), 'CM');
  assert.equal(G.roleOf('Center Attacking Midfield'), 'AM');
  assert.equal(G.roleOf('Left Wing'), 'AM');
  assert.equal(G.roleOf('Secondary Striker'), 'ST');
  assert.equal(G.roleOf('Goalkeeper'), 'GK');
  assert.equal(G.roleOf('fw'), 'ST', 'client role codes are accepted');
});

function player(over) {
  return Object.assign({ playerId: 1, name: 'x', team: 'T', position: 'Center Midfield', minutes: 270, teamMatchNo: 1 }, over);
}

function cohort(extra) {
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push(player({ playerId: i + 1, name: 'P' + i, passesIntoBox: i, progPasses: 10 + i, progCarries: 5, receptionsBetweenLines: i % 4, pressuredPasses: 20, pressuredPassesCompleted: 12 + (i % 6), counterpress: 5 + (i % 3), interceptionsWon: 2, recoveries: 6, aerialWon: 12 - i, tacklesWon: 3 }));
  }
  return rows.concat(extra || []);
}

test('the technical-decision index ignores aerials and physical duels; the conventional rating does not', () => {
  const base = G.scorePlayers(G.computePlayers(cohort()), { minMinutes: 90 });
  const boosted = cohort().map((r) => (r.playerId === 1 ? Object.assign({}, r, { aerialWon: 60, tacklesWon: 30, clearances: 40, headedXg: 2 }) : r));
  const after = G.scorePlayers(G.computePlayers(boosted), { minMinutes: 90 });
  const b = base.find((p) => p.id === '1');
  const a = after.find((p) => p.id === '1');
  assert.equal(a.tdiZ, b.tdiZ, 'TDI unchanged by physical events');
  assert.ok(a.convZ > b.convZ, 'conventional rating rises');
  assert.ok(a.physicalShare > b.physicalShare, 'physical share rises');
});

test('physical share and breakdown add up', () => {
  const [p] = G.computePlayers([player({ aerialWon: 4, passesIntoBox: 2, footXg: 0 })]);
  assert.equal(p.physicalShare, 4 / 6);
  const b = G.breakdown(p);
  assert.equal(b.physicalShare, 66.7);
  const total = b.items.reduce((s, it) => s + it.share, 0);
  assert.ok(Math.abs(total - 100) < 0.5);
});

test('hidden gem = high TDI percentile and low conventional percentile inside the role', () => {
  const gemRow = player({ playerId: 99, name: 'Gem', passesIntoBox: 30, progPasses: 40, progCarries: 20, receptionsBetweenLines: 10, pressuredPasses: 20, pressuredPassesCompleted: 19, counterpress: 10, interceptionsWon: 4, recoveries: 8, aerialWon: 0, tacklesWon: 0 });
  const players = G.scorePlayers(G.computePlayers(cohort([gemRow])), { minMinutes: 90 });
  const gem = players.find((p) => p.id === '99');
  assert.equal(gem.tdiPct, 100);
  assert.equal(gem.isGem, gem.convPct <= G.GEM_MAX_CONV);
  G.hiddenGems(players).forEach((p) => {
    assert.ok(p.tdiPct >= G.GEM_MIN_TDI && p.convPct <= G.GEM_MAX_CONV);
  });
});

test('pre-registered settings are frozen', () => {
  assert.ok(Object.isFrozen(G.TDI_COMPONENTS));
  assert.ok(Object.isFrozen(G.PHYSICAL_ITEMS));
  assert.ok(Object.isFrozen(G.TECHNICAL_ITEMS));
  assert.ok(Object.isFrozen(G.SPLITS));
  assert.ok(Object.isFrozen(G.OUTCOMES));
  assert.deepEqual(G.TDI_IDS, ['intoBox', 'progression', 'betweenLines', 'pressAccuracy', 'counterpress', 'positional']);
  assert.deepEqual(G.VERDICT_BASELINES, ['conventional', 'minutes']);
  const tdiFields = G.TDI_COMPONENTS.map((c) => c.fields).join(' ');
  G.PHYSICAL_ITEMS.forEach((it) => assert.ok(!tdiFields.includes(it.id), it.id + ' must not feed the TDI'));
});

// ---- data + honest validation --------------------------------------------

test('gems data: 64 matches, 1,790 player-match rows, same minutes as the mentality file', () => {
  assert.equal(data.games, 64);
  assert.equal(data.rows.length, 1790);
  const mentality = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_mentality_matches.json'), 'utf8'));
  const sum = (rows) => Math.round(rows.reduce((s, r) => s + r.minutes, 0));
  assert.equal(sum(data.rows), sum(mentality.rows));
  const aerialWon = data.rows.reduce((s, r) => s + r.aerialWon, 0);
  const aerialLost = data.rows.reduce((s, r) => s + r.aerialLost, 0);
  assert.equal(aerialWon, aerialLost, 'every aerial contest has one winner and one loser');
});

const all = G.validateAll(data);

test('hold-out validation: six tests, enough players, CIs present, verdict matches the rule', () => {
  assert.equal(all.length, 6);
  all.forEach((v) => {
    assert.ok(v.n >= 250, v.splitId + '/' + v.outcomeId + ' n=' + v.n);
    const idx = v.predictors.find((p) => p.id === 'tdi');
    assert.ok(idx.rhoCi[0] != null && idx.rhoCi[0] <= idx.rho && idx.rho <= idx.rhoCi[1]);
    const rule = v.n >= 30 && idx.rhoCi[0] > 0 && v.deltas.filter((d) => d.inVerdict).every((d) => d.ci[0] > 0);
    assert.equal(v.signal, rule);
    assert.match(v.verdict, v.signal ? /^נמצא אות/ : /^לא נמצא אות/);
  });
});

test('reported result: no full signal; TDI beats the physical-only rating in all six tests (README / page claims)', () => {
  assert.equal(all.filter((v) => v.signal).length, 0, 'README says «לא נמצא אות מלא»');
  all.forEach((v) => {
    const phys = v.deltas.find((d) => d.vs === 'physical');
    assert.ok(phys.ci[0] > 0, v.splitId + '/' + v.outcomeId + ' vs physical ' + phys.ci);
  });
  assert.match(readme, /לא נמצא אות מלא/);
});

test('validation is deterministic (seeded bootstrap)', () => {
  const again = G.validate(data, { splitId: 'temporal', outcomeId: 'xgChain' });
  assert.deepEqual(again.predictors, all[0].predictors);
});

test('test-retest: TDI repeats at about 0.44 in both splits (README claim)', () => {
  ['temporal', 'oddEven'].forEach((s) => {
    const r = G.reliability(data, s);
    const tdi = r.items.find((it) => it.id === 'tdi');
    assert.ok(Math.abs(tdi.rho - 0.44) <= 0.02, s + ' ' + tdi.rho);
    assert.ok(tdi.ci[0] > 0);
  });
});

// ---- heights / relative age ------------------------------------------------

test('heights file: Wikidata CC0, 572 matched, one Wikidata item per player, month only', () => {
  assert.match(heights.source, /Wikidata/);
  assert.equal(heights.matched, 572);
  const vals = Object.values(heights.players);
  assert.equal(vals.length, 572);
  assert.equal(new Set(vals.map((v) => v.wikidata)).size, vals.length);
  vals.forEach((v) => {
    assert.ok(v.heightCm >= 150 && v.heightCm <= 210);
    assert.deepEqual(Object.keys(v).sort(), ['birthMonth', 'heightCm', 'wikidata']);
  });
});

test('height matching is strict: a shared surname alone is not a match', () => {
  const b = (q, label, team) => ({ p: { value: 'http://www.wikidata.org/entity/' + q }, label: { value: label }, h: { value: '180' }, unit: { value: 'http://www.wikidata.org/entity/Q174728' }, ctys: { value: team } });
  const cands = candidatesFrom([b('Q1', 'Maxi Gómez', 'Uruguay'), b('Q2', 'Luis Suárez', 'Uruguay')]);
  const out = matchPlayers([
    { playerId: 1, name: 'Edinson Roberto Cavani Gómez', team: 'Uruguay' },
    { playerId: 2, name: 'Luis Alberto Suárez Díaz', team: 'Uruguay' }
  ], cands);
  assert.equal(out[1], undefined);
  assert.equal(out[2].q, 'Q2');
});

test('size-bias premise on WC2018: physical share rises with height; conventional rating does not; TDI leans short', () => {
  const t = G.buildTournament(data, { minMinutes: 90 });
  G.attachHeights(t, heights);
  const hb = G.heightBias(t);
  const by = {};
  hb.items.forEach((it) => { by[it.id] = it; });
  assert.ok(hb.n >= 400);
  assert.ok(by.share.ci[0] > 0, 'share ' + by.share.ci);
  assert.ok(by.aerials.ci[0] > 0);
  assert.ok(by.conventional.ci[0] < 0 && by.conventional.ci[1] > 0, 'conventional ' + by.conventional.ci);
  assert.ok(by.tdi.ci[1] < 0, 'tdi ' + by.tdi.ci);
});

test('relative age effect: chi-square is right and WC2018 players over-represent Jan–Mar births', () => {
  const small = G.relativeAge([{ birthMonth: 1 }, { birthMonth: 1 }, { birthMonth: 4 }, { birthMonth: 7 }]);
  assert.equal(small.chi2, 2);
  assert.ok(Math.abs(small.p - 0.57) < 0.01, 'chi2=2, 3 df -> p=0.572');
  const players = G.computePlayers(data.rows);
  G.attachHeights(players, heights);
  const rae = G.relativeAge(players);
  assert.deepEqual(rae.sharePct, [32, 25.4, 24.8, 17.9]);
  assert.ok(rae.p < 0.001);
});

// ---- bring your own data ---------------------------------------------------

test('CSV template parses and runs through the same pipeline', () => {
  const parsed = G.parseCsv(template);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.canValidate, true);
  assert.equal(parsed.hasHeights, true);
  const players = G.computePlayers(parsed.rows);
  assert.equal(players.length, 2);
  const target = players.find((p) => /Target/.test(p.name));
  const play = players.find((p) => /Playmaker/.test(p.name));
  assert.ok(target.physicalShare > play.physicalShare);
  assert.equal(target.heightCm, 193);
});

test('CSV errors are reported, not guessed', () => {
  assert.equal(G.parseCsv('name,team\nx,y').ok, false);
  const r = G.parseCsv('name,minutes,role,aerialWon,mystery\nA,90,CB,abc,1');
  assert.equal(r.ok, true);
  assert.equal(r.canValidate, false);
  assert.deepEqual(r.unknownColumns, ['mystery']);
  assert.ok(r.errors.some((e) => /aerialWon/.test(e)));
});

// ---- page -------------------------------------------------------------------

test('gems page: Hebrew RTL, loads its scripts, cites dated research, no face analysis', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /src="\.\.\/demo\.js"/);
  assert.match(html, /src="\.\.\/gems\.js"/);
  assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov\/19290678/);
  assert.match(html, /Cobley ועמיתים, Sports Medicine, 2009/);
  assert.match(html, /Frontiers, 3\.3\.2022/);
  assert.match(html, /FIFA Training Centre, 30\.11\.2023/);
  assert.match(html, /NO_FACE_MODEL/);
  assert.ok(!/<img/i.test(html), 'no images of people');
  assert.match(html, /gems-template\.csv/);
});

test('home page links to the gems lab', () => {
  assert.match(home, /href="gems\/"/);
});
