// app/api/leads/[projectId]/verifier/retry/route.ts — Demo Polish UX Gate 18D.
//
// POST kicks a deeper Verifier pass for a single lead and returns 202 +
// an eta hint. Server-side debounce guards against double-clicks: requests
// arriving within DEBOUNCE_WINDOW_MS of the row's verifier_last_attempt_at
// are accepted as no-ops (200 with debounced=true), they do NOT increment
// the attempt counter.
//
// GET returns the current verifier state for polling — the lead detail
// "Re-verifying..." UI hits this every 5s for up to 60s.

import { NextResponse, type NextRequest } from 'next/server';

import { inngest } from '@/lib/inngest/client';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const DEBOUNCE_WINDOW_MS = 60_000;
const DEEPER_PASS_ETA_SECONDS = 30;

interface VerifierStatusRow {
  verified: boolean | null;
  verifier_failure_reason: string | null;
  verifier_suggestions: string[] | null;
  verifier_attempt_count: number;
  verifier_last_attempt_at: string | null;
  verifier_notes: string | null;
}

async function loadStatus(projectId: string): Promise<VerifierStatusRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      'verified, verifier_failure_reason, verifier_suggestions, verifier_attempt_count, verifier_last_attempt_at, verifier_notes',
    )
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as VerifierStatusRow;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = decodeURIComponent(params.projectId ?? '');
  if (!projectId) {
    return NextResponse.json({ error: 'invalid_project_id' }, { status: 400 });
  }
  const status = await loadStatus(projectId);
  if (!status) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    verified: status.verified,
    failureReason: status.verifier_failure_reason,
    suggestions: status.verifier_suggestions ?? [],
    attemptCount: status.verifier_attempt_count,
    lastAttemptAt: status.verifier_last_attempt_at,
    notes: status.verifier_notes,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = decodeURIComponent(params.projectId ?? '');
  if (!projectId) {
    return NextResponse.json({ error: 'invalid_project_id' }, { status: 400 });
  }

  const status = await loadStatus(projectId);
  if (!status) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Debounce: if last attempt is within the window, treat as no-op so
  // double-clicks don't multiply the counter or fire duplicate events.
  if (status.verifier_last_attempt_at) {
    const lastMs = new Date(status.verifier_last_attempt_at).getTime();
    if (!Number.isNaN(lastMs) && Date.now() - lastMs < DEBOUNCE_WINDOW_MS) {
      return NextResponse.json(
        {
          ok: true,
          debounced: true,
          attemptCount: status.verifier_attempt_count,
          lastAttemptAt: status.verifier_last_attempt_at,
          etaSeconds: DEEPER_PASS_ETA_SECONDS,
        },
        { status: 200 },
      );
    }
  }

  const nextAttempt = (status.verifier_attempt_count ?? 0) + 1;
  const now = new Date().toISOString();

  const update = {
    verifier_attempt_count: nextAttempt,
    verifier_last_attempt_at: now,
  };
  const updateRes = await (
    supabaseAdmin().from('projects') as unknown as {
      update: (v: typeof update) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update(update)
    .eq('id', projectId);

  if (updateRes.error) {
    return NextResponse.json(
      { error: 'update_failed', detail: updateRes.error.message },
      { status: 500 },
    );
  }

  await inngest
    .send({
      name: 'pathfinder/verifier.retry.requested',
      data: {
        project_id: projectId,
        attempt_count: nextAttempt,
        requested_at: now,
      },
    })
    .catch(() => {
      // Best-effort: the row update already succeeded, so the polling UI
      // will still reflect a fresh attempt timestamp. Operator can retry
      // from the button if Inngest is degraded.
    });

  return NextResponse.json(
    {
      ok: true,
      debounced: false,
      attemptCount: nextAttempt,
      lastAttemptAt: now,
      etaSeconds: DEEPER_PASS_ETA_SECONDS,
    },
    { status: 202 },
  );
}
