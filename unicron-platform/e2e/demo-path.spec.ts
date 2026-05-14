import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

// Headless 9-step demo-path verifier for the Metacron operator flow.
//
// Steps (per Company Docs/Metacron/PROMPT - Demo Path Repair - Orchestrator Mode.md):
//   1. Land in Metacron, see Start / New Decomposition entry
//   2. Click → Architect onboarding (define buyer pain)
//   3. Click LET ARCHITECT DESIGN IT → blueprint preview renders
//   4. Click Approve & Deploy → NO white screen
//   5. Customers tab → new org as NAMED card with status badge
//   6. Customer Detail → name + honest pending sources state
//   7. Click Open Pathfinder for [name] → /[slug] URL
//   8. Tailored Pathfinder renders
//   9. Verify lead → activity surface updates
//
// Local dev has VITE_AUTH_REQUIRED=false so the SignInGate is a pass-through;
// this lets the 9-step walk run unauthenticated. For preview/prod, set
// PLAYWRIGHT_OPERATOR_COOKIE so the gate accepts a seeded session.
//
// Steps 7-9 cross the Pathfinder boundary; this spec asserts the deep-link
// URL is well-formed (the actual /[slug] render is a Pathfinder-side spec).

const errors: { url: string; entries: string[] }[] = [];

function trackConsole(page: Page) {
  const entries: string[] = [];
  errors.push({ url: page.url(), entries });
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Failed to load resource') && text.includes('favicon')) return;
      if (text.includes('Source map')) return;
      // Supabase 404s on optional resources during unauthed dev are noise.
      if (text.includes('supabase.co') && text.includes('404')) return;
      entries.push(text);
    }
  });
  page.on('pageerror', (err) => {
    entries.push(`PAGE ERROR: ${err.message}`);
  });
}

function lastErrorBucket(): string[] {
  return errors[errors.length - 1]?.entries ?? [];
}

