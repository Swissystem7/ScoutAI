'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const BB = require('../basketball.js');
const Demo = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'basketball', 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'basketball.js'), 'utf8');
const exampleCsv = fs.readFileSync(path.join(root, BB.EXAMPLE_PATH), 'utf8');

function parse(csv, extra) {
  return BB.parseBasketballCsv(csv, Object.assign({ attested: true }, extra || {}));
}

test('a user file needs the licence checkbox; the synthetic example does not', () => {
  const csv = 'Player,Team,MP,PTS\nA,X,500,200\n';
  assert.equal(BB.parseBasketballCsv(csv, {}).ok, false);
  assert.match(BB.parseBasketballCsv(csv, {}).errors[0], /רישיון/);
  assert.equal(BB.parseBasketballCsv(csv, { attested: true }).provenance, Demo.USER_DATA_PROVENANCE);
  assert.equal(BB.parseBasketballCsv(csv, { synthetic: true }).provenance, Demo.SYNTHETIC_PROVENANCE);
});

test('Basketball-Reference and Hebrew headers resolve to the same fields', () => {
  assert.equal(BB.resolveHeader('Player'), 'name');
  assert.equal(BB.resolveHeader('Tm'), 'team');
  assert.equal(BB.resolveHeader('MP'), 'minutes');
  assert.equal(BB.resolveHeader('3PA'), 'threePa');
  assert.equal(BB.resolveHeader('+/-'), 'plusMinus');
  assert.equal(BB.resolveHeader('EFF'), 'pir');
  assert.equal(BB.resolveHeader('שם'), 'name');
  assert.equal(BB.resolveHeader('דקות'), 'minutes');
  assert.equal(BB.resolveHeader('ריבאונד הגנה'), 'defRebounds');
  assert.equal(BB.resolveHeader('FG%'), null);
});

