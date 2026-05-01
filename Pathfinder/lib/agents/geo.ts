// lib/agents/geo.ts — GeoMapper shim.
//
// Phase 2 Stream A Gate A2 — exposes the deterministic geographic logic
// from `lib/scoring.ts` under a clean agent-shaped API surface so other
// agents (Enricher, AdjacencyMapper, A1 Inngest functions) can ask
// "what's the geo metadata for this project?" without reimplementing the
// haversine + warm-intro rules.
//
// Per MEMORY/decisions.md D6 the Qualifier stays folded into the Ranker
// for now; D6 does NOT mandate splitting GeoMapper out of `lib/scoring.ts`.
// Stream A README explicitly: "GeoMapper (deterministic). Currently folded
// into scoring per D6 — only split if D6 documents the split rationale;
// otherwise add a thin shim that exposes geo metadata cleanly." This file
// is exactly that thin shim.
//
// Purity: this module re-exports pure functions from `lib/scoring.ts`.
// Adding any runtime dependency here breaks the Phase 2 Zedcor-L4
// transplant invariant — see `lib/scoring.ts` header for the contract.

import {
  haversineMiles,
  nearestBranch,
  findWarmIntro,
} from '@/lib/scoring';
import type { Branch, Customer, Project } from '@/lib/types';

export { haversineMiles, nearestBranch, findWarmIntro };

export interface GeoMetadata {
  nearest_branch_id: string | null;
  distance_miles: number | null;
  in_coverage: boolean;
  warm_for_customer_id: string | null;
}

/**
 * Derive geo metadata for a project given the active branch + customer
 * lookups. Returns nulls (rather than throwing) when the project lacks
 * lat/lon — the same contract the Ranker's geographic stage uses today.
 *
 * `coverageMiles` defaults to the per-branch `coverage_radius_miles` of
 * the matched branch. Callers that need a fixed override (e.g. a
 * synthetic test fixture) can pass an explicit value.
 */
export function mapGeo(
  project: Pick<Project, 'lat' | 'lon'>,
  branches: Pick<Branch, 'id' | 'lat' | 'lon' | 'coverage_radius_miles'>[],
  customers: Pick<Customer, 'id' | 'lat' | 'lon' | 'served_by_branch_id'>[],
  coverageMiles?: number,
): GeoMetadata {
  if (project.lat == null || project.lon == null || branches.length === 0) {
    return {
      nearest_branch_id: null,
      distance_miles: null,
      in_coverage: false,
      warm_for_customer_id: null,
    };
  }
  const match = nearestBranch(project, branches);
  const matchedBranch = branches.find((b) => b.id === match.branch_id);
  const radius = coverageMiles ?? matchedBranch?.coverage_radius_miles ?? 0;
  const in_coverage = match.distance_miles <= radius;
  const warm_for_customer_id = findWarmIntro(
    project,
    customers,
    match.branch_id,
  );
  return {
    nearest_branch_id: match.branch_id,
    distance_miles: match.distance_miles,
    in_coverage,
    warm_for_customer_id,
  };
}
