// Money tab smoke — Burn + Expenses sub-tab roll-up from Notion Accounts.
//
// Runs against the local Vite dev server (Atrium shell loads on atrium.localhost),
// routes /api/atrium/accounts to the snapshot of the live production response so
// the screenshots capture real Notion data without depending on the Vercel
// preview hostname (which doesn't match the atrium.* host rule).

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const ATRIUM_BASE = 'http://atrium.localhost:5173';
const SUPABASE_PROJECT_REF = 'anfihcusvekpovcchpoh';
const ACCOUNTS_JSON = JSON.parse(fs.readFileSync('/tmp/accounts_live.json', 'utf-8'));

test('Money: Burn + Expenses roll up from /api/atrium/accounts (paid+active)', async ({ context, page }) => {
  await context.addInitScript(({ ref }) => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: 'eyJ.fake.token',
      refresh_token: 'fake-refresh-token',
      expires_at: now + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-0000-0000-0000000000a1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'kyle@unicron.systems',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
      },
    };
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  }, { ref: SUPABASE_PROJECT_REF });

  await context.route('**/api/atrium/accounts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ACCOUNTS_JSON),
    });
  });

  await page.goto(`${ATRIUM_BASE}/money`);
  // Atrium shell renders Now by default; click the Money rail item.
  await page.locator('text=ATRIUM').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^\s*Money\s*$/ }).click().catch(async () => {
    await page.locator('[aria-label="Money"], button:has-text("Money")').first().click();
  });
  await expect(page.getByRole('heading', { name: /^Money$/ })).toBeVisible();

  // Burn metric card
  const burnCard = page.locator('text=Burn (30d, services)').locator('..');
  await expect(burnCard).toContainText('$169');
  await expect(burnCard).toContainText('10 connected services');

  await page.screenshot({ path: '/tmp/money-burn-card.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 360 } });

  // Switch to Expenses sub-tab
  await page.getByRole('tab', { name: 'Expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

  // Total row equals Burn
  const totalRow = page.locator('tr', { hasText: 'Total (monthly equivalent)' });
  await expect(totalRow).toContainText('$169.00');
  await expect(totalRow).toContainText('= Burn (30d, services)');

  // Top-of-list row should be Claude API ($50) since sorted desc
  const firstDataRow = page.locator('tbody tr').first();
  await expect(firstDataRow).toContainText('Claude API');
  await expect(firstDataRow).toContainText('$50.00');

  // All 10 paid+active rows present
  const dataRows = page.locator('tbody tr');
  // 10 data rows + 1 total row = 11
  await expect(dataRows).toHaveCount(11);

  await page.screenshot({ path: '/tmp/money-expenses-tab.png', fullPage: true });
});
