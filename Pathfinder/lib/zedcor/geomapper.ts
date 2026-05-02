// lib/zedcor/geomapper.ts — Z-C feature #6 GeoMapper for Zedcor branches.
//
// Pure-function helper that, given a project lat/lon and the active
// `pathfinder.zedcor_branches` set, returns the nearest Zedcor branch and
// whether the project sits inside that branch's `radius_miles` coverage.
//
// Why a separate helper:
//   - `pathfinder.branches` (multi-tenant registry, used by the existing
//     Ranker via lib/scoring.ts) is unrelated to `pathfinder.zedcor_branches`
//     (Zedcor-org-scoped, 34 rows, 200mi default radius).
//   - The Ranker keeps writing to projects.nearest_branch_id /
//     projects.distance_miles for the multi-tenant flow. The new columns
//     projects.nearest_zedcor_branch_id / projects.zedcor_distance_miles
//     (added in 0102_zedcor_geomapper.sql) capture the Zedcor-specific
//     proximity and power the Tuesday demo's branch radius map.
//
// Purity: this file may import from `lib/scoring.ts` (which itself enforces
// no-runtime-deps), but otherwise only takes type-only imports. No fetch,
// no Supabase. Safe to call from server components, scripts, and tests.

import { haversineMiles as haversineMilesPositional } from '@/lib/scoring';

// ---------- Public types ----------

export interface ZedcorBranchPoint {
  /** pathfinder.zedcor_branches.id — uuid */
  id: string;
  branch_name: string;
  state: string;
  lat: number;
  lon: number;
  /** Coverage radius in statute miles — defaults to 200 for Zedcor. */
  radius_miles: number;
}

export interface NearestBranchResult {
  /** pathfinder.zedcor_branches.id (uuid) */
  branch_id: string;
  branch_name: string;
  state: string;
  /** Great-circle distance in statute miles, rounded to 2 decimals. */
  distance_miles: number;
  /** True when distance_miles <= radius_miles. */
  within_radius: boolean;
}

// ---------- Public API ----------

/**
 * Great-circle distance in statute miles between two `{lat, lon}` points.
 *
 * Object-arg wrapper around the canonical positional `lib/scoring.ts`
 * implementation — the Z-C brief specifies this object signature, but
 * keeping the math in one place guarantees Z-C distances match what the
 * Ranker computes for the multi-tenant scoring flow.
 */
export function haversineMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  return haversineMilesPositional(a.lat, a.lon, b.lat, b.lon);
}

/**
 * Find the nearest Zedcor branch to a project. Returns null when the
 * branches array is empty or when project coordinates aren't valid finite
 * numbers — matches the rest of the codebase's "null on missing geo" rule
 * (lib/agents/geo.ts mapGeo).
 *
 * `within_radius` reflects each individual branch's `radius_miles` (200 is
 * the Zedcor default per migration 0100). If the matched branch's radius
 * is <= 0 we treat it as "no coverage" → false.
 */
export function findNearestZedcorBranch(
  project: { lat: number; lon: number },
  branches: ZedcorBranchPoint[],
): NearestBranchResult | null {
  if (
    !branches.length ||
    !Number.isFinite(project.lat) ||
    !Number.isFinite(project.lon)
  ) {
    return null;
  }

  let best = branches[0];
  let bestDist = haversineMiles(
    { lat: project.lat, lon: project.lon },
    { lat: best.lat, lon: best.lon },
  );
  for (let i = 1; i < branches.length; i++) {
    const b = branches[i];
    const d = haversineMiles(
      { lat: project.lat, lon: project.lon },
      { lat: b.lat, lon: b.lon },
    );
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }

  // Round to 2 decimals so DB writes (numeric(8,2)) and UI displays match.
  const distance_miles = Math.round(bestDist * 100) / 100;
  const within_radius =
    best.radius_miles > 0 && distance_miles <= best.radius_miles;

  return {
    branch_id: best.id,
    branch_name: best.branch_name,
    state: best.state,
    distance_miles,
    within_radius,
  };
}
