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

test('offer contact opens a Hebrew workshop issue form that warns the issue is public', () => {
  const formPath = path.join(root, '.github', 'ISSUE_TEMPLATE', 'workshop.yml');
  assert.ok(fs.existsSync(formPath), 'missing .github/ISSUE_TEMPLATE/workshop.yml');
  const form = fs.readFileSync(formPath, 'utf8');
  assert.match(form, /^name: /m);
  assert.match(form, /^title: "פנייה לסדנה/m);
  assert.match(form, /ציבורי/);
  assert.match(form, /אל תכתבו טלפון/);
  assert.match(form, /נתוני שחקנים/);
  assert.doesNotMatch(form, /type: input\s+id: (phone|email)/);
  const plainNew = offer.match(/issues\/new(?!\?template=workshop\.yml)/g) || [];
  assert.equal(plainNew.length, 0, 'every offer contact link must open the workshop form');
  assert.match(offer, /issues\/new\?template=workshop\.yml/);
  assert.match(offer, /הפנייה ציבורית/);
});

test('private contact is one config value (contact.js), hidden while empty, with the Hebrew issue form as fallback', () => {
  const contactPath = path.join(root, 'contact.js');
  assert.ok(fs.existsSync(contactPath), 'missing contact.js (the single CONTACT slot)');
  const { CONTACT, contactHref, renderContact } = require('../contact.js');
  assert.equal(CONTACT, '', 'no invented contact: the owner fills CONTACT');
  assert.equal(contactHref(''), '');
  assert.equal(contactHref('   '), '');
  assert.equal(contactHref('javascript:alert(1)'), '');
  assert.equal(contactHref('http://example.com'), '');
  assert.equal(contactHref('050-0000000'), '');
  assert.equal(contactHref('mailto:not-an-address'), '');
  assert.equal(contactHref('mailto:a@b.co'), 'mailto:a@b.co');
  assert.equal(contactHref(' https://example.com/x '), 'https://example.com/x');

  const makeEl = (hidden) => ({ hidden, attrs: {}, link: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }, querySelector() { return this.link; } });
  const makeDoc = () => {
    const slots = [makeEl(true)];
    const fallbacks = [makeEl(false), makeEl(false)];
    return { slots, fallbacks, querySelectorAll(sel) { return sel === '[data-contact]' ? slots : sel === '[data-contact-fallback]' ? fallbacks : []; } };
  };
  const empty = makeDoc();
  assert.equal(renderContact(empty, ''), false);
  assert.equal(empty.slots[0].hidden, true);
  assert.ok(empty.fallbacks.every((el) => el.hidden === false));
  const filled = makeDoc();
  assert.equal(renderContact(filled, 'mailto:a@b.co'), true);
  assert.equal(filled.slots[0].hidden, false);
  assert.equal(filled.slots[0].link.attrs.href, 'mailto:a@b.co');
  assert.ok(filled.fallbacks.every((el) => el.hidden === true));
  const bad = makeDoc();
  assert.equal(renderContact(bad, 'javascript:alert(1)'), false);
  assert.equal(bad.slots[0].hidden, true);

  assert.match(offer, /<script src="contact\.js"><\/script>/);
  assert.match(offer, /data-contact hidden/);
  const fallbackBlocks = offer.match(/data-contact-fallback[^>]*>[\s\S]*?issues\/new\?template=workshop\.yml/g) || [];
  assert.ok(fallbackBlocks.length >= 1, 'the issue form link must sit inside a data-contact-fallback block');
  for (const page of ['index.html', 'offer.html', 'licence.html', path.join('trap', 'index.html')]) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(text, /mailto:|tel:|wa\.me|whatsapp\.com/i, page + ' must not hard-code contact details');
  }
});

test('every page footer a visitor sees is Hebrew (only the brand name ScoutAI in Latin letters)', () => {
  for (const page of ['index.html', 'offer.html', 'licence.html', path.join('trap', 'index.html')]) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    const footer = (text.match(/<footer>([\s\S]*?)<\/footer>/) || [])[1];
    assert.ok(footer, page + ' has a footer');
    const visible = footer.replace(/<[^>]+>/g, ' ').replace(/ScoutAI/g, '');
    assert.doesNotMatch(visible, /[A-Za-z]{2,}/, page + ' footer has English: ' + visible.trim());
  }
});

