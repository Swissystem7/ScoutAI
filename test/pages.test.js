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
