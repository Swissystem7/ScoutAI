'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const prSize = require('../tools/pr-size.js');

test('parseNumstat reads added, deleted and total changed lines per file', () => {
  const files = prSize.parseNumstat('12\t3\tdemo.js\n0\t40\ttest/old.test.js\n');
  assert.deepEqual(files, [
    { path: 'demo.js', added: 12, deleted: 3, changed: 15, binary: false },
    { path: 'test/old.test.js', added: 0, deleted: 40, changed: 40, binary: false }
  ]);
});

test('parseNumstat ignores blank lines, trailing CR and anything that is not a numstat row', () => {
  const files = prSize.parseNumstat('\r\n5\t5\tindex.html\r\nnot a numstat line\n\n');
  assert.deepEqual(files.map((f) => f.path), ['index.html']);
  assert.equal(prSize.totalChanged(files), 10);
});

test('parseNumstat counts a binary file as zero lines and flags it', () => {
  const [file] = prSize.parseNumstat('-\t-\tdata/logo.png\n');
  assert.deepEqual(file, { path: 'data/logo.png', added: 0, deleted: 0, changed: 0, binary: true });
});

test('parseNumstat names a rename after the change, in both git spellings', () => {
  const files = prSize.parseNumstat('1\t1\told.js => new.js\n2\t2\ttest/{a => b}/x.test.js\n');
  assert.deepEqual(files.map((f) => f.path), ['new.js', 'test/b/x.test.js']);
});

test('planSplit leaves a diff inside the budget alone', () => {
  const plan = prSize.planSplit(prSize.parseNumstat('100\t50\tdemo.js\n'), 400);
  assert.equal(plan.total, 150);
  assert.equal(plan.withinBudget, true);
  assert.equal(plan.splittable, true);
  assert.equal(plan.groups.length, 1);
});

test('planSplit packs an over-budget diff into groups that each fit the budget', () => {
  // 1028 changed lines, the size that made PR #104 unmergeable under the 400-line budget.
  const plan = prSize.planSplit(prSize.parseNumstat([
    '300\t20\tdemo.js',
    '180\t10\tindex.html',
    '150\t8\ttrap.js',
    '200\t0\ttest/a.test.js',
    '150\t10\ttest/b.test.js',
    ''
  ].join('\n')), 400);

  assert.equal(plan.total, 1028);
  assert.equal(plan.withinBudget, false);
  assert.equal(plan.splittable, true);
  assert.equal(plan.groups.length, 3);
  for (const group of plan.groups) assert.ok(group.changed <= 400, group.changed + ' > 400');
  assert.equal(plan.groups.reduce((sum, g) => sum + g.changed, 0), 1028);

  // Every file lands in exactly one group.
  const placed = plan.groups.flatMap((g) => g.files.map((f) => f.path)).sort();
  assert.deepEqual(placed, ['demo.js', 'index.html', 'test/a.test.js', 'test/b.test.js', 'trap.js']);
});

test('planSplit is deterministic: the same diff always yields the same plan', () => {
  const numstat = '90\t0\tc.js\n90\t0\ta.js\n90\t0\tb.js\n90\t0\td.js\n';
  const first = prSize.planSplit(prSize.parseNumstat(numstat), 200);
  const second = prSize.planSplit(prSize.parseNumstat(numstat), 200);
  assert.deepEqual(second, first);
  assert.deepEqual(first.groups.map((g) => g.files.map((f) => f.path)), [['a.js', 'b.js'], ['c.js', 'd.js']]);
});

test('planSplit reports a single file larger than the budget instead of hiding it in a group', () => {
  const plan = prSize.planSplit(prSize.parseNumstat('600\t50\tdemo.js\n30\t0\ttest/a.test.js\n'), 400);
  assert.equal(plan.splittable, false);
  assert.deepEqual(plan.oversize.map((f) => f.path), ['demo.js']);
  assert.deepEqual(plan.groups.map((g) => g.files.map((f) => f.path)), [['test/a.test.js']]);
  for (const group of plan.groups) assert.ok(group.changed <= 400);
});

test('planSplit falls back to the 400-line budget when given a nonsense one', () => {
  for (const bad of [undefined, null, 0, -5, NaN, 'abc']) {
    assert.equal(prSize.planSplit([], bad).budget, 400, 'budget ' + String(bad));
  }
  assert.equal(prSize.planSplit([], '250').budget, 250);
});

test('formatPlan says it is fine when the diff fits, and names each proposed PR when it does not', () => {
  const ok = prSize.formatPlan(prSize.planSplit(prSize.parseNumstat('10\t0\tdemo.js\n'), 400));
  assert.match(ok, /10/);
  assert.doesNotMatch(ok, /PR 1/);

  const over = prSize.formatPlan(prSize.planSplit(prSize.parseNumstat('300\t0\ta.js\n300\t0\tb.js\n'), 400));
  assert.match(over, /PR 1/);
  assert.match(over, /PR 2/);
  assert.match(over, /a\.js/);
  assert.match(over, /b\.js/);
});

test('formatPlan keeps the Hebrew count readable for one group, and for none at all', () => {
  const one = prSize.formatPlan(prSize.planSplit(prSize.parseNumstat('500\t0\ta.js\n90\t0\tb.js\n'), 400));
  assert.match(one, /PR אחד/);
  assert.doesNotMatch(one, /1 PR-ים/);
  assert.match(one, /דורש פיצול ידני/);

  // Nothing is packable: every file on its own already busts the budget.
  const none = prSize.formatPlan(prSize.planSplit(prSize.parseNumstat('500\t0\ta.js\n450\t0\tb.js\n'), 400));
  assert.match(none, /אין פיצול אוטומטי אפשרי/);
  assert.doesNotMatch(none, /0 PR-ים/);
  assert.match(none, /a\.js/);
  assert.match(none, /b\.js/);
});

test('parseArgs defaults to master and 400, and reads both flag spellings', () => {
  assert.deepEqual(prSize.parseArgs([]), { base: 'master', budget: 400, stdin: false, committed: false });
  assert.deepEqual(prSize.parseArgs(['--stdin', '--budget', '200']), {
    base: 'master',
    budget: 200,
    stdin: true,
    committed: false
  });
  assert.deepEqual(prSize.parseArgs(['--base=origin/master', '--budget=120', '--committed']), {
    base: 'origin/master',
    budget: 120,
    stdin: false,
    committed: true
  });
});

test('countLines counts a file git would call N lines, with or without a trailing newline', () => {
  assert.equal(prSize.countLines(''), 0);
  assert.equal(prSize.countLines('a\n'), 1);
  assert.equal(prSize.countLines('a'), 1);
  assert.equal(prSize.countLines('a\nb\nc\n'), 3);
  assert.equal(prSize.countLines('a\nb\nc'), 3);
});

test('numstatForNewFiles turns an untracked file into a numstat row parseNumstat can read back', () => {
  const text = prSize.numstatForNewFiles([
    { path: 'test/new.test.js', lines: 42, binary: false },
    { path: 'data/logo.png', lines: 0, binary: true }
  ]);
  assert.deepEqual(prSize.parseNumstat(text), [
    { path: 'test/new.test.js', added: 42, deleted: 0, changed: 42, binary: false },
    { path: 'data/logo.png', added: 0, deleted: 0, changed: 0, binary: true }
  ]);
});
