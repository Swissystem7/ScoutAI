const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readIf(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

test('offer.html states workshop price 490', () => {
  const offer = read('offer.html');
  assert.match(offer, /490/);
});

test('licence.html or README mentions commercial exploit / Open Data boundary', () => {
  const blob = readIf('licence.html') + '\n' + read('README.md');
  assert.match(blob, /commercially exploit/i);
  assert.match(blob, /Open Data/);
});

test('offer.html has no fake registrant counts', () => {
  const offer = read('offer.html');
  assert.doesNotMatch(offer, /נרשמים\s*:\s*[1-9]\d*/);
  assert.doesNotMatch(offer, /[1-9]\d*\s*נרשמו/);
  assert.match(offer, /אין נרשמים|0 נרשמים|אין הרשמה/);
});

test('PORTFOLIO_ONE_LINER.md states teaching lab and forbids Open Data sales', () => {
  const md = read('docs/PORTFOLIO_ONE_LINER.md');
  assert.match(md, /teaching lab|מעבדת לימוד/i);
  assert.match(md, /not.*scouting SaaS|לא.*סקאוטינג/i);
  assert.match(md, /Open Data/);
  assert.match(md, /user-licensed|ברישיון המשתמש/i);
});
