// Lead-list URL filter state — shared parse / serialize helpers for
// `components/ProjectList.tsx`. Keeping the helpers in `lib/` lets the
// vitest suite cover them without pulling in JSX or React.
//
// Implements: SPEC - Demo Polish & Geography Filters.md § 3.3
//   "Filter + sort state should persist in the URL query string:
//    ?sort=score&dir=desc&range=within&min_score=80"
//
// Defaults (Demo Polish UX § Gate 1C + 1D, lowered to 30 in Gate 17B):
//   sort=score, dir=desc, range=within, min_score=30, filter=all
//
// Range and minScore defaults were widened from the spec § 3.2 baseline
// (range=all, min_score=0) so the dashboard's first paint already shows the
// "leads worth caring about, near a Zedcor branch" view that the Tuesday
// demo opens with. Gate 17B lowered the score floor 50 → 30 so the demo
// surfaces medium-confidence leads alongside the high-score Houston flagship.
// All four are still freely selectable; the change only affects what
// URL-omitted ?... resolves to.
//
// All fields are validated against an explicit allow-list — any unknown
// value falls back to the default for that field. Invalid query strings
// therefore degrade silently to the default view rather than throwing,
// which is what we want for shared / bookmarked URLs that survive a
// schema change.

export type ListSortMode = 'score' | 'distance' | 'posted' | 'recent' | 'value';
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
  range: 'within',
  minScore: 30,
  filter: 'all',
};

const VALID_SORT: ReadonlySet<ListSortMode> = new Set(['score', 'distance', 'posted', 'recent', 'value']);
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
 * and clamp into range. Returns `null` for any non-finite input so the
 * caller can substitute the default (instead of forcing 0, which is no
 * longer the default). */
function snapScoreFloor(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
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

  const snappedMinScore = minScoreRaw == null ? null : snapScoreFloor(Number(minScoreRaw));
  const minScore = snappedMinScore == null ? DEFAULT_LIST_FILTER_STATE.minScore : snappedMinScore;

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
  const effectiveMin = snappedMin == null ? DEFAULT_LIST_FILTER_STATE.minScore : snappedMin;
  if (effectiveMin !== DEFAULT_LIST_FILTER_STATE.minScore) {
    params.set('min_score', String(effectiveMin));
  }
  return params.toString();
}
