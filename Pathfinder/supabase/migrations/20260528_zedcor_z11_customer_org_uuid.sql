-- 20260528_zedcor_z11_customer_org_uuid.sql
--
-- Sprint Z11 Fix 1 — normalize pathfinder.zedcor_customer_sites.customer_org_id
-- and pathfinder.zedcor_branches.customer_org_id from the legacy slug 'zedcor'
-- to the canonical pathfinder.organizations.id UUID for the Zedcor org
-- (6cd87740-7c72-4337-ac79-316a54242eef).
--
-- Why: Z8 wrote these tables keyed by slug. cross-pollination.ts queries by
-- UUID (the same value that pathfinder.projects.organization_id carries), so
-- with the slug in place every cross-pollination lookup returned zero rows
-- and the demo never surfaced warm intros. Migration applied live on
-- 2026-05-28 via the Supabase MCP; persisted here so `supabase db reset` can
-- replay it.
--
-- Spec: Sprint Z11 §"Fix 1 — Customer org ID mismatch".
--
-- Counts after apply: 3,627 zedcor_customer_sites rows, 34 zedcor_branches
-- rows — all now keyed by the UUID. Idempotent (no-op when the slug is
-- absent).

UPDATE pathfinder.zedcor_customer_sites
SET customer_org_id = '6cd87740-7c72-4337-ac79-316a54242eef'
WHERE customer_org_id = 'zedcor';

UPDATE pathfinder.zedcor_branches
SET customer_org_id = '6cd87740-7c72-4337-ac79-316a54242eef'
WHERE customer_org_id = 'zedcor';
