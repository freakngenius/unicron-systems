// Build-Out Pass Slices 3+5 — verifyBuildOut function tests.
//
// Mocks Supabase admin + the global fetch() call to the /[slug] route.
// Covers: pass path, too-few-lead-cards fail, http_401 fail, http_5xx fail.
//
// End-to-end markers (data-kpi-strip, data-lead-card, data-chart) are
// supplied by the parallel Slice 2 sub-agent's PR. Tests here mock HTML
// strings that literally contain the markers — real e2e is gated on
// Slice 2 landing.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- step shim ----------------------------------------------------------

interface CapturedStep {
  name: string;
  result?: unknown;
  error?: unknown;
}

function makeStepCtx() {
  const calls: CapturedStep[] = [];
  return {
    calls,
    step: {
      run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const captured: CapturedStep = { name };
        calls.push(captured);
        try {
          const result = await fn();
          captured.result = result;
          return result;
        } catch (err) {
          captured.error = err;
          throw err;
        }
      },
    },
  };
}

// --- supabase mock ------------------------------------------------------

interface SupabaseStub {
  organizationsRow?: { id: string; slug: string; status: string };
  updateError?: { message: string };
  capturedUpdates: Array<Record<string, unknown>>;
}

let supabaseStub: SupabaseStub = { capturedUpdates: [] };

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'organizations') throw new Error(`unexpected table: ${table}`);
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({
              data: supabaseStub.organizationsRow ?? null,
              error: null,
            }),
          }),
        }),
        update: (v: Record<string, unknown>) => ({
          eq: async (_col: string, _val: string) => {
            supabaseStub.capturedUpdates.push(v);
            return { error: supabaseStub.updateError ?? null };
          },
        }),
      };
    },
  }),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (_cfg: unknown, handler: unknown) => handler,
  },
}));

// --- fetch mock helpers -------------------------------------------------

function mockFetch(response: { status: number; body: string }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    text: async () => response.body,
  }) as unknown as typeof fetch;
}

// --- HTML fixtures ------------------------------------------------------

const PASS_HTML = `
<!doctype html><html><body>
<div data-kpi-strip>
  <span>Leads this week: 42</span>
</div>
<div data-lead-card>Lead 1</div>
<div data-lead-card>Lead 2</div>
<div data-lead-card>Lead 3</div>
<div data-lead-card>Lead 4</div>
<div data-chart>chart-one</div>
<div data-chart>chart-two</div>
</body></html>
`;

const TOO_FEW_LEADS_HTML = `
<!doctype html><html><body>
<div data-kpi-strip>kpis here</div>
<div data-lead-card>Lead 1</div>
<div data-lead-card>Lead 2</div>
<div data-chart>chart-one</div>
</body></html>
`;

const EMPTY_STATE_HTML = `
<!doctype html><html><body>
<div data-kpi-strip>kpis</div>
<div data-empty-state>No leads yet</div>
<div data-chart>chart</div>
</body></html>
`;

// --- tests --------------------------------------------------------------

const ORG = { id: 'org-1', slug: 'testcorp', status: 'ready_to_view' };

describe('Build-Out Pass — verifyBuildOut function', () => {
  beforeEach(() => {
    supabaseStub = { organizationsRow: { ...ORG }, capturedUpdates: [] };
    process.env.PATHFINDER_BASE_URL = 'https://pathfinder-ashy.vercel.app';
  });

  it('flips status to build_out_complete when all checks pass', async () => {
    mockFetch({ status: 200, body: PASS_HTML });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'org-1' } };
    const result = (await (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({
      event,
      step: ctx.step,
    })) as { status: string };
    expect(result.status).toBe('build_out_complete');
    expect(supabaseStub.capturedUpdates).toHaveLength(1);
    expect(supabaseStub.capturedUpdates[0].status).toBe('build_out_complete');
    expect(supabaseStub.capturedUpdates[0].build_out_diagnostic).toBeNull();
  });

  it('accepts data-empty-state in lieu of >=3 lead cards (pass)', async () => {
    mockFetch({ status: 200, body: EMPTY_STATE_HTML });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'org-1' } };
    const result = (await (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({
      event,
      step: ctx.step,
    })) as { status: string };
    expect(result.status).toBe('build_out_complete');
  });

  it('flips status to build_out_failed with too_few_lead_cards reason', async () => {
    mockFetch({ status: 200, body: TOO_FEW_LEADS_HTML });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'org-1' } };
    const result = (await (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({
      event,
      step: ctx.step,
    })) as { status: string; diagnostic: { reason: string } };
    expect(result.status).toBe('build_out_failed');
    expect(result.diagnostic.reason).toBe('too_few_lead_cards');
    expect(supabaseStub.capturedUpdates[0].status).toBe('build_out_failed');
    const diag = supabaseStub.capturedUpdates[0].build_out_diagnostic as { reason: string };
    expect(diag.reason).toBe('too_few_lead_cards');
  });

  it('flips status to build_out_failed with http_401 reason on 401 response', async () => {
    mockFetch({ status: 401, body: 'Unauthorized' });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'org-1' } };
    const result = (await (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({
      event,
      step: ctx.step,
    })) as { status: string; diagnostic: { reason: string; http_status: number } };
    expect(result.status).toBe('build_out_failed');
    expect(result.diagnostic.reason).toBe('http_401');
    expect(result.diagnostic.http_status).toBe(401);
  });

  it('flips status to build_out_failed with http_5xx reason on 503 response', async () => {
    mockFetch({ status: 503, body: 'Service Unavailable' });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'org-1' } };
    const result = (await (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({
      event,
      step: ctx.step,
    })) as { status: string; diagnostic: { reason: string; http_status: number } };
    expect(result.status).toBe('build_out_failed');
    expect(result.diagnostic.reason).toBe('http_5xx');
    expect(result.diagnostic.http_status).toBe(503);
  });

  it('throws when org row is missing (lets Inngest retry)', async () => {
    supabaseStub.organizationsRow = undefined;
    mockFetch({ status: 200, body: PASS_HTML });
    const { verifyBuildOut } = await import('@/lib/inngest/functions/verify-build-out');
    const ctx = makeStepCtx();
    const event = { data: { organization_id: 'missing' } };
    await expect(
      (verifyBuildOut as unknown as (a: unknown) => Promise<unknown>)({ event, step: ctx.step }),
    ).rejects.toThrow(/not found/);
  });
});
