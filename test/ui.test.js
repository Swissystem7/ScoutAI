'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  CURRICULUM_LESSONS,
  COURSE_QUIZ,
  DEFENDER_EXERCISE,
  createStore,
  evaluateCurriculum,
  selectedWeightSwing,
  bestHelpfulBump,
  quizMarkedCorrect,
  matchesMarkedQuiz
} = require('../demo.js');
const {
  escapeHtml,
  deltaCell,
  quizMarkup,
  quizControlMap
} = require('../ui.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function passingFixture() {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const view = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, {
    selectedId: "N'Golo Kanté|France",
    weightsLocked: true
  }));
  const press = view.explorer.rows.find(row => row.key === 'pressures');
  const liveBeats = !!(view.validation && view.validation.beatsMinutes);
  const answers = {
    unusedField: 'dribbles',
    per90: String(press.per90),
    cappedField: 'pressures',
    weightsManual: 'yes',
    fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, view.spec, view.selected.id, 10)),
    splitIsSeason: 'no',
    whatMatters: 'test',
    unusedTerm: 'dribble',
    commercial: 'no',
    beatsMinutes: liveBeats ? 'yes' : 'no',
    roseComponent: 'grit',
    costGroup: 'FW'
  };
  return {
    store,
    view,
    answers,
    ctx: {
      spec: view.spec,
      selected: view.selected,
      explorer: view.explorer,
      validation: view.validation,
      exercise: view.exercise,
      players: store.players,
      fragility: view.fragility,
      answers
    }
  };
}

function contextualCorrect(fieldKey, fixture) {
  const { view, store, answers } = fixture;
  if (fieldKey === 'unusedField') {
    const unused = (view.explorer.unused || []).map(row => row.key);
    return unused.includes('dribbles') ? 'dribbles' : unused[0];
  }
  if (fieldKey === 'cappedField') {
    const capped = (view.explorer.capped || []).map(row => row.key);
    return capped.length ? capped[0] : 'none';
  }
  if (fieldKey === 'fragilityPredict') {
    return bestHelpfulBump(selectedWeightSwing(store.players, view.spec, view.selected.id, 10));
  }
  if (fieldKey === 'beatsMinutes') {
    return view.validation && view.validation.beatsMinutes ? 'yes' : 'no';
  }
  if (fieldKey === 'per90') {
    const press = view.explorer.rows.find(row => row.key === 'pressures');
    return String(press.per90);
  }
  const marked = quizMarkedCorrect(
    Object.keys(COURSE_QUIZ).find(id =>
      (COURSE_QUIZ[id].fields || []).some(f => f.key === fieldKey)
    ),
    fieldKey
  );
  return marked[0] || answers[fieldKey];
}

