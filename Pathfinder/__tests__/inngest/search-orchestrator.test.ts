// __tests__/inngest/search-orchestrator.test.ts — ICP Search S1.
//
// Verifies that the orchestrator:
//   1. Marks the run running + saved_search running on entry.
//   2. Drives each phase inside its own step.run('phase-<key>') boundary.
//   3. Persists running + done progress per phase.
//   4. Lands status='complete' + final stats on the happy path.
//   5. On a phase throw, flips status='failed' + finished_at and stops
//      the chain (per-phase failure surfacing is the whole point of
//      the 2026-05-31 stall fix).

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

const phaseSpies = vi.hoisted(() => ({
  loadSavedSearchRow: vi.fn(),
  doPhaseInterpret: vi.fn(),
  doPhaseGeo: vi.fn(),
  doPhaseSources: vi.fn(),
  doPhaseWire: vi.fn(),
  doPhaseScrape: vi.fn(),
  doPhaseScore: vi.fn(),
}));

vi.mock('@/lib/agents/search', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agents/search')>('@/lib/agents/search');
  return {
    ...actual,
    loadSavedSearchRow: phaseSpies.loadSavedSearchRow,
    doPhaseInterpret: phaseSpies.doPhaseInterpret,
    doPhaseGeo: phaseSpies.doPhaseGeo,
    doPhaseSources: phaseSpies.doPhaseSources,
    doPhaseWire: phaseSpies.doPhaseWire,
    doPhaseScrape: phaseSpies.doPhaseScrape,
    doPhaseScore: phaseSpies.doPhaseScore,
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

const SAVED_FIXTURE = {
  id: 'search-1',
  organization_id: 'org-1',
  name: 'fixture',
  icp_text: 'Commercial janitorial and facilities services in the Atlanta metro.',
  region: 'Atlanta',
  radius_mi: 75,
  architecture: null,
  source_plan: null,
};

const ARCH_FIXTURE = {
  vertical: 'vertical-1',
  lead_schema: {},
  scoring_signals: [],
  naics_codes: ['561720'],
  psc_codes: [],
  keywords: ['janitorial'],
  business_summary: { lead_type: '', business_area: '', problem_solved: '', what_they_get: '' },
};

const GEO_FIXTURE = {
  region: 'Atlanta',
  radius_mi: 75,
  center: { lat: 33.74, lon: -84.39, label: 'Atlanta, GA' },
  states: ['GA'],
  counties: [],
  metros: [],
  bbox: { north: 0, south: 0, east: 0, west: 0 },
};

const SOURCE_PLAN_FIXTURE = {
  tier1: [{ source_id: 't1', kind: 'sam-gov', params: {} }],
  tier2: [],
  tier3: [],
  generated_at: '2026-05-31T00:00:00.000Z',
};

describe('searchOrchestrator (per-phase step.run)', () => {
  beforeEach(() => {
    supabaseState.runUpdates = [];
    supabaseState.searchUpdates = [];
    phaseSpies.loadSavedSearchRow.mockReset();
    phaseSpies.doPhaseInterpret.mockReset();
    phaseSpies.doPhaseGeo.mockReset();
    phaseSpies.doPhaseSources.mockReset();
    phaseSpies.doPhaseWire.mockReset();
    phaseSpies.doPhaseScrape.mockReset();
    phaseSpies.doPhaseScore.mockReset();
  });

  it('walks all six phases each in their own step.run, lands complete with stats', async () => {
    phaseSpies.loadSavedSearchRow.mockResolvedValue(SAVED_FIXTURE);
    phaseSpies.doPhaseInterpret.mockResolvedValue({ architecture: ARCH_FIXTURE, detail: 'vertical=vertical-1 · naics=561720' });
    phaseSpies.doPhaseGeo.mockResolvedValue({ geo: GEO_FIXTURE, detail: 'center=33.74,-84.39 · states=1' });
    phaseSpies.doPhaseSources.mockResolvedValue({ source_plan: SOURCE_PLAN_FIXTURE, sources_found: 1, detail: 'tier1=1 tier2=0 tier3=0' });
    phaseSpies.doPhaseWire.mockResolvedValue({ wired: [{ tier: 'tier1', ref: 't1', outcome: 'live' }], detail: 'tier1=1 tier2=0 tier3=0 (tier3 failures=0, graceful)' });
    phaseSpies.doPhaseScrape.mockResolvedValue({ companies_ingested: 42, detail: '42 ingested' });
    phaseSpies.doPhaseScore.mockResolvedValue({ scored: 42, verified: 17, detail: '42 scored, 17 verified' });

    const ctx = makeStepCtx();
    const out = (await getHandler()({
      event: { data: { search_run_id: 'run-1', saved_search_id: 'search-1' } },
      step: ctx.step,
    })) as { status: string; stats: { sources_found: number; companies_ingested: number; scored: number; verified: number } };

    expect(out.status).toBe('complete');
    expect(out.stats).toEqual({ sources_found: 1, companies_ingested: 42, scored: 42, verified: 17 });

    const stepNames = ctx.calls.map((c) => c.name);
    expect(stepNames).toEqual([
      'mark-running',
      'load-saved-search',
      'phase-interpret',
      'phase-geo',
      'phase-sources',
      'phase-wire',
      'phase-scrape',
      'phase-score',
      'mark-complete',
    ]);

    // mark-complete writes status='complete' + finished_at.
    const last = supabaseState.runUpdates.at(-1);
    expect(last?.status).toBe('complete');
    expect(last?.finished_at).toBeTruthy();
    expect(supabaseState.searchUpdates.at(-1)?.status).toBe('complete');

    // Per-phase running + done events landed for the most-visible phases.
    const runningInterpret = supabaseState.runUpdates.find((u) =>
      u.progress?.phases.some((p) => p.key === 'interpret' && p.status === 'running'),
    );
    expect(runningInterpret).toBeDefined();
    const doneScore = supabaseState.runUpdates.find((u) =>
      u.progress?.phases.some((p) => p.key === 'score' && p.status === 'done'),
    );
    expect(doneScore).toBeDefined();
  });

  it('on interpret throw flips run failed, sets finished_at, and stops the chain', async () => {
    phaseSpies.loadSavedSearchRow.mockResolvedValue(SAVED_FIXTURE);
    phaseSpies.doPhaseInterpret.mockRejectedValue(new Error('architect timed out'));

    const ctx = makeStepCtx();
    const out = (await getHandler()({
      event: { data: { search_run_id: 'run-1', saved_search_id: 'search-1' } },
      step: ctx.step,
    })) as { status: string; error: string };

    expect(out.status).toBe('failed');
    expect(out.error).toContain('architect timed out');

    // doPhaseGeo and downstream phases never invoked.
    expect(phaseSpies.doPhaseGeo).not.toHaveBeenCalled();
    expect(phaseSpies.doPhaseSources).not.toHaveBeenCalled();
    expect(phaseSpies.doPhaseScore).not.toHaveBeenCalled();

    // A failed run update with finished_at must land before the function returns.
    const failedWrite = supabaseState.runUpdates.find(
      (u) => u.status === 'failed' && u.finished_at,
    );
    expect(failedWrite).toBeDefined();
    expect(supabaseState.searchUpdates.some((s) => s.status === 'failed')).toBe(true);

    // The interpret phase row reflects 'failed' status with the error detail.
    const failedInterpret = supabaseState.runUpdates.find((u) =>
      u.progress?.phases.some((p) => p.key === 'interpret' && p.status === 'failed'),
    );
    expect(failedInterpret).toBeDefined();
    const interpretPhase = failedInterpret?.progress?.phases.find((p) => p.key === 'interpret');
    expect(interpretPhase?.detail).toContain('architect timed out');
  });
});
