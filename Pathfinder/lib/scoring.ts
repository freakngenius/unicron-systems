// lib/scoring.ts — pure-function scoring kernel.
//
// IMPORTANT: this module has ZERO runtime dependencies. No `fetch`, no Supabase,
// no Anthropic, no Node-only APIs. The only allowed import is `@/lib/types`,
// which is type-only and erased at compile time.
//
// Reason: in Phase 2 this exact file is transplanted into a Docker container
// running on Zedcor's L4 GPUs (Llama-3.1-8B for entity matching, this kernel
// for the deterministic geographic + stage + customer-adjacency score).
// Anything that reaches out to the cloud at runtime breaks that transplant.
//
// The `scoring-purity` test asserts no forbidden imports at runtime; the
// ESLint `no-restricted-imports` override on this file enforces it at
// authoring time. Both gates exist on purpose — don't remove either.
//
// Score formula (composite, 0–100):
//   composite = round(0.5 * geo + 0.3 * stage + 0.2 * customer)
//
// Geo score (0–100, Gate 17D — full-marks zone widened from 50 → 100mi):
//   100 if dist < 100mi from nearest branch
//   linear decay 100 → 0 across (100mi → coverage_radius_miles)
//   0   if dist >= coverage_radius_miles
//
// Stage score (0–100, Gate 17D — boosted PRE / PLN / NWS / default to lift
// medium-stage leads into the 30–50 score band, RFP unchanged):
//   RFP → 90 · PRE → 85 · PLN → 60 · NWS → 40 · default → 55
//
// Customer score (0–100):
//   100 if a customer is within 10mi of the project
//   linear decay 100 → 0 across (10mi → 50mi)
//   0   if no customer within 50mi
//
// Gate 17D rationale: pre-Gate-17D the ranker only landed 39 of 710 scored
// projects ≥50, leaving the demo's 30–50 band sparse. Two levers:
//   (a) widen the geo full-marks zone from 50 → 100mi so projects 50–100mi
//       from a branch (a meaningful share of metro-region work) keep their
//       full geo=100 instead of decaying;
//   (b) boost PRE / PLN / NWS / default stage scores so non-RFP leads land
//       in the actionable band. PRE is boosted most (75 → 85) because the
//       pre-bid stage is where Zedcor can still influence scope.
// RFP stays at 90 so the Houston flagship (TxDOT I-45, RFP near a branch
// with customer adjacency) lands at composite ≥95 — the regression guard.
//
// Warm-intro signal:
//   if the best-match customer (within 50mi) is served by a DIFFERENT branch
//   than the project's nearest branch, return that customer's id from
//   findWarmIntro. This is the cross-pollination opportunity.

import type { Branch, Customer, Project } from '@/lib/types';

// ---------- Public types ----------

export interface ScoringInput {
  project: Pick<Project, 'lat' | 'lon' | 'project_value' | 'project_stage'>;
  branches: Pick<Branch, 'id' | 'lat' | 'lon' | 'coverage_radius_miles'>[];
  customers: Pick<Customer, 'id' | 'lat' | 'lon' | 'served_by_branch_id'>[];
}

export interface ScoringOutput {
  nearest_branch_id: string;
  distance_miles: number;
  in_coverage: boolean;
  warm_for_customer_id: string | null;
  geo_score: number;
  stage_score: number;
  customer_score: number;
  composite_score: number;
}

// ---------- Constants ----------

const EARTH_RADIUS_MILES = 3958.7613;

// Gate 17D — stage scores rebalanced. RFP unchanged (top); PRE / PLN /
// NWS / default boosted so non-RFP leads land in the demo-actionable
// band. See header comment for rationale.
const STAGE_SCORES: Record<string, number> = {
  RFP: 90,
  PRE: 85,
  PLN: 60,
  NWS: 40,
};
const STAGE_DEFAULT = 55;

// Gate 17D — full-marks zone widened from 50 → 100mi. Projects 50–100mi
// from a branch (large share of metro-region work) keep geo=100 instead
// of decaying through the linear ramp, lifting their composite by
// 0.5 × (100 − previousGeo) points.
const NEAR_GEO_MILES = 100;     // full marks within this radius
const NEAR_CUSTOMER_MILES = 10; // full marks for customer adjacency
const FAR_CUSTOMER_MILES = 50;  // zero customer score beyond this

/**
 * Tolerance window the Verifier uses when comparing the Ranker's stored
 * score to a deterministic recomputation. |delta| <= SCORE_TOLERANCE passes
 * the score-sensibility check; anything outside fails. Lives here so the
 * Verifier and the Ranker reference one source of truth (referenced by
 * `prompts/computer-verifier.md` Check 3).
 */
export const SCORE_TOLERANCE = 15;

// ---------- Distance ----------

/** Great-circle distance between two lat/lon pairs, in statute miles. */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// ---------- Branch matching ----------

interface BranchMatch {
  branch_id: string;
  distance_miles: number;
}

/** Pick the closest branch to a project. Returns the branch id and the
 * great-circle distance in miles. Pure function — caller decides whether
 * the result lands inside that branch's coverage radius. */
