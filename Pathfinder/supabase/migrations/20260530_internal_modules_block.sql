-- 20260530_internal_modules_block.sql
-- Stream A Foundation: additive modules block for Internal (#4, slug='internal').
--
-- Touches one row only. Uses jsonb_set to add or replace the top-level
-- `modules` key inside architecture without disturbing any other key. Zedcor
-- (#1), Realberry (#2), Funder (#3) are not touched. Their `architecture`
-- rows remain byte-identical to their pre-migration state because the WHERE
-- clause restricts the update to slug='internal'.
--
-- Module map mirrors PLAN-stream-a-foundation.md and is consumed by the
-- catalog renderer in Pathfinder/lib/catalog/renderer.ts.

UPDATE pathfinder.organizations
SET architecture = jsonb_set(
  COALESCE(architecture, '{}'::jsonb),
  '{modules}',
  '{
    "ranked-feed":       { "enabled": true },
    "company-detail":    { "enabled": true },
    "outreach-composer": { "enabled": true },
    "hubspot-sync":      { "enabled": true },
    "pipeline-kanban":   { "enabled": true },
    "filter-rail":       { "enabled": true },
    "warm-intro-panel":  { "enabled": true },
    "daily-digest":      { "enabled": true },
    "kpi-strip":         { "enabled": true,  "config": { "metrics": ["verified_count_1d", "active_motion_pct", "avg_score", "sources_live"] } },
    "analytics-charts":  { "enabled": true,  "config": { "emphasis": "secondary" } },
    "geo-map":           { "enabled": false }
  }'::jsonb,
  true
)
WHERE slug = 'internal';

-- Verification: a non-zero result here would indicate the migration touched
-- a row outside its declared scope. Operators can run this independently
-- after `supabase db push` (or the migration runner) completes.
--
--   SELECT slug, jsonb_typeof(architecture->'modules') AS modules_typeof
--   FROM pathfinder.organizations
--   WHERE slug IN ('zedcor', 'realberry', 'funder');
--
-- Expected output: three rows where modules_typeof IS NULL (no modules key
-- introduced on non-Internal orgs).
