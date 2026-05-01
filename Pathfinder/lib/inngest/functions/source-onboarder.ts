// lib/inngest/functions/source-onboarder.ts — Phase 2 Stream E.
//
// Subscribes: pathfinder/source.onboard.requested
// Wraps services/source-onboarder/agent.ts in Inngest's retry + observability
// envelope. Coordinates with Stream A on function-name uniqueness:
// pathfinder-source-onboarder.

import { inngest } from '../client';
import { runSourceOnboarder } from '@/services/source-onboarder/agent';
import type { SourceOnboarderInput } from '@/services/source-onboarder/types';

interface OnboardRequestedEvent {
  data: SourceOnboarderInput & { request_id?: string };
}

export const sourceOnboarder = inngest.createFunction(
  {
    id: 'pathfinder-source-onboarder',
    name: 'Source Onboarder (Phase 2 Stream E)',
    retries: 1,
    concurrency: { limit: 5 },
    triggers: [{ event: 'pathfinder/source.onboard.requested' }],
  },
  async ({ event, step }: { event: OnboardRequestedEvent; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    return stepCtx.run('onboard', async () => runSourceOnboarder({ inputs: event.data }));
  },
);
