// scripts/backfill-llm-calls-session-link.ts — post-demo Gate 4.
//
// Best-effort backfill that retroactively populates llm_calls.session_id
// for rows recorded before the recorder threading was wired through.
// Strategy:
//
//   For each architect_sessions row:
//     - find llm_calls rows where session_id is currently null
//       AND created_at is between the session's started_at and
//       (completed_at + 30s slop)
//       AND agent_name matches the session's agent_role (when both set)
//     - update those rows to point at the session
//
// Idempotent: only touches null session_id rows; safe to re-run.
//
// Also re-finalizes existing sessions where total_cost_usd is 0 by
// re-summing llm_calls.cost_usd grouped by session_id, so the
// architect_sessions UI reflects the real spend.

import 'dotenv/config';

import { supabaseAdmin } from '@/lib/supabase';

interface SessionRow {
  id: string;
  agent_role: string | null;
  created_at: string;
  completed_at: string | null;
  total_cost_usd: number | null;
}

interface LlmCallRow {
  id: string;
  cost_usd: number | null;
  agent_name: string | null;
  created_at: string;
}

const SLOP_MS = 30_000;

async function loadSessions(admin: ReturnType<typeof supabaseAdmin>): Promise<SessionRow[]> {
  const res = await (
    admin.from('architect_sessions') as unknown as {
      select: (cols: string) => Promise<{
        data: SessionRow[] | null;
        error: { message: string } | null;
      }>;
    }
  ).select('id, agent_role, created_at, completed_at, total_cost_usd');
  if (res.error || !res.data) return [];
  return res.data;
}

async function loadCandidateCalls(
  admin: ReturnType<typeof supabaseAdmin>,
  fromIso: string,
  toIso: string,
  agentRole: string | null,
): Promise<LlmCallRow[]> {
  // Pull candidates within the time window where session_id is null. We
  // narrow further in JS because supabase-js .filter() has limited
  // composability for our shape.
  let q = (
    admin.from('llm_calls') as unknown as {
      select: (cols: string) => {
        is: (col: string, val: null) => {
          gte: (col: string, val: string) => {
            lte: (col: string, val: string) => Promise<{
              data: LlmCallRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .select('id, cost_usd, agent_name, created_at')
    .is('session_id', null)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  const res = await q;
  if (res.error || !res.data) return [];
  // Agent-name filter: when the session has an agent_role and the call
  // has an agent_name, require they match. Either-side null is treated
  // as "ambiguous, skip" to keep the link conservative.
  if (agentRole) {
    return res.data.filter((c) => c.agent_name === agentRole);
  }
  return res.data;
}

async function linkCalls(
  admin: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  callIds: string[],
): Promise<void> {
  if (callIds.length === 0) return;
  for (const id of callIds) {
    await (
      admin.from('llm_calls') as unknown as {
        update: (cols: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ session_id: sessionId })
      .eq('id', id);
  }
}

async function refinalize(
  admin: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
): Promise<{ cost: number; calls: number }> {
  const res = await (
    admin.from('llm_calls') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Array<{ cost_usd: number | null }> | null;
          error: { message: string } | null;
        }>;
      };
    }
  )
    .select('cost_usd')
    .eq('session_id', sessionId);
  const calls = res.data?.length ?? 0;
  const cost = (res.data ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  if (calls > 0) {
    await (
      admin.from('architect_sessions') as unknown as {
        update: (cols: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ total_cost_usd: cost, total_llm_calls: calls })
      .eq('id', sessionId);
  }
  return { cost, calls };
}

async function main(): Promise<void> {
  const admin = supabaseAdmin();
  const sessions = await loadSessions(admin);
  console.log(`[recorder-session-link] loaded ${sessions.length} sessions`);

  let totalLinked = 0;
  let totalRefinalized = 0;
  for (const s of sessions) {
    const fromIso = s.created_at;
    // Window end: completed_at + slop, or now if still running.
    const toBase = s.completed_at ?? new Date().toISOString();
    const toIso = new Date(Date.parse(toBase) + SLOP_MS).toISOString();
    const candidates = await loadCandidateCalls(admin, fromIso, toIso, s.agent_role);
    if (candidates.length > 0) {
      await linkCalls(admin, s.id, candidates.map((c) => c.id));
      totalLinked += candidates.length;
    }
    const after = await refinalize(admin, s.id);
    if (after.calls > 0 && (s.total_cost_usd == null || Number(s.total_cost_usd) === 0)) {
      totalRefinalized++;
    }
    if (candidates.length > 0 || after.calls > 0) {
      const agentLabel = (s.agent_role ?? '-').padEnd(20);
      console.log(
        `[recorder-session-link] ${s.id.slice(0, 8)} agent=${agentLabel}` +
          ` linked=${candidates.length} now=${after.calls}calls $${after.cost.toFixed(4)}`,
      );
    }
  }

  console.log('\n[recorder-session-link] DONE');
  console.log(`  sessions processed:          ${sessions.length}`);
  console.log(`  llm_calls newly linked:      ${totalLinked}`);
  console.log(`  sessions refinalized w/cost: ${totalRefinalized}`);
}

main().catch((err: unknown) => {
  console.error('[recorder-session-link] fatal', err);
  process.exit(1);
});
