// app/api/zedcor/recent-runs/route.ts
// GET — returns the last 20 manual runs for the Zedcor org plus the current
// scheduled-toggle state. One round-trip on page mount.
//
// Summary lives in agent_runs.run_metadata jsonb (no separate agent_log join
// needed in the live schema). Filter: runner='manual' AND organization_id=ZEDCOR.

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
  run_metadata: Record<string, unknown> | null;
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

  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: AgentRunRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };

  let runs: AgentRunRow[] = [];
  try {
    const res = await admin
      .from('agent_runs')
      .select('id, started_at, completed_at, status, runner, run_metadata')
      .eq('organization_id', ZEDCOR_ORG_ID)
      .eq('runner', 'manual')
      .order('started_at', { ascending: false })
      .limit(20);
    runs = res.data ?? [];
  } catch {
    runs = [];
  }

  // Current toggle state from organizations.config.
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
    manualOnly = cfg.manual_only !== false;
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
      const meta = (r.run_metadata ?? {}) as { source?: string; summary?: RunSummary };
      const summary = meta.summary ?? null;
      const startedMs = new Date(r.started_at).getTime();
      const completedMs = r.completed_at ? new Date(r.completed_at).getTime() : null;
      const duration_ms = completedMs != null ? completedMs - startedMs : null;
      return {
        run_id: r.id,
        started_at: r.started_at,
        completed_at: r.completed_at,
        status: r.status,
        runner: r.runner ?? 'manual',
        summary,
        duration_ms,
        source: meta.source ?? null,
      };
    }),
  });
}
