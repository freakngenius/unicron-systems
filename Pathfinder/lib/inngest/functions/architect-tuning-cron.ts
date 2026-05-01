// lib/inngest/functions/architect-tuning-cron.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4 (schedule — Inngest weekly cron).
//
// Weekly tuning session per vertical. Runs Sunday 02:00 UTC. Per spec §4
// the trigger is "Sunday 2am customer-local time"; for Pathfinder
// single-vertical Phase 2 we approximate to UTC. Future multi-vertical
// streams can fan out per-vertical with timezone-aware scheduling.
//
// Coordination: Stream A owns the Inngest scaffolding. This function
// registers via the existing functions/index.ts barrel; A's PR review
// confirms it doesn't collide with A's own functions.

import { inngest } from '../client';

const VERTICAL_ID = 'pathfinder-default';
const FEEDBACK_WINDOW_DAYS = 7;

export const architectTuningCron = inngest.createFunction(
  {
    id: 'pathfinder-architect-tuning-weekly',
    name: 'Architect — weekly tuning session',
    retries: 2,
    // 0 2 * * 0 = Sunday 02:00 UTC weekly. Per spec §4 the trigger is
    // "Sunday 2am customer-local time"; for Pathfinder single-vertical
    // Phase 2 we approximate to UTC. Multi-vertical streams can fan out
    // per-vertical with timezone-aware scheduling later.
    triggers: [{ cron: 'TZ=UTC 0 2 * * 0' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const result = await stepCtx.run('run-tuning', async () => {
      const { runTuning } = await import('@/services/architect/sessions/tuning');
      const response = await runTuning({
        input: {
          vertical_id: VERTICAL_ID,
          feedback_window_days: FEEDBACK_WINDOW_DAYS,
          trigger: 'cron',
        },
      });
      return {
        session_id: response.session_id,
        proposals_persisted: response.proposals.length,
        rejected_count: response.rejected.length,
        cost_usd: response.cost_usd,
        duration_ms: response.duration_ms,
        status: response.status,
      };
    });
    return result;
  },
);
