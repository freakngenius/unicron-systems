// lib/agent-runs.ts — small fail-open helpers for the cron telemetry contract.
//
// Phase-1-G2 added pathfinder.agent_runs as the canonical observability
// surface. Producer crons (ranker, verifier, ingestor, outreach) inline
// their own insert+update calls because they need fine-grained queue/
// budget bookkeeping inside the row. The notification crons (slack-alerts,
// cost-alert, briefing) don't have queue semantics — they just need to
// announce "I ran" so dashboards can confirm the schedule is firing.
//
// These helpers are intentionally fail-open: if the agent_runs write
// fails (e.g. RLS regression, transient connectivity), the cron still
// delivers its primary side-effect rather than 500ing because telemetry
// hiccupped. The handlers that need stricter coupling continue to inline.

import { supabaseAdmin } from './supabase';

// `ranker` and `outreach` use the helper for their empty-queue heartbeat
// path (Z-D #26); their main success/failure path still inlines the insert
// because they need fine-grained queue/budget bookkeeping in the row.
type AgentName = 'slack-alerts' | 'cost-alert' | 'briefing' | 'ranker' | 'outreach';

interface OpenedRun {
  id: number | null;
  startedAt: Date;
}

interface AgentRunInsert {
  agent_name: AgentName;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_new: number;
  status: 'running' | 'success' | 'failed' | 'empty_queue';
  error_message: string | null;
}

interface AgentRunUpdate {
  status: 'success' | 'failed' | 'empty_queue';
  completed_at: string;
  records_processed?: number;
  records_new?: number;
  error_message?: string | null;
}

/** Insert a `running` agent_runs row. Returns the row id, or null if the
 *  insert failed — callers MUST tolerate null (fail-open contract). */
export async function openAgentRun(agentName: AgentName): Promise<OpenedRun> {
  const startedAt = new Date();
  const payload: AgentRunInsert = {
    agent_name: agentName,
    started_at: startedAt.toISOString(),
    completed_at: null,
    records_processed: 0,
    records_new: 0,
    status: 'running',
    error_message: null,
  };
  try {
    const admin = supabaseAdmin();
    const res = await (
      admin.from('agent_runs') as unknown as {
        insert: (rows: AgentRunInsert) => {
          select: (cols: string) => {
            maybeSingle: () => Promise<{
              data: { id: number } | null;
              error: { message: string } | null;
            }>;
          };
        };
      }
    )
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (res.error || !res.data) return { id: null, startedAt };
    return { id: res.data.id, startedAt };
  } catch {
    return { id: null, startedAt };
  }
}

/** Close a previously-opened agent_runs row. No-op when id is null. */
export async function closeAgentRun(
  run: OpenedRun,
  patch: Omit<AgentRunUpdate, 'completed_at'>,
): Promise<void> {
  if (run.id == null) return;
  const update: AgentRunUpdate = {
    completed_at: new Date().toISOString(),
    ...patch,
  };
  try {
    const admin = supabaseAdmin();
    await (
      admin.from('agent_runs') as unknown as {
        update: (v: AgentRunUpdate) => {
          eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update(update)
      .eq('id', run.id);
  } catch {
    // fail-open
  }
}