test('offer price anchors are current and sourced; no page links to a raw .md file', () => {
  for (const page of ['index.html', 'offer.html', 'licence.html', path.join('trap', 'index.html')]) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    const rawMd = (text.match(/href="(?!https:\/\/github\.com\/)[^"]*\.md"/g) || []);
    assert.deepEqual(rawMd, [], page + ' links to a .md file that GitHub Pages serves as raw text');
  }
  assert.doesNotMatch(offer, /מתחת לתוכנית וינגייט/);
  if (/וינגייט/.test(offer)) assert.match(offer, /לא ייפתח[^<]*28\.9\.2026/);
  assert.match(offer, /£60[^\n]*courses\.statsbomb\.com/);
  assert.match(offer, /€675/);
  assert.match(offer, /barcainnovationhub\.fcbarcelona\.com/);
  assert.match(offer, /נכון ל־28\.9\.2026/);
  assert.doesNotMatch(offer, /אינו פתוח<\/strong> נכון ל־13\.8\.2026/);
  assert.match(monetization, /28\.9\.2026/);
});

test('licence table scrolls inside its card on a phone instead of widening the page', () => {
  assert.match(licence, /\.table-wrap\{overflow-x:auto\}/);
  const tables = licence.match(/<table>/g) || [];
  const wrapped = licence.match(/<div class="table-wrap"[^>]*>\s*<table>/g) || [];
  assert.ok(tables.length > 0);
  assert.equal(wrapped.length, tables.length, 'every table on licence.html sits in .table-wrap');
});

test('README tells the owner where the one contact value lives', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /`contact\.js`[^\n]*CONTACT/);
});

test('BYOD rejects Open Data by content, not only by metadata: a CSV re-save or a bare array is caught', () => {
  const wc = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_event_aggregates.json'), 'utf8'));
  const roster = createStore(wc).players;
  const cols = ['name', 'team', 'position', 'totalMinutesProxy', 'pressures', 'tackles', 'interceptions', 'defensiveActions',
    'progressiveActions', 'keyPasses', 'passesCompleted', 'shotXgSum', 'boxTouches', 'shotsOnTarget', 'goals', 'assists'];
  const toCsv = rows => [cols.join(',')].concat(rows.map(row => cols.map(key => JSON.stringify(row[key] == null ? '' : row[key])).join(','))).join('\n');
  const opts = { attested: true, openDataPlayers: roster };
  const csv = parseUserDataset(toCsv(wc.players), opts);
  assert.equal(csv.ok, false);
  assert.equal(csv.detected, OPEN_DATA_PROVENANCE);
  assert.equal(csv.contentMatches, wc.players.length);
  assert.match(csv.errors[0], /לפי התוכן/);
  const bare = parseUserDataset(JSON.stringify(wc.players), { attested: true, openDataPlayers: wc.players });
  assert.equal(bare.ok, false);
  assert.equal(bare.detected, OPEN_DATA_PROVENANCE);
  const subset = parseUserDataset(toCsv(wc.players.slice(0, 25)), opts);
  assert.equal(subset.ok, false, 'a 25-row slice of the shipped file is still Open Data');
  // Same World Cup players from another, licensed provider: names match, counts do not.
  const otherProvider = wc.players.slice(0, 40).map(row => Object.assign({}, row, {
    tackles: row.tackles + 1, passesCompleted: row.passesCompleted + 3, pressures: row.pressures + 2,
    keyPasses: row.keyPasses + 1, progressiveActions: row.progressiveActions + 1, boxTouches: row.boxTouches + 1,
    interceptions: row.interceptions + 1, defensiveActions: row.defensiveActions + 1, shotsOnTarget: row.shotsOnTarget + 1,
    goals: row.goals + 1, assists: row.assists + 1, shotXgSum: row.shotXgSum + 0.5
  }));
  const licensed = parseUserDataset(toCsv(otherProvider), opts);
  assert.equal(licensed.ok, true);
  assert.equal(licensed.provenance, USER_DATA_PROVENANCE);
  const unchecked = parseUserDataset(toCsv(otherProvider), { attested: true });
  assert.equal(unchecked.ok, true);
  assert.ok(unchecked.warnings.some(text => /בדיקת התוכן מול Open Data לא רצה/.test(text)));
  assert.match(html, /openDataPlayers:/);
  assert.match(html, /parsed\.warnings/);
  assert.match(licence, /לפי התוכן/);
  assert.match(licence, /שמות ששונו/);
});

test('offer.html shows a 3-hour agenda that walks all eight lab lessons', () => {
  const { CURRICULUM_LESSONS } = require('../demo.js');
  const section = (offer.match(/<section class="card" id="agenda">([\s\S]*?)<\/section>/) || [])[1];
  assert.ok(section, 'agenda section exists');
  assert.match(section, /<h2>סדר היום/);
  CURRICULUM_LESSONS.forEach(lesson => {
    const title = lesson.title.replace(/^\d+\.\s*/, '');
    assert.ok(section.includes(title), 'agenda names lesson ' + title);
  });
  const minutes = [...section.matchAll(/<td>(\d):(\d\d)–(\d):(\d\d)<\/td>/g)]
    .map(m => (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2])));
  assert.ok(minutes.length >= 5);
  assert.equal(minutes.reduce((a, b) => a + b, 0), 180);
  assert.match(section, /class="table-wrap"/);
});
