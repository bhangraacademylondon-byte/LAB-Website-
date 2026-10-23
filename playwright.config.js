// End-to-end tests: real browser against a throwaway copy of the site.
// Run with: npm run test:e2e   (first time on a new computer: npx playwright install chromium)
const path = require('node:path');
const os = require('node:os');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT) || 3510;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Use an already-installed Chromium instead of Playwright's download, when given.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  // An in-memory database, so tests never touch real members or content.
  webServer: {
    command: 'node server/index.js',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      PGLITE_DIR: 'memory',
      DATA_DIR: path.join(os.tmpdir(), 'lab-e2e'),
      ADMIN_PASSWORD: 'e2e-admin-password',
      DATABASE_URL: '',
      SUPABASE_URL: '',
      RENDER: '',
    },
  },
});
