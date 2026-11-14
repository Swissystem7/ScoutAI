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

test('components follow the documented recipe: TS% with 0.44 FTA; defense is steals and blocks only', () => {
  const row = { minutes: 400, points: 200, fga: 150, fta: 50, assists: 60, turnovers: 20, steals: 20, blocks: 10, defRebounds: 60, offRebounds: 30 };
  const c = BB.componentsFor(row);
  assert.equal(c.raw.points40, 20);
  assert.equal(c.raw.ts, Math.round(200 / (2 * (150 + 0.44 * 50)) * 100) / 100);
  assert.equal(c.raw.astTo, 3);
  // steals 2/40 → 80, blocks 1/40 → 50; DRB no longer sits in defense.
  assert.equal(c.defense, Math.round((80 * 0.53 + 50 * 0.47) * 10) / 10);
  // ORB 3/40 → 60 (cap 5), DRB 6/40 → 66.7 (cap 9); 60% ORB, 40% DRB.
  assert.equal(c.raw.offRebounds40, 3);
  assert.equal(c.rebounding, Math.round((60 * 0.6 + (6 / 9 * 100) * 0.4) * 10) / 10);
  assert.ok(engine.includes('* 0.53') && engine.includes('scaleCap(offRebounds, 5) * 0.6'));
});

test('a rebounding centre now scores on rebounding; a guard with the same defense does not', () => {
  const centre = BB.componentsFor({ minutes: 800, offRebounds: 80, defRebounds: 180, steals: 16, blocks: 40 });
  const guard = BB.componentsFor({ minutes: 800, offRebounds: 15, defRebounds: 60, steals: 16, blocks: 40 });
  assert.equal(centre.defense, guard.defense);
  // ORB 4/40 → 80, DRB 9/40 → 100: 0.6 × 80 + 0.4 × 100 = 88.
  assert.equal(centre.rebounding, 88);
  assert.ok(guard.rebounding < 40, 'guard rebounding ' + guard.rebounding);
});

test('missing TOV / FGA / ORB / DRB fall back openly and say so', () => {
  const c = BB.componentsFor({ minutes: 400, points: 200, assists: 60, rebounds: 80 });
  assert.deepEqual(c.estimated.sort(), ['defRebounds', 'fga', 'offRebounds', 'turnovers']);
  const exact = BB.componentsFor({ minutes: 400, rebounds: 80, offRebounds: 20 });
  assert.equal(exact.raw.defRebounds40, 6);
  assert.equal(exact.estimated.indexOf('defRebounds'), -1);
  const fromDrb = BB.componentsFor({ minutes: 400, rebounds: 80, defRebounds: 60 });
  assert.equal(fromDrb.raw.offRebounds40, 2);
  assert.equal(fromDrb.estimated.indexOf('offRebounds'), -1);
  const parsed = parse('Player,Tm,MP,TRB\nA,X,800,200\nB,Y,700,100\n');
  assert.ok(parsed.warnings.some((w) => /ORB/.test(w) && /25%/.test(w)));
  assert.ok(parse('Player,Tm,MP,PTS\nA,X,800,200\nB,Y,700,100\n').warnings.some((w) => /אין ריבאונדים/.test(w)));
});

