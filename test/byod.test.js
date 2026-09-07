'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseUserDataset,
  mapUserColumns,
  parseTypedNumber,
  ensureDistinctPlayerIds,
  looksLikeOpenDataPayload,
  openDataPairOverlap,
  openDataRejectThreshold,
  createStore,
  exportMetricBundle,
  buildCompletionRecord,
  evaluateCurriculum,
  CURRICULUM_LESSONS,
  methodologyParagraph,
  validateMetric,
  DEFAULT_METRIC,
  USER_DATA_PROVENANCE,
  SYNTHETIC_PROVENANCE,
  OPEN_DATA_PROVENANCE,
  USER_DATASET_COLUMNS,
  positionGroup,
  DEFAULT_POSITION_ALIASES,
  MIN_POSITION_PEERS,
  mergePositionAliases,
  evaluateExercise,
  DEFENDER_EXERCISE,
  assignFold,
  describeSplitLabel,
  bestHelpfulBump,
  selectedWeightSwing
} = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const licence = fs.readFileSync(path.join(root, 'licence.html'), 'utf8');
const offer = fs.readFileSync(path.join(root, 'offer.html'), 'utf8');
const monetization = fs.readFileSync(path.join(root, 'MONETIZATION.md'), 'utf8');
const example = JSON.parse(fs.readFileSync(path.join(root, 'data', 'user-dataset.example.json'), 'utf8'));
const wc2018 = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_event_aggregates.json'), 'utf8'));

test('user JSON with attestation becomes USER_LICENSED_DATA and does not claim Open Data', () => {
  const parsed = parseUserDataset(JSON.stringify({
    players: [
      { name: 'Alpha', team: 'Home', position: 'Center Back', minutes: 400, pressures: 40, tackles: 8, interceptions: 6, defensiveActions: 20, progressiveActions: 10, keyPasses: 1, passesCompleted: 100, shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0 },
      { name: 'Beta', team: 'Away', position: 'Center Forward', minutes: 400, pressures: 10, tackles: 1, interceptions: 0, defensiveActions: 4, progressiveActions: 20, keyPasses: 6, passesCompleted: 50, shotXgSum: 2, boxTouches: 20, shotsOnTarget: 4 }
    ]
  }), { attested: true, fileName: 'club.json' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provenance, USER_DATA_PROVENANCE);
  assert.equal(parsed.players.length, 2);
  const store = createStore({ players: parsed.players }, { provenance: parsed.provenance, source: parsed.source });
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 });
  assert.equal(view.provenance, USER_DATA_PROVENANCE);
  assert.equal(view.commercialAllowed, true);
  assert.ok(view.rows.every((row) => row.provenance === USER_DATA_PROVENANCE));
  assert.equal(view.exportBundle.provenance, USER_DATA_PROVENANCE);
  assert.equal(view.exportBundle.commercial, false);
  assert.match(view.exportBundle.methodologyHe, /USER_LICENSED_DATA/);
  assert.doesNotMatch(view.exportBundle.methodologyHe, /מונדיאל 2018/);
});

test('refuses Open Data payload even if the user attests', () => {
  const wc = {
    source: 'StatsBomb Open Data',
    competitionId: 43,
    seasonId: 3,
    players: [{ name: 'Should Not Import', totalMinutesProxy: 300, pressures: 1 }]
  };
  assert.equal(looksLikeOpenDataPayload(wc), true);
  const parsed = parseUserDataset(JSON.stringify(wc), { attested: true });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.detected, OPEN_DATA_PROVENANCE);
  assert.match(parsed.errors[0], /StatsBomb Open Data/);
});

test('refuses user upload without an attestation', () => {
  const parsed = parseUserDataset(JSON.stringify({
    players: [{ name: 'No Attest', minutes: 200 }]
  }), { attested: false });
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /רישיון/);
});

