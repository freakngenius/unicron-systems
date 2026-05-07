// api/inngest.ts — Sprint 2 Nervous System
// Inngest serve endpoint: registers unicron-platform functions with Inngest Cloud.
//   GET  /api/inngest → introspection (Inngest dashboard sync)
//   PUT  /api/inngest → sync (Inngest pushes function manifest to cloud)
//   POST /api/inngest → step execution (Inngest invokes a function step)
//
// Uses inngest/node (not inngest/next) because unicron-platform is Vite, not Next.js.
// bodyParser must be disabled so Inngest can read the raw request stream directly.

import { serve } from 'inngest/node';
import { inngest } from '../lib/inngest/client';
import {
  orchestratorRun,
  analystRun,
  elderRun,
  tabooKeeperRun,
} from '../lib/agents/inngest-fns';

// Disable Vercel's automatic JSON body parsing — inngest/node reads the raw stream.
export const config = { api: { bodyParser: false } };

export default serve({
  client: inngest,
  functions: [orchestratorRun, analystRun, elderRun, tabooKeeperRun],
});
