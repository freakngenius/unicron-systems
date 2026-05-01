// Integration test for the Stream A Gate A1 Inngest pipeline.
//
// Exercises the full event chain from a synthetic raw_event through every
// registered Inngest function in order. Each scaffold function is currently
// observe-only (cron remains canonical for G1+A1) so the assertion is
// "the registered function consumes the prior event and returns the
// expected observed payload" — proving the topology is correctly wired.
//
// Why not run an actual Inngest dev server: vitest-friendly. Calling each
// function's createFunction handler directly with a synthetic step ctx
// proves the same contract (the trigger event shape, the observed output
// shape) without spinning up infrastructure. The trigger declaration on
// the function definition is asserted separately so any rename of the
// event names in lib/inngest/events.ts surfaces here as a typed failure
// rather than a silent runtime drop.
//
// Phase 2 A2 will replace each scaffold body with real work (Enricher,
// AdjacencyMapper, etc). When that happens this file expands to assert the
// new side-effects rather than the placeholder observed_at + project_id.

import { describe, expect, it, vi } from 'vitest';

// Mocks that any registered function might transitively require.
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

import {
  qualifierRank,
  verifier,
  outreach,
  delivery,
  slackAlertOnVerified,
} from '@/lib/inngest/functions';

// Pass-through step shim: runs the inner closure inline so the
// observable behavior of the scaffold body is exercised.
const passthroughStep = {
  run: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
};

interface RegisteredFn {
  opts?: { triggers?: Array<{ event?: string }> };
  fn?: (input: unknown) => Promise<unknown>;
}

function getTrigger(f: unknown): string | undefined {
  const inner = f as { opts?: { triggers?: Array<{ event?: string }> } };
  return inner.opts?.triggers?.[0]?.event;
}

function invokeHandler(
  f: unknown,
  event: { name: string; data: Record<string, unknown> },
): Promise<unknown> {
  // Inngest stores the user-supplied handler under `.fn` on its private
  // function object. Cast through unknown to access it without depending
  // on Inngest internals' types (which differ across minor versions).
  const inner = f as RegisteredFn & { fn: (i: unknown) => Promise<unknown> };
  return inner.fn({ event, step: passthroughStep });
}

describe('Stream A A1 — Inngest pipeline event topology', () => {
  it('every registered function declares the spec-canonical trigger event', () => {
    expect(getTrigger(qualifierRank)).toBe('pathfinder/raw_event.created');
    expect(getTrigger(verifier)).toBe('pathfinder/signal.qualified');
    expect(getTrigger(outreach)).toBe('pathfinder/signal.verified');
    expect(getTrigger(slackAlertOnVerified)).toBe('pathfinder/signal.verified');
    expect(getTrigger(delivery)).toBe('pathfinder/decision.synthesized');
  });

  it('qualifier-rank scaffold consumes raw_event.created and observes the project_id', async () => {
    const result = (await invokeHandler(qualifierRank, {
      name: 'pathfinder/raw_event.created',
      data: {
        project_id: 'usaspending:test-1',
        source: 'usaspending',
        ingested_at: '2026-05-01T17:00:00.000Z',
      },
    })) as { skipped?: string; project_id?: string; source?: string };
    expect(result.project_id).toBe('usaspending:test-1');
    expect(result.source).toBe('usaspending');
    // G1 scaffold: real work happens via cron until A2 cuts over.
    expect(result.skipped).toBe('cron_canonical_for_g1');
  });

  it('verifier scaffold consumes signal.qualified and observes the score', async () => {
    const result = (await invokeHandler(verifier, {
      name: 'pathfinder/signal.qualified',
      data: {
        project_id: 'usaspending:test-1',
        score: 87,
        qualified_at: '2026-05-01T17:01:00.000Z',
      },
    })) as { skipped?: string; project_id?: string; score?: number };
    expect(result.project_id).toBe('usaspending:test-1');
    expect(result.score).toBe(87);
    expect(result.skipped).toBe('cron_canonical_for_g1');
  });

  it('outreach scaffold consumes signal.verified and observes the verifier_pass_count', async () => {
    const result = (await invokeHandler(outreach, {
      name: 'pathfinder/signal.verified',
      data: {
        project_id: 'usaspending:test-1',
        score: 92,
        verifier_pass_count: 1,
        verified_at: '2026-05-01T17:02:00.000Z',
      },
    })) as {
      skipped?: string;
      project_id?: string;
      verifier_pass_count?: number;
    };
    expect(result.project_id).toBe('usaspending:test-1');
    expect(result.verifier_pass_count).toBe(1);
    expect(result.skipped).toBe('cron_canonical_for_g1');
  });

  it('delivery scaffold consumes decision.synthesized and observes the draft_id', async () => {
    const result = (await invokeHandler(delivery, {
      name: 'pathfinder/decision.synthesized',
      data: {
        project_id: 'usaspending:test-1',
        draft_id: null,
        synthesized_at: '2026-05-01T17:03:00.000Z',
      },
    })) as { skipped?: string; project_id?: string; draft_id?: number | null };
    expect(result.project_id).toBe('usaspending:test-1');
    expect(result.draft_id).toBe(null);
    expect(result.skipped).toBe('cron_canonical_for_g1');
  });

  it('end-to-end chain: a raw_event flows through each scaffold without losing identity', async () => {
    const projectId = 'usaspending:e2e-1';
    const t0 = '2026-05-01T18:00:00.000Z';

    // Stage 1 — qualifier-rank consumes raw_event.created
    const qRes = (await invokeHandler(qualifierRank, {
      name: 'pathfinder/raw_event.created',
      data: { project_id: projectId, source: 'usaspending', ingested_at: t0 },
    })) as { project_id: string };
    expect(qRes.project_id).toBe(projectId);

    // Stage 2 — verifier consumes signal.qualified (which the cron Ranker
    // emits on score-assign)
    const vRes = (await invokeHandler(verifier, {
      name: 'pathfinder/signal.qualified',
      data: { project_id: projectId, score: 95, qualified_at: t0 },
    })) as { project_id: string };
    expect(vRes.project_id).toBe(projectId);

    // Stage 3 — outreach consumes signal.verified (cron Verifier emits)
    const oRes = (await invokeHandler(outreach, {
      name: 'pathfinder/signal.verified',
      data: {
        project_id: projectId,
        score: 95,
        verifier_pass_count: 1,
        verified_at: t0,
      },
    })) as { project_id: string };
    expect(oRes.project_id).toBe(projectId);

    // Stage 4 — delivery consumes decision.synthesized (cron Outreach emits)
    const dRes = (await invokeHandler(delivery, {
      name: 'pathfinder/decision.synthesized',
      data: { project_id: projectId, draft_id: null, synthesized_at: t0 },
    })) as { project_id: string };
    expect(dRes.project_id).toBe(projectId);
  });
});