test('parses CSV and the shipped synthetic example', () => {
  const csv = [
    'name,team,position,minutes,pressures,tackles,interceptions,defensiveActions,progressiveActions,keyPasses,passesCompleted,shotXgSum,boxTouches,shotsOnTarget',
    'Gamma,Home,Left Back,270,20,4,3,10,8,1,80,0.1,1,0',
    'Delta,Away,Right Wing,270,8,1,0,3,12,4,40,1.2,8,2'
  ].join('\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'clip.csv' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players.length, 2);
  assert.equal(parsed.players[0].name, 'Gamma');
  assert.ok(USER_DATASET_COLUMNS.includes('pressures'));

  const syn = parseUserDataset(JSON.stringify(example), { synthetic: true });
  assert.equal(syn.ok, true);
  assert.equal(syn.provenance, SYNTHETIC_PROVENANCE);
  assert.ok(example.players.length >= 35 && example.players.length <= 45,
    'synthetic example should be ~40 players, got ' + example.players.length);
  assert.equal(looksLikeOpenDataPayload(example), false);
  assert.equal(example.source, 'SYNTHETIC_EXAMPLE');
  const store = createStore(example, { provenance: SYNTHETIC_PROVENANCE, source: syn.source });
  assert.equal(store.derive({ minMinutes: 90 }).rows.length, example.players.length);
});

test('methodology and export stay source-honest', () => {
  const open = methodologyParagraph({ grit: 40, involvement: 30, clutch: 30, minMinutes: 270 });
  assert.match(open, /אוסר שימוש מסחרי/);
  const user = methodologyParagraph({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 }, { name: 'X', team: 'Y', score: 10, rank: 1, provenance: USER_DATA_PROVENANCE }, { provenance: USER_DATA_PROVENANCE });
  assert.match(user, /USER_LICENSED_DATA/);
  const bundle = exportMetricBundle({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 }, null, { provenance: SYNTHETIC_PROVENANCE });
  assert.equal(bundle.provenance, SYNTHETIC_PROVENANCE);
  assert.match(bundle.citationEn, /synthetic/i);
});

test('BYOD fixture with outcome column duplicated from a scoring input is flagged before rho', () => {
  // Copy pressures into assists so the selected outcome is a byte-level input clone.
  const players = [];
  for (let i = 0; i < 12; i += 1) {
    const pressures = (i + 1) * 3;
    players.push({
      name: 'P' + i,
      team: i < 6 ? 'France' : 'Brazil',
      position: 'Center Midfield',
      minutes: 400,
      pressures: pressures,
      tackles: i,
      interceptions: 1,
      defensiveActions: 5,
      progressiveActions: 8,
      keyPasses: 2,
      passesCompleted: 50,
      shotXgSum: 0.2,
      boxTouches: 3,
      shotsOnTarget: 1,
      assists: pressures,
      dribbles: 0,
      duelsWon: i,
      goals: 0
    });
  }
  const parsed = parseUserDataset(JSON.stringify({ players: players }), {
    attested: true,
    fileName: 'leaky-assists.json'
  });
  assert.equal(parsed.ok, true);
  const store = createStore({ players: parsed.players }, {
    provenance: parsed.provenance,
    source: parsed.source
  });
  const report = validateMetric(store.players, Object.assign({}, DEFAULT_METRIC, {
    minMinutes: 90,
    outcomeId: 'assists',
    splitId: 'groups'
  }), { outcomeId: 'assists', splitId: 'groups' });
  assert.equal(report.leaky, true);
  assert.ok(report.audit.maxRho >= 0.95);
  assert.equal(report.audit.maxField, 'pressures');
  assert.equal(report.train.rho, null);
  assert.equal(report.test.rho, null);
  assert.match(report.verdict, /דליפה נמדדת|מוסתר/);
});

test('home lab exposes BYOD without a network form', () => {
  assert.match(html, /id="byod"/);
  assert.match(html, /USER_LICENSED_DATA/);
  assert.match(html, /userAttest/);
  assert.match(html, /licence\.html/);
  assert.match(html, /offer\.html/);
  assert.match(html, /parseUserDataset/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /mailto:/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('licence page quotes the commercial-exploitation ban', () => {
  assert.match(licence, /lang="he"/);
  assert.match(licence, /dir="rtl"/);
  assert.match(licence, /commercially exploit the data or any analysis derived from the use of the Service/);
  assert.match(licence, /sell or in any way provide the data to any external or third party/);
  assert.match(licence, /8 בספטמבר 2023|8 September 2023/);
  assert.match(licence, /USER_LICENSED_DATA/);
  assert.match(licence, /אסור/);
});

test('offer page is an offer, not a fake checkout', () => {
  assert.match(offer, /lang="he"/);
  assert.match(offer, /dir="rtl"/);
  assert.match(offer, /אין הרשמה/);
  assert.match(offer, /אין סליקה/);
  assert.match(offer, /490/);
  assert.match(offer, /0 נרשמים|אף אחד לא נרשם/);
  assert.doesNotMatch(offer, /type=["']submit/i);
  assert.doesNotMatch(offer, /נרשמו כבר \d+/);
  assert.doesNotMatch(offer, /מקומות אחרונים/);
  assert.match(monetization, /1\.2\.2/);
  assert.match(monetization, /13\.8\.2026/);
  assert.match(monetization, /github.com\/hudl\/open-data/);
});

test('offer sells only the live session — completion record is free self-report', () => {
  assert.match(offer, /בתשלום — רק המפגש החי|רק המפגש החי/);
  assert.match(offer, /workshop\/SYLLABUS\.md/);
  assert.match(offer, /accredited:false/);
  assert.match(offer, /לא תעודת מנהלת/);
  assert.match(offer, /חינם בריפו/);
  assert.doesNotMatch(offer, /רשומת השלמה.{0,40}בתשלום/);
  assert.doesNotMatch(offer, /type=["']submit/i);
});

test('content fingerprint rejects stripped Open Data JSON players even with attestation', () => {
  // (a) metadata stripped — only players[] — must not become USER_LICENSED_DATA
  const stripped = { players: wc2018.players };
  assert.equal(looksLikeOpenDataPayload(stripped), true);
  assert.ok(openDataPairOverlap(wc2018.players) >= openDataRejectThreshold(wc2018.players.length));
  const parsed = parseUserDataset(JSON.stringify(stripped), { attested: true, fileName: 'reimport.json' });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.detected, OPEN_DATA_PROVENANCE);
  assert.equal(parsed.provenance, OPEN_DATA_PROVENANCE);
  const store = createStore(stripped, { provenance: USER_DATA_PROVENANCE, fileName: 'evil.json' });
  assert.equal(store.derive({ minMinutes: 90 }).commercialAllowed, false);
  assert.equal(store.derive({ minMinutes: 90 }).provenance, OPEN_DATA_PROVENANCE);
});

test('content fingerprint rejects Open Data rows re-saved as CSV', () => {
  // (b) Excel-style CSV of the same 605 name|team pairs
  const cols = ['name', 'team', 'position', 'minutes', 'pressures', 'tackles'];
  const lines = [cols.join(',')];
  wc2018.players.forEach(function (p) {
    lines.push([
      JSON.stringify(p.name),
      JSON.stringify(p.team),
      JSON.stringify(p.position || ''),
      p.totalMinutesProxy || 0,
      p.pressures || 0,
      p.tackles || 0
    ].join(','));
  });
  const parsed = parseUserDataset(lines.join('\n'), { attested: true, fileName: 'wc2018.csv' });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.detected, OPEN_DATA_PROVENANCE);
  assert.match(parsed.errors[0], /Open Data|חפיפת/);
});

test('content fingerprint rejects bare Open Data player array JSON', () => {
  const parsed = parseUserDataset(JSON.stringify(wc2018.players), { attested: true });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.detected, OPEN_DATA_PROVENANCE);
});

test('forty invented names still pass as USER_LICENSED_DATA', () => {
  // (c) invented roster must stay clean; altered WC names are out of scope (not a warranty)
  const players = [];
  for (let i = 0; i < 40; i += 1) {
    players.push({
      name: 'Invented Scout ' + i,
      team: 'Lab United ' + (i % 4),
      position: 'Center Back',
      minutes: 300 + i,
      pressures: 10 + i,
      tackles: 2,
      interceptions: 1,
      defensiveActions: 5,
      progressiveActions: 4,
      keyPasses: 1,
      passesCompleted: 40,
      shotXgSum: 0.1,
      boxTouches: 1,
      shotsOnTarget: 0
    });
  }
  assert.equal(openDataPairOverlap(players), 0);
  const parsed = parseUserDataset(JSON.stringify({ players: players }), {
    attested: true,
    fileName: 'invented.json'
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provenance, USER_DATA_PROVENANCE);
  assert.equal(parsed.players.length, 40);
  const view = createStore({ players: parsed.players }, {
    provenance: parsed.provenance,
    source: parsed.source
  }).derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 });
  assert.equal(view.commercialAllowed, true);
  assert.equal(view.provenance, USER_DATA_PROVENANCE);
});

test('BYOD copy documents content fingerprint and the altered-name gap', () => {
  assert.match(html, /name\|team|טביעת אצבע|חפיפת תוכן/);
  assert.match(html, /שמות ששונו|לא נתפס/);
  assert.match(licence, /min\(20/);
  assert.match(licence, /שמות ששונו/);
  assert.match(
    fs.readFileSync(path.join(root, 'data', 'README.md'), 'utf8'),
    /altered names|Not caught/i
  );
});

test('BYOD coverage map: missing defense columns are not zero — grit null + rho null', () => {
  const players = [];
  for (let i = 0; i < 9; i += 1) {
    players.push({
      name: 'P' + i,
      team: 'T' + (i % 3),
      position: i % 2 === 0 ? 'Center Back' : 'Center Forward',
      minutes: 400,
      progressiveActions: 10 + i,
      keyPasses: 1 + (i % 3),
      passesCompleted: 50 + i * 2,
      shotXgSum: 0.2 * i,
      boxTouches: 2 + i,
      shotsOnTarget: i % 4
      // no pressures/tackles/interceptions/defensiveActions, no assists
    });
  }
  const p = parseUserDataset(JSON.stringify({ players: players }), { attested: true, fileName: 'no-defense.json' });
  assert.equal(p.ok, true);
  assert.equal(p.coverage.components.grit.available, false);
  assert.deepEqual(p.coverage.components.grit.missingFields, ['pressures', 'tackles', 'interceptions', 'defensiveActions']);
  assert.ok(p.coverage.banner);
  assert.match(p.coverage.banner, /pressures|לא זמין/);

  const store = createStore({ players: p.players }, { provenance: p.provenance, source: p.source });
  const view = store.derive({
    grit: 40,
    involvement: 30,
    clutch: 30,
    minMinutes: 90,
    normalizePosition: true,
    outcomeId: 'assists',
    splitId: 'hash'
  });
  assert.ok(view.rows.every((r) => r.components.grit === null));
  assert.ok(view.rows.some((r) => r.score !== 100));
  assert.equal(view.validation.test.rho, null);
  assert.match(view.validation.verdict, /assists/);
  assert.ok(view.coverageBanner || (view.coverage && view.coverage.banner));
});


test('position aliases map short codes and Hebrew labels out of OT', () => {
  const inputs = ['CB', 'ST', 'DM', 'GK', 'בלם', 'שוער', 'קשר', 'חלוץ'];
  const expected = ['DF', 'FW', 'MF', 'GK', 'DF', 'GK', 'MF', 'FW'];
  assert.deepEqual(inputs.map(positionGroup), expected);
  assert.equal(positionGroup('LB'), 'DF');
  assert.equal(positionGroup('RB'), 'DF');
  assert.equal(positionGroup('CM'), 'MF');
  assert.equal(positionGroup('AM'), 'MF');
  assert.equal(positionGroup('LW'), 'FW');
  assert.equal(positionGroup('RW'), 'FW');
  assert.equal(positionGroup('CF'), 'FW');
  assert.equal(positionGroup('מגן'), 'DF');
  assert.equal(positionGroup('כנף'), 'FW');
  assert.equal(DEFAULT_POSITION_ALIASES.CB, 'DF');
  // Mapping-step override: club code XYZ → DF
  assert.equal(positionGroup('XYZ', mergePositionAliases({ XYZ: 'DF' })), 'DF');
  assert.equal(positionGroup('XYZ'), 'OT');
});

test('peer floor refuses normalize below MIN_POSITION_PEERS and surfaces a note', () => {
  assert.equal(MIN_POSITION_PEERS, 5);
  const players = [
    { name: 'A', team: 'T1', position: 'CB', minutes: 400, pressures: 40, tackles: 8, interceptions: 6, defensiveActions: 20, progressiveActions: 10, keyPasses: 1, passesCompleted: 100, shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0 },
    { name: 'B', team: 'T1', position: 'DM', minutes: 400, pressures: 50, tackles: 10, interceptions: 4, defensiveActions: 18, progressiveActions: 30, keyPasses: 4, passesCompleted: 120, shotXgSum: 0.4, boxTouches: 4, shotsOnTarget: 1 },
    { name: 'C', team: 'T2', position: 'ST', minutes: 400, pressures: 12, tackles: 1, interceptions: 0, defensiveActions: 4, progressiveActions: 20, keyPasses: 6, passesCompleted: 50, shotXgSum: 2, boxTouches: 20, shotsOnTarget: 4 },
    { name: 'D', team: 'T2', position: 'GK', minutes: 400, pressures: 1, tackles: 0, interceptions: 0, defensiveActions: 3, progressiveActions: 0, keyPasses: 0, passesCompleted: 20, shotXgSum: 0, boxTouches: 0, shotsOnTarget: 0 }
  ];
  const parsed = parseUserDataset(JSON.stringify({ players: players }), { attested: true, fileName: 'one-per-group.json' });
  assert.equal(parsed.ok, true);
  const store = createStore({ players: parsed.players }, { provenance: parsed.provenance, source: parsed.source });
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90, normalizePosition: true });
  assert.match(view.normalizationNote, /5/);
  assert.equal(view.rows.length, 4);
  // One player per group → no mid-rank inflate to three identical 100s
  const gritVals = view.rows.map(function (r) { return r.components.grit; });
  const hundredCount = gritVals.filter(function (v) { return v === 100; }).length;
  assert.ok(hundredCount < 3, 'expected fewer than three identical 100 grit scores, got ' + JSON.stringify(gritVals));
  assert.ok(view.rows.every(function (r) { return r.components.normalizationSkipped === true; }));
  assert.ok(view.rows.every(function (r) { return /5/.test(r.components.normalizationReason || ''); }));
});

test('shipped synthetic example uses aliases and stays off OT', () => {
  const syn = parseUserDataset(JSON.stringify(example), { synthetic: true });
  assert.equal(syn.ok, true);
  const store = createStore(example, { provenance: SYNTHETIC_PROVENANCE, source: syn.source });
  assert.equal(store.otCount, 0);
  const groups = Array.from(new Set(store.players.map(function (p) { return p.positionGroup; }))).sort();
  assert.deepEqual(groups, ['DF', 'FW', 'GK', 'MF']);
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90, normalizePosition: true });
  assert.match(view.normalizationNote, /5/);
});

test('mapUserColumns maps Player / Minutes played / xG aliases', () => {
  const mapped = mapUserColumns(['Player', 'Team', 'Minutes played', 'xG', 'Unknown Col']);
  assert.equal(mapped.mapping.Player, 'name');
  assert.equal(mapped.mapping['Minutes played'], 'minutes');
  assert.equal(mapped.mapping.xG, 'shotXgSum');
  assert.equal(mapped.mapping.Team, 'team');
  assert.equal(mapped.unmatchedCount, 1);
  assert.deepEqual(mapped.unmatched, ['Unknown Col']);
});

test('template CSV parses three players with typed minutes 2340', () => {
  const csv = fs.readFileSync(path.join(root, 'data', 'user-dataset.template.csv'), 'utf8');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'user-dataset.template.csv' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players.length, 3);
  assert.equal(parsed.players[0].minutes, 2340);
  assert.equal(parsed.players[0].name, 'Yossi Cohen');
  assert.equal(parsed.columnMapping.mapping.Player, 'name');
  assert.equal(parsed.columnMapping.mapping['Minutes played'], 'minutes');
  assert.equal(parsed.columnMapping.mapping.xG, 'shotXgSum');
});

