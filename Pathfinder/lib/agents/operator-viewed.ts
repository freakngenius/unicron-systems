// lib/agents/operator-viewed.ts — Phase 2E slice 4.
//
// First-render side-effect that flips an org's status from
// `ready_to_view` → `operator_viewed`. Invoked from
// `app/[slug]/page.tsx` after the org row is fetched. Side-effect only:
// the return value tells the caller whether a transition fired, but the
// rendered page does not change based on it (the badge component reads
// the next request's freshly-loaded status).
//
// Transition rule: ONLY ready_to_view → operator_viewed. Other states
// preserve their semantics:
//   setting_up      → operator visited before any pipeline activity
//   first_run       → operator visited mid-ingestion
//   ranking         → operator visited mid-ranking
//   awaiting_threshold → operator visited but data isn't ready yet
//   operator_viewed → already viewed; no-op
//
// Spec: Company Docs/Metacron/SPEC - Phase 2E Onboarding Completion Loop.md
//       §"Flow" step "status=operator_viewed (set on first /[slug]/ render)"
//
// Best-effort: a failed status update must NOT block the page render or
// fail the request. The threshold cron + future renders will reconcile.

import { supabaseAdmin } from '@/lib/supabase';

export interface FlipToOperatorViewedResult {
  flipped: boolean;
  previous_status?: string;
  reason?: 'already_viewed' | 'not_ready' | 'update_failed' | 'missing_org';
}

const TRANSITIONABLE_FROM = 'ready_to_view';
const TRANSITION_TO = 'operator_viewed';

// Pure helper exposed for unit testing. The page.tsx caller wraps this
// with the production Supabase admin client; tests pass their own.
export async function flipToOperatorViewed(
  orgId: string,
  currentStatus: string | null | undefined,
  client: ReturnType<typeof supabaseAdmin> = supabaseAdmin(),
): Promise<FlipToOperatorViewedResult> {
  if (!currentStatus) {
    return { flipped: false, reason: 'missing_org' };
  }
  if (currentStatus === TRANSITION_TO) {
    return { flipped: false, previous_status: currentStatus, reason: 'already_viewed' };
  }
  if (currentStatus !== TRANSITIONABLE_FROM) {
    return { flipped: false, previous_status: currentStatus, reason: 'not_ready' };
  }

  // Conditional UPDATE: include the previous-status guard in the WHERE
  // clause so a concurrent transition (e.g., threshold cron firing at
  // the same instant) doesn't double-flip or race past the operator
  // visit. PostgREST .eq chains the conditions.
  const update = await (
    client.from('organizations') as unknown as {
      update: (v: { status: string; status_changed_at: string }) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null; data: unknown }>;
        };
      };
    }
  )
    .update({ status: TRANSITION_TO, status_changed_at: new Date().toISOString() })
    .eq('id', orgId)
    .eq('status', TRANSITIONABLE_FROM);

  if (update.error) {
    return {
      flipped: false,
      previous_status: currentStatus,
      reason: 'update_failed',
    };
  }

  return {
    flipped: true,
    previous_status: TRANSITIONABLE_FROM,
  };
}
