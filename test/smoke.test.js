'use strict';

// Headless smoke test of the main page at a 390px phone viewport.
//
// It serves the repository over loopback (no CDN, no fonts, no analytics), opens index.html in headless
// Chromium and fails on a console error, an uncaught exception, a request that leaves 127.0.0.1, a page that
// scrolls sideways, a tap target below 24px or a formula that the RTL paragraph reorders.
//
// Playwright is deliberately NOT a dependency of this repository: `npm test` stays install-free and the test
// skips when the browser is missing. Run it with:
//
//   npm install --no-save playwright && npx playwright install chromium && npm run smoke
//
// Set SCOUTAI_SMOKE_REQUIRED=1 (CI does) to turn that skip into a failure.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const VIEWPORT = { width: 390, height: 844 };
const MIN_TAP = 24; // WCAG 2.2 "Target Size (Minimum)"; the page's own CSS already aims at 44px for buttons.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8'
};

function startServer() {
  const server = http.createServer(function (req, res) {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (path.relative(ROOT, file).startsWith('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, base: 'http://127.0.0.1:' + server.address().port + '/' });
    });
  });
}

// Why the browser cannot run here, or null when it can.
function browserBlocker() {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch (err) {
    return 'playwright is not installed (npm install --no-save playwright)';
  }
  let exe;
  try {
    exe = chromium.executablePath();
  } catch (err) {
    return 'playwright cannot resolve chromium: ' + err.message;
  }
  if (!fs.existsSync(exe)) return 'chromium is not downloaded (npx playwright install chromium)';
  return null;
}

const blocker = browserBlocker();
if (blocker && process.env.SCOUTAI_SMOKE_REQUIRED === '1') {
  throw new Error('SCOUTAI_SMOKE_REQUIRED=1 but the smoke test cannot run: ' + blocker);
}

test('main page at 390px: no console errors, no sideways scroll, no reordered formula', { skip: blocker || false }, async function (t) {
  const { chromium } = require('playwright');
  const { server, base } = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  t.after(async function () {
    await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  });

  const consoleErrors = [];
  const offsite = [];
  page.on('console', function (msg) {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', function (err) {
    consoleErrors.push('uncaught: ' + err.message);
  });
  page.on('request', function (req) {
    if (!req.url().startsWith(base)) offsite.push(req.url());
  });
  page.on('requestfailed', function (req) {
    consoleErrors.push('request failed: ' + req.url());
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#playerTable table tbody tr');
  await page.waitForSelector('#radarRoot svg');

  await t.test('the page renders its data layer without a console error', function () {
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(offsite, [], 'the product runtime must not call anything off 127.0.0.1');
  });

  await t.test('the document is Hebrew RTL and never scrolls sideways', async function () {
    const doc = await page.evaluate(function () {
      return {
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    });
    assert.equal(doc.dir, 'rtl');
    assert.equal(doc.lang, 'he');
    assert.equal(doc.clientWidth, VIEWPORT.width);
    assert.ok(doc.scrollWidth <= VIEWPORT.width, 'page scrolls sideways: scrollWidth ' + doc.scrollWidth);
  });

  await t.test('no visible box escapes the viewport outside a scroller', async function () {
    const escaped = await page.evaluate(function (width) {
      function inScroller(el) {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const overflowX = getComputedStyle(p).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true;
        }
        return false;
      }
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.skip')) continue; // parked off-screen until focused, by design
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (inScroller(el)) continue;
        if (box.right > width + 1 || box.left < -1) {
          out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
            ' [' + Math.round(box.left) + '…' + Math.round(box.right) + ']');
        }
      }
      return out;
    }, VIEWPORT.width);
    assert.deepEqual(escaped, []);
  });

  await t.test('every control is at least ' + MIN_TAP + 'px on both axes', async function () {
    const small = await page.evaluate(function (min) {
      // Links inside running prose are exempt from WCAG target size; navigation links and form controls are not.
      const selector = 'button, select, input, textarea, .toc a, .course-nav a, .lesson-nav a';
      const out = [];
      for (const el of document.querySelectorAll(selector)) {
        if (el.closest('.skip')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.width >= min && box.height >= min) continue;
        out.push((el.id ? '#' + el.id : el.tagName.toLowerCase()) +
          ' ' + Math.round(box.width) + '×' + Math.round(box.height));
      }
      return out;
    }, MIN_TAP);
    assert.deepEqual(small, []);
  });

  await t.test('the live formula keeps every weight next to its component', async function () {
    const order = await page.evaluate(function () {
      function left(root, needle) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const at = node.data.indexOf(needle);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          return range.getBoundingClientRect().left;
        }
        return null;
      }
      const el = document.querySelector('#formulaLine');
      const text = el.textContent;
      const weights = text.match(/(\d+)×([A-Za-z]+)/g) || [];
      return weights.map(function (pair) {
        const parts = pair.split('×');
        return { pair: pair, weight: left(el, parts[0] + '×'), name: left(el, parts[1]) };
      }).concat([{ text: text }]);
    });
    const text = order.pop().text;
    assert.match(text, /×Grit/, 'the lab did not render a formula: ' + JSON.stringify(text));
    for (const run of order) {
      assert.ok(run.weight != null && run.name != null, 'formula run not found on screen: ' + run.pair);
      // "40×Grit" is a left-to-right run: the number must stay left of the component it multiplies.
      assert.ok(run.weight < run.name,
        'RTL reordered "' + run.pair + '" in ' + JSON.stringify(text) +
        ' (weight at x=' + Math.round(run.weight) + ', name at x=' + Math.round(run.name) + ')');
    }
  });
});
