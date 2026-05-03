-- Demo Polish UX Sprint — Gate 11E.
--
-- Adds two additive columns to pathfinder.projects to surface the v2
-- lead detail Project Facts cell for "Estimated Towers" (Gate 11D).
-- Both columns are populated by the tower-estimation enrichment pass
-- (services/tower-estimator/agent.ts + scripts/backfill-estimated-towers.ts).
--
-- Schema choices:
--   - estimated_towers_count text. The estimator may return either a
--     single integer ("32") or a range ("25-35") when uncertain. Storing
--     as text keeps both shapes round-trippable without re-parsing on the
--     read path. The UI cell renders the value verbatim.
--   - estimated_towers_rationale text. Free-form LLM-recorded reasoning
--     surfaced as the cell tooltip. Never null when count is non-null.
--
-- NO DROP. NO destructive ALTER. Re-runnable.

alter table pathfinder.projects
  add column if not exists estimated_towers_count text,
  add column if not exists estimated_towers_rationale text;
