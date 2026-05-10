// GET /api/atrium/products/metacron
// Returns Metacron product health data for the Atrium Products tab.
//
// Queries (all via service-role key):
//  - nervous_system.agents → agent fleet overview
//  - pathfinder.architect_proposals → this week's proposals + aggregate counts
//
// Graceful fallback on missing tables.
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

interface AgentRow {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  active: boolean;
}

interface ProposalRow {
  id: string;
  type: string;
  headline: string;
  status: string;
  confidence: number;
  created_at: string;
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
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [agentsResult, proposalsWeekResult, proposalsPendingResult] = await Promise.allSettled([
    // nervous_system.agents fleet (via RPC — schema not in PostgREST whitelist)
    sb.rpc('ns_list_agents'),

    // Architect proposals this week
    sb
      .schema('pathfinder')
      .from('architect_proposals')
      .select('id, type, headline, status, confidence, created_at')
      .gte('created_at', sinceWeek)
      .order('created_at', { ascending: false })
      .limit(20),

    // Pending proposals count (all time)
    sb
      .schema('pathfinder')
      .from('architect_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  // ── Agents ────────────────────────────────────────────────────────────────
  const agents: AgentRow[] =
    agentsResult.status === 'fulfilled' && !agentsResult.value.error
      ? (agentsResult.value.data as AgentRow[]) ?? []
      : [];

  // ── Proposals this week ────────────────────────────────────────────────────
  const proposals_this_week: ProposalRow[] =
    proposalsWeekResult.status === 'fulfilled' && !proposalsWeekResult.value.error
      ? (proposalsWeekResult.value.data as ProposalRow[]) ?? []
      : [];

  const proposals_approved_week = proposals_this_week.filter((p) => p.status === 'approved').length;

  // ── Pending proposals count ────────────────────────────────────────────────
  const proposals_pending =
    proposalsPendingResult.status === 'fulfilled' && !proposalsPendingResult.value.error
      ? (proposalsPendingResult.value.count ?? 0)
      : 0;

  res.status(200).json({
    agents,
    proposals_this_week,
    proposals_pending,
    proposals_approved_week,
  });
}