test('a file without a minutes column is refused, because per-40 needs minutes', () => {
  const parsed = parse('Player,Team,PTS\nA,X,200\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /דקות/);
});

test('box-score clock minutes (32:15) read as decimal minutes and are reported', () => {
  assert.deepEqual(BB.minutesValue('32:15', false), { value: 32.25, clock: true });
  const parsed = parse('Player,Team,MIN,PTS\nA,X,32:15,20\nB,X,28:30,10\n');
  assert.equal(parsed.players[0].minutes, 32.25);
  assert.ok(parsed.warnings.some((w) => /32:15/.test(w)));
});

test('per-game files with a G column become season totals; rates per 40 do not change', () => {
  const csv = 'Player,Tm,G,MP,PTS,AST\nA,X,30,32.0,20.0,5.0\nB,Y,10,10.0,4.0,1.0\n';
  const parsed = parse(csv);
  assert.equal(parsed.perGame, true);
  assert.equal(parsed.players[0].minutes, 960);
  assert.equal(parsed.players[0].points, 600);
  assert.ok(parsed.warnings.some((w) => /ממוצעים למשחק/.test(w)));
  const store = BB.createBasketballStore(parsed);
  const row = store.players.find((p) => p.name === 'A');
  assert.equal(row.components.raw.points40, 25);
});

test('a per-game file without G is kept but the minutes threshold is flagged', () => {
  const parsed = parse('Player,Tm,MP,PTS\nA,X,32,20\nB,Y,20,8\n');
  assert.equal(parsed.perGame, false);
  assert.ok(parsed.warnings.some((w) => /אין עמודת משחקים/.test(w)));
});

test('traded players: the TOT / 2TM row is kept and the per-team rows are dropped', () => {
  const csv = 'Player,Tm,MP,PTS\nA,2TM,900,400\nA,X,500,250\nA,Y,400,150\nB,X,800,300\n';
  const parsed = parse(csv);
  assert.deepEqual(parsed.players.map((p) => p.name + '|' + p.team), ['A|2TM', 'B|X']);
  assert.ok(parsed.warnings.some((w) => /TOT \/ 2TM/.test(w)));
});

test('summary rows, repeated headers, missing markers and bad numbers are reported, not scored', () => {
  const csv = [
    'Player,Tm,MP,PTS,AST',
    'A,X,800,300,40',
    'Player,Tm,MP,PTS,AST',
    'B,Y,700,-,30',
    'C,Z,600,abc,20',
    'D,W,-100,10,2',
    'Team Totals,,2100,700,90'
  ].join('\n');
  const parsed = parse(csv);
  assert.deepEqual(parsed.players.map((p) => p.name), ['A', 'B', 'C', 'D']);
  assert.equal(parsed.players[1].points, undefined);
  assert.ok(parsed.warnings.some((w) => /חוזרת/.test(w)));
  assert.ok(parsed.warnings.some((w) => /Team Totals/.test(w)));
  assert.ok(parsed.warnings.some((w) => /PTS: 1 תאים ריקים/.test(w)));
  assert.ok(parsed.errors.some((e) => /abc/.test(e)));
  assert.ok(parsed.errors.some((e) => /שלילי/.test(e)));
  assert.ok(parsed.warnings.some((w) => /בלי דקות/.test(w) && /D/.test(w)));
});

test('+/- may be negative; a negative count may not', () => {
  const parsed = parse('Player,Tm,MP,PTS,+/-\nA,X,800,300,-42\nB,Y,700,-5,10\n');
  assert.equal(parsed.players[0].plusMinus, -42);
  assert.equal(parsed.players[1].points, undefined);
});

test('positions: codes, words and Hebrew land in G / F / C', () => {
  assert.equal(BB.positionGroup('PG'), 'G');
  assert.equal(BB.positionGroup('SG-SF'), 'G');
  assert.equal(BB.positionGroup('PF'), 'F');
  assert.equal(BB.positionGroup('C'), 'C');
  assert.equal(BB.positionGroup('Center'), 'C');
  assert.equal(BB.positionGroup('רכז'), 'G');
  assert.equal(BB.positionGroup('סנטר'), 'C');
  assert.equal(BB.positionGroup(''), 'OT');
});

test('components follow the documented recipe: TS% with 0.44 FTA, steals and blocks outweigh DRB', () => {
  const row = { minutes: 400, points: 200, fga: 150, fta: 50, assists: 60, turnovers: 20, steals: 20, blocks: 10, defRebounds: 60 };
  const c = BB.componentsFor(row);
  assert.equal(c.raw.points40, 20);
  assert.equal(c.raw.ts, Math.round(200 / (2 * (150 + 0.44 * 50)) * 100) / 100);
  assert.equal(c.raw.astTo, 3);
  // steals 2/40 → 80, blocks 1/40 → 50, DRB 6/40 → 66.7
  assert.equal(c.defense, Math.round((80 * 0.45 + 50 * 0.4 + (6 / 9 * 100) * 0.15) * 10) / 10);
  assert.ok(engine.includes('0.45') && engine.includes('* 0.15'));
});

test('missing TOV / FGA / DRB fall back openly and say so', () => {
  const c = BB.componentsFor({ minutes: 400, points: 200, assists: 60, rebounds: 80 });
  assert.deepEqual(c.estimated.sort(), ['defRebounds', 'fga', 'turnovers']);
  const exact = BB.componentsFor({ minutes: 400, rebounds: 80, offRebounds: 20 });
  assert.equal(exact.raw.defRebounds40, 6);
  assert.equal(exact.estimated.indexOf('defRebounds'), -1);
});

test('default weights 30/30/40 and the 250-minute floor are the documented defaults', () => {
  assert.deepEqual(
    { d: BB.DEFAULT_SPEC.defense, p: BB.DEFAULT_SPEC.playmaking, s: BB.DEFAULT_SPEC.scoring, m: BB.DEFAULT_SPEC.minMinutes },
    { d: 30, p: 30, s: 40, m: 250 }
  );
  assert.equal(BB.formatFormula(BB.DEFAULT_SPEC), 'מדד = 0.3×הגנה + 0.3×יצירה + 0.4×קליעה');
  assert.equal(BB.compositeScore({ defense: 50, playmaking: 50, scoring: 50 }, BB.DEFAULT_SPEC), 50);
  assert.equal(BB.compositeScore({ defense: 50, playmaking: 50, scoring: 50 }, { defense: 0, playmaking: 0, scoring: 0 }), 0);
});

test('the team split keeps every team on one side and the halves the same size', () => {
  const parsed = BB.parseBasketballCsv(exampleCsv, { synthetic: true });
  const store = BB.createBasketballStore(parsed);
  const folds = BB.assignFolds(store.players);
  assert.equal(folds.by, 'team');
  const sideOf = {};
  store.players.forEach((p) => {
    const side = folds.fold(p);
    assert.ok(!sideOf[p.team] || sideOf[p.team] === side, p.team + ' is on both sides');
    sideOf[p.team] = side;
  });
  const sides = Object.values(sideOf);
  assert.equal(sides.filter((s) => s === 'train').length, sides.filter((s) => s === 'test').length);
});

test('fewer than four teams falls back to a player split and says so', () => {
  const parsed = parse('Player,Tm,MP,PTS\nA,X,800,300\nB,Y,700,200\nC,X,600,100\n');
  const folds = BB.assignFolds(BB.createBasketballStore(parsed).players);
  assert.equal(folds.by, 'player');
  assert.match(folds.label, /פחות מ-4 קבוצות/);
});

test('synthetic example: 80 invented players, 8 teams, and the generator is in the repo', () => {
  const parsed = BB.parseBasketballCsv(exampleCsv, { synthetic: true });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.players.length, 80);
  assert.equal(new Set(parsed.players.map((p) => p.team)).size, 8);
  assert.ok(parsed.players.every((p) => /הדגמה/.test(p.name)));
  assert.match(fs.readFileSync(path.join(root, 'tools', 'make-basketball-example.js'), 'utf8'), /pure noise/);
  assert.ok(fs.existsSync(path.join(root, 'tools', 'make-basketball-example.js')));
});

