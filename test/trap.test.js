'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Trap = require('../trap.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trap', 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'trap.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const attic = fs.readFileSync(path.join(root, 'attic', 'proof-demo.js'), 'utf8');

test('sandbox ranking follows statScore when invented weight is zero', () => {
  const view = Trap.deriveRanking(Trap.SANDBOX_PLAYERS, { name: 'קסם', weight: 0, values: { flash: 0, hold: 100 } });
  assert.equal(view.rows[0].name, 'כנף מבריקה');
  assert.equal(view.rows[0].score, 86);
  assert.ok(view.rows.every((row) => row.deltaRank === 0));
  assert.equal(view.swings.length, 0);
  assert.match(view.formula, /0\/100/);
});

test('invented feature plus weight flips who leads and reports jumps', () => {
  const values = {
    hold: 95, flash: 10, box: 15, cb: 80,
    am: 20, fb: 25, st2: 90, dm: 85
  };
  const view = Trap.deriveRanking(Trap.SANDBOX_PLAYERS, { name: 'נחישות שהמצאתי', weight: 80, values: values });
  assert.notEqual(view.rows[0].id, 'flash');
  assert.ok(view.rows[0].score > view.rows.find((row) => row.id === 'flash').score);
  const holder = view.rows.find((row) => row.id === 'hold');
  const flashy = view.rows.find((row) => row.id === 'flash');
  assert.ok(holder.deltaRank > 0);
  assert.ok(flashy.deltaRank < 0);
  assert.ok(view.swings.some((row) => row.id === 'hold' && row.deltaRank > 0));
  assert.ok(Math.abs(holder.deltaScore) > 0);
  assert.match(view.formula, /נחישות שהמצאתי/);
});

test('auto-fit manufactures a chosen winner and marks the control down', () => {
  const spec = Trap.autoFitInvented(Trap.SANDBOX_PLAYERS, 'st2', 75);
  const view = Trap.deriveRanking(Trap.SANDBOX_PLAYERS, spec);
  assert.equal(view.rows[0].id, 'st2');
  assert.equal(spec.values.st2, 95);
  assert.ok(Object.keys(spec.values).filter((id) => id !== 'st2').every((id) => spec.values[id] === 18));
  const report = Trap.evaluateFalsification({}, spec, { autoFitted: true, tunedAfterSeeingRank: true });
  assert.ok(report.failed >= 4);
  assert.equal(report.items.find((item) => item.id === 'controlUntouched').pass, false);
});

