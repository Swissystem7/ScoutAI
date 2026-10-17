// Headless smoke check of the main page at a phone viewport (390px).
// Serves the repo from a local static server, so no network is needed.
// Fails on console errors, page errors, failed local requests, horizontal
// scroll, or a page that is not Hebrew RTL.
//
//   npm run smoke            (needs: npx playwright install chromium)
//   SMOKE_PAGES=index.html npm run smoke   (one page only)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = (process.env.SMOKE_PAGES || 'index.html,offer.html,licence.html').split(',').map((p) => p.trim()).filter(Boolean);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(normalize(ROOT + sep)) && file !== normalize(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const problems = [];
try {
  for (const name of PAGES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Off-host requests are blocked below on purpose; their load errors are expected.
      const from = msg.location().url || '';
      if (msg.text().startsWith('Failed to load resource') && from && !from.startsWith(base)) return;
      errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (r) => { if (r.url().startsWith(base)) errors.push(`requestfailed: ${r.url()}`); });
    page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    // Anything off-host is blocked, so the check never depends on the network.
    await page.route((url) => !url.href.startsWith(base), (route) => route.abort());

    await page.goto(base + name, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const check = async (where) => {
      const layout = await page.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        lang: document.documentElement.getAttribute('lang'),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        wide: [...document.body.querySelectorAll('*')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); })
          .filter((el) => !el.closest('[hidden]') && getComputedStyle(el).position !== 'fixed')
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(' ').join('.') : ''}`),
      }));
      if (layout.dir !== 'rtl') errors.push(`${where}: html dir is ${layout.dir}, expected rtl`);
      if (layout.lang !== 'he') errors.push(`${where}: html lang is ${layout.lang}, expected he`);
      if (layout.innerWidth !== 390) errors.push(`${where}: layout width is ${layout.innerWidth}, not 390 (content wider than the screen, or no viewport meta)`);
      if (layout.scrollWidth > layout.innerWidth) {
        errors.push(`${where}: horizontal scroll: scrollWidth ${layout.scrollWidth} > innerWidth ${layout.innerWidth} (${layout.wide.join(', ')})`);
      }
    };
    await check('on load');
    // Every tab panel gets the same layout check after it is opened.
    const tabs = await page.locator('[role="tab"]:visible').all();
    for (const tab of tabs) {
      const id = (await tab.getAttribute('data-tab')) || (await tab.getAttribute('id')) || 'tab';
      await tab.click();
      await page.waitForTimeout(150);
      await check(`tab ${id}`);
    }
    // The lab page must really load the local open-data file and draw the
    // player table, then survive switching to the synthetic BYOD example.
    if (await page.locator('#playerTable').count()) {
      const rows = async () => page.locator('#playerTable tr').count();
      await page.waitForFunction(() => document.querySelectorAll('#playerTable tr').length > 1, null, { timeout: 5000 }).catch(() => {});
      if ((await rows()) < 2) errors.push(`open data: player table has no rows (${await page.locator('#tableStatus').textContent()})`);
      await check('open data table');
      await page.locator('#loadSynthetic').click();
      await page.waitForFunction(() => /SYNTHETIC_EXAMPLE/.test(document.getElementById('byodStatus').textContent), null, { timeout: 5000 }).catch(() => {});
      const byod = await page.locator('#byodStatus').textContent();
      if (!/SYNTHETIC_EXAMPLE/.test(byod)) errors.push(`synthetic example did not load: ${byod}`);
      if ((await rows()) < 2) errors.push('synthetic example: player table has no rows');
      await check('synthetic example');
    }
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name} @390px`);
    for (const e of errors) console.log(`     ${e}`);
    problems.push(...errors);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exitCode = problems.length ? 1 : 0;