test('validation reports a same-season team split, never a held-out season', () => {
  const store = BB.createBasketballStore(BB.parseBasketballCsv(exampleCsv, { synthetic: true }));
  const derived = store.derive(BB.DEFAULT_SPEC, { iterations: 200 });
  assert.equal(derived.outcome.id, 'plusMinus');
  assert.ok(derived.rows.every((r) => r.minutes >= 250));
  assert.match(derived.validation.verdict, /אותה עונה/);
  assert.ok(derived.validation.test.n > 0 && derived.validation.train.n > 0);
  const pir = store.derive({ outcomeId: 'pir' }, { iterations: 200 });
  assert.equal(pir.validation.leaky, true);
  assert.match(pir.validation.verdict, /דליפה/);
});

test('PanimGuide on the synthetic file stays inside the shuffle noise band', () => {
  const store = BB.createBasketballStore(BB.parseBasketballCsv(exampleCsv, { synthetic: true }));
  store.outcomes.forEach((o) => {
    const p = store.derive({ outcomeId: o.id }, { iterations: 1000 }).panim;
    assert.ok(p.test.panimP >= 0.05, o.id + ': panim p=' + p.test.panimP);
    assert.ok(Math.abs(p.test.panimRho) <= p.noiseBand, o.id + ': |ρ| outside the band');
  });
});

test('the permutation test is not blind: a planted signal is detected', () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    rows.push({
      id: 'p' + i, name: 'p' + i, team: 'T' + (i % 8), minutes: 800,
      score: i, panimScore: i, components: { defense: 0, playmaking: 0, scoring: 0 },
      outcomes: { plusMinus: i }
    });
  }
  const p = BB.panimTest(rows, 'plusMinus', { iterations: 500 });
  assert.equal(p.test.panimRho, 1);
  assert.ok(p.test.panimP <= 0.01);
  assert.doesNotMatch(p.verdict, /בתוך טווח הרעש/);
  assert.match(p.verdict, /לא אישור/);
});

