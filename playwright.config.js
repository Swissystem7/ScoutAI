// Playwright E2E config (CT-014). Run with `npm run test:e2e`.
// Serves the repo with the zero-dependency tools/serve.js, so the browser sees
// exactly what `npm start` serves. `npm test` (node --test) does not load this.
'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT) || 4173;

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    locale: 'he-IL',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }
    }
  ],
  webServer: {
    command: 'node tools/serve.js',
    env: { PORT: String(PORT) },
    url: 'http://127.0.0.1:' + PORT + '/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
