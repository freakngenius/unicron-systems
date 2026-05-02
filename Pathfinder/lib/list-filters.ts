// Lead-list URL filter state — shared parse / serialize helpers for
// `components/ProjectList.tsx`. Keeping the helpers in `lib/` lets the
// vitest suite cover them without pulling in JSX or React.
//
// Implements: SPEC - Demo Polish & Geography Filters.md § 3.3
//   "Filter + sort state should persist in the URL query string:
//    ?sort=score&dir=desc&range=within&min_score=80"
//
// Defaults (spec § 3.2):
//   sort=score, dir=desc, range=all, min_score=0, filter=all
//
// All fields are validated against an explicit allow-list — any unknown
// value falls back to the default for that field. Invalid query strings
// therefore degrade silently to the default view rather than throwing,
// which is what we want for shared / bookmarked URLs that survive a
// schema change.

export type ListSortMode = 'score' | 'distance' | 'posted' | 'recent';
export type ListSortDir = 'asc' | 'desc';
export type RangeMode = 'within' | 'outside' | 'all';
export type ListFilterMode = 'all' | 'starred';

export interface ListFilterState {
  sort: ListSortMode;
  dir: ListSortDir;
  range: RangeMode;
  /** Lower bound on `projects.score`, inclusive. 0 = no floor. */
  minScore: number;
  /** Legacy starred quick-filter, retained alongside the new range/score
   * controls. */
  filter: ListFilterMode;
}

export const SCORE_FLOOR_STEPS = {
  min: 0,
  max: 90,
  step: 10,
} as const;

export const DEFAULT_LIST_FILTER_STATE: ListFilterState = {
  sort: 'score',
  dir: 'desc',
  range: 'all',
  minScore: 0,
  filter: 'all',
};

const VALID_SORT: ReadonlySet<ListSortMode> = new Set(['score', 'distance', 'posted', 'recent']);
const VALID_DIR: ReadonlySet<ListSortDir> = new Set(['asc', 'desc']);
const VALID_RANGE: ReadonlySet<RangeMode> = new Set(['within', 'outside', 'all']);
const VALID_FILTER: ReadonlySet<ListFilterMode> = new Set(['all', 'starred']);

/** Minimal `URLSearchParams`-compatible interface — `next/navigation`'s
 * `useSearchParams()` returns a `ReadonlyURLSearchParams` which exposes
 * the same `get()` method. We accept either, plus `null` so callers can
 * pass through SSR cases without a guard. */
export interface QueryLike {
  get(key: string): string | null;
}

/** Snap a numeric score floor to the nearest valid step (0, 10, …, 90)
 * and clamp into range. Returns `0` for any non-finite input. */
function snapScoreFloor(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.max(SCORE_FLOOR_STEPS.min, Math.min(SCORE_FLOOR_STEPS.max, raw));
  return Math.round(clamped / SCORE_FLOOR_STEPS.step) * SCORE_FLOOR_STEPS.step;
}

/** Parse a search-params-like object into a fully populated
 * ListFilterState. Unknown / missing keys fall back to defaults. */
export function parseListFilterState(query: QueryLike | null | undefined): ListFilterState {
  if (!query) return { ...DEFAULT_LIST_FILTER_STATE };

  const sortRaw = query.get('sort');
  const dirRaw = query.get('dir');
  const rangeRaw = query.get('range');
  const filterRaw = query.get('filter');
  const minScoreRaw = query.get('min_score');

  const sort: ListSortMode =
    sortRaw && VALID_SORT.has(sortRaw as ListSortMode)
      ? (sortRaw as ListSortMode)
      : DEFAULT_LIST_FILTER_STATE.sort;
  const dir: ListSortDir =
    dirRaw && VALID_DIR.has(dirRaw as ListSortDir)
      ? (dirRaw as ListSortDir)
      : DEFAULT_LIST_FILTER_STATE.dir;
  const range: RangeMode =
    rangeRaw && VALID_RANGE.has(rangeRaw as RangeMode)
      ? (rangeRaw as RangeMode)
      : DEFAULT_LIST_FILTER_STATE.range;
  const filter: ListFilterMode =
    filterRaw && VALID_FILTER.has(filterRaw as ListFilterMode)
      ? (filterRaw as ListFilterMode)
      : DEFAULT_LIST_FILTER_STATE.filter;

  const minScore = minScoreRaw == null ? 0 : snapScoreFloor(Number(minScoreRaw));

  return { sort, dir, range, minScore, filter };
}

/** Serialize a ListFilterState into a `?` query string body, omitting
 * keys that match the default so URLs stay clean. Returns the body
 * without a leading `?` (callers typically prepend it conditionally). */
export function serializeListFilterState(state: ListFilterState): string {
  const params = new URLSearchParams();
  if (state.sort !== DEFAULT_LIST_FILTER_STATE.sort) params.set('sort', state.sort);
  if (state.dir !== DEFAULT_LIST_FILTER_STATE.dir) params.set('dir', state.dir);
  if (state.range !== DEFAULT_LIST_FILTER_STATE.range) params.set('range', state.range);
  if (state.filter !== DEFAULT_LIST_FILTER_STATE.filter) params.set('filter', state.filter);
  const snappedMin = snapScoreFloor(state.minScore);
  if (snappedMin !== DEFAULT_LIST_FILTER_STATE.minScore) {
    params.set('min_score', String(snappedMin));
  }
  return params.toString();
}
