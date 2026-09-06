const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('docs/NO_AI_BANNER.md exists and states NO_AI / no video analysis', () => {
  const p = path.join(ROOT, 'docs/NO_AI_BANNER.md');
  assert.ok(fs.existsSync(p), 'NO_AI_BANNER.md missing');
  const md = read('docs/NO_AI_BANNER.md');
  assert.match(md, /NO_AI/);
  assert.match(md, /no video|אין וידאו|video analysis/i);
  assert.match(md, /no model|אין מודל|not a trained model/i);
});

test('index.html and README stay consistent with NO_AI banner', () => {
  const index = read('index.html');
  const readme = read('README.md');
  assert.match(index, /NO_AI/);
  assert.match(index, /אין וידאו|אין מודל/);
  assert.match(readme, /NO_AI/);
  const doc = read('docs/NO_AI_BANNER.md');
  assert.match(doc, /index\.html|banner/i);
});
