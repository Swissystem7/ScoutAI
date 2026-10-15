'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
// Pages whose inline scripts look elements up by id. The suite has no DOM, so a renamed id
// would only surface in the browser as "Cannot read properties of null".
const PAGES = ['index.html', path.join('trap', 'index.html')];

function read(page) {
  return fs.readFileSync(path.join(root, page), 'utf8');
}

// Every id="..." in the file, including ids written by template strings inside <script>.
function ids(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

// Literal lookups only: getElementById('x') / ("x"). Computed ids ('field-' + f) are skipped.
function lookups(html) {
  return [...new Set([...html.matchAll(/getElementById\((['"])([A-Za-z0-9_-]+)\1\)/g)].map((m) => m[2]))];
}

test('every literal getElementById on a page names an id that page defines', () => {
  const missing = [];
  for (const page of PAGES) {
    const html = read(page);
    const defined = new Set(ids(html));
    for (const id of lookups(html)) if (!defined.has(id)) missing.push(`${page}: #${id}`);
  }
  assert.deepEqual(missing, []);
});

test('the lookup scan finds the lab and trap controls (guards against a regex that matches nothing)', () => {
  assert.ok(lookups(read('index.html')).includes('byodStatus'));
  assert.ok(lookups(read(path.join('trap', 'index.html'))).includes('featureName'));
});

test('no static id is defined twice on a page', () => {
  const dupes = [];
  for (const page of [...PAGES, 'offer.html', 'licence.html']) {
    const seen = new Set();
    for (const id of ids(read(page))) {
      if (id.includes('${')) continue;
      if (seen.has(id)) dupes.push(`${page}: #${id}`);
      seen.add(id);
    }
  }
  assert.deepEqual(dupes, []);
});