test('the spelling probe shows the PanimGuide score is read from the name, not a face', () => {
  const probe = BB.spellingProbe({ name: 'Kylian Mbappe', team: 'France' });
  assert.equal(probe.changes, true);
  assert.ok(probe.probes.some((p) => p.name === 'Mbappe, Kylian'));
  const direct = Demo.identifyPlayerPanim({ name: 'Kylian Mbappe', team: 'France' }).score;
  assert.equal(probe.probes[0].score, direct);
});

test('the panim test is deterministic for a fixed seed', () => {
  const store = BB.createBasketballStore(BB.parseBasketballCsv(exampleCsv, { synthetic: true }));
  const a = store.derive(BB.DEFAULT_SPEC, { iterations: 300 }).panim;
  const b = store.derive(BB.DEFAULT_SPEC, { iterations: 300 }).panim;
  assert.deepEqual(a, b);
});

test('extra numeric columns become candidate new lines; text and box-score % columns do not', () => {
  const csv = [
    'Player,Tm,MP,PTS,FG%,Rk,שפת גוף,Nationality,fWHR',
    'A,X,800,300,0.45,1,3.5,ISR,1.9',
    'B,Y,700,200,0.40,2,2.0,USA,2.1',
    'C,Z,600,100,0.50,3,-,FRA,1.8'
  ].join('\n');
  const parsed = parse(csv);
  assert.deepEqual(parsed.lines, ['שפת גוף', 'fWHR']);
  assert.equal(parsed.players[0].extra['שפת גוף'], 3.5);
  assert.equal(parsed.players[2].extra['שפת גוף'], undefined);
  assert.equal(parsed.players[0].extra.Nationality, undefined);
  assert.ok(parsed.warnings.some((w) => /שורה חדשה/.test(w) && /fWHR/.test(w)));
  assert.ok(parsed.warnings.some((w) => /לא קוראת/.test(w) && /FG%/.test(w) && /Nationality/.test(w)));
  const store = BB.createBasketballStore(parsed);
  assert.deepEqual(store.features.map((f) => f.id), ['x:שפת גוף', 'x:fWHR', 'panim']);
  assert.ok(store.outcomes.some((o) => o.id === 'x:fWHR'));
});

test('a new line can be turned into a rate per 40 minutes', () => {
  const row = { minutes: 800, extra: { touches: 100 }, panimScore: 80 };
  assert.equal(BB.featureValue(row, 'x:touches', false), 100);
  assert.equal(BB.featureValue(row, 'x:touches', true), 5);
  assert.equal(BB.featureValue(row, 'panim', true), 80);
  assert.equal(BB.featureValue(row, 'x:missing', false), null);
});

test('partial ρ removes what the metric already explains', () => {
  const z = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copy = z.slice();
  // A line that is the metric itself adds nothing.
  assert.equal(BB.partialRho(copy, z.map((v) => v * 2), z), null);
  // A line that carries information the metric lacks keeps a partial correlation.
  const extra = [5, 1, 9, 3, 7, 2, 10, 4, 8, 6];
  const y = z.map((v, i) => v + extra[i] * 2);
  assert.ok(BB.partialRho(extra, y, z) > 0.8);
});

test('synthetic file: the random line is noise; the planted line is caught raw but adds nothing beyond the metric', () => {
  const store = BB.createBasketballStore(BB.parseBasketballCsv(exampleCsv, { synthetic: true }));
  assert.deepEqual(store.lines, ['שפת גוף (אקראי)', 'בקרה (מושתל)']);
  const random = store.derive({ featureId: 'x:שפת גוף (אקראי)', outcomeId: 'plusMinus' }).feature;
  assert.ok(random.test.p >= 0.05, 'random p=' + random.test.p);
  assert.ok(random.test.partialP >= 0.05);
  assert.match(random.verdict, /בתוך טווח הרעש/);
  const planted = store.derive({ featureId: 'x:בקרה (מושתל)', outcomeId: 'plusMinus' }).feature;
  assert.ok(planted.test.p < 0.05, 'planted p=' + planted.test.p);
  assert.ok(planted.test.partialP >= 0.05, 'planted partial p=' + planted.test.partialP);
  assert.match(planted.verdict, /חוזרת על מה שהסטטיסטיקה כבר יודעת/);
  assert.match(planted.verdict, /לא אישור/);
});

