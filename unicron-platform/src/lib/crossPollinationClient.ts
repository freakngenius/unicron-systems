// Cross-Pollination client (Phase 1 / Stream M5).
//
// Real-only: reads matches for a single lead or batch from
// pathfinder.lead_cross_pollination via Supabase anon SELECT. There is no
// mock fallback — empty results render an empty state in the modal.
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

const SCHEMA = 'pathfinder';
const TABLE = 'lead_cross_pollination';

export async function listCrossPollinationMatches(
  filter: ListMatchesFilter = {},
): Promise<CrossPollinationMatch[]> {
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
