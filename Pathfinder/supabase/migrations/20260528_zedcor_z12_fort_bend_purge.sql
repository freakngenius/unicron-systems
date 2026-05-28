-- Sprint Z12 — purge Fort Bend page-nav garbage from pathfinder.projects.
--
-- The prior Fort Bend adapter (pre-Z12) scraped the county landing page
-- with selectors broad enough to match historical "Tabulations" archive
-- links and "Doing business with Fort Bend" navigation tiles. Those rows
-- landed in pathfinder.projects with project_stage='unknown' and titles
-- that are not real opportunities.
--
-- Z12 rewrites the adapter to mirror galveston-county.ts (Bonfire-only,
-- no landing fallback). This migration removes the legacy bad data so the
-- Zedcor lead feed stops surfacing it.
--
-- Verification (2026-05-28 pre-apply): zero fort-bend-county rows existed
-- in pathfinder.projects at the time this migration was authored, so the
-- DELETE is a no-op. The statement remains for safety against future
-- re-ingest of the same garbage shape from any other source.

DELETE FROM pathfinder.projects
WHERE source = 'fort-bend-county'
  AND project_stage = 'unknown';
