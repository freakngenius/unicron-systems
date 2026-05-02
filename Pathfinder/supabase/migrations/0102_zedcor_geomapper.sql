-- 0102_zedcor_geomapper.sql — Z-C feature #6 GeoMapper backing columns.
--
-- Adds a Zedcor-specific proximity pair to pathfinder.projects:
--   nearest_zedcor_branch_id  uuid → pathfinder.zedcor_branches.id
--   zedcor_distance_miles     numeric(8,2)
--
-- The existing nearest_branch_id (text) and distance_miles (numeric) columns
-- continue to point at pathfinder.branches (the multi-tenant registry used
-- by the cron Ranker via lib/scoring.ts). These new columns are populated
-- by lib/zedcor/geomapper.ts + scripts/backfill-zedcor-geo.ts and read by
-- the Z-C map view (#15) and lead list (#14).
--
-- Additive only. No RLS changes — projects RLS is unchanged. Idempotent
-- via IF NOT EXISTS so the migration is safe to re-apply.

alter table pathfinder.projects
  add column if not exists nearest_zedcor_branch_id uuid
    references pathfinder.zedcor_branches(id) on delete set null,
  add column if not exists zedcor_distance_miles numeric(8, 2);

create index if not exists idx_projects_nearest_zedcor_branch
  on pathfinder.projects(nearest_zedcor_branch_id)
  where nearest_zedcor_branch_id is not null;

comment on column pathfinder.projects.nearest_zedcor_branch_id is
  'Zedcor-org-scoped nearest branch (pathfinder.zedcor_branches). Populated by lib/zedcor/geomapper.ts. Coexists with nearest_branch_id which targets the multi-tenant pathfinder.branches registry.';
comment on column pathfinder.projects.zedcor_distance_miles is
  'Great-circle distance in statute miles to nearest_zedcor_branch_id. 0102_zedcor_geomapper.';
