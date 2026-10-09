'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_METRIC,
  createStore,
  buildStructuredCourse
} = require('../demo.js');

test('buildStructuredCourse returns a structured course with exercises shared with the user', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const view = store.derive(DEFAULT_METRIC);

  const result = buildStructuredCourse(view);

  assert.ok(result && typeof result === 'object');
  assert.ok(result.course && typeof result.course === 'object');
  assert.ok(Array.isArray(result.course.lessons));
  assert.ok(result.course.lessons.length >= 1);
  assert.ok(Array.isArray(result.course.exercises));
  assert.ok(result.course.exercises.length >= 1, 'course must include at least one exercise');
  assert.ok(result.sharedExercise && typeof result.sharedExercise === 'object');
  assert.equal(result.sharedExercise, view.exercise, 'live exercise is shared with the user');
  assert.ok(
    result.sharedExercise.prompt || result.sharedExercise.title,
    'shared exercise is user-facing'
  );
  const first = result.course.exercises[0];
  assert.ok(first.prompt || first.title, 'course exercise is described for the learner');
});

test('buildStructuredCourse can start from the shipped dataset without a pre-built view', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const result = buildStructuredCourse(wc, DEFAULT_METRIC);
  assert.ok(result.course.exercises.length >= 1);
  assert.ok(result.sharedExercise);
});
