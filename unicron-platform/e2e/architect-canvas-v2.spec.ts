import { test, expect, type Page } from '@playwright/test';

// Headless verification of the SPEC v2 layout
// (Company Docs/Metacron/SPEC - Architect Canvas Flowchart.md →
//  "UI Layout v2"):
//
//   1. LEFT pane = 1/3 width = text. RIGHT pane = 2/3 width = canvas.
//   2. Both panes fixed full-height, edge-attached (no floating-card margins).
//   3. Node spacing — no overlap between side-by-side nodes in a layer.
//   4. "ARCHITECT · THINKING ..." loading label is GONE after completion.
//
// The standalone test exercises the full UX; the Atrium-embedded test
// confirms host-based routing flips and the same canvas module is served.

const ARCH_FIXTURE = {
  proposal_id: 'p',
  session_id: 's',
  status: 'completed' as const,
  cost_usd: 0.4,
  duration_ms: 1000,
  reasoning: ['line'],
  architecture: {
    buyer: 'GC distributors',
    buying_signal: 'permits',
    data_sources_proposed: [
      { type: 'permits', jurisdictions: ['Pittsburgh, PA'], expected_daily_volume: 110 },
      { type: 'sam_gov', jurisdictions: ['US national'], expected_daily_volume: 38 },
    ],
    data_sources_rejected: [],
    layer_2_watchers: [
      { source_type: 'permits', instruction: 'Poll.' },
      { source_type: 'sam_gov', instruction: 'Watch.' },
    ],
    layer_3_agents: [
      { role: 'Qualifier', instruction: 'Filter.' },
      { role: 'Enricher', instruction: 'Enrich.' },
    ],
    layer_4_agents: [{ role: 'Ranker', instruction: 'Score.' }],
    estimates: { daily_qualified_volume: 7, cost_per_lead_usd: 0.06, architecture_confidence: 'high' as const },
    open_questions: [],
    business_summary: {
      lead_type: 'GC projects',
      business_area: 'Construction security',
      problem_solved: 'Manual scraping',
      what_they_get: 'A ranked daily list',
    },
  },
};

async function stubArchitectFetch(page: Page) {
  await page.addInitScript((fixture) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('/api/architect/decompose')) {
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof window.fetch;
  }, ARCH_FIXTURE);
}

async function driveToCanvas(page: Page) {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 15_000 });
  await textarea.fill('Mobile solar surveillance towers for construction sites in Houston');
  await page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i }).click();
  await expect(page.getByTestId('architect-canvas')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('arch-node-dashboard')).toBeVisible({ timeout: 10_000 });
}