test('escapeHtml neutralises angle brackets and quotes', () => {
  const out = escapeHtml('<img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('"'));
  assert.match(out, /&lt;img/);
  const quoted = escapeHtml('say "hi"');
  assert.ok(!quoted.includes('"'));
  assert.match(quoted, /&quot;/);
});

test('deltaCell marks signed movement without raw HTML injection', () => {
  assert.match(deltaCell(2), /class="up"/);
  assert.match(deltaCell(-3), /class="down"/);
  assert.match(deltaCell(0), /muted/);
  assert.doesNotMatch(deltaCell('<x>'), /<x>/);
});

test('COURSE_QUIZ is frozen next to eight curriculum lessons and yields 31 static options', () => {
  assert.equal(CURRICULUM_LESSONS.length, 8);
  assert.equal(Object.keys(COURSE_QUIZ).length, 8);
  let optionCount = 0;
  CURRICULUM_LESSONS.forEach(lesson => {
    assert.ok(COURSE_QUIZ[lesson.id], lesson.id);
    Object.freeze(COURSE_QUIZ[lesson.id]);
    (COURSE_QUIZ[lesson.id].fields || []).forEach(field => {
      optionCount += (field.options || []).length;
    });
  });
  assert.equal(optionCount, 31);
  assert.equal(fs.existsSync(path.join(root, 'lib')), false);
  assert.ok(fs.existsSync(path.join(root, 'ui.js')));
});

test('quizMarkup generates options from COURSE_QUIZ — index.html has no hard-coded 45', () => {
  assert.doesNotMatch(html, /<option value="45"/);
  assert.match(html, /src="ui\.js"/);
  assert.match(html, /ScoutAIUi\.quizMarkup/);
  assert.doesNotMatch(html, /function courseQuizHtml\([\s\S]*?<option value="pressures"/);
  const lesson = CURRICULUM_LESSONS.find(item => item.id === 'events');
  const markup = quizMarkup(lesson, {}, COURSE_QUIZ);
  assert.match(markup, /<option value="dribbles"/);
  assert.match(markup, /<option value="pressures"/);
  assert.equal(quizMarkedCorrect('events', 'unusedField')[0], 'dribbles');
});

test('for each of eight lessons marked-correct option passes and every other option fails', () => {
  const fixture = passingFixture();
  const allPass = evaluateCurriculum(fixture.ctx);
  assert.ok(allPass.every(item => item.passed), allPass.filter(i => !i.passed).map(i => i.id).join(','));

  CURRICULUM_LESSONS.forEach(lesson => {
    const entry = COURSE_QUIZ[lesson.id];
    assert.ok(entry, lesson.id);
    const fields = entry.fields || [];
    if (!fields.length) {
      // defenders: no <option> quiz — live exercise must stay green on the fixture
      const markup = quizMarkup(lesson, fixture.ctx, COURSE_QUIZ);
      assert.doesNotMatch(markup, /<option /);
      assert.equal(allPass.find(item => item.id === lesson.id).passed, true);
      const failed = evaluateCurriculum(Object.assign({}, fixture.ctx, {
        answers: Object.assign({}, fixture.answers, { roseComponent: 'clutch', costGroup: 'GK' })
      }));
      assert.equal(failed.find(item => item.id === lesson.id).passed, false);
      return;
    }
    fields.forEach(field => {
      if (field.kind === 'number') {
        const correct = contextualCorrect(field.key, fixture);
        const ok = evaluateCurriculum(Object.assign({}, fixture.ctx, {
          answers: Object.assign({}, fixture.answers, { [field.key]: correct })
        }));
        assert.equal(ok.find(item => item.id === lesson.id).passed, true, lesson.id + ' number correct');
        const bad = evaluateCurriculum(Object.assign({}, fixture.ctx, {
          answers: Object.assign({}, fixture.answers, { [field.key]: '45' })
        }));
        assert.equal(bad.find(item => item.id === lesson.id).passed, false, lesson.id + ' number wrong');
        return;
      }
      const options = (field.options || []).filter(opt => opt.value !== '');
      const marked = options.filter(opt => opt.correct === true).map(opt => opt.value);
      const correctValue = marked.length
        ? marked[0]
        : contextualCorrect(field.key, fixture);
      assert.ok(correctValue, lesson.id + '.' + field.key);
      options.forEach(opt => {
        // For dynamicCaps, include live keys as tryable values.
        const result = evaluateCurriculum(Object.assign({}, fixture.ctx, {
          answers: Object.assign({}, fixture.answers, { [field.key]: opt.value })
        }));
        const lessonResult = result.find(item => item.id === lesson.id);
        const expectPass = opt.value === correctValue ||
          (marked.length > 0 && marked.includes(opt.value) && opt.value === correctValue);
        if (opt.value === correctValue) {
          assert.equal(lessonResult.passed, true,
            lesson.id + ' ' + field.key + '=' + opt.value + ' should pass');
        } else {
          assert.equal(lessonResult.passed, false,
            lesson.id + ' ' + field.key + '=' + opt.value + ' should fail');
        }
      });
      if (field.dynamicCaps) {
        const liveKeys = (fixture.view.explorer.capped || []).map(row => row.key);
        liveKeys.forEach(key => {
          const result = evaluateCurriculum(Object.assign({}, fixture.ctx, {
            answers: Object.assign({}, fixture.answers, { [field.key]: key })
          }));
          const lessonResult = result.find(item => item.id === lesson.id);
          assert.equal(lessonResult.passed, key === correctValue,
            'caps live key ' + key);
        });
      }
    });
  });
});

test('quizControlMap covers every COURSE_QUIZ control id and matchesMarkedQuiz tracks static keys', () => {
  const map = quizControlMap(COURSE_QUIZ);
  assert.equal(map.ansUnusedField, 'unusedField');
  assert.equal(map.ansCommercial, 'commercial');
  assert.equal(matchesMarkedQuiz('honesty', 'commercial', 'no'), true);
  assert.equal(matchesMarkedQuiz('honesty', 'commercial', 'yes'), false);
  assert.equal(matchesMarkedQuiz('weights', 'weightsManual', 'yes'), true);
});