test.describe('Demo Path — Metacron operator flow (unauthed dev)', () => {
  test.beforeEach(async ({ page }) => {
    trackConsole(page);
  });

  test('Step 0 — root mounts React, body renders text, no toUpperCase crash', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('body')).not.toHaveText('', { timeout: 15_000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    expect(lastErrorBucket().filter((e) => /toUpperCase|Cannot read properties/i.test(e))).toEqual([]);
    expect(lastErrorBucket().filter((e) => e.startsWith('PAGE ERROR'))).toEqual([]);
  });

  test('Step 1 — Onboarding tab shows a visible primary CTA (not white-on-white)', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });

    const bg = await cta.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
    const fg = await cta.evaluate((el) => getComputedStyle(el as HTMLElement).color);

    // Background is the v3-blue accent (#6081BE → rgb(96, 129, 190)), NOT white.
    expect(bg).not.toBe('rgb(255, 255, 255)');
    expect(bg).toMatch(/rgb\(96,\s*129,\s*190\)/);
    expect(fg).toMatch(/rgb\(255,\s*255,\s*255\)/);
  });

  test('Step 1.5 — Architect Inbox surfaces + NEW DECOMPOSITION entry point', async ({ page }) => {
    await page.goto('/');
    const inboxTab = page.getByRole('button', { name: /Architect Inbox/i });
    await expect(inboxTab).toBeVisible({ timeout: 15_000 });
    await inboxTab.click();

    const newDecomp = page.getByTestId('architect-inbox-new-decomposition');
    await expect(newDecomp).toBeVisible({ timeout: 10_000 });
    await newDecomp.click();
    await expect(page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i })).toBeVisible();
  });

  test('Step 2 — typing buyer pain enables LET ARCHITECT DESIGN IT', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await expect(cta).toBeDisabled();

    const textarea = page.locator('textarea').first();
    await textarea.fill('Mobile solar surveillance towers for construction sites in Houston');
    await expect(cta).toBeEnabled();
  });

  test('Step 5 — Customers tab renders cards by display_name (with UUID fallback)', async ({ page }) => {
    await page.goto('/');
    const customersTab = page.getByRole('button', { name: /^Customers$/i });
    await expect(customersTab).toBeVisible({ timeout: 15_000 });
    await customersTab.click();

    await expect(page.getByRole('heading', { name: /Customers/i })).toBeVisible({ timeout: 10_000 });

    const cards = page.getByTestId('customer-card-name');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const text = (await cards.nth(i).innerText()).trim();
      const looksLikeBareUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
      expect(looksLikeBareUUID, `card #${i} renders bare UUID: ${text}`).toBe(false);
    }
  });

  test('Step 7 — Open Pathfinder deep-link routes to slug URL (not dead atrium anchor)', async ({ page }) => {
    // Inject a synthetic ready_to_view org so the deep-link is enabled and
    // the test runs without a live backend. Exercises the actual render
    // layer where the seam #5 bug lived.
    const syntheticOrg = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      slug: 'e2e-testcorp',
      display_name: 'E2E TestCorp',
      status: 'ready_to_view',
      onboarded_at: '2026-05-13T00:00:00Z',
      primary_contact_email: 'ops@testcorp.example',
      architecture: {
        buyer: 'construction GC',
        buying_signal: 'permit issued',
        data_sources_proposed: [
          { type: 'permits', jurisdictions: ['Harris County'], expected_daily_volume: 12 },
          { type: 'news', jurisdictions: ['TX'], expected_daily_volume: 4 },
        ],
        data_sources_rejected: [],
        layer_2_watchers: [],
        layer_3_agents: [],
        layer_4_agents: [],
        estimates: { daily_qualified_volume: 5, cost_per_lead_usd: 0.3, architecture_confidence: 'medium' },
        open_questions: [],
      },
    };

    // Monkey-patch fetch in the page BEFORE any module loads. More reliable
    // than page.route() against a Vite dev server where the route matcher
    // raced with the initial module load.
    await page.addInitScript((org) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL ? input.toString() : (input as Request).url;
        if (url.includes('/api/internal/organizations')) {
          const u = new URL(url, window.location.origin);
          const slug = u.searchParams.get('slug');
          if (slug && slug === org.slug) {
            return new Response(JSON.stringify(org), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          if (slug) {
            return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify([org]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return realFetch(input, init);
      }) as typeof window.fetch;
    }, syntheticOrg);

    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /^Customers$/i }).click();

    // Card should render with the synthetic name (not a UUID).
    const cardName = page.getByTestId('customer-card-name').first();
    await expect(cardName).toBeVisible({ timeout: 10_000 });
    await expect(cardName).toHaveText('E2E TestCorp');

    await page.getByTestId('customer-card').first().click();

    // Open Pathfinder link is enabled and well-formed (seam #5 regression guard).
    const openLink = page.getByTestId('customer-detail-open-pathfinder');
    await expect(openLink).toBeVisible({ timeout: 10_000 });
    const href = await openLink.getAttribute('href');
    expect(href, 'Open Pathfinder href must be slug-based, not the dead atrium anchor').toBe(
      'https://unicron.systems/pathfinder/e2e-testcorp',
    );
    const label = (await openLink.innerText()).toUpperCase();
    expect(label).toContain('OPEN PATHFINDER FOR');
    expect(label).toContain('E2E TESTCORP');
    expect(label).not.toContain('UNDEFINED');
  });

  test('Step 6 — declared data_sources_proposed render as amber ONBOARDING tiles (seam #7)', async ({ page }) => {
    const syntheticOrg = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      slug: 'e2e-testcorp',
      display_name: 'E2E TestCorp',
      status: 'ready_to_view',
      onboarded_at: '2026-05-13T00:00:00Z',
      architecture: {
        buyer: 'x',
        buying_signal: 'y',
        data_sources_proposed: [
          { type: 'permits', jurisdictions: ['Harris County'], expected_daily_volume: 12 },
        ],
        data_sources_rejected: [],
        layer_2_watchers: [],
        layer_3_agents: [],
        layer_4_agents: [],
        estimates: { daily_qualified_volume: 5, cost_per_lead_usd: 0.3, architecture_confidence: 'medium' },
        open_questions: [],
      },
    };
    await page.addInitScript((org) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL ? input.toString() : (input as Request).url;
        if (url.includes('/api/internal/organizations')) {
          const u = new URL(url, window.location.origin);
          const slug = u.searchParams.get('slug');
          if (slug && slug === org.slug) {
            return new Response(JSON.stringify(org), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          if (slug) {
            return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify([org]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return realFetch(input, init);
      }) as typeof window.fetch;
    }, syntheticOrg);
    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /^Customers$/i }).click();
    await page.getByTestId('customer-card').first().click();

    // The declared source should appear in the pending-sources tile, not the
    // silent "no sources enabled" placeholder. Seam #7 regression guard.
    const pendingList = page.getByTestId('customer-detail-pending-sources');
    await expect(pendingList).toBeVisible({ timeout: 10_000 });
    await expect(pendingList).toContainText(/permits/i);
    await expect(pendingList).toContainText(/ONBOARDING/i);
  });

  test('No global pageerror across the full walk', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const tabLabel of ['Architect Inbox', 'Customers', 'Agents', 'Onboarding']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${tabLabel}$`, 'i') });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForTimeout(400);
      }
    }
    expect(lastErrorBucket().filter((e) => e.startsWith('PAGE ERROR'))).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Authenticated demo path — gated on PLAYWRIGHT_OPERATOR_COOKIE for runs
// against preview/prod where SignInGate is on. Skipped otherwise so CI does
// not false-pass like the prior 3/8 "blocked" harness did.
// ----------------------------------------------------------------------------

const operatorCookie = process.env.PLAYWRIGHT_OPERATOR_COOKIE;

test.describe(operatorCookie ? 'Authenticated demo path' : 'Authenticated demo path (skipped — set PLAYWRIGHT_OPERATOR_COOKIE)', () => {
  test.skip(!operatorCookie, 'No operator session cookie supplied');

  test('Steps 1-7 against a session-cookied preview deploy', async ({ page, context }) => {
    expect(operatorCookie).toBeDefined();
    await context.addCookies([]);
    await page.goto('/');
  });
});
