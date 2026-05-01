// lib/inngest/functions/delivery.ts — Phase 1 G1 Task B2.
//
// Subscribes: pathfinder/decision.synthesized
// Emits:     pathfinder/delivery.completed (one per channel)
//
// SCAFFOLD ONLY for G1. The Vercel cron at /api/cron/briefing handles
// weekly Friday delivery; the Slack-alert-on-verified Inngest function
// handles high-priority Slack alerts. Per-decision fan-out (email +
// hubspot-pre-stamp + dashboard) lives in the cron handlers today and
// migrates here in Phase 2.

import { inngest } from '../client';

interface DecisionSynthesizedEvent {
  data: {
    project_id: string;
    draft_id: number | null;
    synthesized_at: string;
  };
}

export const delivery = inngest.createFunction(
  {
    id: 'pathfinder-delivery',
    name: 'Delivery dispatcher (scaffold; cron + slack-alert handle G1)',
    retries: 2,
    triggers: [{ event: 'pathfinder/decision.synthesized' }],
  },
  async ({ event, step }: { event: DecisionSynthesizedEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const observed = await stepCtx.run('observe', async () => ({
      observed_at: new Date().toISOString(),
      project_id: event.data.project_id,
      draft_id: event.data.draft_id,
    }));
    return { skipped: 'cron_canonical_for_g1', ...observed };
  },
);
