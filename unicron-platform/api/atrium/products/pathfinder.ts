// GET /api/atrium/products/pathfinder
// Returns Pathfinder product health data for the Atrium Products tab.
//
// Queries (all via service-role key):
//  - pathfinder.customers → tenant list
//  - pathfinder.agent_runs → last-24h summary per agent
//  - pathfinder.projects   → total count + high-score count
//  - pathfinder.lead_cross_pollination → signal count
//  - pathfinder.outreach_drafts → draft count
//
// Graceful fallback on any missing table: returns empty arrays / zero counts
// so the UI can render with stub data.
//
// Sprint 6 Stream B.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not configured');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key);
}

interface AgentRunRow {
  agent_name: string;
  status: string;
  started_at: string;
  records_processed: number | null;
  records_new: number | null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sb = getServiceClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run queries in parallel. Each is wrapped so a missing table returns safe fallback.
  const [tenantsResult, agentRunsResult, projectsResult, xpollResult, draftsResult] =
    await Promise.allSettled([
      // Tenants
      sb
        .schema('pathfinder')
        .from('customers')
        .select('id, name, monthly_value, customer_since')
        .order('name')
        .limit(50),

      // Agent runs — last 24h
      sb
        .schema('pathfinder')
        .from('agent_runs')
        .select('agent_name, status, started_at, records_processed, records_new')
        .gte('started_at', since24h)
        .order('started_at', { ascending: false })
        .limit(500),

      // Projects count + high score count (score >= 70)
      Promise.all([
        sb.schema('pathfinder').from('projects').select('id', { count: 'exact', head: true }),
        sb
          .schema('pathfinder')
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .gte('score', 70),
      ]),

      // Cross-pollination signals (last 7 days, matched_at column)
      sb
        .schema('pathfinder')
        .from('lead_cross_pollination')
        .select('id', { count: 'exact', head: true })
        .gte('matched_at', sinceWeek),

      // Outreach drafts
      sb
        .schema('pathfinder')
        .from('outreach_drafts')
        .select('id', { count: 'exact', head: true }),
    ]);

  // ── Tenants ────────────────────────────────────────────────────────────────
  type TenantRow = { id: string; name: string; monthly_value: number | null; customer_since: string | null };
  const tenants: TenantRow[] =
    tenantsResult.status === 'fulfilled' && !tenantsResult.value.error
      ? (tenantsResult.value.data as TenantRow[]) ?? []
      : [];

  // ── Agent runs — aggregate per agent ──────────────────────────────────────
  const rawRuns: AgentRunRow[] =
    agentRunsResult.status === 'fulfilled' && !agentRunsResult.value.error
      ? (agentRunsResult.value.data as AgentRunRow[]) ?? []
      : [];

  const agentMap = new Map<
    string,
    {
      agent_name: string;
      last_status: string;
      last_run_at: string;
      records_processed_24h: number;
      records_new_24h: number;
      run_count_24h: number;
    }
  >();

  for (const run of rawRuns) {
    const existing = agentMap.get(run.agent_name);
    if (!existing) {
      agentMap.set(run.agent_name, {
        agent_name: run.agent_name,
        last_status: run.status,
        last_run_at: run.started_at,
        records_processed_24h: run.records_processed ?? 0,
        records_new_24h: run.records_new ?? 0,
        run_count_24h: 1,
      });
    } else {
      existing.records_processed_24h += run.records_processed ?? 0;
      existing.records_new_24h += run.records_new ?? 0;
      existing.run_count_24h += 1;
      // Runs are ordered DESC by started_at — first encountered is most recent
    }
  }

  const agent_runs = [...agentMap.values()].sort((a, b) =>
    a.agent_name.localeCompare(b.agent_name),
  );

  // ── Project stats ──────────────────────────────────────────────────────────
  let total_projects = 0;
  let high_score_projects = 0;
  if (projectsResult.status === 'fulfilled') {
    const [totalRes, highRes] = projectsResult.value;
    total_projects = totalRes.count ?? 0;
    high_score_projects = highRes.count ?? 0;
  }

  // ── Cross-pollination signals ──────────────────────────────────────────────
  let cross_pollination_signals = 0;
  if (xpollResult.status === 'fulfilled' && !xpollResult.value.error) {
    cross_pollination_signals = xpollResult.value.count ?? 0;
  }

  // ── Outreach drafts ────────────────────────────────────────────────────────
  let outreach_drafts = 0;
  if (draftsResult.status === 'fulfilled' && !draftsResult.value.error) {
    outreach_drafts = draftsResult.value.count ?? 0;
  }

  res.status(200).json({
    tenants,
    agent_runs,
    total_projects,
    high_score_projects,
    cross_pollination_signals,
    outreach_drafts,
  });
}
