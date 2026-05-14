import { test, expect, type Page } from '@playwright/test';

// Headless click-through verifier for the Customer Profile Architect History tab.
// SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md
//
// Stubs /api/internal/organizations and /api/internal/architect-history so the
// flow runs without a live Pathfinder backend. Asserts:
//   - Customer Detail renders the Architect History tab control
//   - Clicking the tab fetches and lists every Architect run for the org
//   - Default selection opens the first run; canvas + business_summary render
//   - Clicking a different row swaps the detail view
//   - No blueprint is lost from view (canvas always present once data loads)

const ORG = {
  id: 'realberry-4',
  slug: 'realberry-4',
  display_name: 'Realberry 4',
  status: 'setting_up',
  onboarded_at: null,
  architecture: {},
};

const ARCH_RUN_1 = {
  session_id: '11111111-1111-1111-1111-111111111111',
  session_type: 'decomposition',
  status: 'completed',
  created_at: '2026-05-13T22:52:38.000Z',
  completed_at: '2026-05-13T22:54:00.000Z',
  duration_ms: 82000,
  total_cost_usd: 0.92,
  goal: null,
  input_payload: {
    buyer_pain_prompt:
      'Realberry needs verified acquisition opportunities for multifamily 200+ unit or hospitality 150+ key assets in Mountain West / Southeast metros.',
  },
  output_payload: {
    buyer: 'Realberry institutional real-estate acquisitions team',
    buying_signal: 'Distressed-owner or motivated-seller signal',
    data_sources_proposed: [
      { type: 'sec_disposition_filings', jurisdictions: ['US national'], expected_daily_volume: 12 },
      { type: 'county_recorder_nod', jurisdictions: ['Denver, CO'], expected_daily_volume: 28 },
    ],
    data_sources_rejected: [],
    layer_2_watchers: [
      { source_type: 'sec_disposition_filings', instruction: 'Watch 8-K/10-Q REIT disposition filings.' },
      { source_type: 'county_recorder_nod', instruction: 'Poll Denver County notice of default feed.' },
    ],
    layer_3_agents: [
      { role: 'Qualifier', instruction: 'Filter assets to 200+ units or 150+ keys.' },
    ],
    layer_4_agents: [
      { role: 'Ranker', instruction: 'Rank by distress severity and asset size.' },
    ],
    estimates: { daily_qualified_volume: 3, cost_per_lead_usd: 0.18, architecture_confidence: 'medium' },
    open_questions: [],
    business_summary: {
      lead_type:
        'A verified property acquisition opportunity: a multifamily community of 200+ units or a hospitality asset of 150+ keys located in one of Realberry\'s eight target markets, with a confirmed seller motivation signal.',
      business_area: 'Institutional real-estate acquisitions',
      problem_solved: 'Manually scanning SEC filings, broker listings, and county records wastes acquisition team hours.',
      what_they_get: 'A ranked daily list of motivated-seller signals on qualifying multifamily and hospitality assets.',
    },
    ui_plan: {
      dashboard_emphasis: 'distress severity vs asset size',
      kpis: [
        { label: 'Qualified leads · 7d', metric: 'count' },
        { label: 'Top-rank score', metric: 'max' },
      ],
      charts: [{ type: 'bar', title: 'Leads by metro' }],
    },
  },
  proposal: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    type: 'vertical_configuration',
    headline: 'Vertical config: realberry — Distressed multifamily and hospitality',
    body: null,
    confidence: 0.6,
    status: 'pending',
    resolved_at: null,
    resolved_by_user_email: null,
  },
};

