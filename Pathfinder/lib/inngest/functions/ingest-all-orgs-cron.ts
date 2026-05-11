// lib/inngest/functions/ingest-all-orgs-cron.ts — Phase 2C slice 1.
//
// Per-org ingest dispatch cron. Lists active orgs from
// pathfinder.organizations and emits one `pathfinder/org.ingest_requested`
// event per org. Subscribers (slice 2: ranker dispatcher) pick the work
// up; slice 1 only emits.
//
// The cron runs every 4 hours, off-cycle from the existing
// architect/verifier/coverage crons to avoid traffic spikes.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md.
//
// Halt boundary note: this function does NOT load the architecture for
// each org during dispatch. Subscribers call loadOrgArchitecture
// themselves so the dispatch event stays small (no jsonb payloads in the
// Inngest event stream) and so per-org failures are isolated to each
// subscriber step.

import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '../client';

interface ActiveOrgRow {
  id: string;
  slug: string;
}

export const ingestAllOrgsCron = inngest.createFunction(
  {
    id: 'pathfinder-ingest-all-orgs',
    name: 'Per-org ingest dispatch (Phase 2C slice 1)',
    retries: 1,
    triggers: [{ cron: 'TZ=UTC 0 */4 * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
      sendEvent: (
        name: string,
        payload: { name: string; data: Record<string, unknown> },
      ) => Promise<unknown>;
    };

    const orgs = await stepCtx.run('list-active-orgs', async () => {
      const client = supabaseAdmin();
      const { data, error } = await client
        .from('organizations')
        .select('id,slug');
      if (error) {
        throw new Error(`ingest-all-orgs: list failed: ${error.message}`);
      }
      return (data ?? []) as ActiveOrgRow[];
    });

    const requestedAt = new Date().toISOString();
    const dispatched: string[] = [];
    for (const org of orgs) {
      await stepCtx.sendEvent(`dispatch-${org.slug}`, {
        name: 'pathfinder/org.ingest_requested',
        data: {
          organization_id: org.id,
          slug: org.slug,
          trigger: 'cron',
          requested_at: requestedAt,
        },
      });
      dispatched.push(org.slug);
    }

    return {
      dispatched_count: dispatched.length,
      slugs: dispatched,
      requested_at: requestedAt,
    };
  },
);
