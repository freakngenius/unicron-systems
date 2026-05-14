import { test, expect } from '@playwright/test';

// Atrium Money → Accounts headless click-through.
//
// Strategy:
//  1. Visit http://atrium.localhost:5173 — the App.tsx host router renders the
//     Atrium shell when hostname starts with "atrium.". macOS resolves
//     *.localhost natively (no /etc/hosts edits needed).
//  2. Seed a fake Supabase session in localStorage via page.addInitScript so
//     useAuth() resolves to 'signed-in' without needing a real magic link.
//     supabase-js v2 reads sessions from `sb-<project-ref>-auth-token`.
//  3. Mock /api/atrium/accounts to a deterministic payload — production calls
//     the real Notion API which requires the integration to be shared with the
//     Accounts DB; mocking removes that dependency for the smoke test.
//  4. Drive the Money rail tab → Accounts sub-tab and assert every SPEC
//     acceptance criterion: paid above free, sort desc, subtotal, deep-link,
//     status pills, category chips, credentials NEVER rendered.

const ATRIUM_BASE = 'http://atrium.localhost:5173';
const NOTION_VIEW_URL =
  'https://www.notion.so/futuroso/350785c67e728039b4eee158a72bf35c?v=350785c67e72801c9b90000cbc1186e7';

const SUPABASE_PROJECT_REF = 'anfihcusvekpovcchpoh';

const MOCK_ACCOUNTS = {
  notion_url: NOTION_VIEW_URL,
  paid: [
    {
      notion_page_id: 'a1', notion_url: 'https://www.notion.so/a1',
      service: 'Vercel', status: 'Active', category: ['Infrastructure'],
      subscription_usd: 240, account_type: 'Yearly',
      last_billed: '2026-04-01', start_date: '2025-01-01',
      notes: 'Pro plan',
    },
    {
      notion_page_id: 'a2', notion_url: 'https://www.notion.so/a2',
      service: 'OpenAI', status: 'Active', category: ['AI'],
      subscription_usd: 200, account_type: 'Monthly',
      last_billed: '2026-05-01', start_date: '2025-06-01',
      notes: null,
    },
    {
      notion_page_id: 'a3', notion_url: 'https://www.notion.so/a3',
      service: 'Anthropic', status: 'Paused', category: ['AI'],
      subscription_usd: 50, account_type: 'Monthly',
      last_billed: '2026-05-08', start_date: '2025-09-01',
      notes: null,
    },
  ],
  free: [
    {
      notion_page_id: 'b1', notion_url: 'https://www.notion.so/b1',
      service: 'GitHub', status: 'Active', category: ['Infrastructure'],
      subscription_usd: null, account_type: 'Free',
      last_billed: null, start_date: '2024-01-01',
      notes: 'Free tier',
    },
  ],
  paid_total_usd: 490,
  paid_monthly_equivalent_usd: 270,
  fetched_at: '2026-05-13T20:00:00.000Z',
};

