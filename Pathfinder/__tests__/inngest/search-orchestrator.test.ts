// __tests__/inngest/search-orchestrator.test.ts — ICP Search S1.
//
// Verifies that the orchestrator:
//   1. Marks the run running + saved_search running on entry.
//   2. Calls S2's runSearchPlan then runIngestForSearch in order.
//   3. Persists every onPhase event into search_runs.progress.
//   4. Lands status='complete' + final stats on the happy path.
//   5. On a seam throw, flips status='failed' and stops the chain.

import { describe, expect, it, vi, beforeEach } from 'vitest';

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

interface SearchRunPatch {
  status?: string;
  phase?: string | null;
  progress?: { phases: Array<{ key: string; status: string; detail?: string | null }> };
  stats?: { sources_found: number; companies_ingested: number; scored: number; verified: number };
  started_at?: string | null;
  finished_at?: string | null;
}

const seamSpies = vi.hoisted(() => ({
  runSearchPlan: vi.fn(),
  runIngestForSearch: vi.fn(),
}));

vi.mock('@/lib/agents/search', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agents/search')>('@/lib/agents/search');
  return {
    ...actual,
    runSearchPlan: seamSpies.runSearchPlan,
    runIngestForSearch: seamSpies.runIngestForSearch,
  };
});

const supabaseState = vi.hoisted(() => ({
  runUpdates: [] as SearchRunPatch[],
  searchUpdates: [] as Array<{ status: string }>,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'search_runs') {
        return {
          update: (patch: SearchRunPatch) => ({
            eq: async (_col: string, _val: string) => {
              supabaseState.runUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'saved_searches') {
        return {
          update: (patch: { status: string; updated_at: string }) => ({
            eq: async (_col: string, _val: string) => {
              supabaseState.searchUpdates.push({ status: patch.status });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { searchOrchestrator } from '@/lib/inngest/functions/search-orchestrator';

function getHandler(): (args: { event: { data: { search_run_id: string; saved_search_id: string } }; step: unknown }) => Promise<unknown> {
  const wrapped = searchOrchestrator as unknown as { fn: (args: unknown) => Promise<unknown> };
  return wrapped.fn as (args: { event: { data: { search_run_id: string; saved_search_id: string } }; step: unknown }) => Promise<unknown>;
}

describe('searchOrchestrator', () => {
  beforeEach(() => {
    supabaseState.runUpdates = [];
    supabaseState.searchUpdates = [];
    seamSpies.runSearchPlan.mockReset();
    seamSpies.runIngestForSearch.mockReset();
  });

  it('walks plan + ingest, persists phase events, lands complete with stats', async () => {
    seamSpies.runSearchPlan.mockImplementation(async (_id: string, { onPhase }: { onPhase: (e: { key: string; status: string; detail?: string; label?: string }) => Promise<void> }) => {
      await onPhase({ key: 'interpret', status: 'running' });
      await onPhase({ key: 'interpret', status: 'done', detail: 'parsed' });
      await onPhase({ key: 'geo', status: 'running' });
      await onPhase({ key: 'geo', status: 'done', detail: '1 state' });
      await onPhase({ key: 'sources', status: 'running' });
      await onPhase({ key: 'sources', status: 'done', detail: 'tier1=1' });
      return { architecture: {}, geo: { center: { lat: 0, lon: 0 }, states: [] }, source_plan: { tier1: [], tier2: [], tier3: [] }, sources_found: 3 };
    });

    seamSpies.runIngestForSearch.mockImplementation(async (_id: string, { onPhase }: { onPhase: (e: { key: string; status: string; detail?: string; label?: string }) => Promise<void> }) => {
      await onPhase({ key: 'wire', status: 'running' });
      await onPhase({ key: 'wire', status: 'done', detail: 'tier1=1 tier2=0 tier3=0' });
      await onPhase({ key: 'scrape', status: 'running' });
      await onPhase({ key: 'scrape', status: 'done', detail: '42 ingested' });
      await onPhase({ key: 'score', status: 'running' });
      await onPhase({ key: 'score', status: 'done', detail: '42 scored, 17 verified' });
      return { stats: { sources_found: 3, companies_ingested: 42, scored: 42, verified: 17 }, wired: [] };
    });

    const ctx = makeStepCtx();
    const out = (await getHandler()({
      event: { data: { search_run_id: 'run-1', saved_search_id: 'search-1' } },
      step: ctx.step,
    })) as { status: string; stats: { sources_found: number; companies_ingested: number; scored: number; verified: number } };

    expect(out.status).toBe('complete');
    expect(out.stats).toEqual({ sources_found: 3, companies_ingested: 42, scored: 42, verified: 17 });

    expect(seamSpies.runSearchPlan).toHaveBeenCalledOnce();
    expect(seamSpies.runIngestForSearch).toHaveBeenCalledOnce();
    expect(seamSpies.runSearchPlan.mock.invocationCallOrder[0]).toBeLessThan(
      seamSpies.runIngestForSearch.mock.invocationCallOrder[0],
    );

    // Final search_runs update carries status=complete + finished_at.
    const last = supabaseState.runUpdates.at(-1);
    expect(last?.status).toBe('complete');
    expect(last?.finished_at).toBeTruthy();
    expect(supabaseState.searchUpdates.at(-1)?.status).toBe('complete');

    // Phase progress threaded through every onPhase callback.
    const runningInterpret = supabaseState.runUpdates.find((u) =>
      u.progress?.phases.some((p) => p.key === 'interpret' && p.status === 'running'),
    );
    expect(runningInterpret).toBeDefined();
    const doneScore = supabaseState.runUpdates.find((u) =>
      u.progress?.phases.some((p) => p.key === 'score' && p.status === 'done'),
    );
    expect(doneScore).toBeDefined();
  });

  it('marks the run failed when runSearchPlan throws and does not call runIngestForSearch', async () => {
    seamSpies.runSearchPlan.mockImplementation(async (_id: string, { onPhase }: { onPhase: (e: { key: string; status: string; detail?: string }) => Promise<void> }) => {
      await onPhase({ key: 'geo', status: 'running' });
      throw new Error('geo lookup down');
    });

    const ctx = makeStepCtx();
    const out = (await getHandler()({
      event: { data: { search_run_id: 'run-1', saved_search_id: 'search-1' } },
      step: ctx.step,
    })) as { status: string; failed_phase: string; error: string };

    expect(out.status).toBe('failed');
    expect(out.failed_phase).toBe('geo');
    expect(out.error).toContain('geo lookup down');

    expect(seamSpies.runIngestForSearch).not.toHaveBeenCalled();
    expect(supabaseState.runUpdates.at(-1)?.status).toBe('failed');
    expect(supabaseState.searchUpdates.at(-1)?.status).toBe('failed');
  });
});
