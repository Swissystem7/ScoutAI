'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseUserDataset,
  parseCsvRecords,
  detectCsvDelimiter,
  auditCsvHeaders,
  auditPositions,
  positionGroup,
  POSITION_CODES,
  suggestCsvHeader,
  resolveCsvHeader,
  CSV_HEADER_ALIASES,
  CSV_DELIMITERS,
  looksLikeOpenDataPayload,
  createStore,
  exportMetricBundle,
  methodologyParagraph,
  USER_DATA_PROVENANCE,
  SYNTHETIC_PROVENANCE,
  OPEN_DATA_PROVENANCE,
  USER_DATASET_COLUMNS,
  NUMERIC_USER_FIELDS,
  invalidNumericFields,
  playerKey,
  serializeMetricHash,
  parseMetricHash,
  DEFAULT_METRIC
} = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const licence = fs.readFileSync(path.join(root, 'licence.html'), 'utf8');
const offer = fs.readFileSync(path.join(root, 'offer.html'), 'utf8');
const monetization = fs.readFileSync(path.join(root, 'MONETIZATION.md'), 'utf8');
const example = JSON.parse(fs.readFileSync(path.join(root, 'data', 'user-dataset.example.json'), 'utf8'));

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
  assert.equal(example.players.length, 4);
  assert.equal(looksLikeOpenDataPayload(example), false);
  assert.equal(example.source, 'SYNTHETIC_EXAMPLE');
  const store = createStore(example, { provenance: SYNTHETIC_PROVENANCE, source: syn.source });
  assert.equal(store.derive({ minMinutes: 90 }).rows.length, 4);
});

test('CSV keeps quoted commas, doubled quotes and line breaks inside one field', () => {
  const csv = [
    '\uFEFFname,team,position,minutes,pressures',
    '"Silva, Thiago","Gamma ""B""",Center Back,270,20',
    '"O""Neil",Away,"Right Wing","180",8',
    '',
    '"Two\nLines",Home,Left Back,90,3',
    'Plain,Home,Left Back,90,3',
    ''
  ].join('\r\n');
  assert.deepEqual(parseCsvRecords('a,b\r\n"x, y","p ""q"""\n'), [['a', 'b'], ['x, y', 'p "q"']]);
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'excel.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.players.map((p) => p.name), ['Silva, Thiago', 'O"Neil', 'Two\nLines', 'Plain']);
  assert.equal(parsed.players[0].team, 'Gamma "B"');
  assert.equal(parsed.players[0].pressures, 20);
  assert.equal(parsed.players[1].totalMinutesProxy, 180);
  assert.equal(parsed.players[1].position, 'Right Wing');
  const ids = new Set(parsed.players.map(playerKey));
  assert.equal(ids.size, 4);
});

