// lib/inngest/functions/org-created.ts — Phase 2E slice 2.
//
// Subscribes to `pathfinder/org.created`, emitted by POST /api/organizations
// after Architect Approve & Deploy persists a new org row. Flips
// pathfinder.organizations.status from 'setting_up' → 'first_run' so the
// Metacron Customer Detail badge reflects the on-demand activity.
//
// Slice 2 scope is the status flip only. The full on-demand adapter
// dispatch envisioned in Phase 2E SPEC §"On-demand first run" depends on
// Phase 2C slice 6 (source adapter registry) which hasn't shipped yet.
// Until that lands, the existing cron-based ingestor + ranker pipeline
// picks up the new org on its next cycle (ranker every 30 min, ingest
// every 4h).
//
// Spec: Company Docs/Metacron/SPEC - Phase 2E Onboarding Completion Loop.md.

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';

export const orgCreated = inngest.createFunction(
  {
    id: 'pathfinder-org-created',
    name: 'Org created — flip status to first_run (Phase 2E slice 2)',
    retries: 2,
    triggers: [{ event: 'pathfinder/org.created' }],
  },
  async ({ event, step }: { event: { data: { organization_id: string; slug: string } }; step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const { organization_id, slug } = event.data;

    // Idempotency guard — if the org's current status is anything other
    // than 'setting_up', skip the flip. Re-emits of the event must not
    // overwrite a later state (e.g., operator_viewed by the time the
    // event arrives).
    const result = await stepCtx.run('flip-status-to-first-run', async () => {
      const admin = supabaseAdmin();
      const { data: current, error: fetchErr } = await (
        admin.from('organizations') as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{
                data: { id: string; status: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        }
      )
        .select('id,status')
        .eq('id', organization_id)
        .maybeSingle();

      if (fetchErr) {
        throw new Error(`org-created: fetch failed: ${fetchErr.message}`);
      }
      if (!current) {
        throw new Error(`org-created: organization ${organization_id} not found`);
      }
      if (current.status !== 'setting_up') {
        return {
          skipped: true as const,
          reason: 'status_already_advanced',
          observed_status: current.status,
        };
      }

      const { error: updateErr } = await (
        admin.from('organizations') as unknown as {
          update: (v: { status: string; status_changed_at: string }) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .update({ status: 'first_run', status_changed_at: new Date().toISOString() })
        .eq('id', organization_id);

      if (updateErr) {
        throw new Error(`org-created: status update failed: ${updateErr.message}`);
      }

      return {
        skipped: false as const,
        previous_status: 'setting_up',
        new_status: 'first_run',
      };
    });

    return { organization_id, slug, ...result };
  },
);
