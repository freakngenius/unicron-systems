// Cross-pollination engine — Z-B feature #10.
//
// Spec: SPEC - Cross-Pollination Engine.md sections 3 + 4.
//
// Given a lead's entity-bearing fields (project_owner, prime_contractor,
// key_subs, parent_company), surface every Zedcor customer that already
// has a relationship with one of those entities. Three matching layers:
//   1. Exact (normalized) — confidence 1.0
//   2. Fuzzy (Levenshtein on normalized form, length-windowed) — confidence
//      scales with string similarity
//   3. Parent-company (canonical) — confidence 0.85
//
// Per matched customer the engine aggregates branch_count, active_site_count,
// most_recent_site_date, and primary_branch (the branch whose state matches
// the most-recent active site). Results are inserted into
// pathfinder.lead_cross_pollination unless `writeMatches: false` is passed
// (used by the eval runner to read against production without polluting it).

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCustomerName } from '@/lib/normalization/customer-name';
import type { PathfinderDatabase } from '@/lib/types';

type SupabaseAdminClient = SupabaseClient<PathfinderDatabase, 'pathfinder'>;

type MatchLayer = 'exact' | 'fuzzy' | 'parent_company';
type MatchedField = 'project_owner' | 'prime_contractor' | 'key_sub' | 'parent_company';

export interface CrossPollinationMatch {
  lead_id: string;
  customer_org_id: string;
  customer_canonical: string;
  match_layer: MatchLayer;
  match_confidence: number;
  primary_branch_id: string | null;
  primary_branch_name: string | null;
  branch_count: number;
  active_site_count: number;
  most_recent_site_date: string | null;
  national_account: boolean;
  matched_field: MatchedField;
  matched_value_raw: string;
}

interface CustomerSiteRow {
  customer_name_normalized: string;
  customer_name_raw: string | null;
  parent_company_canonical: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  is_active: boolean;
  ingested_at: string;
}

interface BranchRow {
  id: string;
  branch_name: string;
  state: string;
  lat: number | null;
  lon: number | null;
}

interface FindMatchesOpts {
  leadId: string;
  fields: {
    project_owner?: string | null;
    prime_contractor?: string | null;
    key_subs?: (string | null | undefined)[] | null;
    parent_company?: string | null;
  };
  supabase: SupabaseAdminClient;
  config?: {
    fuzzy_max_distance?: number;
    national_account_threshold?: number;
    customer_org_id?: string;
  };
  /** When false, skip the insert into lead_cross_pollination. Default true. */
  writeMatches?: boolean;
}

const DEFAULT_FUZZY_MAX_DISTANCE = 3;
const DEFAULT_NATIONAL_ACCOUNT_THRESHOLD = 5;
const DEFAULT_CUSTOMER_ORG_ID = 'zedcor';
const LENGTH_WINDOW_RATIO = 0.2; // ±20% (spec § 3.2 / § 5.1)
// Minimum string-similarity confidence we'll accept from the fuzzy layer.
// Spec § 5 calls out "ABC LLC" vs "ABC Holdings" as the canonical FP risk;
// at 3 vs 12 chars the length window already kicks them apart, but for
// short candidates (4-6 chars) a single-edit hit on an unrelated 5-char
// name (e.g., 'abcd' vs 'abcz') still passes the distance gate. Demanding
// at least 0.70 similarity rules those out without rejecting real typos
// like "Lenar" → "lennar" (0.83) or "Davidson Home" → "davidson homes"
// (0.93).
const MIN_FUZZY_CONFIDENCE = 0.7;
// Floor on candidate length before we'll attempt fuzzy matching at all.
// Below this, single edits are almost always coincidence (spec § 5.1
// length-window guard, applied at the candidate side).
const MIN_FUZZY_CANDIDATE_LEN = 5;

