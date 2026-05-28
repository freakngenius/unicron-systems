// lib/adapters/zedcor/cross-pollination.ts
//
// Sprint Z4 — Cross-pollination engine for the pitch-metadata pipeline.
//
// Given a project's gc_name (populated by Z3.5's enrichment), find whether
// Zedcor already has a relationship with that GC via pathfinder.zedcor_customer_sites.
// Output a human-readable warm-intro string for the rep, plus a list of low-confidence
// matches that the rep can audit but that don't surface as warm intros.
//
// Spec: SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 1".
//
// Note: spec references "pathfinder.customers WHERE organization_id=<uuid>".
// Actual schema uses pathfinder.zedcor_customer_sites with customer_org_id='zedcor'
// (string slug, not UUID). This module honors the spec's intent against the
// real schema.
//
// Cloud-only. Pure logic apart from supabase reads.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCustomerName } from '@/lib/normalization/customer-name';

export interface CrossPollinationResult {
  cross_pollination: string;            // human-readable summary
  warm_intro_path: string | null;       // null when no warm intro
  matched_customer: string | null;      // canonical (normalized) name when matched ≥0.8
  confidence: number;                   // 0..1
  possible_cross_pollination: Array<{
    customer_canonical: string;
    confidence: number;
    branch_state: string | null;
  }>;
}

interface CustomerSiteRow {
  customer_name_normalized: string;
  customer_name_raw: string | null;
  parent_company_canonical: string | null;
  state: string | null;
  is_active: boolean;
}

interface BranchRow {
  id: string;
  branch_name: string;
  state: string;
}

const WARM_THRESHOLD = 0.8;
const POSSIBLE_THRESHOLD = 0.6;       // lower-bound for "possible" — below this it's not even noted
const MAX_POSSIBLE_RESULTS = 5;
const ZEDCOR_CUSTOMER_ORG = 'zedcor';

// ─────────────────────────────────────────────────────────────────────────
// Levenshtein + similarity
// ─────────────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function normalizedSubstringHit(target: string, candidate: string): boolean {
  // After normalization, a substring relation is a strong signal that's
  // independent of edit-distance (e.g., "acme construction" ⊃ "acme" with
  // similarity ≈0.27 — distance gate misses it but substring catches it).
  if (target.length < 4 || candidate.length < 4) return false;
  return target.includes(candidate) || candidate.includes(target);
}

// ─────────────────────────────────────────────────────────────────────────
// Branch lookup
// ─────────────────────────────────────────────────────────────────────────

function pickBranchForSite(site: CustomerSiteRow, branchesByState: Map<string, BranchRow[]>): BranchRow | null {
  if (!site.state) return null;
  const list = branchesByState.get(site.state);
  if (!list || list.length === 0) return null;
  return list[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export interface ResolveCrossPollinationOpts {
  gcName: string | null | undefined;
  supabase: SupabaseClient;
  customerOrgId?: string;
}

export async function resolveCrossPollination(
  opts: ResolveCrossPollinationOpts,
): Promise<CrossPollinationResult> {
  const customerOrgId = opts.customerOrgId ?? ZEDCOR_CUSTOMER_ORG;
  const gcNameRaw = (opts.gcName ?? '').trim();

  if (!gcNameRaw) {
    return {
      cross_pollination: 'No existing Zedcor relationship — cold outreach',
      warm_intro_path: null,
      matched_customer: null,
      confidence: 0,
      possible_cross_pollination: [],
    };
  }

  const gcNormalized = normalizeCustomerName(gcNameRaw);
  if (!gcNormalized) {
    return {
      cross_pollination: 'No existing Zedcor relationship — cold outreach',
      warm_intro_path: null,
      matched_customer: null,
      confidence: 0,
      possible_cross_pollination: [],
    };
  }

  // Page the customer-site corpus (~1855 rows in prod).
  const sites: CustomerSiteRow[] = [];
  const PAGE = 1000;
  const sb = opts.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          range: (lo: number, hi: number) => Promise<{ data: CustomerSiteRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('zedcor_customer_sites')
      .select('customer_name_normalized, customer_name_raw, parent_company_canonical, state, is_active')
      .eq('customer_org_id', customerOrgId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`zedcor_customer_sites read failed: ${error.message}`);
    const page = data ?? [];
    sites.push(...page);
    if (page.length < PAGE) break;
  }

  const sbBranch = opts.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: BranchRow[] | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: branchData, error: branchErr } = await sbBranch
    .from('zedcor_branches')
    .select('id, branch_name, state')
    .eq('customer_org_id', customerOrgId);
  if (branchErr) throw new Error(`zedcor_branches read failed: ${branchErr.message}`);
  const branches = branchData ?? [];
  const branchesByState = new Map<string, BranchRow[]>();
  for (const b of branches) {
    if (!b.state) continue;
    const list = branchesByState.get(b.state) ?? [];
    list.push(b);
    branchesByState.set(b.state, list);
  }

  // Score each unique customer.
  type ScoredCustomer = {
    canonical: string;
    confidence: number;
    representativeSite: CustomerSiteRow;
  };

  const scored = new Map<string, ScoredCustomer>();
  for (const site of sites) {
    if (!site.is_active) continue;
    const canonical = site.customer_name_normalized;
    if (!canonical) continue;

    // Combine distance similarity with substring-hit bonus + parent_company match.
    let conf = similarity(gcNormalized, canonical);
    if (normalizedSubstringHit(gcNormalized, canonical)) {
      conf = Math.max(conf, 0.85);
    }
    if (site.parent_company_canonical) {
      const parentConf = similarity(gcNormalized, site.parent_company_canonical);
      if (parentConf > conf) conf = parentConf;
      if (normalizedSubstringHit(gcNormalized, site.parent_company_canonical)) {
        conf = Math.max(conf, 0.85);
      }
    }

    const existing = scored.get(canonical);
    if (!existing || conf > existing.confidence) {
      scored.set(canonical, { canonical, confidence: conf, representativeSite: site });
    }
  }

  const ranked = Array.from(scored.values()).sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0] ?? null;
  const possibles = ranked
    .filter((r) => r.confidence >= POSSIBLE_THRESHOLD && r.confidence < WARM_THRESHOLD)
    .slice(0, MAX_POSSIBLE_RESULTS)
    .map((r) => ({
      customer_canonical: r.canonical,
      confidence: Math.round(r.confidence * 1000) / 1000,
      branch_state: r.representativeSite.state,
    }));

  if (!best || best.confidence < WARM_THRESHOLD) {
    return {
      cross_pollination: 'No existing Zedcor relationship — cold outreach',
      warm_intro_path: null,
      matched_customer: null,
      confidence: best?.confidence ?? 0,
      possible_cross_pollination: possibles,
    };
  }

  const matchedDisplay = best.representativeSite.customer_name_raw ?? best.canonical;
  const branch = pickBranchForSite(best.representativeSite, branchesByState);
  const branchLabel = branch?.branch_name ?? best.representativeSite.state ?? 'a Zedcor branch';

  const crossPollText = best.representativeSite.parent_company_canonical &&
    similarity(gcNormalized, best.representativeSite.parent_company_canonical) >= WARM_THRESHOLD
    ? `Parent company "${matchedDisplay}" is an existing Zedcor customer (${branchLabel}).`
    : `GC "${matchedDisplay}" is an existing Zedcor customer (${branchLabel}).`;

  const warmIntro = branch
    ? `${branch.branch_name} branch owns the ${matchedDisplay} account. Confirm rep ownership in the branch CRM before calling.`
    : `${matchedDisplay} is on file in ${best.representativeSite.state ?? 'an unmapped state'}. No branch mapping yet — check zedcor_branches for ownership before calling.`;

  return {
    cross_pollination: crossPollText,
    warm_intro_path: warmIntro,
    matched_customer: best.canonical,
    confidence: Math.round(best.confidence * 1000) / 1000,
    possible_cross_pollination: possibles,
  };
}

