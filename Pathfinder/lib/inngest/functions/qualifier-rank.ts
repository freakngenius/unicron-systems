// lib/inngest/functions/qualifier-rank.ts — Phase 1 G1 Task B2.
//
// Subscribes: pathfinder/raw_event.created
// Emits:     pathfinder/signal.qualified | pathfinder/signal.rejected
//
// SCAFFOLD ONLY for G1. The body delegates to the existing Ranker cron
// behavior conceptually but does NOT yet replace the cron handler — the
// Vercel cron at `*/30 * * * *` continues to do the work for safety
// during the transition.
//
// Phase 2 (or G2) cuts over: cron schedule emits per-item events for
// new projects only; this function does the actual ranking. Until then,
// this function is a no-op event handler that records observability
// signals so we can compare the two paths side-by-side before promotion.

import { inngest } from '../client';

interface RawEventCreatedEvent {
  data: {
    project_id: string;
    source: string;
    ingested_at: string;
  };
}

export const qualifierRank = inngest.createFunction(
  {
    id: 'pathfinder-qualifier-rank',
    name: 'Qualifier+Ranker (scaffold; cron is canonical for G1)',
    retries: 2,
    triggers: [{ event: 'pathfinder/raw_event.created' }],
  },
  async ({ event, step }: { event: RawEventCreatedEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const observed = await stepCtx.run('observe', async () => ({
      observed_at: new Date().toISOString(),
      project_id: event.data.project_id,
      source: event.data.source,
    }));
    return { skipped: 'cron_canonical_for_g1', ...observed };
  },
);
