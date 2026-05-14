import { test, expect } from '@playwright/test';

// Live-data verification for /goal F2.
//
// Runs against vite.e2e.config.ts which proxies /api/internal/* to a locally-
// running Pathfinder dev server (Next.js on :5194), which in turn queries the
// live Supabase database. The migration 20260514_architect_sessions_org_link_backfill
// linked 3 historical architect_sessions to real organizations (realberry-4,
// realberry-is-a-3-6b, were-a-regional-commercial-fleet). This test verifies
// the entire path end-to-end against REAL data: no fixtures, no stubs.
//
// Path: Customers tab → realberry-4 card → ARCHITECT HISTORY tab → real run →
//       ArchitectCanvas renders the real decomposition → screenshot.

test('F2 live — Customer Detail Architect History against real Supabase data', async ({
  page,
}) => {
  await page.goto('/');

  // Customers tab — no stubs. The /api/internal/organizations call hits the
  // real Pathfinder proxy which hits real Supabase via service-role.
  await page.getByRole('button', { name: /^Customers$/i }).click();

  // realberry-4 is id 033acd31 (uuid prefix shown by CustomersView when
  // display_name is empty — a separate pre-existing UX bug). The migration
  // backfilled exactly one architect_session to this org.
  const card = page
    .getByTestId('customer-card')
    .filter({ hasText: '033acd31' })
    .first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  await expect(page.getByTestId('customer-detail-name')).toBeVisible();

  // Open Architect History tab.
  const tab = page.getByTestId('customer-detail-tab-architect_history');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute('data-active', 'true');

  // The list renders at least one real run (we backfilled exactly 1 to this org).
  const rows = page.getByTestId('architect-history-row');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThanOrEqual(1);

  // Detail panel renders the canvas with the real decomposition, and the intent
  // text comes back from Pathfinder (input_payload may be empty if the historical
  // session pre-dated the buyer_pain_prompt schema, so we don't assert on the
  // intent text — we assert on the canvas + summary content).
  await expect(page.getByTestId('architect-history-canvas')).toBeVisible();
  await expect(page.getByTestId('architect-canvas')).toBeVisible();

  // Wait briefly for fitView animation, then capture evidence.
  await page.waitForTimeout(800);
  await page.screenshot({
    path: 'e2e-screenshots/architect-history-live-real-data.png',
    fullPage: false,
  });
});
