// lib/inngest/functions/architect-discovery-cron.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5 (Inngest cron weekly per vertical).
//
// Weekly per-vertical discovery scan. Currently single-vertical
// (pathfinder-default). Multi-vertical fan-out is post-Phase-2.
//
// Adjacency-threshold triggering (§5: "AdjacencyMapper hitting a threshold
// of 15% of qualified leads referencing an unwatched geography") is owned
// by Stream A (AdjacencyMapper at A2). When that lands, A's function
// emits `pathfinder/architect.discovery.adjacency_triggered` and a
// subscriber here calls runDiscovery with trigger='adjacency_threshold'.
// For now only the periodic cron is wired.

import { inngest } from '../client';

const VERTICAL_ID = 'pathfinder-default';

export const architectDiscoveryCron = inngest.createFunction(
  {
    id: 'pathfinder-architect-discovery-weekly',
    name: 'Architect — weekly discovery scan',
    retries: 2,
    // 0 4 * * 0 = Sunday 04:00 UTC (2 hours after the tuning cron to
    // avoid stacking the two architect runs at the same minute).
    triggers: [{ cron: 'TZ=UTC 0 4 * * 0' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    return await stepCtx.run('run-discovery', async () => {
      const { runDiscovery } = await import('@/services/architect/sessions/discovery');
      const response = await runDiscovery({
        input: {
          vertical_id: VERTICAL_ID,
          trigger: 'periodic',
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
  },
);
