// GET /api/atrium/agents/verify-cron-sync — Sprint 7.5 H1 Option 2
//
// Fetches the deployed Inngest function manifest at /api/inngest and compares
// each cron-fired function's schedule against the live value in
// nervous_system.agents. Returns:
//   { ok, matches: [{ function_id, expected, observed, match: boolean }], deploy_lag: bool, generated_at }
//
// "deploy_lag" is true if the manifest's cron differs from the DB value —
// i.e. a save happened but the redeploy hasn't completed yet.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

interface InngestManifestFunction {
  id?: string;
  name?: string;
  triggers?: Array<{ cron?: string }>;
}

interface InngestManifest {
  functions?: InngestManifestFunction[];
}

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

    // 2. Fetch deployed Inngest manifest from the local serve endpoint
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = req.headers['host'] ?? 'atrium.unicron.systems';
    const manifestUrl = `${proto}://${host}/api/inngest`;
    const manifestResp = await fetch(manifestUrl, { headers: { Accept: 'application/json' } });
    if (!manifestResp.ok) {
      res.status(502).json({
        ok: false,
        error: `Failed to fetch ${manifestUrl}: HTTP ${manifestResp.status}`,
      });
      return;
    }
    const manifest = (await manifestResp.json()) as InngestManifest;
    const fnById: Record<string, InngestManifestFunction> = {};
    for (const fn of manifest.functions ?? []) {
      if (fn.id) fnById[fn.id] = fn;
    }

    // 3. Build per-agent compare result
    const matches = Object.entries(AGENT_TO_FN_ID).map(([agentName, fnId]) => {
      const expected = dbCron[agentName] ?? null;
      const observedCron = fnById[fnId]?.triggers?.find((t) => typeof t.cron === 'string')?.cron ?? null;
      return {
        agent_name: agentName,
        function_id: fnId,
        expected,
        observed: observedCron,
        match: expected !== null && observedCron !== null && expected === observedCron,
      };
    });

    const deployLag = matches.some((m) => m.expected !== null && m.expected !== m.observed);

    res.status(200).json({
      ok: true,
      manifest_url: manifestUrl,
      deploy_lag: deployLag,
      matches,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
