'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseUserDataset,
  looksLikeOpenDataPayload,
  createStore,
  exportMetricBundle,
  methodologyParagraph,
  USER_DATA_PROVENANCE,
  SYNTHETIC_PROVENANCE,
  OPEN_DATA_PROVENANCE,
  USER_DATASET_COLUMNS
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
