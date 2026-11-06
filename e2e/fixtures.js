// Shared fixture for the E2E specs (CT-014).
// - Every request that is not to the local test server is aborted, so a test
//   can never depend on (or leak to) a third-party host. The app ships no
//   external requests today; the guard keeps it that way and the test fails
//   if one appears.
// - Uncaught page errors, console errors and 4xx/5xx responses fail the test.
'use strict';

const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const external = [];
    const errors = [];
    await page.route('**/*', function (route) {
      const url = route.request().url();
      if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      external.push(url);
      return route.abort();
    });
    page.on('pageerror', function (err) { errors.push(err.message); });
    page.on('console', function (msg) {
      // A failed resource is reported below with its URL instead.
      if (msg.type() === 'error' && !/^Failed to load resource/.test(msg.text())) errors.push(msg.text());
    });
    page.on('response', function (res) {
      // Browsers ask for /favicon.ico on their own; the site does not ship one.
      if (res.status() >= 400 && !/\/favicon\.ico$/.test(res.url())) errors.push(res.status() + ' ' + res.url());
    });
    await use(page);
    base.expect(external, 'no request may leave the local server').toEqual([]);
    base.expect(errors, 'no uncaught errors or console errors').toEqual([]);
  }
});

module.exports = { test, expect: base.expect };