// Exported for unit testing.
export const __internal = { levenshtein, similarity, normalizedSubstringHit };

// ─────────────────────────────────────────────────────────────────────────
// Sprint Z8 — backfill re-evaluation (additive)
// ─────────────────────────────────────────────────────────────────────────
//
// scripts/backfill-cross-pollination.ts walks every in-window project after
// the Z8 customer import lands and re-runs the match against the now-
// populated zedcor_customer_sites corpus. Most projects already have a
// cross_pollination string from the Z4 pipeline — usually the "cold
// outreach" fallback computed before customers existed. `force` lets the
// backfill bypass the "already pitched" guard so those rows get re-scored
// against the new corpus.

export interface ReevaluateCrossPollinationOpts extends ResolveCrossPollinationOpts {
  /**
   * Existing cross_pollination value on the project, if any. Used to decide
   * whether the re-evaluation is a no-op (saves a Notion write).
   */
  existingCrossPollination?: string | null;
  /**
   * Existing matched_customer canonical, if any. Used as the diff key.
   */
  existingMatchedCustomer?: string | null;
  /**
   * When false (default), returns { changed: false } if the existing value
   * already reflects a confirmed warm intro. When true, always recomputes
   * and reports the diff. Z8's backfill passes true.
   */
  force?: boolean;
}

export interface ReevaluateResult extends CrossPollinationResult {
  /**
   * True when the re-evaluation produced a different cross_pollination
   * string or matched_customer than the existing value. Caller uses this
   * to decide whether to write to Notion + persist.
   */
  changed: boolean;
  /**
   * True when the new result surfaces a warm intro (confidence ≥ 0.8) that
   * the existing value did not. Used to count warm-intro flips for the
   * spec's §"Acceptance criterion 3".
   */
  warm_intro_gained: boolean;
}

/**
 * Re-evaluate cross-pollination for a project, comparing against the
 * existing stored value. Pure additive wrapper around resolveCrossPollination
 * — adds the diff-keyed change detection that Z8's backfill needs.
 *
 * Honors `force`:
 *   - force=false (default): if existing value is already a warm intro
 *     (i.e., not "No existing Zedcor relationship — cold outreach"), skip
 *     the supabase reads and return { changed: false }.
 *   - force=true: always recompute, always diff. Z8's backfill passes true.
 */
export async function reevaluateCrossPollination(
  opts: ReevaluateCrossPollinationOpts,
): Promise<ReevaluateResult> {
  const existing = (opts.existingCrossPollination ?? '').trim();
  const existingIsWarm = existing.length > 0 &&
    !existing.startsWith('No existing Zedcor relationship');

  if (!opts.force && existingIsWarm) {
    return {
      cross_pollination: existing,
      warm_intro_path: null,
      matched_customer: opts.existingMatchedCustomer ?? null,
      confidence: 1,
      possible_cross_pollination: [],
      changed: false,
      warm_intro_gained: false,
    };
  }

  const fresh = await resolveCrossPollination({
    gcName: opts.gcName,
    supabase: opts.supabase,
    customerOrgId: opts.customerOrgId,
  });

  const changed = fresh.cross_pollination !== existing ||
    (fresh.matched_customer ?? null) !== (opts.existingMatchedCustomer ?? null);

  const freshIsWarm = fresh.confidence >= WARM_THRESHOLD &&
    fresh.matched_customer !== null;
  const warm_intro_gained = freshIsWarm && !existingIsWarm;

  return {
    ...fresh,
    changed,
    warm_intro_gained,
  };
}