export async function findMatches(opts: FindMatchesOpts): Promise<CrossPollinationMatch[]> {
  const customerOrgId = opts.config?.customer_org_id ?? DEFAULT_CUSTOMER_ORG_ID;
  const fuzzyMax = opts.config?.fuzzy_max_distance ?? DEFAULT_FUZZY_MAX_DISTANCE;
  const nationalThreshold =
    opts.config?.national_account_threshold ?? DEFAULT_NATIONAL_ACCOUNT_THRESHOLD;
  const write = opts.writeMatches !== false;

  // 1. Build the candidate list — one entry per entity-bearing field.
  type Candidate = { raw: string; normalized: string; field: MatchedField };
  const candidates: Candidate[] = [];
  const push = (raw: string | null | undefined, field: MatchedField) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const normalized = normalizeCustomerName(trimmed);
    if (!normalized) return;
    candidates.push({ raw: trimmed, normalized, field });
  };
  push(opts.fields.project_owner, 'project_owner');
  push(opts.fields.prime_contractor, 'prime_contractor');
  for (const sub of opts.fields.key_subs ?? []) push(sub, 'key_sub');
  push(opts.fields.parent_company, 'parent_company');

  if (candidates.length === 0) return [];

  // 2. Load the customer-site corpus once per call. With ~1,855 rows this
  //    fits comfortably in memory and keeps per-lead latency under 50ms.
  //    Supabase REST defaults to a 1000-row page cap, so we paginate
  //    explicitly via .range() until we've drained the table.
  const PAGE = 1000;
  const sites: CustomerSiteRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: siteErr } = await opts.supabase
      .from('zedcor_customer_sites')
      .select(
        'customer_name_normalized, customer_name_raw, parent_company_canonical, state, lat, lon, is_active, ingested_at',
      )
      .eq('customer_org_id', customerOrgId)
      .range(offset, offset + PAGE - 1);
    if (siteErr) throw siteErr;
    const rows = (page ?? []) as unknown as CustomerSiteRow[];
    sites.push(...rows);
    if (rows.length < PAGE) break;
  }

  const { data: branchRows, error: branchErr } = await opts.supabase
    .from('zedcor_branches')
    .select('id, branch_name, state, lat, lon')
    .eq('customer_org_id', customerOrgId);
  if (branchErr) throw branchErr;
  const branches = (branchRows ?? []) as unknown as BranchRow[];

  // 3. Build indexes.
  //    - normalizedIndex: normalized name → array of sites
  //    - normalizedNames: deduped list of all normalized customer names
  //      (used as the fuzzy-match haystack)
  //    - parentIndex: parent_company_canonical → array of sites
  const normalizedIndex = new Map<string, CustomerSiteRow[]>();
  const parentIndex = new Map<string, CustomerSiteRow[]>();
  const normalizedNames = new Set<string>();
  for (const site of sites) {
    if (!site.customer_name_normalized) continue;
    normalizedNames.add(site.customer_name_normalized);
    const list = normalizedIndex.get(site.customer_name_normalized) ?? [];
    list.push(site);
    normalizedIndex.set(site.customer_name_normalized, list);
    if (site.parent_company_canonical) {
      const plist = parentIndex.get(site.parent_company_canonical) ?? [];
      plist.push(site);
      parentIndex.set(site.parent_company_canonical, plist);
    }
  }

  // 4. Run each candidate through the three layers in order. Stop at the
  //    first layer that hits per (candidate, customer) pair so we don't
  //    double-count the same customer at lower confidence.
  //    Track best (customer, candidate) pairs in a map keyed on customer
  //    normalized name; if multiple candidates from the same lead match the
  //    same customer (rare but possible), keep the highest-confidence match.
  const bestByCustomer = new Map<string, {
    customer_canonical: string;
    layer: MatchLayer;
    confidence: number;
    field: MatchedField;
    raw: string;
  }>();

  for (const cand of candidates) {
    // Layer 1: exact
    const exactHit = normalizedIndex.get(cand.normalized);
    if (exactHit && exactHit.length > 0) {
      consider(bestByCustomer, cand.normalized, {
        customer_canonical: cand.normalized,
        layer: 'exact',
        confidence: 1.0,
        field: cand.field,
        raw: cand.raw,
      });
      continue;
    }

    // Layer 2: fuzzy (length-windowed Levenshtein)
    const fuzzy = bestFuzzyMatch(cand.normalized, normalizedNames, fuzzyMax);
    if (fuzzy) {
      consider(bestByCustomer, fuzzy.name, {
        customer_canonical: fuzzy.name,
        layer: 'fuzzy',
        confidence: fuzzy.confidence,
        field: cand.field,
        raw: cand.raw,
      });
      continue;
    }

    // Layer 3: parent-company canonical
    //   The candidate's parent_company is supplied directly via fields when
    //   the field type is 'parent_company'. For owner/contractor candidates
    //   we don't have a side-channel parent — but we can still match if any
    //   customer's parent_company_canonical equals the candidate's
    //   normalized form (covers cases like lead "DR Horton" matching the
    //   parent canonical "dr horton" derived across many branch suffixes).
    const parentHit = parentIndex.get(cand.normalized);
    if (parentHit && parentHit.length > 0) {
      consider(bestByCustomer, cand.normalized, {
        customer_canonical: cand.normalized,
        layer: 'parent_company',
        confidence: 0.85,
        field: cand.field,
        raw: cand.raw,
      });
    }
  }

  if (bestByCustomer.size === 0) return [];

  // 5. Aggregate per matched customer: collect all sites for the matched
  //    customer (or all sites under the matched parent), then derive
  //    branch_count / active_site_count / most_recent_site_date /
  //    primary_branch.
  const branchesByState = new Map<string, BranchRow[]>();
  for (const b of branches) {
    const list = branchesByState.get(b.state) ?? [];
    list.push(b);
    branchesByState.set(b.state, list);
  }

  const matches: CrossPollinationMatch[] = [];
  for (const [customerKey, info] of bestByCustomer) {
    const matchingSites: CustomerSiteRow[] =
      info.layer === 'parent_company'
        ? parentIndex.get(customerKey) ?? []
        : normalizedIndex.get(customerKey) ?? [];

    const activeSites = matchingSites.filter((s) => s.is_active);
    if (activeSites.length === 0) continue; // matches with no active sites are noise

    const distinctStates = new Set<string>();
    for (const s of activeSites) {
      if (s.state) distinctStates.add(s.state);
    }

    const sortedByRecency = [...activeSites].sort((a, b) =>
      a.ingested_at < b.ingested_at ? 1 : -1,
    );
    const mostRecent = sortedByRecency[0];
    const primaryBranch = pickPrimaryBranch(mostRecent, branchesByState);

    matches.push({
      lead_id: opts.leadId,
      customer_org_id: customerOrgId,
      customer_canonical: customerKey,
      match_layer: info.layer,
      match_confidence: round2(info.confidence),
      primary_branch_id: primaryBranch?.id ?? null,
      primary_branch_name: primaryBranch?.branch_name ?? mostRecent?.state ?? null,
      branch_count: distinctStates.size,
      active_site_count: activeSites.length,
      most_recent_site_date: mostRecent ? mostRecent.ingested_at.slice(0, 10) : null,
      national_account: distinctStates.size >= nationalThreshold,
      matched_field: info.field,
      matched_value_raw: info.raw,
    });
  }

  // 6. Sort highest-confidence first — caller (UI / ranker) typically wants
  //    that ordering. Stable.
  matches.sort((a, b) => b.match_confidence - a.match_confidence);

  // 7. Persist if requested.
  if (write && matches.length > 0) {
    const { error: insertErr } = await opts.supabase
      .from('lead_cross_pollination')
      .insert(matches as unknown as never);
    if (insertErr) throw insertErr;
  }

  return matches;
}