test.describe('Atrium Money → Accounts (headless click-through)', () => {
  test.beforeEach(async ({ context, page }) => {
    // Seed a fake Supabase session BEFORE any page script runs.
    // supabase-js v2 reads from localStorage key `sb-<ref>-auth-token`.
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
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          phone: '',
          confirmed_at: '2026-01-01T00:00:00.000Z',
          last_sign_in_at: '2026-05-13T00:00:00.000Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { full_name: 'Kyle Kesterson' },
          identities: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      };
      window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    }, { ref: SUPABASE_PROJECT_REF });

    await context.route('**/api/atrium/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ACCOUNTS),
      });
    });
    // Real-Supabase calls will 401 because our seeded session is fake; mock
    // them so they don't pollute the console-error budget.
    await context.route('**/*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  });

  test('renders Paid + Free groups, sort desc, subtotal, deep-link, no credentials', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(`PAGE ERROR: ${e.message}`));

    await page.goto(`${ATRIUM_BASE}/`);

    // Money rail tab (button carries aria-label="Money")
    const moneyTab = page.getByRole('button', { name: 'Money', exact: true });
    await expect(moneyTab).toBeVisible({ timeout: 20_000 });
    await moneyTab.click();

    // Accounts sub-tab is the Money tab's default.
    const accountsHeading = page.getByRole('heading', { name: /^Accounts$/, level: 2 });
    await expect(accountsHeading).toBeVisible({ timeout: 15_000 });

    // Both group headings visible, paid above free
    const paidHeading = page.getByRole('heading', { name: /Paid accounts/i });
    const freeHeading = page.getByRole('heading', { name: /Free \/ Trial accounts/i });
    await expect(paidHeading).toBeVisible();
    await expect(freeHeading).toBeVisible();

    const paidBox = await paidHeading.boundingBox();
    const freeBox = await freeHeading.boundingBox();
    expect(paidBox && freeBox && paidBox.y < freeBox.y).toBeTruthy();

    // Subtotal (monthly equivalent = 240/12 + 200 + 50 = 270)
    await expect(page.getByText('$270').first()).toBeVisible();
    // Raw quoted total
    await expect(page.getByText('$490').first()).toBeVisible();

    // Sort desc within paid: Vercel (240) before OpenAI (200) before Anthropic (50)
    const services = page.locator('table tbody tr td:first-child');
    const order = await services.allInnerTexts();
    const vercelIdx = order.findIndex((s) => s.includes('Vercel'));
    const openaiIdx = order.findIndex((s) => s.includes('OpenAI'));
    const anthropicIdx = order.findIndex((s) => s.includes('Anthropic'));
    expect(vercelIdx).toBeGreaterThanOrEqual(0);
    expect(vercelIdx).toBeLessThan(openaiIdx);
    expect(openaiIdx).toBeLessThan(anthropicIdx);

    // Free row present
    await expect(page.getByText('GitHub')).toBeVisible();

    // Deep-link to the Accounts view
    const notionLink = page.getByRole('link', { name: /Open in Notion/i });
    await expect(notionLink).toBeVisible();
    expect(await notionLink.getAttribute('href')).toBe(NOTION_VIEW_URL);
    expect(await notionLink.getAttribute('target')).toBe('_blank');

    // Status pills — at least one Active pill rendered
    await expect(page.getByText('Active').first()).toBeVisible();
    // And a Paused pill (Anthropic)
    await expect(page.getByText('Paused').first()).toBeVisible();

    // Category chips
    await expect(page.getByText('Infrastructure').first()).toBeVisible();
    await expect(page.getByText('AI').first()).toBeVisible();

    // Column headers (the visible columns ONLY — never API/Email/PW/Username)
    for (const col of ['Service', 'Status', 'Category', 'Subscription', 'Account Type', 'Last Billed', 'Start Date', 'Notes']) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }

    // Credential column headers must NOT be present as table headers.
    // We allow the strings to appear elsewhere on the page (e.g. nav labels),
    // but the Accounts table specifically must not include them.
    const accountsTable = page.locator('table').first();
    const tableHtml = await accountsTable.innerHTML();
    expect(tableHtml).not.toContain('>PW<');
    expect(tableHtml).not.toContain('>Username<');
    // Email could be a legitimate substring elsewhere; check exact header form
    expect(tableHtml.match(/<th[^>]*>\s*Email\s*<\/th>/i)).toBeNull();
    expect(tableHtml.match(/<th[^>]*>\s*API\s*<\/th>/i)).toBeNull();

    // No console errors that matter (supabase 401s on fake session, favicon,
    // and 404s on unmocked auxiliary endpoints are expected in this hermetic
    // smoke).
    const real = consoleErrors.filter(
      (e) => !/favicon|Source map|supabase\.co|status of 401|status of 404|Failed to load resource/.test(e),
    );
    expect(real).toEqual([]);
  });
});
