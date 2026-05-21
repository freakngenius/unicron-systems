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
type AgentName =
  | 'slack-alerts'
  | 'cost-alert'
  | 'briefing'
  | 'ranker'
  | 'outreach'
  | 'connector-refresh';

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
  // Phase 2A completion (migration 20260511_phase2a_completion_org_id_rls.sql)
  // added NOT NULL on this column. Every agent_runs insert must supply it.
  // Platform-level heartbeats (cron telemetry without per-project context)
  // attribute to Zedcor as the canonical "platform" org — matches the
  // pre-migration backfill and preserves dashboard continuity.
  organization_id: string;
}

interface AgentRunUpdate {
  status: 'success' | 'failed' | 'empty_queue';
  completed_at: string;
  records_processed?: number;
  records_new?: number;
  error_message?: string | null;
}

// Cached Zedcor org id lookup. Used by every openAgentRun call as the
// fallback attribution when the caller doesn't pass an explicit
// organizationId. Module-scope cache because the value never changes.
let _platformOrgIdCache: string | null = null;
async function resolvePlatformOrgId(): Promise<string | null> {
  if (_platformOrgIdCache) return _platformOrgIdCache;
  try {
    const admin = supabaseAdmin();
    const res = await (
      admin.from('organizations') as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
          };
        };
      }
    )
      .select('id')
      .eq('slug', 'zedcor')
      .maybeSingle();
    _platformOrgIdCache = res.data?.id ?? null;
    return _platformOrgIdCache;
  } catch {
    return null;
  }
}

/** Test seam — clear the platform-org cache between vitest runs that
 *  swap the supabase client. Production code does not call this. */
export function __resetPlatformOrgIdCacheForTests(): void {
  _platformOrgIdCache = null;
}

/** Resolve the platform "default" organization_id (Zedcor) for telemetry
 *  inserts that have no per-project context — e.g. agent_log rows from
 *  empty-queue heartbeats. Module-cached after first call. Returns null
 *  when Zedcor is unresolvable; callers should tolerate that. */
export async function getPlatformOrgId(): Promise<string | null> {
  return resolvePlatformOrgId();
}

/** Insert a `running` agent_runs row. Returns the row id, or null if the
 *  insert failed — callers MUST tolerate null (fail-open contract).
 *  Pass `opts.organizationId` to attribute the run to a specific org; if
 *  omitted, the row is attributed to Zedcor (the canonical platform org). */
export async function openAgentRun(
  agentName: AgentName,
  opts?: { organizationId?: string | null },
): Promise<OpenedRun> {
  const startedAt = new Date();
  const orgId = opts?.organizationId ?? (await resolvePlatformOrgId());
  if (!orgId) {
    // No platform org id resolvable → fail-open with id=null. Without
    // an organization_id the insert would 23502 and we'd return null
    // anyway; skipping the round-trip is cheaper.
    return { id: null, startedAt };
  }
  const payload: AgentRunInsert = {
    agent_name: agentName,
    started_at: startedAt.toISOString(),
    completed_at: null,
    records_processed: 0,
    records_new: 0,
    status: 'running',
    error_message: null,
    organization_id: orgId,
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
