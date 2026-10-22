'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const base = 'https://scoutai.test/';
const PAGES = {
  'index.html': base,
  'offer.html': base + 'offer.html',
  'licence.html': base + 'licence.html',
  'trap/index.html': base + 'trap/',
};

// Resolve every href on a page to the site page it opens, so ../ and trap/ and index.html all compare equal.
function linkedPages(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const from = new URL(file, base);
  const seen = new Set();
  for (const match of html.matchAll(/href="([^"#]*)(?:#[^"]*)?"/g)) {
    if (!match[1]) continue;
    const url = new URL(match[1], from);
    if (url.origin !== new URL(base).origin) continue;
    seen.add(url.href.replace(/index\.html$/, ''));
  }
  return seen;
}

for (const [file, self] of Object.entries(PAGES)) {
  test(`${file} links to every other page of the site`, () => {
    const seen = linkedPages(file);
    const missing = Object.entries(PAGES)
      .filter(([, url]) => url !== self && !seen.has(url))
      .map(([other]) => other);
    assert.deepEqual(missing, [], `${file} has no link to ${missing.join(', ')}`);
  });
}

test('offer.html exposes accessible section landmarks, table of contents, and skip links', () => {
  const html = fs.readFileSync(path.join(root, 'offer.html'), 'utf8');
  assert.match(html, /<a class="skip" href="#offer">דלגו להצעה<\/a>/);
  assert.match(html, /<a class="skip" href="#scope">דלגו למה נמכר<\/a>/);
  assert.match(html, /<a class="skip" href="#pricing">דלגו למחיר המוצע<\/a>/);
  assert.match(html, /<a class="skip" href="#deliverables">דלגו למה מקבלים<\/a>/);
  assert.match(html, /<a class="skip" href="#contact">דלגו לאיך פונים<\/a>/);
  assert.match(html, /<nav class="toc" aria-label="מעבר לחלקי ההצעה">/);
  assert.match(html, /<a href="#offer">הסדנה<\/a>/);
  assert.match(html, /<a href="#scope">מה נמכר<\/a>/);
  assert.match(html, /<a href="#pricing">מחיר מוצע<\/a>/);
  assert.match(html, /<a href="#deliverables">מה מקבלים<\/a>/);
  assert.match(html, /<a href="#contact">איך פונים<\/a>/);
  assert.match(html, /<a href="#disclosure">גילוי נאות<\/a>/);
  assert.match(html, /<section class="card" id="scope">/);
  assert.match(html, /<section class="card" id="pricing">/);
  assert.match(html, /<section class="card" id="deliverables">/);
  assert.match(html, /<section class="card" id="contact">/);
  assert.match(html, /<section class="card" id="disclosure">/);
  assert.match(html, /min-height:\s*44px/);
});
