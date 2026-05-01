// lib/inngest/client.ts — Phase 1 G1 Task B1.
//
// Singleton Inngest client used by both function definitions and event
// emitters. The Pathfinder app is the publisher (cron handlers emit) and
// the consumer (Inngest serves the function endpoints at /api/inngest).
//
// Inngest v4 dropped the top-level EventSchemas export; per-function
// event typing now flows through explicit data shapes in the trigger
// config and via type assertions where strict typing is needed. Event
// names are still kept in `lib/inngest/events.ts` as the canonical
// contract for downstream subscribers.

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'pathfinder' });
