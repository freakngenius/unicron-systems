-- Sprint Z12 — repair customer_org_id on pathfinder.zedcor_customer_sites.
--
-- Earlier waves of the Zedcor seed inserted rows with the legacy slug
-- 'zedcor' in customer_org_id, then a later seed corrected them to the
-- canonical UUID. The slug-form rows are the ones the cross-pollination
-- engine fails to find, because resolveCrossPollination filters on the
-- UUID (`6cd87740-7c72-4337-ac79-316a54242eef`).
--
-- This migration is idempotent and safe to re-run: it only rewrites rows
-- whose customer_org_id is still the slug.
--
-- Verification (2026-05-28 pre-apply): all 3,627 rows already had the UUID
-- form. This migration is now a no-op safety net that documents the
-- canonical UUID and keeps any future legacy inserts from drifting.

UPDATE pathfinder.zedcor_customer_sites
SET customer_org_id = '6cd87740-7c72-4337-ac79-316a54242eef'
WHERE customer_org_id = 'zedcor';
