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
  sourceOnboarder,
} from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [qualifierRank, verifier, outreach, delivery, slackAlertOnVerified, sourceOnboarder],
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