test('thousands separator and mm:ss typed conversion', () => {
  assert.equal(parseTypedNumber('2,340', 1, 'minutes').value, 2340);
  assert.equal(parseTypedNumber('90:00', 1, 'minutes').value, 90);
  const bad = parseTypedNumber('n/a', 4, 'pressures');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /שורה 4/);
  assert.match(bad.error, /pressures/);
});

test('two Yossi Cohen rows keep distinct stable ids', () => {
  const csv = [
    'Player,Team,Minutes played,xG',
    'Yossi Cohen,Hapoel,270,0.1',
    'Yossi Cohen,Hapoel,180,0.2'
  ].join('\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'twins.csv' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players.length, 2);
  const ids = parsed.players.map(function (p) { return p.id; });
  assert.equal(new Set(ids).size, 2);
  const store = createStore({ players: parsed.players }, { provenance: parsed.provenance });
  assert.equal(new Set(store.players.map(function (p) { return p.id; })).size, 2);
  // Re-parse is deterministic
  const again = parseUserDataset(csv, { attested: true, fileName: 'twins.csv' });
  assert.deepEqual(again.players.map(function (p) { return p.id; }), ids);
});

test('optional mapping override remaps a custom header', () => {
  const csv = [
    'Athlete,Club,Mins,xg_raw',
    'Aleph,Home,300,1.2'
  ].join('\n');
  const parsed = parseUserDataset(csv, {
    attested: true,
    fileName: 'custom.csv',
    mapping: { Athlete: 'name', Club: 'team', Mins: 'minutes', xg_raw: 'shotXgSum' }
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players[0].name, 'Aleph');
  assert.equal(parsed.players[0].minutes, 300);
  assert.equal(parsed.players[0].shotXgSum, 1.2);
});

test('home lab documents template CSV and mapping helpers', () => {
  assert.match(html, /user-dataset\.template\.csv/);
  assert.match(html, /mapUserColumns/);
  assert.match(html, /id="byodMapping"/);
  assert.match(html, /applyParsedDataset/);
});

test('Open Data store keeps wc2018 caps (pressures90 === 18)', () => {
  const s = createStore(wc2018);
  assert.equal(s.capsSource, 'wc2018');
  assert.equal(s.caps.pressures90, 18);
  assert.equal(s.caps.tacklesInt90, 6);
  assert.equal(s.caps.xg90, 0.6);
  assert.ok(s.capSaturation);
  assert.ok(s.capSaturation.cells > 0);
});

test('file-derived caps on season-like USER_LICENSED_DATA differ from WC2018 and separate double-output players', () => {
  // Season-like minutes (~3000) with pressure rates that both exceed WC2018 cap 18.
  // Under WC2018 both grit axes clamp to 100; under file caps they stay ordered.
  // Season-like minutes (~3000). Rates well above WC2018 caps so both high
  // producers clamp to grit 100 under wc2018; file caps (= roster max /90) keep order.
  const season = {
    players: [
      {
        name: 'PresserA', team: 'Home', position: 'Center Defensive Midfield',
        totalMinutesProxy: 3000, pressures: 1200, tackles: 200, interceptions: 100,
        defensiveActions: 600, progressiveActions: 200, keyPasses: 10, passesCompleted: 1500,
        shotXgSum: 2, boxTouches: 30, shotsOnTarget: 8
      },
      {
        name: 'PresserB', team: 'Away', position: 'Center Defensive Midfield',
        totalMinutesProxy: 3000, pressures: 1600, tackles: 280, interceptions: 140,
        defensiveActions: 800, progressiveActions: 220, keyPasses: 12, passesCompleted: 1600,
        shotXgSum: 2.2, boxTouches: 35, shotsOnTarget: 9
      },
      {
        name: 'Quiet', team: 'Draw', position: 'Center Back',
        totalMinutesProxy: 3000, pressures: 200, tackles: 40, interceptions: 30,
        defensiveActions: 150, progressiveActions: 80, keyPasses: 2, passesCompleted: 900,
        shotXgSum: 0.3, boxTouches: 5, shotsOnTarget: 1
      }
    ]
  };
  const flat = createStore(season, { provenance: USER_DATA_PROVENANCE, caps: 'wc2018' });
  assert.equal(flat.capsSource, 'wc2018');
  assert.equal(flat.caps.pressures90, 18);
  const aFlat = flat.players.find((p) => p.name === 'PresserA');
  const bFlat = flat.players.find((p) => p.name === 'PresserB');
  assert.equal(aFlat.components.grit, 100);
  assert.equal(bFlat.components.grit, 100);

  const s = createStore(season, { provenance: USER_DATA_PROVENANCE, caps: 'file' });
  assert.equal(s.capsSource, 'file');
  assert.notEqual(s.caps.pressures90, 18);
  // Max pressures/90 = 1600*90/3000 = 48
  assert.equal(s.caps.pressures90, 48);
  const a = s.players.find((p) => p.name === 'PresserA');
  const b = s.players.find((p) => p.name === 'PresserB');
  assert.ok(b.components.grit > a.components.grit);
  assert.ok(a.components.grit < 100);
  assert.equal(s.capSaturation.rate, 0);
  assert.ok(flat.capSaturation.rate > 0);

  // Default for USER_LICENSED_DATA without explicit caps is file
  const auto = createStore(season, { provenance: USER_DATA_PROVENANCE });
  assert.equal(auto.capsSource, 'file');
  assert.equal(auto.caps.pressures90, 48);
});

test('BYOD UI mentions file-derived caps and saturation', () => {
  assert.match(html, /תקרות מהתפלגות הקובץ|תקרות מהקובץ/);
  assert.match(html, /רווי/);
  assert.match(html, /caps:\s*parsed\.provenance === 'STATSBOMB_OPEN_DATA' \? 'wc2018' : 'file'/);
});


test('buildCompletionRecord is unaccredited local self-report with curriculum stepIds', () => {
  const store = createStore(wc2018);
  const view = store.derive(DEFAULT_METRIC);
  const curriculum = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    answers: {}
  });
  const record = buildCompletionRecord({
    provenance: OPEN_DATA_PROVENANCE,
    curriculum: curriculum,
    selected: view.selected,
    players: store.players
  });
  assert.deepEqual(record.stepIds, CURRICULUM_LESSONS.map((lesson) => lesson.id));
  assert.equal(record.accredited, false);
  assert.equal(record.commercial, false);
  assert.equal(record.heldOutSeason, false);
  assert.match(record.disclaimerHe, /לא תעודת מנהלת/);
  assert.match(record.disclaimerHe, /NO_HELD_OUT_SEASON/);
  assert.ok(record.warnings.includes('NO_HELD_OUT_SEASON'));
  assert.ok(record.warnings.includes('HAND_WEIGHTS_UNCALIBRATED'));
  assert.equal(record.players, undefined);
  assert.match(record.stamp, /NON_COMMERCIAL/i);
  assert.equal(record.provenance, OPEN_DATA_PROVENANCE);
  assert.doesNotMatch(JSON.stringify(record), /https?:\/\//);
});

test('buildCompletionRecord may list players only off Open Data', () => {
  const parsed = parseUserDataset(JSON.stringify({
    players: [
      { name: 'Alpha', team: 'Home', position: 'Center Back', minutes: 400, pressures: 40, tackles: 8, interceptions: 6, defensiveActions: 20, progressiveActions: 10, keyPasses: 1, passesCompleted: 100, shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0 },
      { name: 'Beta', team: 'Away', position: 'Center Forward', minutes: 400, pressures: 10, tackles: 1, interceptions: 0, defensiveActions: 4, progressiveActions: 20, keyPasses: 6, passesCompleted: 50, shotXgSum: 2, boxTouches: 20, shotsOnTarget: 4 }
    ]
  }), { attested: true, fileName: 'club.json' });
  const store = createStore({ players: parsed.players }, { provenance: parsed.provenance });
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 });
  const record = buildCompletionRecord({
    provenance: USER_DATA_PROVENANCE,
    curriculum: evaluateCurriculum({
      spec: view.spec,
      selected: view.selected,
      explorer: view.explorer,
      validation: view.validation,
      exercise: view.exercise,
      players: store.players,
      answers: {}
    }),
    players: store.players
  });
  assert.equal(record.accredited, false);
  assert.match(record.disclaimerHe, /לא תעודת מנהלת/);
  assert.ok(Array.isArray(record.players));
  assert.equal(record.players.length, 2);
  assert.equal(Object.keys(record.players[0]).sort().join(','), 'id,name,team');
});