function consider(
  best: Map<
    string,
    { customer_canonical: string; layer: MatchLayer; confidence: number; field: MatchedField; raw: string }
  >,
  customerKey: string,
  candidate: {
    customer_canonical: string;
    layer: MatchLayer;
    confidence: number;
    field: MatchedField;
    raw: string;
  },
): void {
  const prior = best.get(customerKey);
  if (!prior || candidate.confidence > prior.confidence) {
    best.set(customerKey, candidate);
  }
}

function pickPrimaryBranch(
  site: CustomerSiteRow | undefined,
  branchesByState: Map<string, BranchRow[]>,
): BranchRow | null {
  if (!site || !site.state) return null;
  const list = branchesByState.get(site.state);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  // Multiple branches in this state — pick nearest by lat/lon if site has
  // coords; otherwise return the first deterministically.
  if (site.lat == null || site.lon == null) return list[0];
  let nearest = list[0];
  let nearestDist = Infinity;
  for (const b of list) {
    if (b.lat == null || b.lon == null) continue;
    const d = squaredDistance(site.lat, site.lon, b.lat, b.lon);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = b;
    }
  }
  return nearest;
}

function squaredDistance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return dLat * dLat + dLon * dLon;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ----- Fuzzy matching -----------------------------------------------------

interface FuzzyHit {
  name: string;
  distance: number;
  confidence: number;
}

export function bestFuzzyMatch(
  candidate: string,
  haystack: Iterable<string>,
  maxDistance: number,
): FuzzyHit | null {
  if (!candidate) return null;
  if (candidate.length < MIN_FUZZY_CANDIDATE_LEN) return null;
  const minLen = Math.floor(candidate.length * (1 - LENGTH_WINDOW_RATIO));
  const maxLen = Math.ceil(candidate.length * (1 + LENGTH_WINDOW_RATIO));
  let best: FuzzyHit | null = null;
  for (const name of haystack) {
    if (!name || name === candidate) continue;
    if (name.length < minLen || name.length > maxLen) continue;
    const d = levenshtein(candidate, name, maxDistance);
    if (d > maxDistance) continue;
    const longer = Math.max(candidate.length, name.length);
    const confidence = longer === 0 ? 0 : 1 - d / longer;
    if (confidence < MIN_FUZZY_CONFIDENCE) continue;
    if (!best || d < best.distance) {
      best = { name, distance: d, confidence };
    }
  }
  return best;
}

// Classic two-row dynamic-programming Levenshtein with an early-exit cap.
// Returns the actual distance if it's <= cap, otherwise cap + 1.
export function levenshtein(a: string, b: string, cap: number = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;

  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= m; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}
