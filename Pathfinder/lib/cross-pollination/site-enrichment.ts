// lib/cross-pollination/site-enrichment.ts
//
// Helper that fetches representative jobsite details for a set of matched
// customer canonicals, so the Outreach Drafter prompt can name a specific
// past project ("Marbella Ranch in Glendale, AZ") rather than a generic
// "active site in Phoenix." Both the cron drafter and the chat drafter
// consume this.
//
// Returns a Map keyed by lowercase customer canonical. Each value is an
// array of up to N most-recent active sites, with the un-canonicalized
// display name preserved so prose reads naturally.
//
// Schema reference (pathfinder.zedcor_customer_sites):
//   - customer_name_normalized matches lead_cross_pollination.customer_canonical
//   - parent_company_canonical matches the same when parent-company match layer
//   - customer_name_raw is the display name ("Big-D Construction")
//   - site_name is the specific jobsite ("Marbella Ranch - 7725 N El Mirage Rd, Glendale AZ 85307")
//   - city + state ground the location claim

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PathfinderDatabase } from '@/lib/types';

type Admin = SupabaseClient<PathfinderDatabase, 'pathfinder'>;

/** Representative jobsite the Drafter can name in the email opening. */
export interface RepresentativeSite {
  /** Raw site_name as stored. Drafter copies this verbatim; the trim
   *  to a clean prose token happens in the prompt block. */
  site_name: string;
  /** city + state, both optional. State is the postal code (e.g., "AZ"). */
  city: string | null;
  state: string | null;
  /** The un-canonicalized display name of the customer. We want the
   *  drafter to write "Big-D Construction", not "big-d construction".
   *  Pulled from the same row to guarantee they agree. */
  customer_name_raw: string;
}

/** Hard cap on sites fetched per customer canonical. Three keeps the
 *  prompt block compact while giving the model variety to pick from. */
const SITES_PER_CUSTOMER = 3;

/** Fetch representative active sites for each canonical, joining by
 *  `customer_name_normalized` first and falling back to
 *  `parent_company_canonical`. Returns a Map<canonical_lower, sites[]>.
 *  Canonicals not found return undefined (caller should treat as empty).
 *
 *  Defensive: if Supabase returns an error, returns an empty Map rather
 *  than throwing — the drafter still gets the customer-level fields and
 *  degrades gracefully to the existing generic warm-intro template. */
export async function fetchRepresentativeSites(
  admin: Admin,
  canonicals: string[],
): Promise<Map<string, RepresentativeSite[]>> {
  const out = new Map<string, RepresentativeSite[]>();
  if (canonicals.length === 0) return out;

  // De-dupe + lowercase before query
  const norm = Array.from(new Set(canonicals.map((c) => c.toLowerCase())));

  // We fetch all rows that match on either column, then bucket in JS.
  // The combined IN-list query is one round-trip; per-canonical fetches
  // would N+1 the drafter cycle.
  const { data, error } = await admin
    .from('zedcor_customer_sites')
    .select('customer_name_normalized, parent_company_canonical, customer_name_raw, site_name, city, state, ingested_at, is_active')
    .eq('is_active', true)
    .or(
      `customer_name_normalized.in.(${norm.map((c) => `"${c}"`).join(',')}),parent_company_canonical.in.(${norm.map((c) => `"${c}"`).join(',')})`,
    )
    .order('ingested_at', { ascending: false, nullsFirst: false });

  if (error || !data) return out;

  type Row = {
    customer_name_normalized: string | null;
    parent_company_canonical: string | null;
    customer_name_raw: string | null;
    site_name: string | null;
    city: string | null;
    state: string | null;
    ingested_at: string | null;
    is_active: boolean | null;
  };

  for (const r of (data as unknown as Row[])) {
    if (!r.site_name) continue;
    const site: RepresentativeSite = {
      site_name: r.site_name,
      city: r.city,
      state: r.state,
      customer_name_raw: r.customer_name_raw ?? r.customer_name_normalized ?? '',
    };
    // A row can match a canonical via either column; push into both
    // buckets if both match the requested canonicals.
    const buckets: string[] = [];
    if (r.customer_name_normalized && norm.includes(r.customer_name_normalized.toLowerCase())) {
      buckets.push(r.customer_name_normalized.toLowerCase());
    }
    if (
      r.parent_company_canonical &&
      norm.includes(r.parent_company_canonical.toLowerCase()) &&
      !buckets.includes(r.parent_company_canonical.toLowerCase())
    ) {
      buckets.push(r.parent_company_canonical.toLowerCase());
    }
    for (const key of buckets) {
      const cur = out.get(key) ?? [];
      if (cur.length < SITES_PER_CUSTOMER) {
        cur.push(site);
        out.set(key, cur);
      }
    }
  }
  return out;
}

/** Trim a site_name like "Marbella Ranch - 7725 N El Mirage Rd, Glendale
 *  AZ 85307" down to "Marbella Ranch" so the prompt block stays clean.
 *  The full string still goes into the prompt as a backup, but the
 *  trimmed form is what the example phrasing template references. */
export function shortSiteName(siteName: string): string {
  // Split on " - " (the address separator most rows use) and take the
  // first chunk. If there's no separator, trim before the first comma.
  const dashIdx = siteName.indexOf(' - ');
  if (dashIdx > 0) return siteName.slice(0, dashIdx).trim();
  const commaIdx = siteName.indexOf(',');
  if (commaIdx > 0) return siteName.slice(0, commaIdx).trim();
  return siteName.trim();
}