test('default weights 24/20/24/32 (Four Factors rebounding share) and the 250-minute floor', () => {
  assert.deepEqual(
    { d: BB.DEFAULT_SPEC.defense, r: BB.DEFAULT_SPEC.rebounding, p: BB.DEFAULT_SPEC.playmaking, s: BB.DEFAULT_SPEC.scoring, m: BB.DEFAULT_SPEC.minMinutes },
    { d: 24, r: 20, p: 24, s: 32, m: 250 }
  );
  // The old 30/30/40 proportions are kept inside the remaining 80%.
  assert.equal(BB.DEFAULT_SPEC.defense / 0.8, 30);
  assert.equal(BB.DEFAULT_SPEC.scoring / 0.8, 40);
  assert.equal(BB.formatFormula(BB.DEFAULT_SPEC), 'מדד = 0.24×הגנה + 0.2×ריבאונד + 0.24×יצירה + 0.32×קליעה');
  const half = { defense: 50, rebounding: 50, playmaking: 50, scoring: 50 };
  assert.equal(BB.compositeScore(half, BB.DEFAULT_SPEC), 50);
  assert.equal(BB.compositeScore(half, { defense: 0, rebounding: 0, playmaking: 0, scoring: 0 }), 0);
  assert.equal(BB.formatFormula({ defense: 0, rebounding: 0, playmaking: 0, scoring: 0 }), 'כל המשקלות 0 — אין מדד');
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

// A small game log: `quality(i, round)` sets player i's level in a round.
function gameLog(players, rounds, quality, extraHeader) {
  const head = 'Round,Player,Team,MP,PTS,ORB,DRB,AST,STL,BLK,TOV,FGA,FTA,+/-,PIR' + (extraHeader || '');
  const lines = [head];
  for (let r = 1; r <= rounds; r += 1) {
    for (let i = 0; i < players; i += 1) {
      const q = quality(i, r);
      // Every count rises with q, so a higher q is a better player on every component.
      lines.push([r, 'P' + i, 'T' + (i % 8), 25, 8 + 2 * q, 1 + Math.floor(q / 3), 3 + Math.floor(q / 2), 1 + Math.floor(q / 2), 1,
        Math.floor(q / 4), 2, 8 + q, 2, q - 5, 6 + 2 * q].join(','));
    }
  }
  return lines.join('\n');
}

test('a Round / מחזור column makes a game log: summed to a season, games kept for part 6', () => {
  const csv = [
    'מחזור,Player,Tm,MP,PTS,AST',
    'Game 1,A,X,30,20,5',
    'Game 1,B,Y,20,8,2',
    'Game 2,A,X,32,10,3',
    'Game 3,A,Z,28,14,4',
    ',B,Y,22,6,1'
  ].join('\n');
  const parsed = parse(csv);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.gameLog.rounds, [1, 2, 3]);
  assert.equal(parsed.gameLog.lines.length, 4);
  const a = parsed.players.find((p) => p.name === 'A');
  assert.deepEqual({ g: a.games, min: a.minutes, pts: a.points, ast: a.assists, team: a.team }, { g: 3, min: 90, pts: 44, ast: 12, team: 'Z' });
  assert.equal(parsed.perGame, false);
  assert.ok(parsed.errors.some((e) => /חסר מחזור/.test(e)));
  assert.ok(parsed.warnings.some((w) => /קובץ משחק-משחק/.test(w) && /מחזורים 1–3/.test(w)));
  assert.ok(parsed.warnings.some((w) => /ביותר מקבוצה אחת/.test(w) && /A/.test(w)));
  // A season file has no game log.
  assert.equal(parse('Player,Tm,MP,PTS\nA,X,800,300\nB,Y,700,200\n').gameLog, null);
});

test('start of season: the metric sees only the early rounds, the target only the later ones', () => {
  // P0 is the best player early and the only worst one later; everyone else is steady.
  const csv = gameLog(24, 8, (i, r) => (i === 0 ? (r <= 2 ? 10 : 0) : 1 + (i % 9)));
  const store = BB.createBasketballStore(parse(csv));
  const s = store.derive({ outcomeId: 'pir', minMinutes: 0, splitRound: 2, target: 'P0' }, { iterations: 200 }).season;
  assert.equal(s.splitRound, 2);
  assert.equal(s.earlyRounds, 2);
  assert.equal(s.laterRounds, 6);
  assert.equal(s.earlyFloor, 2 * BB.MIN_PER_ROUND);
  assert.equal(s.target.found, true);
  assert.equal(s.target.ranks.find((r) => r.id === 'metric').rank, 1);
  assert.equal(s.target.laterRank, s.laterPlayers);
  assert.match(s.verdict, /דוגמה, לא הוכחה/);
});

test('start of season: a lasting skill is detected, a reshuffled one stays in the noise', () => {
  const steady = BB.createBasketballStore(parse(gameLog(48, 8, (i) => i % 10)));
  const kept = steady.derive({ outcomeId: 'pir', splitRound: 2 }, { iterations: 300 }).season;
  const metric = kept.predictors[0];
  assert.equal(metric.id, 'metric');
  assert.ok(metric.rho > 0.8 && metric.p < 0.05, 'steady ρ=' + metric.rho);
  assert.match(kept.verdict, /חוזה את/);
  assert.ok(kept.predictors.some((p) => p.id === 'pir' && p.sameAsTarget));

  // Later quality is a fixed scramble of early quality: no lasting skill.
  const shuffled = BB.createBasketballStore(parse(gameLog(48, 8, (i, r) => (r <= 2 ? i % 10 : (i * 3 + 5) % 10))));
  const lost = shuffled.derive({ outcomeId: 'plusMinus', splitRound: 2 }, { iterations: 300 }).season;
  assert.ok(lost.predictors[0].p >= 0.05, 'scrambled p=' + lost.predictors[0].p);
  assert.match(lost.verdict, /לא חוזה/);
});

test('start of season: unknown or low-minute target players are reported, not ranked', () => {
  const store = BB.createBasketballStore(parse(gameLog(20, 6, (i) => i % 7)));
  const missing = store.derive({ outcomeId: 'pir', target: 'Nobody' }, { iterations: 50 }).season;
  assert.equal(missing.target.found, false);
  assert.match(missing.verdict, /לא נמצא שחקן/);
  const csv = gameLog(20, 6, (i) => i % 7) + '\n1,Bench,T1,3,2,0,1,0,0,0,0,1,0,0,1';
  const bench = BB.createBasketballStore(parse(csv)).derive({ outcomeId: 'pir', target: 'bench' }, { iterations: 50 }).season;
  assert.equal(bench.target.found, true);
  assert.equal(bench.target.eligible, false);
  assert.match(bench.verdict, /מתחת לסף/);
});

test('start of season: the default split is about a quarter of the season, never the last round', () => {
  assert.equal(BB.defaultSplitRound([1, 2]), 1);
  assert.equal(BB.defaultSplitRound([1, 2, 3, 4, 5, 6, 7, 8]), 2);
  assert.equal(BB.defaultSplitRound(Array.from({ length: 32 }, (_, i) => i + 1)), 8);
  assert.equal(BB.defaultSplitRound([5]), null);
  const one = BB.createBasketballStore(parse('Round,Player,Tm,MP,PIR\n1,A,X,30,10\n1,B,Y,20,5\n'));
  assert.match(one.derive({ outcomeId: 'pir' }).season.error, /מחזור אחד/);
});

test('synthetic game log: 80 invented players, 14 rounds, written by the same seeded generator', () => {
  const text = fs.readFileSync(path.join(root, BB.GAMELOG_EXAMPLE_PATH), 'utf8');
  const parsed = BB.parseBasketballCsv(text, { synthetic: true });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provenance, Demo.SYNTHETIC_PROVENANCE);
  assert.equal(parsed.players.length, 80);
  assert.equal(parsed.gameLog.rounds.length, 14);
  assert.ok(parsed.players.every((p) => /דמו/.test(p.name)));
  assert.match(fs.readFileSync(path.join(root, 'tools', 'make-basketball-example.js'), 'utf8'), /basketball\.gamelog\.example\.csv/);
  const store = BB.createBasketballStore(parsed);
  const a = store.derive({ outcomeId: 'pir' }, { iterations: 200 }).season;
  const b = store.derive({ outcomeId: 'pir' }, { iterations: 200 }).season;
  assert.deepEqual(a, b);
  assert.equal(a.splitRound, BB.defaultSplitRound(parsed.gameLog.rounds));
  assert.ok(a.top.length === 10 && a.n > 40);
});

test('basketball page is Hebrew RTL, accessible, and cites its research', () => {
  assert.match(html, /lang="he"/);
  assert.match(html, /dir="rtl"/);
  ['load', 'builder', 'ranking', 'validate', 'panim', 'season', 'research'].forEach((id) => {
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
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map((m) => m[1]).join('\n');
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
