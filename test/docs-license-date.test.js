const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('docs/LICENSE_CHECK_DATE.md pins 2026-09-06 and §1.2.2', () => {
  const md = read('docs/LICENSE_CHECK_DATE.md');
  assert.match(md, /2026-09-06/);
  assert.match(md, /§\s*1\.2\.2|section\s*1\.2\.2|1\.2\.2/i);
  assert.match(md, /StatsBomb/i);
  assert.match(md, /commercially exploit/i);
});

test('licence.html still references 1.2.2', () => {
  const html = read('licence.html');
  assert.match(html, /1\.2\.2/);
  assert.match(html, /StatsBomb/i);
});
