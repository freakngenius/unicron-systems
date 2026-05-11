-- RLS gap completion — remaining 5 tables.
-- Spec: canonical Metacron card 35c785c67e72816996b1ead977e45498
--       "RLS gap on 7 pathfinder tables (security)".
--
-- Closes the last 5 of the 7 RLS-disabled tables surfaced by the Supabase
-- advisor. The first 2 (briefings, outreach_drafts) closed via the
-- 20260511_phase2a_completion_org_id_rls migration earlier today.
--
-- Tables (5):
--   chat_threads     (7 rows)  user_email is operator-internal context key,
--                              NOT customer email — used as org slug
--                              per 2026-05-11 probe (all 5 rows = 'zedcor')
--   chat_messages    (86 rows) inherits scoping via thread_id → chat_threads
--   project_contacts (0 rows)  references projects via project_id text
--   org_geo_config   (1 row)   org-keyed config (org_id text = slug)
--   user_connections (3 rows)  per-operator OAuth tokens
--                              (currently only Kyle's HubSpot connections)
--
-- Policy choice: uniform operators_read_all + operators_write_all via
-- operator_allowlist, mirroring the Phase 2A completion migration.
-- Per Phase 2A SPEC (2026-05-05 update): customers don't authenticate;
-- only operators read/write these tables. user_connections cross-operator
-- visibility is acceptable in a 2-3 person team — can be tightened later
-- with a self-only policy when team size grows.
--
-- All 5 tables already have RLS DISABLED (verified 2026-05-11). This
-- migration enables RLS + adds policies in one shot so no window of
-- "RLS-on-but-policy-less" zero-access exists.

-- STEP 1 — Enable RLS
ALTER TABLE pathfinder.chat_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.org_geo_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.user_connections ENABLE ROW LEVEL SECURITY;

-- STEP 2 — Operator-allowlist policies (drop+create idempotent)
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.chat_threads;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.chat_threads;
CREATE POLICY "operators_read_all"  ON pathfinder.chat_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.chat_threads FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.chat_messages;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.chat_messages;
CREATE POLICY "operators_read_all"  ON pathfinder.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.chat_messages FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.project_contacts;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.project_contacts;
CREATE POLICY "operators_read_all"  ON pathfinder.project_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.project_contacts FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.org_geo_config;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.org_geo_config;
CREATE POLICY "operators_read_all"  ON pathfinder.org_geo_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.org_geo_config FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.user_connections;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.user_connections;
CREATE POLICY "operators_read_all"  ON pathfinder.user_connections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.user_connections FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- =============================================================================
-- POST-APPLY VERIFICATION
-- =============================================================================
-- 1. RLS enabled on all 5:
--    SELECT relname, relrowsecurity FROM pg_class
--      WHERE relnamespace = 'pathfinder'::regnamespace
--      AND relname IN ('chat_threads','chat_messages','project_contacts','org_geo_config','user_connections');
-- 2. Operator policies present:
--    SELECT tablename, policyname FROM pg_policies
--      WHERE schemaname='pathfinder'
--      AND tablename IN ('chat_threads','chat_messages','project_contacts','org_geo_config','user_connections')
--    ORDER BY tablename, policyname;  -- expect 10 rows: 2 policies × 5 tables
