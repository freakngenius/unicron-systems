// __tests__/agents/search/run.test.ts — ICP Saved Search S2.
//
// Verifies runSearchPlan + runIngestForSearch against a stubbed supabase
// client and stubbed agents. No live calls.

import { describe, it, expect, vi } from 'vitest';
import { runSearchPlan, runIngestForSearch } from '@/lib/agents/search/run';
import type { SavedSearchRow, SourcePlan } from '@/lib/agents/search/types';
import type { DecompositionResponse } from '@/services/architect/types';
import type { SourceOnboarderResult } from '@/services/source-onboarder/types';

// ----- Test doubles -------------------------------------------------------

interface StubState {
  saved_search: SavedSearchRow;
  updates: Record<string, unknown>[];
}

function makeSupabaseStub(state: StubState) {
  // Minimal stub mimicking the .from(...).select/update/eq/single chain.
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                single() {
                  return Promise.resolve({ data: state.saved_search, error: null });
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          state.updates.push(payload);
          // Merge updates into the in-memory row so subsequent reads see them.
          Object.assign(state.saved_search, payload);
          return {
            eq(_col: string, _val: unknown) {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as never;
}

function savedSearchFixture(overrides: Partial<SavedSearchRow> = {}): SavedSearchRow {
  return {
    id: 'ss-1',
    organization_id: 'org-internal',
    name: 'Houston GCs',
    icp_text: 'Houston-area commercial general contractors doing site work over $1M who need temporary security.',
    region: 'Houston, TX',
    radius_mi: 200,
    status: 'planning',
    architecture: null,
    source_plan: null,
    ...overrides,
  };
}

function decompFixture(): DecompositionResponse {
  return {
    proposal_id: 'p-1',
    session_id: 'sess-1',
    architecture: {
      buyer: 'commercial general contractor',
      buying_signal: 'NAICS 236220 SAM.gov active',
      data_sources_proposed: [],
      data_sources_rejected: [],
      layer_2_watchers: [],
      layer_3_agents: [],
      layer_4_agents: [],
      estimates: { daily_qualified_volume: 5, cost_per_lead_usd: 0.1, architecture_confidence: 'medium' },
      open_questions: [],
      business_summary: {
        lead_type: 'commercial general contractor',
        business_area: 'Texas construction',
        problem_solved: 'pre-bid intel',
        what_they_get: 'a feed',
      },
    },
    reasoning: [],
    cost_usd: 0.03,
    duration_ms: 5_000,
    status: 'completed',
  };
}

function naicsLlmStub() {
  return vi.fn().mockResolvedValue({
    content: JSON.stringify({ naics_codes: ['236220'], psc_codes: [], keywords: ['site security'] }),
    model: 'claude-sonnet-4-6',
    usage: { inputTokens: 50, outputTokens: 30, cachedInputTokens: 0, costUsd: 0.01, latencyMs: 100, cacheHit: false },
  });
}

// ----- runSearchPlan ------------------------------------------------------

describe('runSearchPlan', () => {
  it('runs interpret → geo → sources, persists architecture + source_plan, and fires phase events in order', async () => {
    const state: StubState = { saved_search: savedSearchFixture(), updates: [] };
    const supabase = makeSupabaseStub(state);
    const onPhase = vi.fn();
    const runDecomposition = vi.fn().mockResolvedValue(decompFixture());
    const runLlm = naicsLlmStub();
    const geocodeLocation = vi.fn().mockResolvedValue({ lat: 29.76, lon: -95.37, confidence: 1, place_id: 'p' });
    const completeSonar = vi.fn().mockResolvedValue({ text: '[]', citations: [], model: 'sonar', latencyMs: 50 });

    const result = await runSearchPlan('ss-1', {
      supabase,
      onPhase,
      runDecomposition,
      runLlm,
      geocodeLocation,
      completeSonar,
      newId: () => 'vertical-1',
      now: () => new Date('2026-05-30T12:00:00Z'),
    });

    // Phase order: interpret(running, done), geo(running, done), sources(running, done)
    const phaseSequence = onPhase.mock.calls.map((c) => `${c[0].key}:${c[0].status}`);
    expect(phaseSequence).toEqual([
      'interpret:running', 'interpret:done',
      'geo:running', 'geo:done',
      'sources:running', 'sources:done',
    ]);

    // architecture + source_plan were both persisted
    const archUpdate = state.updates.find((u) => 'architecture' in u);
    const planUpdate = state.updates.find((u) => 'source_plan' in u);
    expect(archUpdate).toBeTruthy();
    expect(planUpdate).toBeTruthy();
    expect((archUpdate!.architecture as { vertical: string }).vertical).toBe('vertical-1');

    expect(result.architecture.naics_codes).toEqual(['236220']);
    expect(result.geo.center.lat).toBeCloseTo(29.76);
    expect(result.source_plan.tier1.length).toBeGreaterThan(0);
    expect(result.sources_found).toBe(
      result.source_plan.tier1.length + result.source_plan.tier2.length + result.source_plan.tier3.length,
    );
  });

  it('emits a failed phase event when the interpreter throws', async () => {
    const state: StubState = { saved_search: savedSearchFixture(), updates: [] };
    const supabase = makeSupabaseStub(state);
    const onPhase = vi.fn();
    const runDecomposition = vi.fn().mockRejectedValue(new Error('architect timed out'));

    await expect(
      runSearchPlan('ss-1', { supabase, onPhase, runDecomposition }),
    ).rejects.toThrow(/architect timed out/);

    const failedEvent = onPhase.mock.calls.find(
      (c) => c[0].key === 'interpret' && c[0].status === 'failed',
    );
    expect(failedEvent).toBeTruthy();
    expect(state.updates.find((u) => 'architecture' in u)).toBeFalsy();
  });
});

// ----- runIngestForSearch -------------------------------------------------

function ingestFixtureRow(): SavedSearchRow {
  const source_plan: SourcePlan = {
    tier1: [
      { source_id: 'sam_gov_entity:naics_236220', kind: 'sam_gov_entity', params: { primaryNaics: '236220', stateOrProvinceCode: ['TX'] }, jurisdiction: 'federal' },
    ],
    tier2: [
      { source_id: 'state_license:TX', template: 'state-license-portal', needs: ['license_lookup_endpoint'], candidate_url: 'https://example.com/tx-license' },
      { source_id: 'state_license:IL', template: 'state-license-portal', needs: ['license_lookup_endpoint'] }, // no candidate_url → skipped
    ],
    tier3: [
      { candidate: 'TX Construction RSS', url: 'https://example.com/rss', discovered_by: 'perplexity', auto_attempt: true },
      { candidate: 'Brittle Source', url: 'https://broken.example/feed', discovered_by: 'perplexity', auto_attempt: true },
    ],
    generated_at: '2026-05-30T12:00:00.000Z',
  };
  return savedSearchFixture({ architecture: null, source_plan });
}

describe('runIngestForSearch', () => {
  it('walks tier1+tier2+tier3 wire, fires scrape+score hooks, and accumulates stats', async () => {
    const state: StubState = { saved_search: ingestFixtureRow(), updates: [] };
    const supabase = makeSupabaseStub(state);
    const onPhase = vi.fn();

    const runSourceOnboarder = vi.fn(async ({ inputs }) => {
      // Mark broken.example as failure path
      if (inputs.url?.includes('broken.example')) throw new Error('connect ECONNREFUSED');
      return {
        outcome: 'live',
        source_id: 'src-' + (inputs.url ?? 'x'),
        adapter_kind: 'rss',
        first_event_at: '2026-05-30T12:00:00Z',
        session_id: 'sess-x',
        cost_usd: 0,
        duration_ms: 100,
        reasoning_log: [],
      } satisfies SourceOnboarderResult;
    });

    const scrapeForSearch = vi.fn().mockResolvedValue({ companies_ingested: 17, detail: 'scraped TX gov + 1 RSS' });
    const scoreForSearch = vi.fn().mockResolvedValue({ scored: 17, verified: 6 });

    const result = await runIngestForSearch('ss-1', {
      supabase,
      onPhase,
      runSourceOnboarder,
      scrapeForSearch,
      scoreForSearch,
    });

    // Wire outcomes
    expect(result.wired.length).toBe(5); // 1 tier1 + 2 tier2 + 2 tier3
    expect(result.wired.find((w) => w.tier === 'tier2' && w.ref === 'state_license:IL')?.outcome).toBe('skipped');
    expect(result.wired.find((w) => w.tier === 'tier2' && w.ref === 'state_license:TX')?.outcome).toBe('live');
    expect(result.wired.find((w) => w.tier === 'tier3' && w.ref.includes('broken.example'))?.outcome).toBe('failed');
    // Tier 3 failure did NOT abort the run
    expect(result.wired.find((w) => w.tier === 'tier3' && w.ref.includes('example.com/rss'))?.outcome).toBe('live');

    // Stats
    expect(result.stats.sources_found).toBe(5);
    expect(result.stats.companies_ingested).toBe(17);
    expect(result.stats.scored).toBe(17);
    expect(result.stats.verified).toBe(6);

    // Phase events
    const seq = onPhase.mock.calls.map((c) => `${c[0].key}:${c[0].status}`);
    expect(seq).toEqual(['wire:running', 'wire:done', 'scrape:running', 'scrape:done', 'score:running', 'score:done']);

    // Score hook received the scrape's company count
    expect(scoreForSearch).toHaveBeenCalledWith(
      expect.objectContaining({ companies_ingested: 17 }),
    );
  });

  it('throws when source_plan is missing (runSearchPlan must complete first)', async () => {
    const state: StubState = { saved_search: savedSearchFixture(), updates: [] };
    const supabase = makeSupabaseStub(state);
    await expect(
      runIngestForSearch('ss-1', { supabase }),
    ).rejects.toThrow(/has no source_plan/);
  });

  it('falls back to the default scrape/score no-op when no hooks are passed', async () => {
    const state: StubState = { saved_search: ingestFixtureRow(), updates: [] };
    const supabase = makeSupabaseStub(state);
    const runSourceOnboarder = vi.fn().mockResolvedValue({
      outcome: 'live', source_id: 's', session_id: 's', cost_usd: 0, duration_ms: 0, reasoning_log: [],
    });

    const result = await runIngestForSearch('ss-1', { supabase, runSourceOnboarder });
    expect(result.stats.companies_ingested).toBe(0);
    expect(result.stats.scored).toBe(0);
    expect(result.stats.verified).toBe(0);
    // Honest signal in the default hook detail: the scrape phase done event
    // should carry the documented no-op explanation. We do not test the
    // exact wording here; the stats=0 contract is what matters.
  });
});
