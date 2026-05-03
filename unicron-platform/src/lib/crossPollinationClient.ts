// Cross-Pollination client (Phase 1 / Stream M5).
//
// Real-mode (default — Supabase anon SELECT against pathfinder.lead_cross_pollination):
// reads matches for a single lead or batch.
// Mock-mode (VITE_CROSS_POLL_API_ENABLED=false OR no Supabase env): returns
// fixtures.
//
// As of 2026-05-02, verify writes are NOT supported by Pathfinder schema
// (see operator-todo). The client therefore exposes only listMatches; the
// modal records "verified" decisions in unicron.agent_dispatches and skips
// any Pathfinder write.

import { getSupabase } from './supabase';
import type {
  CrossPollinationMatch,
  ListMatchesFilter,
} from './contracts/crossPollination';
import { crossPollinationMatchesMock } from '../data/mocks';

const SCHEMA = 'pathfinder';
const TABLE = 'lead_cross_pollination';

function realEnabled(): boolean {
  return import.meta.env.VITE_CROSS_POLL_API_ENABLED === 'true';
}

export async function listCrossPollinationMatches(
  filter: ListMatchesFilter = {},
): Promise<CrossPollinationMatch[]> {
  if (!realEnabled()) {
    await new Promise((r) => setTimeout(r, 200));
    let rows = [...crossPollinationMatchesMock];
    if (filter.lead_id) rows = rows.filter((m) => m.lead_id === filter.lead_id);
    if (filter.lead_ids && filter.lead_ids.length > 0)
      rows = rows.filter((m) => filter.lead_ids!.includes(m.lead_id));
    if (filter.customer_org_id)
      rows = rows.filter((m) => m.customer_org_id === filter.customer_org_id);
    if (typeof filter.min_confidence === 'number') {
      const min = filter.min_confidence;
      rows = rows.filter((m) => m.match_confidence >= min);
    }
    rows.sort((a, b) => b.match_confidence - a.match_confidence);
    if (filter.limit) rows = rows.slice(0, filter.limit);
    return rows;
  }

  const supabase = getSupabase();
  let query = supabase.schema(SCHEMA).from(TABLE).select('*').order('match_confidence', {
    ascending: false,
  });
  if (filter.lead_id) query = query.eq('lead_id', filter.lead_id);
  if (filter.lead_ids && filter.lead_ids.length > 0)
    query = query.in('lead_id', filter.lead_ids);
  if (filter.customer_org_id) query = query.eq('customer_org_id', filter.customer_org_id);
  if (typeof filter.min_confidence === 'number')
    query = query.gte('match_confidence', filter.min_confidence);
  if (filter.limit) query = query.limit(filter.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CrossPollinationMatch[];
}
