const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('docs/WORKSHOP_OUTLINE.md exists and mentions 490 or workshop', () => {
  const p = path.join(ROOT, 'docs/WORKSHOP_OUTLINE.md');
  assert.ok(fs.existsSync(p), 'WORKSHOP_OUTLINE.md missing');
  const md = read('docs/WORKSHOP_OUTLINE.md');
  assert.match(md, /490|workshop/i);
});

test('WORKSHOP_OUTLINE.md is 3h agenda on user-licensed data / no Open Data sales', () => {
  const md = read('docs/WORKSHOP_OUTLINE.md');
  assert.match(md, /3[- ]hour|3h|0:00/i);
  assert.match(md, /user-licensed|BYOD/i);
  assert.match(md, /Open Data/);
  assert.match(md, /no Open Data sales|No Open Data sales|cannot be sold|forbids commercially/i);
});
