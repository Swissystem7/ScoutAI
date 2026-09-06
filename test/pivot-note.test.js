const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('docs/PIVOT_NOTE.md exists: workshop not ranking sales', () => {
  const p = path.join(ROOT, 'docs/PIVOT_NOTE.md');
  assert.ok(fs.existsSync(p), 'PIVOT_NOTE.md missing');
  const md = read('docs/PIVOT_NOTE.md');
  assert.match(md, /workshop/i);
  assert.match(md, /ranking/i);
  assert.match(md, /PIVOT|pivot/);
  assert.match(md, /not a ranking|ranking sales|REJECT|no ranking/i);
});

test('PIVOT_NOTE.md prefers workshop over Open Data ranking SKU', () => {
  const md = read('docs/PIVOT_NOTE.md');
  assert.match(md, /user-licensed|BYOD|workshop/i);
  assert.match(md, /Open Data/);
  assert.match(md, /REJECT|forbid|never/i);
});