test('European Excel CSV: `;` delimiter, sep= hint and decimal comma are understood', () => {
  // Delimiter is read from the header line, quotes do not count.
  assert.deepEqual(detectCsvDelimiter('name,team\nA,B'), { delimiter: ',', offset: 0 });
  assert.deepEqual(detectCsvDelimiter('name;team\nA;B'), { delimiter: ';', offset: 0 });
  assert.deepEqual(detectCsvDelimiter('name\tteam\nA\tB'), { delimiter: '\t', offset: 0 });
  assert.deepEqual(detectCsvDelimiter('"a;b;c",d\n1,2'), { delimiter: ',', offset: 0 });
  assert.deepEqual(detectCsvDelimiter('sep=;\r\nname;team'), { delimiter: ';', offset: 7 });
  assert.deepEqual(detectCsvDelimiter(''), { delimiter: ',', offset: 0 });
  assert.deepEqual(CSV_DELIMITERS, [',', ';', '\t']);

  // A tab inside a comma file is data, not a cell boundary.
  assert.deepEqual(parseCsvRecords('name,team\nA\tB,C'), [['name', 'team'], ['A\tB', 'C']]);
  // sep= line is consumed, never parsed as a header.
  assert.deepEqual(parseCsvRecords('sep=;\nname;team\nA;B'), [['name', 'team'], ['A', 'B']]);

  const csv = [
    '﻿sep=;',
    'name;team;position;minutes;pressures;shotXgSum',
    '"Silva, Thiago";Home;Center Back;270;20;0,15',
    'Beta;Away;Right Wing;180;8;1,2',
    'Gamma;Away;Right Wing;90;abc;2'
  ].join('\r\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'excel-de.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.players.map((p) => p.name), ['Silva, Thiago', 'Beta', 'Gamma']);
  assert.equal(parsed.players[0].team, 'Home');
  assert.equal(parsed.players[0].totalMinutesProxy, 270);
  assert.equal(parsed.players[0].shotXgSum, 0.15);
  assert.equal(parsed.players[1].shotXgSum, 1.2);
  assert.deepEqual(parsed.errors, ['שורה 5: pressures=«abc» אינו מספר — התא נשאר ריק']);

  // In a comma file "12,5" is still not a number (see the messy.csv test);
  // the decimal comma is only unlocked when the comma cannot be a separator.
  const commaFile = parseUserDataset('name,minutes,pressures\nA,90,"12,5"\n', { attested: true });
  assert.equal('pressures' in commaFile.players[0], false);
  assert.equal(commaFile.errors.length, 1);

  // Excel's "1000 separator" format and FBref's Min column quote 2970 as
  // "2,970". Strict groups of three load as a whole number and are listed;
  // "0,456" is a decimal comma, not 456, and stays an error.
  const grouped = parseUserDataset(
    'name,minutes,pressures,shotXgSum\nA,"2,970","1,204.5",1\nB,"1,080",3,"0,456"\n',
    { attested: true }
  );
  assert.equal(grouped.ok, true);
  assert.equal(grouped.players[0].minutes, 2970);
  assert.equal(grouped.players[0].pressures, 1204.5);
  assert.equal(grouped.players[1].minutes, 1080);
  assert.equal('shotXgSum' in grouped.players[1], false);
  assert.deepEqual(grouped.errors, ['שורה 3: shotXgSum=«0,456» אינו מספר — התא נשאר ריק']);
  assert.ok(grouped.warnings.some((w) => w.includes('מפריד אלפים') && w.includes('minutes=«2,970» → 2970')));
  // In a `;` file the comma is the decimal mark, never a thousands group.
  assert.equal(parseUserDataset('name;minutes;shotXgSum\nA;90;1,250\n', { attested: true }).players[0].shotXgSum, 1.25);

  // The wrong-column error now shows what was actually read, so a user whose
  // file collapsed into one column can see why.
  const noName = parseUserDataset('player|minutes\nA|90\n', { attested: true });
  assert.equal(noName.ok, false);
  assert.match(noName.errors[0], /חסרה עמודת name/);
  assert.match(noName.errors[0], /player\|minutes/);
  assert.ok(html.includes('מפריד'), 'the BYOD help text must say that ; and tab delimiters are accepted');
});

test('CSV rows without a name are reported, not silently dropped', () => {
  const csv = 'name,minutes\nAlpha,90\n,45\n"",30\n';
  const parsed = parseUserDataset(csv, { attested: true });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players.length, 1);
  assert.deepEqual(parsed.errors, ['שורה 3: חסר שם', 'שורה 4: חסר שם']);
  // name+minutes only: the header audit says, truthfully, that nothing will be scored.
  assert.equal(parsed.warnings.length, 2);
  assert.ok(parsed.warnings[0].startsWith('אף עמודת ספירה מוכרת לא נמצאה'));
  assert.equal(parsed.warnings[1], 'שחקן אחד — הדירוג יהיה טריוויאלי');
  assert.ok(html.includes('parsed.warnings'), 'the BYOD status line must surface warnings and skipped rows');
});

