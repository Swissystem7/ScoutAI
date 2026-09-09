'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const demo = require('../demo.js');
const {
  createStore,
  DEFAULT_METRIC,
  evaluateExercise,
  createRankCache,
  resetRankCalls,
  evaluateCurriculum
} = demo;

const wc = require('../data/wc2018_event_aggregates.json');
const goldenPath = path.join(__dirname, 'fixtures', 'derive-golden.json');

const WEIGHTS = [
  { grit: 40, involvement: 30, clutch: 30 },
  { grit: 70, involvement: 20, clutch: 10 }
];
const MINS = [0, 270, 600];
const NORMS = [false, true];

function matrixSpecs() {
  const specs = [];
  WEIGHTS.forEach((w) => {
    MINS.forEach((minMinutes) => {
      NORMS.forEach((normalizePosition) => {
        specs.push({
          grit: w.grit,
          involvement: w.involvement,
          clutch: w.clutch,
          minMinutes,
          normalizePosition,
          outcomeId: normalizePosition ? 'goals' : 'assists'
        });
      });
    });
  });
  return specs;
}

function stripCurriculum(view) {
  if (!view || typeof view !== 'object') return view;
  const copy = Object.assign({}, view);
  delete copy.curriculum;
  return copy;
}

test('ב10: derive ranks once per distinct spec — RANK_CALLS is 5 after fix (was 11)', () => {
  // Baseline before ב10: slider derive(metric, DEFAULT) re-ranked the same set
  // 11 times (rows + baseline + fragility×4 + validate + exercise×2×2) for 5
  // distinct specs. After the patch, one rank per needed distinct spec → 5.
  const store = createStore(wc);
  const spec = { grit: 70, involvement: 20, clutch: 10, minMinutes: 270 };
  resetRankCalls();
  store.derive(spec, DEFAULT_METRIC);
  assert.equal(demo.RANK_CALLS, 5,
    'after ב10, derive should call scorePrepared 5 times for 5 distinct specs');
});

test('ב10: evaluateExercise with precomputed rank cache matches cold call', () => {
  const store = createStore(wc);
  const players = store.players;
  const spec = { grit: 70, involvement: 20, clutch: 10, minMinutes: 270 };
  const precomputed = createRankCache();
  assert.deepEqual(
    evaluateExercise(players, spec),
    evaluateExercise(players, spec, precomputed)
  );
});

test('ב10: derive golden matrix (12 specs) matches fixture byte-for-byte after stripping curriculum', () => {
  const expectedRaw = fs.readFileSync(goldenPath, 'utf8');
  const expected = JSON.parse(expectedRaw);
  const specs = matrixSpecs();
  assert.equal(specs.length, 12);
  assert.equal(expected.length, 12);

  const store = createStore(wc);
  const actual = specs.map((spec) => {
    const view = store.derive(spec, DEFAULT_METRIC);
    return { spec, view: stripCurriculum(view) };
  });

  // Strip curriculum on both sides (fixture already stripped; keep symmetric).
  const left = JSON.stringify(actual.map((row) => ({
    spec: row.spec,
    view: stripCurriculum(row.view)
  })));
  const right = JSON.stringify(expected.map((row) => ({
    spec: row.spec,
    view: stripCurriculum(row.view)
  })));
  assert.equal(left, right);
});

test('ב10: derive no longer embeds dead empty-answers curriculum field', () => {
  const store = createStore(wc);
  const view = store.derive(DEFAULT_METRIC);
  assert.equal('curriculum' in view, false);
  assert.equal(evaluateCurriculum(view).length, 8);
});