test('workshop syllabus mentions all eight curriculum lesson ids', () => {
  const md = fs.readFileSync(path.join(root, 'workshop', 'SYLLABUS.md'), 'utf8');
  CURRICULUM_LESSONS.forEach((lesson) => {
    assert.match(md, new RegExp(lesson.id));
  });
  assert.match(md, /3 שעות|0:00/);
});

test('workshop kit pages are Hebrew RTL offline (no CDN / http)', () => {
  const handout = fs.readFileSync(path.join(root, 'workshop', 'handout.html'), 'utf8');
  const facilitator = fs.readFileSync(path.join(root, 'workshop', 'facilitator.html'), 'utf8');
  for (const page of [handout, facilitator]) {
    assert.match(page, /lang="he"/);
    assert.match(page, /dir="rtl"/);
    assert.doesNotMatch(page, /https?:\/\//i);
    assert.doesNotMatch(page, /cdn\.|unpkg|jsdelivr|googleapis/i);
    assert.doesNotMatch(page, /<form\b/i);
  }
  assert.match(handout, /@media print/);
  assert.match(facilitator, /evaluateCurriculum|has-player|weights-locked/);
  assert.match(facilitator, /קטן מדי|פחות משני שחקנים/);
  assert.match(html, /downloadCompletion|completionJson|accredited:false/);
  assert.match(html, /workshop\/SYLLABUS\.md/);
});


test('ב8: non-WC teams get arbitrary group split with heldOutSeason false', () => {
  assert.equal(assignFold({ name: 'A', team: 'קבוצה א' }, 'groups'), 'test');
  assert.equal(assignFold({ name: 'B', team: 'קבוצה ב' }, 'groups'), 'train');
  assert.notEqual(assignFold({ name: 'A', team: 'קבוצה א' }, 'groups'), 'unassigned');
  // WC path unchanged
  assert.equal(assignFold({ name: 'A', team: 'France' }, 'groups'), 'train');
  assert.equal(assignFold({ name: 'B', team: 'Brazil' }, 'groups'), 'test');
  const label = describeSplitLabel('groups', [{ team: 'קבוצה א' }, { team: 'קבוצה ב' }]);
  assert.match(label, /שרירותי/);
  assert.doesNotMatch(label, /מונדיאל 2018$/);
});

test('ב8: full curriculum passes on synthetic ~40 example', () => {
  const syn = parseUserDataset(JSON.stringify(example), { synthetic: true });
  assert.equal(syn.ok, true);
  assert.ok(syn.players.length >= 35);
  const store = createStore(example, { provenance: SYNTHETIC_PROVENANCE, source: syn.source });
  assert.equal(store.capsSource, 'file');
  const hint = DEFENDER_EXERCISE.hint;
  const ranked = store.players.slice().sort((a, b) =>
    (b.components.raw.pressures90 || 0) - (a.components.raw.pressures90 || 0));
  const selected = ranked[0];
  const view = store.derive(Object.assign({}, hint, {
    selectedId: selected.id,
    weightsLocked: true,
    weightAttempts: 2,
    outcomeId: 'assists'
  }));
  assert.equal(view.validation.heldOutSeason, false);
  assert.ok(view.validation.test.n > 0);
  assert.match(view.validation.splitLabel, /שרירותי/);
  assert.equal(view.exercise.smallSample, false);
  assert.ok(view.explorer.capped.length > 0, 'file-layer ceiling touch should surface as capped');
  const press = view.explorer.rows.find((row) => row.key === 'pressures');
  const answers = {
    unusedField: view.explorer.unused[0].key,
    per90: String(press.per90),
    cappedField: view.explorer.capped[0].key,
    weightsManual: 'yes',
    fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, view.spec, selected.id, 10)),
    splitIsSeason: 'no',
    whatMatters: 'test',
    unusedTerm: 'dribble',
    commercial: 'no',
    beatsMinutes: view.validation.beatsMinutes ? 'yes' : 'no',
    roseComponent: view.exercise.expectedRose,
    costGroup: view.exercise.expectedCostGroup
  };
  const lessons = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: answers
  });
  assert.equal(lessons.every((l) => l.passed), true,
    lessons.filter((l) => !l.passed).map((l) => l.id).join(','));
  assert.ok(CURRICULUM_LESSONS.find((l) => l.id === 'caps').hint == null,
    'caps lesson must not hardcode an Open Data player name');
});

