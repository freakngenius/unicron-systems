// app/api/zedcor/recent-runs/route.ts
// GET — returns the last 20 manual runs for the Zedcor org, plus the
// current scheduled-toggle state. Bundles two reads so the page mount is
// one round-trip.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOperatorIdentity, operatorDenied } from '@/lib/auth/require-operator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

type AgentRunRow = {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  runner: string | null;
};

type AgentLogRow = {
  event_type: string;
  event_data: Record<string, unknown> | null;
  run_id: number | null;
};

type RunSummary = {
  sources_polled?: number;
  sources_hit?: number;
  sources_empty?: number;
  sources_failed?: number;
  projects_inserted?: number;
  projects_deduped?: number;
  notion_writes?: number;
  notion_dedupes?: number;
};

export async function GET() {
  const auth = await getOperatorIdentity();
  if (!auth.ok) return operatorDenied(auth);

  // Use untyped casts — Z1A's migration adds `runner`, `organization_id`,
  // `hub_id` to agent_runs and `run_id`, `organization_id` to agent_log;
  // those columns aren't in PathfinderDatabase types yet.
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: AgentRunRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };

  // 1. Recent runs.
  let runs: AgentRunRow[] = [];
  let runsErr: { message: string } | null = null;
  try {
    const res = await admin
      .from('agent_runs')
      .select('id, started_at, completed_at, status, runner')
      .eq('organization_id', ZEDCOR_ORG_ID)
      .in('runner', ['manual', 'manual-stub'])
      .order('started_at', { ascending: false })
      .limit(20);
    runs = res.data ?? [];
    runsErr = res.error;
  } catch (e) {
    runsErr = { message: e instanceof Error ? e.message : String(e) };
  }

  // If the query fails (Z1A migration not yet landed), treat as empty —
  // the UI shows the "No runs yet" placeholder.
  if (runsErr) {
    runs = [];
  }

  // 2. Pull matching log summaries by run_id (one IN-clause).
  const summaryByRunId = new Map<number, RunSummary>();
  if (runs.length > 0) {
    try {
      const ids = runs.map((r) => r.id);
      const logAdmin = supabaseAdmin() as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            in: (col: string, vals: number[]) => {
              in: (col: string, evs: string[]) => Promise<{
                data: AgentLogRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
      const logRes = await logAdmin
        .from('agent_log')
        .select('event_type, event_data, run_id')
        .in('run_id', ids)
        .in('event_type', ['orchestrator_run_summary', 'orchestrator_run_summary_stub']);
      for (const row of logRes.data ?? []) {
        if (row.run_id == null) continue;
        const ev = (row.event_data ?? {}) as RunSummary & Record<string, unknown>;
        summaryByRunId.set(row.run_id, {
          sources_polled: ev.sources_polled,
          sources_hit: ev.sources_hit,
          sources_empty: ev.sources_empty,
          sources_failed: ev.sources_failed,
          projects_inserted: ev.projects_inserted,
          projects_deduped: ev.projects_deduped,
          notion_writes: ev.notion_writes,
          notion_dedupes: ev.notion_dedupes,
        });
      }
    } catch {
      // Log query failed — leave map empty, individual rows render with summary=null.
    }
  }

  // 3. Current toggle state from organizations.config.
  let scheduledEnabled = false;
  let manualOnly = true;
  try {
    const orgAdmin = supabaseAdmin() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { config: Record<string, unknown> | null } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const orgRes = await orgAdmin
      .from('organizations')
      .select('config')
      .eq('id', ZEDCOR_ORG_ID)
      .maybeSingle();
    const cfg = (orgRes.data?.config ?? {}) as { manual_only?: boolean };
    manualOnly = cfg.manual_only !== false; // default to true if missing
    scheduledEnabled = !manualOnly;
  } catch {
    manualOnly = true;
    scheduledEnabled = false;
  }

  return NextResponse.json({
    current_state: {
      manual_only: manualOnly,
      scheduled_enabled: scheduledEnabled,
    },
    runs: runs.map((r) => {
      const startedMs = new Date(r.started_at).getTime();
      const completedMs = r.completed_at ? new Date(r.completed_at).getTime() : null;
      const duration_ms = completedMs != null ? completedMs - startedMs : null;
      return {
        run_id: r.id,
        started_at: r.started_at,
        completed_at: r.completed_at,
        status: r.status,
        runner: r.runner ?? 'unknown',
        summary: summaryByRunId.get(r.id) ?? null,
        duration_ms,
      };
    }),
  });
}
