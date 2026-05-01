// lib/inngest/functions/verifier.ts — Phase 1 G1 Task B2.
//
// Subscribes: pathfinder/signal.qualified
// Emits:     pathfinder/signal.verified | pathfinder/signal.escalated
//
// SCAFFOLD ONLY for G1. Same logic as qualifier-rank.ts: the Vercel cron
// at /api/cron/verifier remains the canonical Verifier; this function is
// a contract-level scaffold so Phase 2 streams can subscribe without
// rewiring. Cutover happens after G2 with side-by-side comparison.

import { inngest } from '../client';

interface SignalQualifiedEvent {
  data: {
    project_id: string;
    score: number;
    qualified_at: string;
  };
}

export const verifier = inngest.createFunction(
  {
    id: 'pathfinder-verifier',
    name: 'Verifier (scaffold; cron is canonical for G1)',
    retries: 2,
    triggers: [{ event: 'pathfinder/signal.qualified' }],
  },
  async ({ event, step }: { event: SignalQualifiedEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const observed = await stepCtx.run('observe', async () => ({
      observed_at: new Date().toISOString(),
      project_id: event.data.project_id,
      score: event.data.score,
    }));
    return { skipped: 'cron_canonical_for_g1', ...observed };
  },
);