test('ב8: evaluateExercise smallSample true at n≤12 and false at 40', () => {
  const syn = parseUserDataset(JSON.stringify(example), { synthetic: true });
  const store = createStore(example, { provenance: SYNTHETIC_PROVENANCE, source: syn.source });
  const twelve = store.players.slice(0, 12);
  const ex12 = evaluateExercise(twelve, DEFENDER_EXERCISE.hint, { roseComponent: 'grit', costGroup: 'FW' });
  assert.equal(ex12.smallSample, true);
  assert.equal(ex12.passed, false);
  assert.match(ex12.summary, /אי אפשר להעריך את הבדיקה הזאת ב-n=12/);
  const notEval = ex12.checks.filter((c) => c.evaluable === false);
  assert.ok(notEval.length >= 1);
  assert.ok(notEval.every((c) => /אי אפשר להעריך/.test(c.detail)));
  const ex40 = evaluateExercise(store.players, DEFENDER_EXERCISE.hint, {
    roseComponent: 'grit', costGroup: 'FW'
  });
  assert.equal(ex40.smallSample, false);
  assert.equal(ex40.passed, true);
});

test('ב8: offer and course UI mention completable BYOD/synthetic course', () => {
  assert.match(offer, /בר־השלמה|בר-השלמה|~40|בת ~40/);
  assert.match(html, /BYOD|סינתט/);
  assert.match(html, /שרירותי/);
  assert.match(html, /splitSelect/);
});
