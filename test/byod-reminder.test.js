const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('docs/BYOD_REMINDER.md exists and rejects Open Data lookalikes', () => {
  const p = path.join(ROOT, 'docs/BYOD_REMINDER.md');
  assert.ok(fs.existsSync(p), 'BYOD_REMINDER.md missing');
  const md = read('docs/BYOD_REMINDER.md');
  assert.match(md, /Open Data lookalike|lookalikes/i);
  assert.match(md, /user-licensed|license (their|own) data|BYOD/i);
  assert.match(md, /reject/i);
});

test('BYOD_REMINDER.md states user must license own data', () => {
  const md = read('docs/BYOD_REMINDER.md');
  assert.match(md, /license|licensed/i);
  assert.match(md, /own data|user-licensed|BYOD/i);
  assert.match(md, /Open Data/);
});
