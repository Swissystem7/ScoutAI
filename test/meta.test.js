'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PAGES = ['index.html', 'offer.html', 'licence.html', 'trap/index.html'];

function description(page) {
  const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const found = head.match(/<meta name="description" content="([^"]*)">/g) || [];
  return found.map((tag) => tag.match(/content="([^"]*)"/)[1]);
}

test('every page has exactly one meta description in its head', () => {
  for (const page of PAGES) {
    assert.equal(description(page).length, 1, `${page} needs one meta description`);
  }
});

test('meta descriptions are distinct and short enough for a search snippet', () => {
  const texts = PAGES.map((page) => description(page)[0]);
  assert.equal(new Set(texts).size, PAGES.length, 'two pages share a description');
  texts.forEach((text, i) => {
    assert.ok(text.length >= 50 && text.length <= 160, `${PAGES[i]}: ${text.length} chars`);
  });
});
