'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('npm test discovers every test file instead of listing them (no silent skips, no merge conflict with #22)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.ok(!/npm test` מריץ `node --test test\//.test(readme), 'README still lists test files by name');
});
