import { test, expect, type Page } from '@playwright/test';

// E2E verifier for the Customer Intake gate that precedes Architect
// decomposition (Notion card 363785c6-7e72-8119-b7b3-efb428166e29).
//
// Asserts the flow re-order from the Metacron Reconnect sprint:
//   DefinePain.submit → CustomerIntakeModal opens BEFORE decomposition,
//   intake.submit → decomposition fires, intake.cancel → returns to define.
//
// Stubs both the organizations list (so the intake modal can validate
// slug uniqueness) and the decompose-proxy (so the LLM is never called).
// Tracks decompose-call timing to prove the modal blocks kickoff.

const ARCH_FIXTURE = {
  proposal_id: '00000000-0000-0000-0000-000000000001',
  session_id: '00000000-0000-0000-0000-000000000002',
  status: 'completed' as const,
  cost_usd: 0,
  duration_ms: 1,
  reasoning: ['stubbed'],
  architecture: {
    buyer: 'stubbed buyer',
    buying_signal: 'stubbed signal',
    data_sources_proposed: [],
    data_sources_rejected: [],
    layer_2_watchers: [],
    layer_3_agents: [],
    layer_4_agents: [],
    estimates: {
      daily_qualified_volume: 0,
      cost_per_lead_usd: 0,
      architecture_confidence: 'medium' as const,
    },
    open_questions: [],
    business_summary: {
      lead_type: 'stubbed',
      business_area: 'stubbed',
      problem_solved: 'stubbed',
      what_they_get: 'stubbed',
    },
  },
};

async function stubApis(page: Page) {
  // Inject a flag the test reads back from the page so we can prove the
  // decompose endpoint was NOT hit before the intake modal submitted.
  await page.addInitScript((fixture) => {
    (window as unknown as { __decomposeCalls: { at: number; body: unknown }[] }).__decomposeCalls = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      if (url.includes('/api/internal/organizations') && (!init?.method || init?.method === 'GET')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/architect/decompose')) {
        const parsed = ((): unknown => {
          if (!init?.body) return null;
          try {
            return JSON.parse(init.body as string);
          } catch {
            return init.body;
          }
        })();
        (window as unknown as { __decomposeCalls: { at: number; body: unknown }[] }).__decomposeCalls.push({
          at: Date.now(),
          body: parsed,
        });
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof window.fetch;
  }, ARCH_FIXTURE);
}

test.describe('Customer intake modal blocks Architect decomposition', () => {
  test('intake modal opens before decompose call and forwards customer_intake on submit', async ({
    page,
  }) => {
    await stubApis(page);
    await page.goto('/');

    // Step 1: type buyer pain → CTA enables.
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('Distributors of construction-site mobile surveillance towers');

    const cta = page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i });
    await expect(cta).toBeEnabled();
    await cta.click();

    // Step 2: intake modal appears, decompose has NOT been called yet.
    const modal = page.getByTestId('customer-intake-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    const decomposeCallsBeforeSubmit = await page.evaluate(
      () => (window as unknown as { __decomposeCalls: unknown[] }).__decomposeCalls.length,
    );
    expect(decomposeCallsBeforeSubmit).toBe(0);

    // Step 3: fill intake and submit.
    await page.getByTestId('customer-intake-name-input').fill('Zedcor Surveillance');
    await page.getByTestId('customer-intake-contact-input').fill('Doug Sharpe');
    // Slug auto-derives — assert it before submit.
    const slugInput = page.getByTestId('customer-intake-slug-input');
    await expect(slugInput).toHaveValue('zedcor-surveillance');
    await page.getByTestId('customer-intake-submit').click();

    // Step 4: modal closes; decompose call is now sent with customer_intake.
    await expect(modal).toHaveCount(0);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __decomposeCalls: unknown[] }).__decomposeCalls.length,
          ),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0);

    const call = await page.evaluate(
      () =>
        (
          window as unknown as {
            __decomposeCalls: { body: { customer_intake?: { name: string; slug: string; contact_name: string } } }[];
          }
        ).__decomposeCalls[0],
    );
    expect(call.body.customer_intake).toEqual({
      name: 'Zedcor Surveillance',
      slug: 'zedcor-surveillance',
      contact_name: 'Doug Sharpe',
    });
  });

  test('cancel returns operator to DefinePain without kicking off decomposition', async ({ page }) => {
    await stubApis(page);
    await page.goto('/');

    const textarea = page.locator('textarea').first();
    await textarea.fill('Mobile surveillance towers');
    await page.getByRole('button', { name: /LET ARCHITECT DESIGN IT/i }).click();

    const modal = page.getByTestId('customer-intake-modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('customer-intake-cancel').click();
    await expect(modal).toHaveCount(0);

    // Define pain textarea is back on screen.
    await expect(page.locator('textarea').first()).toBeVisible();

    const decomposeCalls = await page.evaluate(
      () => (window as unknown as { __decomposeCalls: unknown[] }).__decomposeCalls.length,
    );
    expect(decomposeCalls).toBe(0);
  });
});