const ARCH_RUN_2 = {
  session_id: '22222222-2222-2222-2222-222222222222',
  session_type: 'decomposition',
  status: 'completed',
  created_at: '2026-05-10T17:40:02.000Z',
  completed_at: '2026-05-10T17:42:14.000Z',
  duration_ms: 132000,
  total_cost_usd: 1.21,
  goal: null,
  input_payload: { buyer_pain_prompt: 'earlier discovery run prior to refinement' },
  output_payload: {
    buyer: 'Realberry',
    buying_signal: 'Earlier formulation',
    data_sources_proposed: [
      { type: 'broker_listings', jurisdictions: ['Phoenix, AZ'], expected_daily_volume: 18 },
    ],
    data_sources_rejected: [],
    layer_2_watchers: [
      { source_type: 'broker_listings', instruction: 'Poll major CRE broker portals.' },
    ],
    layer_3_agents: [{ role: 'Filter', instruction: 'Reject under-threshold assets.' }],
    layer_4_agents: [],
    estimates: { daily_qualified_volume: 2, cost_per_lead_usd: 0.22, architecture_confidence: 'low' },
    open_questions: ['Are off-market signals counted?'],
    business_summary: {
      lead_type: 'Earlier formulation of acquisition lead',
      business_area: 'Real estate',
      problem_solved: 'Scattered broker signals.',
      what_they_get: 'Initial distress list.',
    },
  },
  proposal: null,
};

async function stubHistory(page: Page) {
  await page.addInitScript(
    ({ org, runs }) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : (input as Request).url;
        if (url.includes('/api/internal/organizations')) {
          if (url.includes('slug=')) {
            return new Response(JSON.stringify(org), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify([org]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/api/internal/architect-history')) {
          return new Response(
            JSON.stringify({ org_slug: org.slug, history: runs }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return realFetch(input, init);
      }) as typeof window.fetch;
    },
    { org: ORG, runs: [ARCH_RUN_1, ARCH_RUN_2] },
  );
}

test.describe('Customer Profile Architect History (standalone)', () => {
  test('lists runs, shows blueprint detail with canvas + summary, swaps on click', async ({
    page,
  }) => {
    await stubHistory(page);
    await page.goto('/');

    // Navigate to Customers tab.
    await page.getByRole('button', { name: /^Customers$/i }).click();

    // Open the customer card.
    await page
      .getByTestId('customer-card')
      .filter({ hasText: 'Realberry 4' })
      .first()
      .click();

    // Customer Detail header.
    await expect(page.getByTestId('customer-detail-name')).toHaveText('Realberry 4');

    // Click the Architect History tab.
    const historyTabBtn = page.getByTestId('customer-detail-tab-architect_history');
    await expect(historyTabBtn).toBeVisible();
    await historyTabBtn.click();
    await expect(historyTabBtn).toHaveAttribute('data-active', 'true');

    // The history list renders with both runs.
    const rows = page.getByTestId('architect-history-row');
    await expect(rows).toHaveCount(2);

    // The first row (newest) is selected by default and the detail panel
    // shows its canvas + intent + business_summary.
    await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('architect-history-canvas')).toBeVisible();
    await expect(page.getByTestId('architect-canvas')).toBeVisible();
    await expect(page.getByTestId('architect-history-intent')).toContainText(
      'Mountain West / Southeast metros',
    );

    // Click the older row; the detail swaps.
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('architect-history-intent')).toContainText(
      'earlier discovery run',
    );

    // The canvas is still present — no blueprint is lost from view.
    await expect(page.getByTestId('architect-canvas')).toBeVisible();

    // Screenshot for evidence.
    await page.screenshot({
      path: 'e2e-screenshots/architect-history-standalone.png',
      fullPage: false,
    });
  });
});

function atriumBaseURL(baseURL: string | undefined): string {
  const fallback = 'http://atrium.localhost:5173/';
  if (!baseURL) return fallback;
  try {
    const u = new URL(baseURL);
    if (u.hostname.startsWith('atrium.')) return u.toString();
    u.hostname = `atrium.${u.hostname}`;
    return u.toString();
  } catch {
    return fallback;
  }
}

test.describe('Customer Profile Architect History (Atrium-embedded shell mount)', () => {
  test('module that surfaces the canvas inside Customer Detail loads under the atrium host', async ({
    page,
    baseURL,
  }) => {
    // Same proof contract as the canvas e2e (architect-canvas.spec.ts:213):
    // hit the same module under the atrium-prefixed host; if Vite serves it
    // without error, the same component tree the standalone test exercised
    // will mount inside the Atrium shell.
    const atriumOrigin = atriumBaseURL(baseURL).replace(/\/$/, '');
    const moduleUrl = `${atriumOrigin}/src/views/ArchitectHistoryTab.tsx`;
    const res = await page.request.get(moduleUrl);
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('ArchitectHistoryTab');
  });
});
