// lib/inngest/client.ts — Sprint 2 Nervous System
//
// Singleton Inngest client for unicron-platform server-side functions.
// Mirrors the pattern from Pathfinder/lib/inngest/client.ts; kept as a
// separate instance so the two apps can independently register their
// functions with Inngest Cloud without ID collision.

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'unicron-platform' });
