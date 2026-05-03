# Persist per-component scores on pathfinder.projects

**Filed:** 2026-05-03
**Status:** Queued — follow-up from Gate 7C
**Origin:** Gate 7C ScoreBreakdown landed on a server-side-recompute path because `pathfinder.score_components` doesn't exist and `scoreProject()` is the source of truth for the breakdown. The recompute runs on every lead detail page load.

## Scope

Migration adds three columns to `pathfinder.projects`:

```sql
alter table pathfinder.projects
  add column if not exists geo_score      smallint check (geo_score      between 0 and 100),
  add column if not exists stage_score    smallint check (stage_score    between 0 and 100),
  add column if not exists customer_score smallint check (customer_score between 0 and 100);
```

Ranker writes them at the same time it writes `composite_score`. Backfill once via `scripts/backfill-component-scores.ts`.

ScoreBreakdown reads directly from `Project` instead of taking the `breakdown` prop. The page route's `computeBreakdown()` helper + branches/customers fetches become unnecessary — drop them.

## Why deferred from 7C

- Schema change touches the Ranker (out of 7C scope which was verification + wiring only).
- The recompute cost is small (pure function over ~5 branches + ~50 customers). Real-world page load latency unaffected.
- 7C's path proves the data shape is correct; this todo persists it.

## Acceptance for closing

- Migration applied to live Supabase
- Ranker writes the three new columns when scoring
- `scripts/backfill-component-scores.ts` populates historical rows
- ScoreBreakdown updated to read from Project directly; page route's `computeBreakdown()` helper removed
- All existing tests still pass
