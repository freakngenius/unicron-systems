// GET /api/atrium/agents/verify-cron-sync — Sprint 7.5 H1 Option 2
//
// Compares the deployed Inngest cron values (from generated-agent-cron.ts,
// which is regenerated on every Vercel build from nervous_system.agents) to
// the current DB value for the same agent. Returns:
//   { ok, matches: [{ function_id, expected, observed, match: boolean }], deploy_lag: bool, generated_at }
//
// "deploy_lag" is true if a save happened in DB but the redeploy hasn't
// completed yet, so GENERATED_AGENT_CRON still holds the previous value.
//
// We intentionally do NOT fetch /api/inngest at runtime — that endpoint is
// guarded by the Inngest signing key. The GENERATED_AGENT_CRON map IS what
// inngest.createFunction({cron: agentCron(...)}) consumes at module load, so
// it's authoritative for the deployed Inngest function definitions.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GENERATED_AGENT_CRON, GENERATED_AT } from '../../../lib/agents/generated-agent-cron.js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

// Map agent name → Inngest function id. Extend as more agents migrate to
// DB-driven cron registration. Today only Analyst's nightly cron is wired.
const AGENT_TO_FN_ID: Record<string, string> = {
  Analyst: 'analyst-nightly',
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    // 1. Fetch DB-side cron values
    const sb = getServiceClient();
    const { data: rows, error } = await sb.rpc('ns_list_agents');
    if (error) {
      res.status(500).json({ ok: false, error: `ns_list_agents: ${error.message}` });
      return;
    }
    const dbCron: Record<string, string | null> = {};
    for (const row of (rows ?? []) as Array<{ name?: string; schedule_cron?: string | null }>) {
      if (row.name) dbCron[row.name] = row.schedule_cron ?? null;
    }

    // 2. Compare per-agent: DB value (expected) vs deployed
    //    GENERATED_AGENT_CRON (observed). The map was baked from DB at the
    //    prebuild step of the currently-running deploy, so it's authoritative
    //    for what Inngest registered.
    const matches = Object.entries(AGENT_TO_FN_ID).map(([agentName, fnId]) => {
      const expected = dbCron[agentName] ?? null;
      const observed = GENERATED_AGENT_CRON[agentName] ?? null;
      return {
        agent_name: agentName,
        function_id: fnId,
        expected,
        observed,
        match: expected !== null && observed !== null && expected === observed,
      };
    });

    const deployLag = matches.some((m) => m.expected !== null && m.expected !== m.observed);

    res.status(200).json({
      ok: true,
      generated_at: GENERATED_AT,
      deploy_lag: deployLag,
      matches,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
