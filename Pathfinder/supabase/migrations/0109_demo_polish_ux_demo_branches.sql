-- 0109_demo_polish_ux_demo_branches
--
-- Demo Polish UX Sprint — Gate 1C.
--
-- Documents the four demo-branch row set that the dashboard restricts to
-- on Tuesday's Zedcor demo: Houston (hou-002), Los Angeles (lax-008),
-- Nashville (nsh-006), Pittsburgh (pit-007). On the production database
-- (`anfihcusvekpovcchpoh`) all four already exist — Houston from the
-- original seed; LA / Nashville / Pittsburgh from an earlier session that
-- ran a GeoMapper backfill that's already attached projects to those IDs
-- (verified 2026-05-02: pit-007=27 leads, hou-002=21, lax-008=7,
-- nsh-006=6).
--
-- This migration is purely additive and idempotent. ON CONFLICT DO NOTHING
-- means re-applying it against the live DB is a no-op. The benefit of
-- keeping it is that a fresh database (new tenant clone, dev reset, etc.)
-- comes up with the same demo-branch row set the dashboard expects, so
-- pickDemoBranches() in lib/demo-branches.ts always finds all four.
--
-- The lat/lon and coverage_radius_miles values match the live rows
-- verbatim. opened_date matches the production rows (2026-04-01) for
-- LA/Nashville/Pittsburgh; Houston is on its original 2019-08-22.

INSERT INTO pathfinder.branches (id, name, code, lat, lon, coverage_radius_miles, opened_date, region)
VALUES
  ('lax-008', 'Los Angeles', 'LAX', 34.0522, -118.2437, 300, '2026-04-01', 'CA'),
  ('nsh-006', 'Nashville',   'NSH', 36.1627, -86.7816,  300, '2026-04-01', 'TN'),
  ('pit-007', 'Pittsburgh',  'PIT', 40.4406, -79.9959,  300, '2026-04-01', 'PA')
ON CONFLICT (id) DO NOTHING;