test('attic reconstruction uses archived hand-typed numbers, not a face model', () => {
  const kante = Trap.archivedHandFedScore(Trap.ATTIC_ARCHIVED_FEATURES.kante);
  const vardy = Trap.archivedHandFedScore(Trap.ATTIC_ARCHIVED_FEATURES.vardy);
  const flashy = Trap.archivedHandFedScore(Trap.ATTIC_ARCHIVED_FEATURES.flashy);
  assert.equal(kante, Trap.ATTIC_PLAYERS.find((p) => p.id === 'kante').archivedInvented);
  assert.ok(kante > flashy);
  assert.ok(vardy > flashy);
  assert.doesNotMatch(engine, /require\(['"]\.\/lib\/faceEnergyProfile/);
  assert.doesNotMatch(engine, /function faceEnergyProfile/);
  assert.doesNotMatch(engine + '\n' + html, /getUserMedia|face-api|mediapipe|jawScore|chinScore/i);
});

test('stats-only attic ranking keeps the control first; archived mix flips it', () => {
  const baseline = Trap.evaluateAtticWalkthrough({ weight: 0, values: { kante: 50, vardy: 50, flashy: 50 } });
  assert.equal(baseline.holds, false);
  assert.equal(baseline.rows[0].id, 'flashy');
  assert.match(baseline.proofLine, /נכשל/);

  const archived = Trap.evaluateAtticWalkthrough(Trap.archivedAtticSpec({ weight: 80 }));
  assert.equal(archived.holds, true);
  assert.equal(archived.usedArchive, true);
  assert.equal(archived.circular, true);
  assert.ok(archived.rows.find((row) => row.id === 'kante').rank < archived.rows.find((row) => row.id === 'flashy').rank);
  assert.ok(archived.rows.find((row) => row.id === 'vardy').rank < archived.rows.find((row) => row.id === 'flashy').rank);
  assert.match(archived.proofLine, /עבר/);
});

test('attic-style upside rewards low stats so the archived conclusion is almost automatic', () => {
  const spec = Trap.archivedAtticSpec({ weight: 100, mode: 'atticUpside' });
  const view = Trap.evaluateAtticWalkthrough(spec);
  assert.equal(view.holds, true);
  const control = view.rows.find((row) => row.id === 'flashy');
  const grinders = view.rows.filter((row) => row.role === 'grinder');
  assert.ok(grinders.every((row) => row.score > control.score));
  assert.ok(control.score < 40);
});

test('walkthrough steps reconstruct the repo history in order', () => {
  assert.equal(Trap.WALKTHROUGH_STEPS.length, 6);
  assert.equal(Trap.WALKTHROUGH_STEPS[0].id, 'conclusion-first');
  assert.equal(Trap.WALKTHROUGH_STEPS[5].id, 'why-nothing');
  assert.match(Trap.WALKTHROUGH_STEPS[2].body, /לא מדדו פנים/);
  assert.match(Trap.WALKTHROUGH_STEPS[4].body, /עבר/);
  assert.match(attic, /jawSquareness: 0\.85/);
  assert.match(attic, /Flashy Winger \(control\)/);
  assert.equal(Trap.ATTIC_ARCHIVED_FEATURES.kante.jawSquareness, 0.85);
  assert.equal(Trap.ATTIC_ARCHIVED_FEATURES.flashy.chinProjection, 0.3);
  assert.match(Trap.ATTIC_SOURCE.path, /attic\/proof-demo\.js/);
});

test('falsification checklist fails a post-hoc sandbox metric and stays honest about next season', () => {
  const spec = Trap.normalizeInventedSpec({
    name: 'ריבוע אופי',
    weight: 60,
    values: { hold: 90, flash: 10, box: 10, cb: 80, am: 15, fb: 20, st2: 85, dm: 80 }
  }, Trap.SANDBOX_PLAYERS);
  const report = Trap.evaluateFalsification({}, spec, {
    tunedAfterSeeingRank: true,
    sameSample: true,
    valuesHandTyped: true
  });
  assert.equal(report.total, 6);
  assert.ok(report.failed >= 4);
  const byId = Object.fromEntries(report.items.map((item) => [item.id, item]));
  assert.equal(byId.outOfSample.pass, false);
  assert.equal(byId.preregistered.pass, false);
  assert.equal(byId.nextSeason.pass, false);
  assert.equal(byId.featureTiming.pass, false);
  assert.equal(byId.independentMeasure.pass, false);
  assert.match(report.summary, /נכשל/);
});

test('learner can override inferred answers; only explicit yes counts as pass', () => {
  const failed = Trap.evaluateFalsification({ outOfSample: 'no' }, { weight: 0 }, {});
  assert.equal(failed.items.find((item) => item.id === 'outOfSample').pass, false);
  const passed = Trap.evaluateFalsification({
    outOfSample: 'yes',
    preregistered: 'yes',
    nextSeason: 'yes',
    featureTiming: 'yes',
    independentMeasure: 'yes',
    controlUntouched: 'yes'
  }, { weight: 0 }, { hasHoldout: true, hasNextSeason: true, valuesHandTyped: false });
  assert.equal(passed.passed, 6);
  assert.equal(passed.failed, 0);
});

test('homepage builder weights are treated as unregistered when they left 40/30/30', () => {
  const moved = Trap.homepageMetricContext({ grit: 70, involvement: 20, clutch: 10 });
  assert.equal(moved.tunedAfterSeeingRank, true);
  const def = Trap.homepageMetricContext({ grit: 40, involvement: 30, clutch: 30 });
  assert.equal(def.tunedAfterSeeingRank, false);
});

test('trap page is Hebrew RTL, linked from the homepage, and never scores faces', () => {
  assert.match(html, /lang="he"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /מלכודת הפיצ['׳']רים המשכנעים/);
  assert.match(html, /הוסף פיצ['׳']ר/);
  assert.match(html, /הוכחה מעגלית/);
  assert.match(html, /מבחן ההפרכה/);
  assert.match(html, /attic\/proof-demo\.js/);
  assert.match(html, /לא מנתח פנים/);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(home, /href="trap\/"/);
  assert.match(home, /מלכודת הפיצ['׳']רים המשכנעים/);
});

test('trap runtime has no network, forms, or submission path', () => {
  const runtime = html + '\n' + engine;
  const forbidden = [
    /XMLHttpRequest/i, /sendBeacon/i, /WebSocket/i,
    /<form\b/i, /type=["']submit/i, /mailto:/i, /https?:\/\//i,
    /fetch\s*\(\s*['"`]https?:/i
  ];
  forbidden.forEach((pattern) => assert.doesNotMatch(runtime, pattern));
  assert.match(html, /ScoutAITrap/);
  assert.match(html, /class="skip"/);
  assert.match(html, /:focus-visible/);
});
