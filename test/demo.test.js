'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createDemoFixture } = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'demo.js'), 'utf8');

test('same seed yields byte-for-byte equivalent metadata', () => {
  const first = JSON.stringify(createDemoFixture('athlete-fixture-7'));
  const second = JSON.stringify(createDemoFixture('athlete-fixture-7'));
  assert.equal(first, second);
});

test('fixture declares provenance and never claims video analysis', () => {
  const fixture = createDemoFixture('provenance');
  assert.equal(fixture.video.provenance, 'LOCAL_VIDEO');
  assert.equal(fixture.video.analyzed, false);
  assert.equal(fixture.video.uploaded, false);
  assert.equal(fixture.service.provenance, 'VERIFIED_ANALYSIS_SERVICE');
  assert.equal(fixture.service.available, false);
  assert.ok(fixture.metrics.every(item => item.provenance === 'DEMO_METRIC' && item.measured === false));
  assert.ok(fixture.timeline.every(item => item.provenance === 'DEMO_METRIC'));
});

test('runtime contains no network or submission path', () => {
  const productRuntime = `${html}\n${runtime}`;
  const forbidden = [
    /\bfetch\s*\(/i, /XMLHttpRequest/i, /sendBeacon/i, /WebSocket/i,
    /<form\b/i, /type=["']submit/i, /mailto:/i, /https?:\/\//i
  ];
  forbidden.forEach(pattern => assert.doesNotMatch(productRuntime, pattern));
});

test('UI labels provenance and unavailable external actions', () => {
  for (const label of ['LOCAL_VIDEO', 'DEMO_METRIC', 'VERIFIED_ANALYSIS_SERVICE']) {
    assert.match(html, new RegExp(label, 'g'));
  }
  assert.match(html, /אינן זמינות/);
  assert.match(html, /דבר לא נשלח/);
  assert.match(html, /אינו מספק סקאוטינג מקצועי/);
});
