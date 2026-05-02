-- 0109_demo_polish_ux_demo_branches
--
-- Demo Polish UX Sprint — Gate 1C.
--
-- The Tuesday 2026-05-05 Zedcor demo walks four branches: Houston (already
-- in pathfinder.branches as hou-002), Los Angeles, Nashville, Pittsburgh.
-- The latter three live in pathfinder.zedcor_branches (34-row Z-A table)
-- but never made it into the older multi-tenant pathfinder.branches table
-- that the main Dashboard reads. Result: clicking those cities on the map
-- has nothing to bind to.
--
-- This migration is purely additive. It inserts three rows for LA / Nashville
-- / Pittsburgh into pathfinder.branches with lat/lon matching the Zedcor
-- centroids and the same 300mi coverage radius the existing rows use. The
-- five preexisting rows (phx-001, hou-002, atl-003, chi-004, sea-005) are
-- untouched. Project rows that already point at hou-002 stay attached;
-- the GeoMapper backfill that repoints orphan projects at the new branches
-- is deferred to Gate 1.5 / a separate operator-todo.
--
-- ON CONFLICT DO NOTHING so re-running the migration is idempotent and
-- does not stomp any field that may have been edited by a later seed run.

INSERT INTO pathfinder.branches (id, name, code, lat, lon, coverage_radius_miles, opened_date, region)
VALUES
  ('lax-006', 'Los Angeles', 'LAX', 34.0522, -118.2437, 300, '2024-02-01', 'CA'),
  ('nas-007', 'Nashville',   'NAS', 36.1627, -86.7816,  300, '2024-02-01', 'TN'),
  ('pit-008', 'Pittsburgh',  'PIT', 40.4406, -79.9959,  300, '2024-02-01', 'PA')
ON CONFLICT (id) DO NOTHING;