export function nearestBranch(
  project: { lat: number | null | undefined; lon: number | null | undefined },
  branches: Pick<Branch, 'id' | 'lat' | 'lon'>[],
): BranchMatch {
  if (branches.length === 0) {
    throw new Error('nearestBranch: branches array is empty');
  }
  if (project.lat == null || project.lon == null) {
    throw new Error('nearestBranch: project requires lat and lon');
  }
  let bestId = branches[0].id;
  let bestDist = haversineMiles(project.lat, project.lon, branches[0].lat, branches[0].lon);
  for (let i = 1; i < branches.length; i++) {
    const b = branches[i];
    const d = haversineMiles(project.lat, project.lon, b.lat, b.lon);
    if (d < bestDist) {
      bestDist = d;
      bestId = b.id;
    }
  }
  return { branch_id: bestId, distance_miles: bestDist };
}

// ---------- Warm intro ----------

/** Return the id of the closest CROSS-BRANCH customer within `maxMiles` of
 * the project. A cross-branch customer is one whose `served_by_branch_id`
 * is set and is NOT the same as `nearest_branch_id`. Returns null when no
 * cross-branch customer is within range.
 *
 * This matches the brief literally: "projects within 50 miles of a customer
 * served by a different branch get visually distinguished as warm-intro
 * candidates." Customers served by the same branch are ignored — they're
 * a service-call signal, not a cross-pollination signal. */
export function findWarmIntro(
  project: { lat: number | null | undefined; lon: number | null | undefined },
  customers: Pick<Customer, 'id' | 'lat' | 'lon' | 'served_by_branch_id'>[],
  nearest_branch_id: string,
  maxMiles: number = FAR_CUSTOMER_MILES,
): string | null {
  if (project.lat == null || project.lon == null) return null;
  if (customers.length === 0) return null;

  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of customers) {
    if (!c.served_by_branch_id || c.served_by_branch_id === nearest_branch_id) continue;
    const d = haversineMiles(project.lat, project.lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      bestId = c.id;
    }
  }
  if (bestId === null || bestDist > maxMiles) return null;
  return bestId;
}

// ---------- Score components ----------

/** 100 within NEAR_GEO_MILES of the branch, linearly decaying to 0 at the
 * branch's coverage_radius_miles. Outside coverage = 0. */
export function computeGeoScore(distance_miles: number, coverage_radius_miles: number): number {
  if (distance_miles >= coverage_radius_miles) return 0;
  if (distance_miles <= NEAR_GEO_MILES) return 100;
  const span = coverage_radius_miles - NEAR_GEO_MILES;
  if (span <= 0) return 0;
  const decayed = 100 * (1 - (distance_miles - NEAR_GEO_MILES) / span);
  return clamp(decayed, 0, 100);
}

/** Stage → score. Unknown / null stages return STAGE_DEFAULT. */
export function computeStageScore(stage: string | null | undefined): number {
  if (!stage) return STAGE_DEFAULT;
  const key = stage.trim().toUpperCase();
  return STAGE_SCORES[key] ?? STAGE_DEFAULT;
}

/** 100 within NEAR_CUSTOMER_MILES of any customer, linearly decaying to 0
 * at FAR_CUSTOMER_MILES. Considers the closest customer only. */
export function computeCustomerScore(
  project: { lat: number | null | undefined; lon: number | null | undefined },
  customers: Pick<Customer, 'lat' | 'lon'>[],
): number {
  if (project.lat == null || project.lon == null) return 0;
  if (customers.length === 0) return 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of customers) {
    const d = haversineMiles(project.lat, project.lon, c.lat, c.lon);
    if (d < bestDist) bestDist = d;
  }
  if (!Number.isFinite(bestDist)) return 0;
  if (bestDist <= NEAR_CUSTOMER_MILES) return 100;
  if (bestDist >= FAR_CUSTOMER_MILES) return 0;
  const span = FAR_CUSTOMER_MILES - NEAR_CUSTOMER_MILES;
  return clamp(100 * (1 - (bestDist - NEAR_CUSTOMER_MILES) / span), 0, 100);
}

// ---------- Composite ----------

/** Run all components and return the full ScoringOutput. */
export function scoreProject(input: ScoringInput): ScoringOutput {
  const { project, branches, customers } = input;
  if (project.lat == null || project.lon == null) {
    throw new Error('scoreProject: project requires lat and lon');
  }
  const nearest = nearestBranch(project as { lat: number; lon: number }, branches);
  const branch = branches.find((b) => b.id === nearest.branch_id)!;
  const in_coverage = nearest.distance_miles < branch.coverage_radius_miles;

  const geo_score = computeGeoScore(nearest.distance_miles, branch.coverage_radius_miles);
  const stage_score = computeStageScore(project.project_stage);
  const customer_score = computeCustomerScore(project, customers);
  const composite_score = Math.round(
    0.5 * geo_score + 0.3 * stage_score + 0.2 * customer_score,
  );

  const warm_for_customer_id = findWarmIntro(project, customers, nearest.branch_id);

  return {
    nearest_branch_id: nearest.branch_id,
    distance_miles: nearest.distance_miles,
    in_coverage,
    warm_for_customer_id,
    geo_score: Math.round(geo_score),
    stage_score: Math.round(stage_score),
    customer_score: Math.round(customer_score),
    composite_score,
  };
}

// ---------- Helpers ----------

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
