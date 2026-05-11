// lib/inngest/functions/check-ready-to-view-cron.ts — Phase 2E slice 2.
//
// Periodic Inngest cron that walks orgs in `first_run` or `ranking` state
// and transitions them based on verified-lead count per Phase 2E SPEC
// §"Threshold check":
//
//   verified_count >= 3  →  status = 'ready_to_view'
//   verified_count <  3  →  status = 'awaiting_threshold'
//
// Cron-driven (every 5 minutes) rather than event-driven because the
// existing ranker is a Vercel cron that doesn't emit per-org completion
// hooks. Phase 2C slice 2 made the ranker org-aware but kept the queue
// global; the threshold check pulls state from the database, not events.
//
// Emits `pathfinder/org.ranking_complete` on each transition for
// observability sinks.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2E Onboarding Completion Loop.md.

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';

const READY_TO_VIEW_THRESHOLD = 3;
const CHECKABLE_STATES = ['first_run', 'ranking'] as const;

interface OrgRow {
  id: string;
  slug: string;
  status: string;
}

export const checkReadyToViewCron = inngest.createFunction(
  {
    id: 'pathfinder-check-ready-to-view',
    name: 'Org status state machine — ready-to-view threshold (Phase 2E slice 2)',
    retries: 1,
    triggers: [{ cron: 'TZ=UTC */5 * * * *' }],
  },
  async ({ step }: { step: unknown }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
      sendEvent: (
        name: string,
        payload: { name: string; data: Record<string, unknown> },
      ) => Promise<unknown>;
    };

    const candidates = await stepCtx.run('list-checkable-orgs', async () => {
      const admin = supabaseAdmin();
      const { data, error } = await (
        admin.from('organizations') as unknown as {
          select: (cols: string) => {
            in: (col: string, vals: readonly string[]) => Promise<{
              data: OrgRow[] | null;
              error: { message: string } | null;
            }>;
          };
        }
      )
        .select('id,slug,status')
        .in('status', CHECKABLE_STATES);
      if (error) {
        throw new Error(`check-ready-to-view: list failed: ${error.message}`);
      }
      return (data ?? []) as OrgRow[];
    });

    const transitions: Array<{
      organization_id: string;
      slug: string;
      previous_status: string;
      next_status: 'ready_to_view' | 'awaiting_threshold';
      verified_count: number;
      total_count: number;
    }> = [];

    for (const org of candidates) {
      const counts = await stepCtx.run(`count-verified-${org.slug}`, async () => {
        const admin = supabaseAdmin();
        const verifiedRes = await (
          admin.from('projects') as unknown as {
            select: (cols: string, opts: { count: 'exact'; head: true }) => {
              eq: (col: string, val: string) => {
                eq: (col: string, val: boolean) => Promise<{
                  count: number | null;
                  error: { message: string } | null;
                }>;
              };
            };
          }
        )
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('verified', true);
        const totalRes = await (
          admin.from('projects') as unknown as {
            select: (cols: string, opts: { count: 'exact'; head: true }) => {
              eq: (col: string, val: string) => Promise<{
                count: number | null;
                error: { message: string } | null;
              }>;
            };
          }
        )
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);
        if (verifiedRes.error || totalRes.error) {
          throw new Error(
            `check-ready-to-view: count failed for ${org.slug}: ${verifiedRes.error?.message ?? totalRes.error?.message}`,
          );
        }
        return {
          verified: verifiedRes.count ?? 0,
          total: totalRes.count ?? 0,
        };
      });

      const next_status: 'ready_to_view' | 'awaiting_threshold' =
        counts.verified >= READY_TO_VIEW_THRESHOLD ? 'ready_to_view' : 'awaiting_threshold';

      if (next_status === org.status) continue; // no-op

      await stepCtx.run(`apply-transition-${org.slug}`, async () => {
        const admin = supabaseAdmin();
        const { error } = await (
          admin.from('organizations') as unknown as {
            update: (v: { status: string; status_changed_at: string }) => {
              eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
            };
          }
        )
          .update({ status: next_status, status_changed_at: new Date().toISOString() })
          .eq('id', org.id);
        if (error) {
          throw new Error(`check-ready-to-view: status update failed for ${org.slug}: ${error.message}`);
        }
      });

      await stepCtx.sendEvent(`ranking-complete-${org.slug}`, {
        name: 'pathfinder/org.ranking_complete',
        data: {
          organization_id: org.id,
          slug: org.slug,
          verified_count: counts.verified,
          total_count: counts.total,
          next_status,
          completed_at: new Date().toISOString(),
        },
      });

      transitions.push({
        organization_id: org.id,
        slug: org.slug,
        previous_status: org.status,
        next_status,
        verified_count: counts.verified,
        total_count: counts.total,
      });
    }

    return {
      checked_count: candidates.length,
      transition_count: transitions.length,
      transitions,
    };
  },
);
