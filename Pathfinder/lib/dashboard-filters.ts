// Demo Polish UX Sprint — Gate 1E.
//
// Shared filter pipeline so the BranchDock per-branch counts, the right-rail
// "X of Y" counter, the ProjectList rendered rows, and the map cluster
// markers all read from a single source of truth. Prior code computed each
// of those four counts on a different subset of `initialProjects`, which
// drifted whenever a filter changed.
//
// Two bands of filters:
//   - Non-branch filters: source, cross-poll mode, hidden set, range
//     (within/outside/all), and minScore. Applied first; the resulting
//     "pre-branch" set is what every per-branch count and the "Y" of
//     "X of Y" reflects.
//   - Branch selection: the user clicked a branch on the map / in the
//     dock. Applied on top of the pre-branch set; the result is what the
//     right rail and the cluster markers render. Per-branch counts in the
//     dock are explicitly NOT branch-narrowed (selecting Nashville must
//     not zero Houston's count, otherwise switching is impossible).
//
// Sort + starred are still applied inside `ProjectList` because they are
// UI-local concerns that don't influence map / dock counts.
//
// Intentionally pure + dependency-free so vitest can cover it without React.

import type { Project } from '@/lib/types';
import type { ListFilterState } from '@/lib/list-filters';
import type { SourceKey } from '@/components/TopBar';

const SOURCE_FILTER_TO_DB: Record<Exclude<SourceKey, 'all'>, string> = {
  usa: 'usaspending',
  sam: 'sam.gov',
  news: 'news',
  harris: 'harris',
};

/** Best-available distance for range gating. Mirrors the helper in
 * components/ProjectList.tsx so both call sites agree on which column
 * "wins" when both are populated. `zedcor_distance_miles` is set by the
 * Z-C GeoMapper integration; the multi-tenant `distance_miles` column
 * predates that — prefer the more recent value when both are populated. */
export function projectDistanceMiles(p: Project): number | null {
  const zd = p.zedcor_distance_miles;
  if (typeof zd === 'number' && Number.isFinite(zd)) return zd;
  if (typeof p.distance_miles === 'number' && Number.isFinite(p.distance_miles)) {
    return p.distance_miles;
  }
  return null;
}

export interface NonBranchFilterContext {
  projects: Project[];
  source: SourceKey;
  crossPoll: boolean;
  hidden: ReadonlySet<string>;
  state: Pick<ListFilterState, 'range' | 'minScore'>;
  /** Org's max-supported distance threshold (miles). Used by the range
   * filter when `state.range !== 'all'`. */
  maxDistance: number;
}

/** Apply every filter that is NOT branch-selection. The result feeds both
 * the per-branch counts (via groupCountsByBranch below) and the rendered
 * project list (after a final branch-id narrowing). */
export function applyNonBranchFilters(ctx: NonBranchFilterContext): Project[] {
  const { projects, source, crossPoll, hidden, state, maxDistance } = ctx;
  let arr = projects;

  if (hidden.size > 0) {
    arr = arr.filter((p) => !hidden.has(p.id));
  }

  if (crossPoll) {
    arr = arr.filter((p) => !!p.warm_for_customer_id);
  }

  if (source !== 'all') {
    const db = SOURCE_FILTER_TO_DB[source];
    arr = arr.filter((p) => p.source === db);
  }

  if (state.range !== 'all') {
    arr = arr.filter((p) => {
      const d = projectDistanceMiles(p);
      if (d == null) return false;
      return state.range === 'within' ? d <= maxDistance : d > maxDistance;
    });
  }

  if (state.minScore > 0) {
    arr = arr.filter((p) => (p.score ?? 0) >= state.minScore);
  }

  return arr;
}

/** Narrow a pre-branch-filtered set down to a single branch's leads. The
 * dashboard's right rail and the map's cluster layer both render the
 * narrowed set; per-branch counts in the dock do NOT (so users can still
 * see other branches' totals while one is selected). */
export function applyBranchFilter(
  preBranchFiltered: Project[],
  selectedBranchId: string | null,
): Project[] {
  if (!selectedBranchId) return preBranchFiltered;
  return preBranchFiltered.filter((p) => p.nearest_branch_id === selectedBranchId);
}

export interface BranchCount {
  count: number;
  /** Hi-priority count (score >= hiThreshold). */
  hi: number;
}

/** Group a pre-branch-filtered set into per-branch counts. Branches with
 * no leads aren't omitted — callers seed the map with all branches first
 * so the dock renders zero-counts when a filter narrows everything out
 * for that branch. */
export function groupCountsByBranch(
  projects: Project[],
  branchIds: readonly string[],
  hiThreshold: number,
): Record<string, BranchCount> {
  const out: Record<string, BranchCount> = {};
  for (const id of branchIds) out[id] = { count: 0, hi: 0 };
  for (const p of projects) {
    const id = p.nearest_branch_id;
    if (!id || !out[id]) continue;
    out[id].count += 1;
    if ((p.score ?? 0) >= hiThreshold) out[id].hi += 1;
  }
  return out;
}
