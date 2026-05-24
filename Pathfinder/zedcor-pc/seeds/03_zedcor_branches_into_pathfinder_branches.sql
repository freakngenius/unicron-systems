-- 03_zedcor_branches_into_pathfinder_branches.sql
-- Loads Zedcor's 34 branches into pathfinder.branches (the multi-tenant
-- table the headline Dashboard reads). Idempotent — ON CONFLICT DO NOTHING.
-- Existing demo branches (hou-002, lax-008, nsh-006, pit-007) preserved.

begin;

INSERT INTO pathfinder.branches (id, name, code, lat, lon, coverage_radius_miles, opened_date, region) VALUES
  ('calgary-ab', 'Calgary', 'CAL', 51.0447, -114.0719, 200, '2026-04-01', 'AB'),
  ('chilliwack-bc', 'Chilliwack', 'CHI', 49.1579, -121.9514, 200, '2026-04-01', 'BC'),
  ('leduc-ab', 'Leduc', 'LED', 53.2596, -113.5492, 200, '2026-04-01', 'AB'),
  ('ottawa-on', 'Ottawa', 'OTT', 45.4215, -75.6972, 200, '2026-04-01', 'ON'),
  ('toronto-on', 'Toronto', 'TOR', 43.6532, -79.3832, 200, '2026-04-01', 'ON'),
  ('winnipeg-mb', 'Winnipeg', 'WIN', 49.8951, -97.1384, 200, '2026-04-01', 'MB'),
  ('alabama-al', 'Alabama', 'ALA', 32.3617, -86.2792, 200, '2026-04-01', 'AL'),
  ('albuquerque-nm', 'Albuquerque', 'ALB', 35.0844, -106.6504, 200, '2026-04-01', 'NM'),
  ('arkansas-ar', 'Arkansas', 'ARK', 34.7465, -92.2896, 200, '2026-04-01', 'AR'),
  ('austin-tx', 'Austin', 'AUS', 30.2672, -97.7431, 200, '2026-04-01', 'TX'),
  ('charlotte-nc', 'Charlotte', 'CHA', 35.2271, -80.8431, 200, '2026-04-01', 'NC'),
  ('dallas-tx', 'Dallas', 'DAL', 32.7767, -96.797, 200, '2026-04-01', 'TX'),
  ('denver-co', 'Denver', 'DEN', 39.7392, -104.9903, 200, '2026-04-01', 'CO'),
  ('georgia-ga', 'Georgia', 'GEO', 33.749, -84.388, 200, '2026-04-01', 'GA'),
  ('hou-002', 'Houston', 'HOU', 29.7604, -95.3698, 200, '2026-04-01', 'TX'),
  ('illinois-il', 'Illinois', 'ILL', 41.8781, -87.6298, 200, '2026-04-01', 'IL'),
  ('iowa-ia', 'Iowa', 'IOW', 41.5868, -93.625, 200, '2026-04-01', 'IA'),
  ('jacksonville-fl', 'Jacksonville', 'JAC', 30.3322, -81.6557, 200, '2026-04-01', 'FL'),
  ('las-vegas-nv', 'Las Vegas', 'LAS', 36.1699, -115.1398, 200, '2026-04-01', 'NV'),
  ('lax-008', 'Los Angeles', 'LOS', 34.0522, -118.2437, 200, '2026-04-01', 'CA'),
  ('midland-tx', 'Midland', 'MID', 31.9974, -102.0779, 200, '2026-04-01', 'TX'),
  ('missouri-mo', 'Missouri', 'MIS', 38.627, -90.1994, 200, '2026-04-01', 'MO'),
  ('nsh-006', 'Nashville', 'NAS', 36.1627, -86.7816, 200, '2026-04-01', 'TN'),
  ('new-york-ny', 'New York', 'NEW', 40.7128, -74.006, 200, '2026-04-01', 'NY'),
  ('ohio-oh', 'Ohio', 'OHI', 39.9612, -82.9988, 200, '2026-04-01', 'OH'),
  ('oregon-or', 'Oregon', 'ORE', 45.5152, -122.6784, 200, '2026-04-01', 'OR'),
  ('pennsylvania-pa', 'Pennsylvania', 'PEN', 39.9526, -75.1652, 200, '2026-04-01', 'PA'),
  ('phoenix-az', 'Phoenix', 'PHO', 33.4484, -112.074, 200, '2026-04-01', 'AZ'),
  ('sacramento-ca', 'Sacramento', 'SAC', 38.5816, -121.4944, 200, '2026-04-01', 'CA'),
  ('san-antonio-tx', 'San Antonio', 'SAN', 29.4241, -98.4936, 200, '2026-04-01', 'TX'),
  ('south-carolina-sc', 'South Carolina', 'SOU', 33.8361, -81.1637, 200, '2026-04-01', 'SC'),
  ('tampa-fl', 'Tampa', 'TAM', 27.9506, -82.4572, 200, '2026-04-01', 'FL'),
  ('washington-wa', 'Washington', 'WAS', 47.6062, -122.3321, 200, '2026-04-01', 'WA'),
  ('wisconsin-wi', 'Wisconsin', 'WIS', 43.0731, -89.4012, 200, '2026-04-01', 'WI')
ON CONFLICT (id) DO NOTHING;

commit;

-- Sanity:
--   SELECT count(*) FROM pathfinder.branches;
--   SELECT id, name, code, region FROM pathfinder.branches ORDER BY name;