function atriumBaseURL(baseURL: string | undefined): string {
  const fallback = 'http://atrium.localhost:5174/';
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

test.describe('Architect Canvas v2 — standalone Metacron', () => {
  test('left third = text pane, right two-thirds = canvas, full-height edge-attached', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubArchitectFetch(page);
    await page.goto('/');
    await driveToCanvas(page);

    // Both panes present.
    const textPane = page.getByTestId('architect-thinking-text-pane');
    const canvasPane = page.getByTestId('architect-thinking-canvas-pane');
    await expect(textPane).toBeVisible();
    await expect(canvasPane).toBeVisible();

    const textBox = await textPane.boundingBox();
    const canvasBox = await canvasPane.boundingBox();
    expect(textBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (!textBox || !canvasBox) return;

    // LEFT = text (1/3), RIGHT = canvas (2/3).
    expect(textBox.x).toBeLessThan(canvasBox.x);

    const viewport = page.viewportSize()!;
    const expectedThird = viewport.width / 3;
    const expectedTwoThirds = (viewport.width * 2) / 3;
    // Allow ±10px slack for sub-pixel rounding.
    expect(Math.abs(textBox.width - expectedThird)).toBeLessThan(10);
    expect(Math.abs(canvasBox.width - expectedTwoThirds)).toBeLessThan(10);

    // Both panes are edge-attached (no margin on the outer sides) and full-height
    // (start directly under the topbar, run to viewport bottom).
    // 56 is the topbar height (matches `min-h-[calc(100vh-56px)]` in the codebase).
    expect(textBox.x).toBeLessThanOrEqual(1);
    expect(canvasBox.x + canvasBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
    // Panes start at top: the topbar covers y=0..56, so each pane top should be
    // somewhere in that band (or very near zero in the embedded case).
    expect(textBox.y).toBeLessThan(80);
    expect(canvasBox.y).toBeLessThan(80);
    // Panes run to bottom of viewport.
    const textBottom = textBox.y + textBox.height;
    const canvasBottom = canvasBox.y + canvasBox.height;
    expect(textBottom).toBeGreaterThan(viewport.height - 4);
    expect(canvasBottom).toBeGreaterThan(viewport.height - 4);
  });

  test('node spacing — no two nodes overlap horizontally inside a layer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubArchitectFetch(page);
    await page.goto('/');
    await driveToCanvas(page);

    // Same-layer pairs from the fixture: permits/sam_gov sources, L2 permits/L2 sam_gov,
    // Qualifier/Enricher.
    const pairs: Array<[string, string]> = [
      ['arch-node-source-permits', 'arch-node-source-sam_gov'],
      ['arch-node-agent-L2 · permits', 'arch-node-agent-L2 · sam_gov'],
      ['arch-node-agent-Qualifier', 'arch-node-agent-Enricher'],
    ];

    for (const [aTestId, bTestId] of pairs) {
      const a = page.getByTestId(aTestId);
      const b = page.getByTestId(bTestId);
      const aBox = await a.boundingBox();
      const bBox = await b.boundingBox();
      expect(aBox, `missing bounding box for ${aTestId}`).not.toBeNull();
      expect(bBox, `missing bounding box for ${bTestId}`).not.toBeNull();
      if (!aBox || !bBox) continue;
      // Compute horizontal gap between the two rects (positive if disjoint).
      const left = aBox.x < bBox.x ? aBox : bBox;
      const right = aBox.x < bBox.x ? bBox : aBox;
      const gap = right.x - (left.x + left.width);
      expect(
        gap,
        `${aTestId} ↔ ${bTestId} overlap or touch (gap=${gap}px, expected > 0)`,
      ).toBeGreaterThan(0);
    }
  });

  test('"ARCHITECT · THINKING ..." loading label is removed after completion', async ({ page }) => {
    await stubArchitectFetch(page);
    await page.goto('/');
    await driveToCanvas(page);

    // Wait for the line-reveal to complete (the APPROVE & DEPLOY button enables).
    await expect(page.getByRole('button', { name: /APPROVE & DEPLOY/i })).toBeEnabled({ timeout: 15_000 });

    // The loading label "ARCHITECT · THINKING" (with the animated ellipsis) must
    // be gone. Once `done` flips true the v2 layout switches the eyebrow to
    // "ARCHITECT · DECOMPOSITION" (past tense) and drops the ellipsis.
    const labelEl = page.getByTestId('architect-thinking-label');
    await expect(labelEl).not.toContainText(/DECOMPOSING/i);
    await expect(labelEl).not.toContainText(/THINKING/i);
    expect(await labelEl.textContent()).toMatch(/ARCHITECT · DECOMPOSITION/i);
  });
});

test.describe('Architect Canvas v2 — Atrium-embedded Metacron', () => {
  test('host-based routing flips; v2 canvas module is served', async ({ page, baseURL }) => {
    await stubArchitectFetch(page);
    await page.goto(atriumBaseURL(baseURL));

    // Standalone Topbar must not render — host-based router took the Atrium branch.
    const standaloneCTA = await page
      .getByRole('button', { name: /LET ARCHITECT DESIGN IT/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(standaloneCTA).toBe(false);

    // Module graph for this host serves the same ArchitectCanvas + the new
    // ArchitectThinking layout (1fr_2fr grid + edge-attached pane testids).
    const canvasModule = await page.request.get(
      new URL('/src/components/onboarding/ArchitectCanvas.tsx', atriumBaseURL(baseURL)).toString(),
    );
    expect(canvasModule.status()).toBe(200);
    expect(await canvasModule.text()).toContain('architect-canvas');

    const thinkingModule = await page.request.get(
      new URL('/src/components/onboarding/ArchitectThinking.tsx', atriumBaseURL(baseURL)).toString(),
    );
    expect(thinkingModule.status()).toBe(200);
    const thinkingBody = await thinkingModule.text();
    expect(thinkingBody).toContain('architect-thinking-text-pane');
    expect(thinkingBody).toContain('architect-thinking-canvas-pane');
    expect(thinkingBody).toContain('grid-cols-[1fr_2fr]');
  });
});