test('non-numeric stat cells are reported and never silently become 0', () => {
  const csv = [
    'name,team,minutes,pressures,tackles',
    'Alpha,Home,abc,12,1',
    'Beta,Home,90,"12,5",2',
    'Gamma,Home, 90 ,7,n/a',
    'Delta,Home,90,,3'
  ].join('\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'messy.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.players.map((p) => p.name), ['Beta', 'Gamma', 'Delta']);
  assert.deepEqual(parsed.errors, [
    'שורה 2: minutes=«abc» אינו מספר — השחקן דולג',
    'שורה 3: pressures=«12,5» אינו מספר — התא נשאר ריק',
    'שורה 4: tackles=«n/a» אינו מספר — התא נשאר ריק'
  ]);
  assert.equal(parsed.players[0].totalMinutesProxy, 90);
  assert.equal('pressures' in parsed.players[0], false);
  assert.equal(parsed.players[1].pressures, 7);
  assert.equal('tackles' in parsed.players[1], false);
  assert.equal('pressures' in parsed.players[2], false);
  assert.ok(NUMERIC_USER_FIELDS.includes('minutes') && NUMERIC_USER_FIELDS.includes('shotXgSum'));

  const json = parseUserDataset(JSON.stringify({
    players: [
      { name: 'J', team: 'T', minutes: 'x', pressures: 'n/a', tackles: 3 },
      { name: 'K', team: 'T', minutes: 90, pressures: [1] }
    ]
  }), { attested: true });
  assert.equal(json.ok, true);
  assert.deepEqual(json.errors, [
    'שחקן «J»: minutes=«x» אינו מספר — נחשב כחסר',
    'שחקן «J»: pressures=«n/a» אינו מספר — נחשב כחסר',
    'שחקן «K»: pressures=«1» אינו מספר — נחשב כחסר'
  ]);
  assert.deepEqual(json.players[0], { name: 'J', team: 'T', tackles: 3 });
  assert.deepEqual(invalidNumericFields({ name: 'ok', minutes: 90, pressures: '7', shotXgSum: 0.4 }), []);
  assert.deepEqual(invalidNumericFields({ name: 'bad', minutes: Infinity }), [{ key: 'minutes', value: Infinity }]);
});

