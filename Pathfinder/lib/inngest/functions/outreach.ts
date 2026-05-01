// lib/inngest/functions/outreach.ts — Phase 1 G1 Task B2.
//
// Subscribes: pathfinder/signal.verified
// Emits:     pathfinder/decision.synthesized
//
// SCAFFOLD ONLY for G1. The Vercel cron at /api/cron/outreach is the
// canonical OutreachDrafter for now. See `qualifier-rank.ts` and
// `verifier.ts` for the same pattern + rationale.

import { inngest } from '../client';

interface SignalVerifiedEvent {
  data: {
    project_id: string;
    score: number;
    verifier_pass_count: number;
    verified_at: string;
  };
}

export const outreach = inngest.createFunction(
  {
    id: 'pathfinder-outreach',
    name: 'OutreachDrafter (scaffold; cron is canonical for G1)',
    retries: 2,
    triggers: [{ event: 'pathfinder/signal.verified' }],
  },
  async ({ event, step }: { event: SignalVerifiedEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const observed = await stepCtx.run('observe', async () => ({
      observed_at: new Date().toISOString(),
      project_id: event.data.project_id,
      score: event.data.score,
      verifier_pass_count: event.data.verifier_pass_count,
    }));
    return { skipped: 'cron_canonical_for_g1', ...observed };
  },
);
