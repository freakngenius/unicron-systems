// app/api/inngest/route.ts — Phase 1 G1 Task B1.
//
// Inngest serves its functions through this single endpoint. Inngest
// cloud (or the local Inngest dev server) calls this route to discover
// the function set and dispatch events into them.

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  qualifierRank,
  verifier,
  outreach,
  delivery,
  slackAlertOnVerified,
  architectTuningCron,
  architectDiscoveryCron,
} from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    qualifierRank,
    verifier,
    outreach,
    delivery,
    slackAlertOnVerified,
    architectTuningCron,
    architectDiscoveryCron,
  ],
});

export const dynamic = 'force-dynamic';
// Tuning sessions cap at 30 min per spec §9, but Inngest steps run
// independently — the serve() route only handles dispatch, not the
// session itself. 60s is enough for Inngest function discovery + step ack.
export const maxDuration = 60;
