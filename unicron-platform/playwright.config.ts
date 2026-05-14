import { defineConfig, devices } from '@playwright/test';

// Headless demo-path verification. Target one of:
//   PLAYWRIGHT_BASE_URL=https://unicron.systems          (prod)
//   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app     (preview)
//   PLAYWRIGHT_BASE_URL=http://localhost:5173            (local dev)
// Falls back to localhost so `npx playwright test` works after `npm run dev`.

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: process.env.PLAYWRIGHT_BASIC_AUTH
      ? { authorization: `Basic ${Buffer.from(process.env.PLAYWRIGHT_BASIC_AUTH).toString('base64')}` }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer block — the caller starts vite (or hits a preview URL)
  // separately, which keeps the harness usable against prod/preview/local
  // without leaking ports.
});
