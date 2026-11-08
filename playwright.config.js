import { defineConfig } from '@playwright/test';

// E2E targets default to production. Override with E2E_*_URL to point the suite
// at a staging host while developing.
//
// Locally on macOS 13 the bundled Chromium is unavailable (Playwright requires
// macOS 14+), so run with E2E_BROWSER_CHANNEL=chrome to use the system Chrome.
// CI uses the bundled Chromium installed with `playwright install`.

const use = {
  headless: true,
  // Video needs a separate ffmpeg download; screenshots and traces cover
  // debugging without it.
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
};

if (process.env.E2E_BROWSER_CHANNEL) {
  use.channel = process.env.E2E_BROWSER_CHANNEL;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
