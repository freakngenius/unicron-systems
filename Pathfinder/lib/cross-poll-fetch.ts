// Demo Polish UX Sprint — Gate 2.
//
// Server-side fetch + join for the dashboard's cross-pollination overlay.
// Reads `pathfinder.lead_cross_pollination` and joins each match's
// `customer_canonical` against `pathfinder.zedcor_customer_sites` (via the
// sites' `customer_name_normalized` column) to pick a representative
// lat/lon (active sites are preferred, with most-recently-updated as a
// tiebreak).
//
// The dashboard previously read the multi-tenant `projects.warm_for_customer_id`
// → `pathfinder.customers` lookup for its warm-intro overlay. That path
// stays in place for the 30 facility customers, but it never resolved
// against the Zedcor contractor cross-poll set (Brasfield & Gorrie, Big-D,
// etc.) because those names live in `pathfinder.zedcor_customer_sites`,
// not `pathfinder.customers`. Bridging via this helper keeps the two
// concept layers cleanly separated (Path B in the Gate 2 plan).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrossPollMatch, PathfinderDatabase } from '@/lib/types';

type SB = SupabaseClient<PathfinderDatabase, 'pathfinder'>;

interface RawCrossPollRow {
  lead_id: string;
  customer_org_id: string;
  customer_canonical: string;
  match_layer: string;
  match_confidence: number | string;
  primary_branch_name: string | null;
  active_site_count: number | null;
}

interface SiteRow {
  customer_name_normalized: string | null;
  parent_company_canonical: string | null;
  lat: number | string | null;
  lon: number | string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

/** Fetch every cross-pollination match in production and decorate each with
 * a representative customer lat/lon. The result is intended to be passed
 * down into the Dashboard for the cross-pollination filter + warm-intro
 * polyline overlay. Returns an empty array on Supabase error so the page
 * still renders (the cross-pollination toggle just becomes a no-op). */
export async function fetchCrossPollMatches(supabase: SB): Promise<CrossPollMatch[]> {
  // 1) All cross-poll rows. Production today has 12 rows (3 exact + 9 fuzzy);
  //    no pagination needed at this scale.
  const xpoll = await supabase
    .from('lead_cross_pollination')
    .select(
      'lead_id, customer_org_id, customer_canonical, match_layer, match_confidence, primary_branch_name, active_site_count',
    );
  if (xpoll.error || !xpoll.data) return [];
  const rows = xpoll.data as unknown as RawCrossPollRow[];
  if (rows.length === 0) return [];

  const canonicals = Array.from(new Set(rows.map((r) => r.customer_canonical))).filter(
    (n): n is string => typeof n === 'string' && n.length > 0,
  );
  if (canonicals.length === 0) return rows.map((r) => rawToMatch(r, null));

  // 2) Sites whose normalized OR parent canonical matches one of the
  //    cross-poll customer canonicals. We `or()` two `in()` filters so a
  //    site contributes if either column matches.
  const orFilter = [
    `customer_name_normalized.in.(${canonicals.map(quoteForOr).join(',')})`,
    `parent_company_canonical.in.(${canonicals.map(quoteForOr).join(',')})`,
  ].join(',');

  const sitesRes = await supabase
    .from('zedcor_customer_sites')
    .select(
      'customer_name_normalized, parent_company_canonical, lat, lon, is_active, updated_at',
    )
    .or(orFilter);

  const repByCanonical = new Map<string, { lat: number; lon: number }>();
  if (!sitesRes.error && Array.isArray(sitesRes.data)) {
    const sites = sitesRes.data as unknown as SiteRow[];
    // Active sites preferred; within active, most-recently-updated wins.
    // Inactive sites are kept as a fallback.
    const sorted = [...sites].sort((a, b) => {
      const activeA = a.is_active ? 1 : 0;
      const activeB = b.is_active ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    });
    for (const s of sorted) {
      const lat = numOrNull(s.lat);
      const lon = numOrNull(s.lon);
      if (lat == null || lon == null) continue;
      // A single site row can satisfy either column. Record under both so
      // a cross-poll row matched on canonical OR parent still finds a rep.
      const candidates = [s.customer_name_normalized, s.parent_company_canonical].filter(
        (k): k is string => typeof k === 'string' && k.length > 0,
      );
      for (const key of candidates) {
        if (!repByCanonical.has(key)) repByCanonical.set(key, { lat, lon });
      }
    }
  }

  return rows.map((r) => rawToMatch(r, repByCanonical.get(r.customer_canonical) ?? null));
}

function rawToMatch(
  r: RawCrossPollRow,
  rep: { lat: number; lon: number } | null,
): CrossPollMatch {
  const conf =
    typeof r.match_confidence === 'string'
      ? Number(r.match_confidence)
      : r.match_confidence;
  // Match layer is open-vocabulary in Postgres; clamp to the two values the
  // dashboard cares about so the line styling is deterministic. Anything
  // other than literal "exact" is treated as fuzzy (conservative — fuzzy
  // gets the dashed/lower-confidence line).
  const layer: 'exact' | 'fuzzy' = r.match_layer === 'exact' ? 'exact' : 'fuzzy';
  return {
    lead_id: r.lead_id,
    customer_org_id: r.customer_org_id,
    customer_canonical: r.customer_canonical,
    match_layer: layer,
    match_confidence: Number.isFinite(conf) ? conf : 0,
    primary_branch_name: r.primary_branch_name ?? null,
    active_site_count: r.active_site_count ?? 0,
    customer_lat: rep?.lat ?? null,
    customer_lon: rep?.lon ?? null,
  };
}

function numOrNull(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Wrap a string for inclusion in a PostgREST `or()` `in.(...)` list. The
 * built-in `.in('col', arr)` chain does its own quoting; for raw `or()` we
 * have to handle commas + double-quote our own values. */
function quoteForOr(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Build a per-lead map from a flat match list, picking the highest-
 * confidence match when a single project has multiple cross-poll rows.
 * Used by the Dashboard to translate `project.id` → match summary. */
export function indexMatchesByLead(matches: readonly CrossPollMatch[]): Map<string, CrossPollMatch> {
  const out = new Map<string, CrossPollMatch>();
  for (const m of matches) {
    const prev = out.get(m.lead_id);
    if (!prev || m.match_confidence > prev.match_confidence) {
      out.set(m.lead_id, m);
    }
  }
  return out;
}
