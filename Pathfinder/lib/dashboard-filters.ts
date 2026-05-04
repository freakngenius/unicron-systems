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
  /** Demo Polish UX § Gate 2 — set of project ids that have a cross-poll
   * match in `pathfinder.lead_cross_pollination`. When the cross-poll
   * toggle is ON, only projects in this set survive the cross-poll
   * filter. The minScore + range filters are intentionally bypassed in
   * cross-poll mode so the demo's "12 warm-intro candidates" surface
   * cleanly regardless of the active score floor / range setting (per
   * Kyle's PR-body assertion: cross-poll filter must show ≥ 12 leads). */
  crossPollLeadIds?: ReadonlySet<string>;
  /** Demo Polish UX § Gate 18E — set of branch ids visible on the map.
   * When provided, the range filter switches from per-lead distance
   * (which targets the lead's nearest_branch_id and breaks once
   * DEMO_HOUSTON_ONLY narrows the visible coverage circles) to a
   * branch-set membership check:
   *   within  = nearest_branch_id ∈ activeBranchIds
   *   outside = nearest_branch_id ∉ activeBranchIds
   *   all     = no narrowing
   * Without this set, the range filter falls back to the original
   * distance-based check. */
  activeBranchIds?: ReadonlySet<string>;
}

/** Apply every filter that is NOT branch-selection. The result feeds both
 * the per-branch counts (via groupCountsByBranch below) and the rendered
 * project list (after a final branch-id narrowing). */
export function applyNonBranchFilters(ctx: NonBranchFilterContext): Project[] {
  const {
    projects,
    source,
    crossPoll,
    hidden,
    state,
    maxDistance,
    crossPollLeadIds,
    activeBranchIds,
  } = ctx;
  let arr = projects;

  if (hidden.size > 0) {
    arr = arr.filter((p) => !hidden.has(p.id));
  }

  if (crossPoll) {
    // Cross-poll mode is its own narrative — every match the engine found
    // is in scope regardless of score / range. Bypass those two filters
    // so the demo's signature warm-intro candidates surface cleanly.
    if (crossPollLeadIds && crossPollLeadIds.size > 0) {
      arr = arr.filter((p) => crossPollLeadIds.has(p.id));
    } else {
      // No xpoll set wired (legacy / SSR fallback) — fall back to the
      // older `warm_for_customer_id` signal so the toggle still narrows
      // something rather than rendering empty.
      arr = arr.filter((p) => !!p.warm_for_customer_id);
    }
    if (source !== 'all') {
      const db = SOURCE_FILTER_TO_DB[source];
      arr = arr.filter((p) => p.source === db);
    }
    return arr;
  }

  if (source !== 'all') {
    const db = SOURCE_FILTER_TO_DB[source];
    arr = arr.filter((p) => p.source === db);
  }

  if (state.range !== 'all') {
    if (activeBranchIds && activeBranchIds.size > 0) {
      // Gate 18E — branch-set membership. The within/outside semantics now
      // mirror the visible coverage circles on the map rather than the
      // lead's nearest_branch_id distance, which broke once
      // DEMO_HOUSTON_ONLY narrowed the dock to a single branch.
      arr = arr.filter((p) => {
        const id = p.nearest_branch_id;
        if (id == null) return state.range === 'outside';
        const inSet = activeBranchIds.has(id);
        return state.range === 'within' ? inSet : !inSet;
      });
    } else {
      arr = arr.filter((p) => {
        const d = projectDistanceMiles(p);
        if (d == null) return false;
        return state.range === 'within' ? d <= maxDistance : d > maxDistance;
      });
    }
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
