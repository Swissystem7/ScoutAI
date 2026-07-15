const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = '/home/runner/work/ScoutAI/ScoutAI';
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const fixtures = require(path.join(repoRoot, 'demo-fixtures.js'));

test('fixture generation is deterministic for same seed', () => {
  const a = fixtures.createDemoFixture('seed-123');
  const b = fixtures.createDemoFixture('seed-123');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('fixture metadata carries provenance classes', () => {
  const fixture = fixtures.createDemoFixture('abc');
  assert.equal(fixture.classifications.video, 'LOCAL_VIDEO');
  assert.equal(fixture.classifications.metric, 'DEMO_METRIC');
  assert.equal(fixture.classifications.service, 'VERIFIED_ANALYSIS_SERVICE: unavailable');
});

test('ui visibly labels local video and demo metrics', () => {
  assert.match(html, /LOCAL_VIDEO/);
  assert.match(html, /DEMO_METRIC/);
  assert.match(html, /VERIFIED_ANALYSIS_SERVICE/);
  const metricTagCount = (html.match(/DEMO_METRIC/g) || []).length;
  assert.ok(metricTagCount >= 10, `expected many DEMO_METRIC labels, got ${metricTagCount}`);
});

test('no network, api, beacon, oauth, payment, or form submission paths', () => {
  const forbiddenPatterns = [
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /sendBeacon\s*\(/,
    /navigator\.share\s*\(/,
    /<form\b/i,
    /\.submit\s*\(/
  ];
  forbiddenPatterns.forEach((pattern) => {
    assert.ok(!pattern.test(html), `forbidden pattern found: ${pattern}`);
  });
});

test('actions do not claim external success and explicitly state unavailability/local-only', () => {
  const forbiddenClaims = [
    'נשלח למייל המגייס',
    'נציג Academy יחזור אליך תוך 24 שעות',
    'ניסיון Club התחיל',
    'החשבון נוצר! ברוך הבא'
  ];
  forbiddenClaims.forEach((claim) => assert.ok(!html.includes(claim), `forbidden claim found: ${claim}`));

  const requiredNotices = [
    'PDF/Email חיצוני אינם זמינים בדמו מקומי',
    'פנייה למכירות לא זמינה בדמו מקומי',
    'נוצר פרופיל מקומי בלבד',
    'אין פתיחת ניסיון, אין מכירות, אין שליחת PDF/Email'
  ];
  requiredNotices.forEach((notice) => {
    const source = html.includes(notice) || readme.includes(notice);
    assert.ok(source, `missing required notice: ${notice}`);
  });
});

test('readme and runtime legal/privacy copy describe local-only behavior', () => {
  assert.match(readme, /דמו מקומי ודטרמיניסטי/);
  assert.match(readme, /אין backend, אין upload/);
  assert.match(html, /זהו דמו מקומי בלבד/);
  assert.match(html, /אין API, אין העלאה לענן, אין שליחת אימייל/);
  assert.match(html, /אין לראות בפלט הדמו המלצה רפואית, גיוסית, חוזית או מקצועית/);
});