test('a line that adds real information beyond the metric is reported as such', () => {
  const rows = [];
  for (let i = 0; i < 48; i += 1) {
    const hidden = (i * 37) % 48;
    rows.push({
      id: 'p' + i, name: 'p' + i, team: 'T' + (i % 8), minutes: 800, score: i % 12,
      panimScore: 70, components: { defense: 0, playmaking: 0, scoring: 0 },
      outcomes: {}, extra: { bl: hidden, target: hidden * 3 + (i % 12) }
    });
  }
  const f = BB.featureTest(rows, 'x:bl', 'x:target', { iterations: 400 });
  assert.ok(f.test.p < 0.05);
  assert.ok(f.test.partialP < 0.05);
  assert.match(f.verdict, /מוסיפה מידע שאין בבוקס-סקור/);
});

test('testing a column against itself is refused', () => {
  const store = BB.createBasketballStore(BB.parseBasketballCsv(exampleCsv, { synthetic: true }));
  const d = store.derive({ featureId: 'x:בקרה (מושתל)', outcomeId: 'x:בקרה (מושתל)' });
  assert.match(d.feature.error, /אותה עמודה/);
});

test('basketball page is Hebrew RTL, accessible, and cites its research', () => {
  assert.match(html, /lang="he"/);
  assert.match(html, /dir="rtl"/);
  ['load', 'builder', 'ranking', 'validate', 'panim', 'research'].forEach((id) => {
    assert.match(html, new RegExp('<a class="skip" href="#' + id + '">'));
    assert.match(html, new RegExp('<section class="card" id="' + id + '"'));
  });
  assert.match(html, /<nav class="toc" aria-label="מעבר לחלקי המעבדה">/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-valuetext/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /button:disabled/);
  [
    'pmc.ncbi.nlm.nih.gov/articles/PMC8416241',
    'doi.org/10.1177/0956797617716929',
    'doi.org/10.1371/journal.pone.0132726',
    'basketball-reference.com/about/bpm2.html',
    'basketball-reference.com/about/factors.html',
    'arxiv.org/abs/1609.09830',
    'pmc.ncbi.nlm.nih.gov/articles/PMC12865708',
    'doi:10.1123/jsep.2020-0066',
    'Kraus, Huang &amp; Keltner (2010)'
  ].forEach((ref) => assert.ok(html.includes(ref), 'missing source ' + ref));
  assert.match(html, /<details id="protocol">/);
  assert.match(html, /בלי לראות סטטיסטיקה/);
});

test('basketball runtime has no outbound network, forms or submission path', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]).join('\n');
  const runtime = scripts + '\n' + engine;
  [/XMLHttpRequest/i, /sendBeacon/i, /WebSocket/i, /<form\b/i, /type=["']submit/i, /mailto:/i,
    /https?:\/\//i, /fetch\s*\(\s*['"`]https?:/i].forEach((pattern) => assert.doesNotMatch(runtime, pattern));
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  // External links are citations only, all inside the research section.
  const research = html.slice(html.indexOf('id="research"'), html.indexOf('<footer>'));
  const outside = html.replace(research, '');
  assert.doesNotMatch(outside, /href="https?:/);
});

test('every page links to the basketball lab, and it links back to the football lab', () => {
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /href="basketball\/"/);
  assert.match(fs.readFileSync(path.join(root, 'trap', 'index.html'), 'utf8'), /href="\.\.\/basketball\/"/);
  assert.match(fs.readFileSync(path.join(root, 'offer.html'), 'utf8'), /href="basketball\/"/);
  assert.match(fs.readFileSync(path.join(root, 'licence.html'), 'utf8'), /href="basketball\/"/);
  assert.match(html, /<a href="\.\.\/">כדורגל<\/a>/);
});
