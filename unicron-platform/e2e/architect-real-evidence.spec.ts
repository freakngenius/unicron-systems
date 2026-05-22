// Three-turn evidence run against the REAL Stream D Architect.
//
// Skipped unless ARCHITECT_REAL_EVIDENCE=1 so accidental CI runs don't
// burn LLM budget. Drive locally via:
//
//   VITE_API_PROXY_TARGET=https://<preview-url>.vercel.app npm run dev
//   ARCHITECT_REAL_EVIDENCE=1 npx playwright test e2e/architect-real-evidence.spec.ts
//
// Each real LLM turn takes 100–180 seconds, so the full 3-turn run is
// ~8–12 minutes. Captures per-turn session_id + duration_ms + screenshots
// in test-results/real-evidence-*.png.

import { test, expect } from '@playwright/test';

const RUN = process.env.ARCHITECT_REAL_EVIDENCE === '1';

type DecomposeRecord = {
  status: number;
  body: { session_id?: string; duration_ms?: number; architecture?: { buyer?: string; open_questions?: string[] } } | null;
  requestBody: { buyer_pain_prompt?: string; constraints?: string[] } | null;
};

test.describe.configure({ mode: 'serial' });

test.describe('Conversational Architect — real-endpoint evidence (manual)', () => {
  test.skip(!RUN, 'set ARCHITECT_REAL_EVIDENCE=1 to run');

  test('three real turns: thinking indicator per turn, accumulating constraints, canvas updates, Approve & Deploy', async ({
    page,
  }) => {
    test.setTimeout(900_000); // 15 minutes total

    const decomposeRecords: DecomposeRecord[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/architect/decompose-proxy') && req.method() === 'POST') {
        const raw = req.postData();
        let parsed: DecomposeRecord['requestBody'];
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        // Stash the request body on a placeholder; response handler fills in status/body.
        decomposeRecords.push({ status: 0, body: null, requestBody: parsed });
      }
    });
    page.on('response', async (response) => {
      if (response.url().includes('/api/architect/decompose-proxy') && response.request().method() === 'POST') {
        const idx = decomposeRecords.findIndex((r) => r.status === 0);
        if (idx === -1) return;
        try {
          decomposeRecords[idx] = {
            ...decomposeRecords[idx],
            status: response.status(),
            body: await response.json().catch(() => null),
          };
        } catch {
          // ignore
        }
      }
    });

    const orgPostBodies: Array<{ architecture?: { buyer?: string } }> = [];
    page.on('request', async (req) => {
      if (req.url().includes('/api/internal/organizations') && req.method() === 'POST') {
        try {
          orgPostBodies.push(JSON.parse(req.postData() ?? '{}'));
        } catch {
          // ignore
        }
      }
    });

    await page.goto('/');

    // Buyer pain → submit.
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill(
      'public adjusters tracking storm damage across Texas after category-3+ hurricanes',
    );
    await page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i }).click();

    // Intake → submit.
    await expect(page.getByTestId('customer-intake-modal')).toBeVisible();
    await page.getByTestId('customer-intake-name-input').fill('Real PA Three-Turn');
    await page.getByTestId('customer-intake-contact-input').fill('Test Contact');
    await page.getByTestId('customer-intake-submit').click();

    // -------- TURN 1 --------
    const thinking = page.getByTestId('architect-thinking-indicator');
    await expect(thinking).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: 'test-results/real-evidence-turn-1-in-flight.png' });
    await expect(page.getByTestId('architect-message')).toHaveCount(1, { timeout: 240_000 });
    await expect(thinking).toHaveCount(0);
    await page.waitForTimeout(4_000); // let reveal animation paint
    await page.screenshot({ path: 'test-results/real-evidence-turn-1-revealed.png' });

    // Click the first open question to seed the composer.
    const questions = page.getByTestId('architect-open-question');
    await expect(questions.first()).toBeVisible({ timeout: 5_000 });
    await questions.first().click();
    const composer = page.getByTestId('architect-composer');
    await expect(composer).toHaveValue(/^Re: /);

    // Replace with a concrete refinement and send.
    await composer.fill(
      'Residential-only TX adjuster firm in coastal counties: TX-Harris, TX-Galveston, TX-Brazoria, TX-Fort Bend, TX-Chambers, TX-Nueces. Drop commercial-only sources and any non-Texas jurisdictions.',
    );
    await page.getByTestId('architect-composer-send').click();

    // -------- TURN 2 --------
    await expect(thinking).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: 'test-results/real-evidence-turn-2-in-flight.png' });
    await expect(page.getByTestId('architect-message')).toHaveCount(2, { timeout: 240_000 });
    await expect(thinking).toHaveCount(0);
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: 'test-results/real-evidence-turn-2-revealed.png' });

    // Send a free-form refinement (not seeded from a question).
    await composer.fill(
      'Phase 1: start with Galveston, Fort Bend, Brazoria only. Pause cost-heavy sources during non-storm periods (no active FEMA TX disaster). CRM is HubSpot.',
    );
    await page.getByTestId('architect-composer-send').click();

    // -------- TURN 3 --------
    await expect(thinking).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: 'test-results/real-evidence-turn-3-in-flight.png' });
    await expect(page.getByTestId('architect-message')).toHaveCount(3, { timeout: 240_000 });
    await expect(thinking).toHaveCount(0);
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: 'test-results/real-evidence-turn-3-revealed.png' });

    // -------- Approve & Deploy --------
    const approveBtn = page.getByTestId('architect-approve-button');
    await expect(approveBtn).toBeEnabled({ timeout: 10_000 });
    await approveBtn.click();
    await expect(page.getByTestId('approve-deploy-modal')).toBeVisible();
    await page.getByTestId('approve-deploy-confirm').click();
    // The organization POST may fail in dev (preview backend may reject
    // localhost-origin POSTs); that's separate from this test's invariants.
    await page.waitForTimeout(3_000);

    // -------- Assertions --------
    expect(decomposeRecords).toHaveLength(3);
    const [t1, t2, t3] = decomposeRecords;

    // Per-turn: 200, real session_id, real non-zero duration_ms.
    for (const t of [t1, t2, t3]) {
      expect(t.status).toBe(200);
      expect(t.body?.session_id).toMatch(/^[0-9a-f]{8}-/);
      expect(t.body?.duration_ms ?? 0).toBeGreaterThan(1000);
    }

    // Distinct session_ids across turns — each turn is its own
    // architect_session server-side.
    expect(new Set([t1.body!.session_id, t2.body!.session_id, t3.body!.session_id]).size).toBe(3);

    // Accumulating constraints — turn 1 empty, turn 2 length 1, turn 3 length 2.
    expect(t1.requestBody?.constraints ?? []).toEqual([]);
    expect(t2.requestBody?.constraints).toHaveLength(1);
    expect(t3.requestBody?.constraints).toHaveLength(2);
    expect(t3.requestBody?.constraints?.[0]).toBe(t2.requestBody?.constraints?.[0]);

    // Approve & Deploy hit /api/internal/organizations carrying the latest
    // turn's architecture.
    expect(orgPostBodies.length).toBeGreaterThan(0);
    const latestBuyer = t3.body?.architecture?.buyer;
    expect(orgPostBodies[0].architecture?.buyer).toBe(latestBuyer);

    console.log('[evidence] per-turn:');
    for (const [i, t] of [t1, t2, t3].entries()) {
      console.log(
        `  turn ${i + 1}: session_id=${t.body!.session_id}  duration_ms=${t.body!.duration_ms}  ` +
          `constraints=${(t.requestBody?.constraints ?? []).length}  buyer=${t.body!.architecture?.buyer}`,
      );
    }
  });
});
