// app/api/architect/tune/route.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4 (operator-on-demand tuning trigger).
//
// POST /api/architect/tune
// Auth: Bearer ARCHITECT_API_TOKEN (matches /decompose convention).
// Operators trigger a tuning run on demand (e.g., after a wave of bad
// outreach signals); the weekly Inngest cron handles the routine schedule.

import { NextResponse, type NextRequest } from 'next/server';
import { runTuning } from '@/services/architect/sessions/tuning';
import type { TuningInput } from '@/services/architect/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Tuning spec §9 wants 30 min; Vercel Pro plan caps at 800. Sessions
// that need longer must run via Inngest, not Vercel function.
export const maxDuration = 800;

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ARCHITECT_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'ARCHITECT_API_TOKEN not configured' };
    }
    return { ok: true };
  }
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const input: TuningInput = {
    vertical_id: typeof b.vertical_id === 'string' ? b.vertical_id : 'pathfinder-default',
    feedback_window_days:
      typeof b.feedback_window_days === 'number' && b.feedback_window_days > 0
        ? Math.min(b.feedback_window_days, 90)
        : 7,
    trigger: 'manual',
  };
  try {
    const response = await runTuning({ input });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[architect.tune] session failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
