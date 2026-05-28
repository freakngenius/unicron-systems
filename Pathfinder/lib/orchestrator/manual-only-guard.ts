// lib/orchestrator/manual-only-guard.ts
//
// Sprint Z1A — defense-in-depth guard for Pathfinder cron handlers that
// process the Zedcor org. Read once per request; if
// `pathfinder.organizations.config->>'manual_only'` is true, log
// `cron_skipped_manual_only` to agent_log and signal the caller to short-
// circuit with a 204.
//
// Layer 1 (Vercel cron entries) is already disabled in vercel.json at
// commit 92c9b5e — this guard exists so that re-enabling crons accidentally
// (or via a future operator who restores entries) does NOT produce
// uncontrolled Zedcor traffic. The Scheduled toggle UI flips this flag.

import { supabaseAdmin } from '@/lib/supabase';

export const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

export async function isManualOnly(orgId: string): Promise<boolean> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: { config: Record<string, unknown> | null } | null; error: unknown }>;
        };
      };
    };
  };
  const { data } = await admin.from('organizations').select('config').eq('id', orgId).single();
  return Boolean((data?.config as { manual_only?: boolean } | null)?.manual_only);
}

interface AgentLogInsert {
  agent_name: string;
  event_type: string;
  event_data: Record<string, unknown>;
  organization_id: string;
  runner: string;
  ts: string;
}

/**
 * If the org is in manual-only mode, write a `cron_skipped_manual_only`
 * event and return a 204 Response for the cron handler to return directly.
 * Otherwise return null (continue normal handler logic).
 *
 * Usage at the top of a cron route handler:
 *   const skip = await skipIfManualOnly('Pathfinder/app/api/cron/ingestor');
 *   if (skip) return skip;
 */
export async function skipIfManualOnly(handler: string, orgId: string = ZEDCOR_ORG_ID): Promise<Response | null> {
  if (!(await isManualOnly(orgId))) return null;
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => { insert: (row: AgentLogInsert) => Promise<{ error: unknown }> };
  };
  await admin.from('agent_log').insert({
    agent_name: 'cron-guard',
    event_type: 'cron_skipped_manual_only',
    event_data: { handler, org_id: orgId },
    organization_id: orgId,
    runner: 'cron',
    ts: new Date().toISOString(),
  });
  return new Response(null, { status: 204, headers: { 'X-Skipped': 'manual_only' } });
}
