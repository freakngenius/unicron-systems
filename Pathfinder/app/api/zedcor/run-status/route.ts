// app/api/zedcor/run-status/route.ts
// GET ?run_id=N — returns current step + percent for an in-flight run, or
// the summary for a completed run. Polled by Z1B's UI every 2 seconds.
//
// Sprint Z1A — shape matches Z1B's expectations exactly:
//   { run_id, finished, status, current_step, percent_complete, summary? }
// Z1B's UI reads `current_step` and `percent_complete` from the latest
// `step_progress` event_data (step_label + percent) and `summary` from
// the `orchestrator_run_summary` terminal event. The orchestrator at
// lib/orchestrator/orchestrator.ts emits both.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ZEDCOR_ORG_ID } from '@/lib/orchestrator/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgentRunRow = {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
};

type AgentLogRow = {
  event_type: string;
  event_data: Record<string, unknown> | null;
  ts: string;
};

const TERMINAL_STATUSES = new Set(['success', 'failed', 'partial_failure']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const runIdStr = req.nextUrl.searchParams.get('run_id');
  const runId = runIdStr ? Number.parseInt(runIdStr, 10) : NaN;
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json({ error: 'invalid run_id' }, { status: 400 });
  }

  // 1. Fetch run row, filtered to Zedcor for safety.
  const runAdmin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string | number) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: AgentRunRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const runRes = await runAdmin
    .from('agent_runs')
    .select('id, started_at, completed_at, status')
    .eq('id', runId)
    .eq('organization_id', ZEDCOR_ORG_ID)
    .maybeSingle();

  if (!runRes.data) {
    return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
  }

  const run = runRes.data;
  const finished = TERMINAL_STATUSES.has(run.status);

  // 2. Pull all log events for this run to derive step + percent (and summary if done).
  const logAdmin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: AgentLogRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const logRes = await logAdmin
    .from('agent_log')
    .select('event_type, event_data, ts')
    .eq('run_id', runId)
    .order('ts', { ascending: false });

  const logs = logRes.data ?? [];

  // current_step + percent — read from latest progress event with step_label.
  let currentStep = finished ? 'Completed' : 'Starting…';
  let percent = finished ? 100 : 0;
  for (const row of logs) {
    const ev = (row.event_data ?? {}) as { step_label?: string; percent?: number };
    if (ev.step_label) {
      currentStep = ev.step_label;
      if (typeof ev.percent === 'number') percent = ev.percent;
      break;
    }
  }

  // summary — read from the terminal event if present.
  let summary: Record<string, unknown> | null = null;
  if (finished) {
    for (const row of logs) {
      if (
        row.event_type === 'orchestrator_run_summary' ||
        row.event_type === 'orchestrator_run_summary_stub'
      ) {
        summary = row.event_data ?? null;
        break;
      }
    }
  }

  return NextResponse.json({
    run_id: run.id,
    finished,
    status: run.status,
    current_step: currentStep,
    percent_complete: Math.max(0, Math.min(100, percent)),
    summary,
  });
}