test('CSV rows wider than the header are skipped, short rows name the missing columns', () => {
  const csv = [
    'name,team,minutes,pressures,tackles,,',
    'Silva, Thiago,Home,90,12,1',
    'Alpha,Home,90,7,2,,',
    'Beta,Home,90',
    'Gamma,Home,90,5,3'
  ].join('\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'shifted.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.players.map((p) => p.name), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(parsed.errors, [
    'שורה 2: 6 תאים מול 5 כותרות — כנראה מפריד לא מצוטט בתוך שם; השורה דולגה',
    'שורה 4: 3 תאים מול 5 כותרות — pressures, tackles נחשבים ריקים'
  ]);
  assert.deepEqual(parsed.players[0], { name: 'Alpha', team: 'Home', totalMinutesProxy: 90, minutes: 90, pressures: 7, tackles: 2 });
  assert.deepEqual(parsed.players[1], { name: 'Beta', team: 'Home', totalMinutesProxy: 90, minutes: 90 });
  assert.equal(parsed.players[2].tackles, 3);

  const quoted = parseUserDataset('name,minutes,pressures\n"Silva, Thiago",90,12\n', { attested: true });
  assert.deepEqual(quoted.errors, []);
  assert.equal(quoted.players[0].name, 'Silva, Thiago');
  assert.equal(quoted.players[0].pressures, 12);

  const semi = parseUserDataset('sep=;\nname;minutes;pressures\nSilva; Thiago;90;12\n', { attested: true });
  assert.equal(semi.ok, false);
  assert.deepEqual(semi.errors, ['שורה 3: 4 תאים מול 3 כותרות — כנראה מפריד לא מצוטט בתוך שם; השורה דולגה']);
  assert.ok(html.includes('מספר תאים'), 'the BYOD help text must mention the row-width check');
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

function twoCohens() {
  return {
    players: [
      {
        name: 'Cohen', team: 'A', position: 'Center Back',
        totalMinutesProxy: 360, pressures: 60, tackles: 14, interceptions: 12,
        defensiveActions: 50, progressiveActions: 10, keyPasses: 0, passesCompleted: 150,
        shotXgSum: 0.05, boxTouches: 2, shotsOnTarget: 0
      },
      {
        name: 'Cohen', team: 'A', position: 'Center Forward',
        totalMinutesProxy: 300, pressures: 25, tackles: 2, interceptions: 1,
        defensiveActions: 8, progressiveActions: 30, keyPasses: 6, passesCompleted: 70,
        shotXgSum: 2.4, boxTouches: 30, shotsOnTarget: 7
      }
    ]
  };
}

test('two players with the same name in the same team get separate ids', () => {
  const store = createStore(twoCohens(), { provenance: USER_DATA_PROVENANCE });
  const players = store.players;
  assert.equal(players.length, 2);
  assert.notEqual(players[0].id, players[1].id);
  assert.equal(players[0].id, 'Cohen|A', 'first occurrence keeps the plain key');
  assert.equal(players[1].id, 'Cohen|A#2', 'collision gets a #2 suffix');

  const view = store.derive({ minMinutes: 90, selectedId: players[1].id });
  assert.equal(view.selected.position, 'Center Forward');
  assert.equal(view.selected.id, players[1].id);

  const first = store.derive({ minMinutes: 90, selectedId: players[0].id });
  assert.equal(first.selected.position, 'Center Back');
});

test('the second same-name player is reachable in compare radar and Δ rank', () => {
  const store = createStore(twoCohens(), { provenance: USER_DATA_PROVENANCE });
  const [back, forward] = store.players;
  const view = store.derive(
    { grit: 0, involvement: 0, clutch: 100, minMinutes: 90, selectedId: back.id, compareId: forward.id },
    DEFAULT_METRIC
  );
  assert.equal(view.rows.length, 2);
  assert.equal(new Set(view.rows.map((row) => row.id)).size, 2);
  assert.equal(view.compared.position, 'Center Forward');
  assert.equal(view.radar.a.id, back.id);
  assert.equal(view.radar.b.id, forward.id);
  view.rows.forEach((row) => {
    assert.ok(Number.isFinite(row.deltaRank), `Δ rank for ${row.id} is present`);
    assert.ok(Number.isFinite(row.baselineScore), `baseline score for ${row.id} is present`);
  });
  const fwd = view.rows.find((row) => row.id === forward.id);
  const def = view.rows.find((row) => row.id === back.id);
  assert.notEqual(fwd.baselineScore, def.baselineScore, 'each Cohen is matched to its own baseline row');
});

test('a third duplicate gets #3 and suffixed ids survive the hash permalink', () => {
  const data = twoCohens();
  data.players.push(Object.assign({}, data.players[0], { position: 'Goalkeeper' }));
  const store = createStore(data, { provenance: USER_DATA_PROVENANCE });
  assert.deepEqual(store.players.map((row) => row.id), ['Cohen|A', 'Cohen|A#2', 'Cohen|A#3']);
  const parsed = parseMetricHash('#' + serializeMetricHash({ minMinutes: 90, selectedId: 'Cohen|A#3', compareId: 'Cohen|A#2' }));
  assert.equal(parsed.selectedId, 'Cohen|A#3');
  assert.equal(parsed.compareId, 'Cohen|A#2');
  assert.equal(store.derive(parsed).selected.position, 'Goalkeeper');
});

test('shipped WC2018 file keeps every player id unchanged', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_event_aggregates.json'), 'utf8'));
  const store = createStore(raw);
  assert.ok(store.players.length > 0);
  assert.equal(store.players.length, raw.players.length);
  store.players.forEach((row, i) => {
    assert.equal(row.id, playerKey(raw.players[i]));
  });
  assert.equal(new Set(store.players.map((row) => row.id)).size, store.players.length, 'no duplicate ids');
  assert.ok(store.players.every((row) => !/#\d+$/.test(row.id)), 'no collision suffix was needed');
});

test('CSV headers the lab does not read are reported with a suggestion, duplicates too', () => {
  const csv = [
    'name,team,minutes,tackle,Pressures,Key Passes,xG,name',
    'Alpha,Home,270,5,10,2,0.4,ignored',
    'Beta,Home,270,3,2,1,0.1,ignored'
  ].join('\n');
  const parsed = parseUserDataset(csv, { attested: true, fileName: 'typos.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, [
    'כותרת כפולה: name — נקראת רק העמודה הראשונה',
    'עמודות שלא זוהו ולא נטענו: tackle (אולי tackles?)',
    'כותרות שהותאמו: Key Passes → keyPasses, xG → shotXgSum'
  ]);
  // Case-insensitive match still works, a spaced or coded header loads, the unknown column never reaches the player.
  assert.deepEqual(parsed.players[0], { name: 'Alpha', team: 'Home', totalMinutesProxy: 270, minutes: 270, pressures: 10, keyPasses: 2, shotXgSum: 0.4 });

  assert.equal(suggestCsvHeader('tackle'), 'tackles');
  assert.equal(suggestCsvHeader('key_passes'), 'keyPasses');
  assert.equal(suggestCsvHeader('Defensive Actions'), 'defensiveActions');
  assert.equal(suggestCsvHeader('shots_on_target'), 'shotsOnTarget');
  assert.equal(suggestCsvHeader('xG'), null);
  assert.equal(suggestCsvHeader('club'), null);

  // A clean header produces no warning at all.
  assert.deepEqual(auditCsvHeaders(['name', 'team', 'position', 'minutes', 'pressures', 'tackles', '']), []);
  assert.deepEqual(auditCsvHeaders(['Name', 'TotalMinutesProxy', 'Goals']), []);
});

test('CSV without any recognised stat column warns that every score will be 0', () => {
  const csv = 'name,minutes,born,nation\nAlpha,270,25,ISR\nBeta,270,31,ESP\n';
  const parsed = parseUserDataset(csv, { attested: true });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.warnings.length, 2);
  assert.equal(parsed.warnings[0], 'עמודות שלא זוהו ולא נטענו: born, nation');
  assert.ok(parsed.warnings[1].startsWith('אף עמודת ספירה מוכרת לא נמצאה — כל השחקנים יקבלו 0'));
  assert.ok(parsed.warnings[1].includes('pressures, tackles'));
  const store = createStore({ players: parsed.players }, { provenance: USER_DATA_PROVENANCE });
  assert.ok(store.derive({ minMinutes: 90 }).rows.every((row) => row.score === 0), 'the warning tells the truth');

  // Header-only warnings also travel with a rejected file (no players survived).
  const rejected = parseUserDataset('name,minutes,age\nAlpha,abc,5\n', { attested: true });
  assert.equal(rejected.ok, false);
  assert.ok(html.includes('שלא זוהתה'), 'the BYOD help text must mention unknown-column reporting');
});

test('positionGroup reads FIFA/Opta codes, Hebrew words and multi-role cells, not only StatsBomb names', () => {
  // Long names still work, and word order keeps "Wing Back" a defender.
  assert.equal(positionGroup('Center Defensive Midfield'), 'MF');
  assert.equal(positionGroup('Right Wing Back'), 'DF');
  assert.equal(positionGroup('Attacking Midfield'), 'MF');
  // Codes, any case, and the first role of a multi-role cell.
  assert.equal(positionGroup('GK'), 'GK');
  assert.equal(positionGroup('cb'), 'DF');
  assert.equal(positionGroup('CDM'), 'MF');
  assert.equal(positionGroup('ST'), 'FW');
  assert.equal(positionGroup('CB/RB'), 'DF');
  assert.equal(positionGroup('ST, LW'), 'FW');
  // Hebrew.
  assert.equal(positionGroup('שוער'), 'GK');
  assert.equal(positionGroup('בלם'), 'DF');
  assert.equal(positionGroup('קשר אחורי'), 'MF');
  assert.equal(positionGroup('חלוץ מרכזי'), 'FW');
  // Every published code maps to its own group.
  Object.keys(POSITION_CODES).forEach((group) => {
    POSITION_CODES[group].forEach((code) => assert.equal(positionGroup(code), group, code));
  });
  // Unknown and empty stay OT; empty is not an error worth reporting.
  assert.equal(positionGroup('Pivot'), 'OT');
  assert.equal(positionGroup(''), 'OT');
  assert.deepEqual(auditPositions([{ position: 'CB' }, { position: '' }, {}]), []);
  const notes = auditPositions([{ position: 'Pivot' }, { position: 'CB' }, { position: 'Pivot' }, { position: 'Enganche' }]);
  assert.equal(notes.length, 1);
  assert.ok(notes[0].startsWith('עמדות שלא זוהו ונחשבות OT'));
  assert.ok(notes[0].includes('Pivot, Enganche'), 'each unknown label is listed once');
});

test('CSV with coded positions normalises inside the right groups and reports the labels it cannot place', () => {
  const header = 'name,team,position,minutes,pressures,shotXgSum';
  const coded = [header, 'A,X,CB,900,90,0.1', 'B,X,RB,900,30,0.1', 'C,X,ST,900,10,3', 'D,X,CF,900,10,1'].join('\n');
  const parsed = parseUserDataset(coded, { attested: true });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.warnings, [], 'recognised codes produce no warning');
  const store = createStore({ players: parsed.players }, { provenance: USER_DATA_PROVENANCE });
  const rows = store.derive({ minMinutes: 90, normalizePosition: true }).rows;
  const groups = {};
  rows.forEach((row) => { groups[row.name] = row.positionGroup; });
  assert.deepEqual(groups, { A: 'DF', B: 'DF', C: 'FW', D: 'FW' });
  // Percentiles are taken inside the group: the top defender and the top
  // forward both sit at the top of their own grit/clutch ladder.
  const byName = {};
  rows.forEach((row) => { byName[row.name] = row.components; });
  assert.ok(byName.A.grit > byName.B.grit, 'CB with more pressures ranks above the RB inside DF');
  assert.ok(byName.C.clutch > byName.D.clutch, 'ST with more xG ranks above the CF inside FW');

  const unknown = [header, 'A,X,Pivot,900,90,0.1', 'B,X,Enganche,900,30,0.1', 'C,X,ST,900,10,3'].join('\n');
  const flagged = parseUserDataset(unknown, { attested: true });
  assert.equal(flagged.ok, true);
  assert.equal(flagged.warnings.length, 1);
  assert.ok(flagged.warnings[0].includes('Pivot, Enganche'));
  assert.ok(!flagged.warnings[0].split(' — ')[0].includes('ST'), 'recognised codes are not listed as unknown');
  // The JSON path gets the same report.
  const json = parseUserDataset(JSON.stringify({ players: [{ name: 'A', minutes: 900, position: 'Pivot' }, { name: 'B', minutes: 900, position: 'GK' }] }), { attested: true });
  assert.equal(json.warnings.length, 1);
  assert.ok(json.warnings[0].includes('Pivot'));
  assert.ok(html.includes('CDM') && html.includes('OT'), 'the BYOD help text must list accepted position codes');
});

test('CSV header aliases: FBref codes, spaced or underscored names and Hebrew headers load into the right columns', () => {
  assert.equal(resolveCsvHeader('Key Passes'), 'keyPasses');
  assert.equal(resolveCsvHeader('KEY_PASSES'), 'keyPasses');
  assert.equal(resolveCsvHeader('shots-on-target'), 'shotsOnTarget');
  assert.equal(resolveCsvHeader('Total Minutes Proxy'), 'totalMinutesProxy');
  assert.equal(resolveCsvHeader('xG'), 'shotXgSum');
  assert.equal(resolveCsvHeader('Club'), 'team');
  assert.equal(resolveCsvHeader('דקות'), 'minutes');
  assert.equal(resolveCsvHeader('age'), null);
  assert.equal(resolveCsvHeader('passes'), null, 'attempted vs completed is ambiguous, so it stays unknown');
  assert.equal(resolveCsvHeader(''), null);
  Object.keys(CSV_HEADER_ALIASES).forEach((alias) => {
    assert.ok(USER_DATASET_COLUMNS.includes(CSV_HEADER_ALIASES[alias]), alias + ' maps to a column the lab reads');
    assert.equal(alias, alias.toLowerCase().replace(/[ _.-]+/g, ''), alias + ' is stored in its plain form');
  });

  // An FBref-style export: short codes, Title Case, one column spelled twice.
  const fbref = [
    'Player,Squad,Pos,Min,Tkl,Int,KP,xG,SoT,Gls,Ast,shots_on_target',
    'Alpha,Home,CB,270,5,3,2,0.4,1,0,1,9',
    'Beta,Away,ST,180,1,0,3,1.1,4,2,0,9'
  ].join('\n');
  const parsed = parseUserDataset(fbref, { attested: true, fileName: 'fbref.csv' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, [
    'כותרת כפולה: shots_on_target (= shotsOnTarget) — נקראת רק העמודה הראשונה',
    'כותרות שהותאמו: Player → name, Squad → team, Pos → position, Min → minutes, Tkl → tackles, Int → interceptions, KP → keyPasses, xG → shotXgSum, SoT → shotsOnTarget, Gls → goals, Ast → assists'
  ]);
  assert.deepEqual(parsed.players[0], {
    name: 'Alpha', team: 'Home', position: 'CB', totalMinutesProxy: 270, minutes: 270,
    tackles: 5, interceptions: 3, keyPasses: 2, shotXgSum: 0.4, shotsOnTarget: 1, goals: 0, assists: 1
  });
  const store = createStore({ players: parsed.players }, { provenance: USER_DATA_PROVENANCE });
  const alpha = store.players.find((row) => row.name === 'Alpha');
  assert.equal(alpha.counts.tackles, 5, 'Tkl reached the counts the formula reads');
  assert.equal(alpha.positionGroup, 'DF');
  assert.ok(alpha.components.grit > 0, 'the aliased defensive columns feed Grit');

  // A sheet typed in Hebrew and saved by a European Excel.
  const hebrew = 'sep=;\nשם;קבוצה;עמדה;דקות;tackles\nגמא;בית;בלם;270;6\nדלתא;חוץ;חלוץ;180;1\n';
  const he = parseUserDataset(hebrew, { attested: true });
  assert.equal(he.ok, true);
  assert.deepEqual(he.errors, []);
  assert.deepEqual(he.warnings, ['כותרות שהותאמו: שם → name, קבוצה → team, עמדה → position, דקות → minutes']);
  assert.deepEqual(he.players[0], { name: 'גמא', team: 'בית', position: 'בלם', totalMinutesProxy: 270, minutes: 270, tackles: 6 });

  // A header that differs only in case is not reported as a mapping, and a
  // trailing empty header cell still does not count towards the row width.
  assert.deepEqual(auditCsvHeaders(['Name', 'TEAM', 'Minutes', 'Tackles']), []);
  const padded = parseUserDataset('name,minutes,Tkl,,' + '\n' + 'Alpha,270,4' + '\n', { attested: true });
  assert.deepEqual(padded.errors, []);
  assert.deepEqual(padded.players, [{ name: 'Alpha', totalMinutesProxy: 270, minutes: 270, tackles: 4 }]);
  assert.ok(html.includes('Key Passes'), 'the BYOD help text must mention the accepted header spellings');
});
