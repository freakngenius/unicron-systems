-- Drop legacy permissive qual=true RLS policies + add operator policies where missing.
-- Spec: Metacron kanban canonical card 35d785c67e7281d69588d1d0b281982e
--       ("BUG: lingering qual=true RLS policies on projects / agent_log / data_sources").
--
-- Card originally named 3 tables. 2026-05-12 re-probe via Supabase MCP found 10 tables
-- still carrying the legacy "<table>_read"/"<table>_write" policies with qual=true,
-- which OR-merge with the operator_allowlist policies and grant SELECT/ALL to the
-- Supabase anon key (publicly embedded in client bundles). Kyle authorized expanded
-- scope: ship all 10 in one PR (overnight pre-auth window, 2026-05-12).
--
-- Tables in scope (10):
--   projects (1,825 rows)            agent_log (16,764 rows)
--   data_sources (0 rows)            agent_runs (1,472 rows)
--   llm_calls (2,820 rows)           customers (33 rows)
--   branches (9 rows)                architect_sessions (26 rows)
--   architect_proposals (13 rows)    agent_verifications (0 rows)
--
-- Pattern mirrors 20260511_rls_completion_remaining_5_tables.sql:
-- operator-allowlist read + write policies via auth.jwt() ->> 'email'.
-- agent_verifications keeps its existing "service role all" policy untouched
-- (service role bypasses RLS and is correct for Inngest/cron writes).
--
-- RLS is already ENABLED on all 10 tables (verified pre-flight). No ALTER TABLE
-- ENABLE needed; that avoids any "RLS-on-but-policy-less" window.

-- =============================================================================
-- STEP 1 — drop legacy qual=true policies
-- =============================================================================
DROP POLICY IF EXISTS "projects_read"             ON pathfinder.projects;
DROP POLICY IF EXISTS "projects_write"            ON pathfinder.projects;
DROP POLICY IF EXISTS "agent_log_read"            ON pathfinder.agent_log;
DROP POLICY IF EXISTS "agent_log_write"           ON pathfinder.agent_log;
DROP POLICY IF EXISTS "data_sources_read"         ON pathfinder.data_sources;
DROP POLICY IF EXISTS "data_sources_write"        ON pathfinder.data_sources;
DROP POLICY IF EXISTS "agent_runs_read"           ON pathfinder.agent_runs;
DROP POLICY IF EXISTS "agent_runs_write"          ON pathfinder.agent_runs;
DROP POLICY IF EXISTS "llm_calls_read"            ON pathfinder.llm_calls;
DROP POLICY IF EXISTS "llm_calls_write"           ON pathfinder.llm_calls;
DROP POLICY IF EXISTS "customers_read"            ON pathfinder.customers;
DROP POLICY IF EXISTS "customers_write"           ON pathfinder.customers;
DROP POLICY IF EXISTS "branches_read"             ON pathfinder.branches;
DROP POLICY IF EXISTS "branches_write"            ON pathfinder.branches;
DROP POLICY IF EXISTS "architect_sessions_read"   ON pathfinder.architect_sessions;
DROP POLICY IF EXISTS "architect_sessions_write"  ON pathfinder.architect_sessions;
DROP POLICY IF EXISTS "architect_proposals_read"  ON pathfinder.architect_proposals;
DROP POLICY IF EXISTS "architect_proposals_write" ON pathfinder.architect_proposals;
DROP POLICY IF EXISTS "customers read own org verifications" ON pathfinder.agent_verifications;

-- =============================================================================
-- STEP 2 — operator policies (idempotent: drop then create)
-- All 10 tables end with identical text. Tables that already had operator policies
-- (projects, agent_log, data_sources) are recreated so policy text is uniform
-- across the schema.
-- =============================================================================

-- projects
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.projects;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.projects;
CREATE POLICY "operators_read_all"  ON pathfinder.projects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.projects FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- agent_log
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_log;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_log;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_log FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- data_sources
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.data_sources;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.data_sources;
CREATE POLICY "operators_read_all"  ON pathfinder.data_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.data_sources FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- agent_runs
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_runs;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_runs;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_runs FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- llm_calls
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.llm_calls;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.llm_calls;
CREATE POLICY "operators_read_all"  ON pathfinder.llm_calls FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.llm_calls FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- customers
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.customers;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.customers;
CREATE POLICY "operators_read_all"  ON pathfinder.customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.customers FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- branches
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.branches;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.branches;
CREATE POLICY "operators_read_all"  ON pathfinder.branches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.branches FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- architect_sessions
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.architect_sessions;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.architect_sessions;
CREATE POLICY "operators_read_all"  ON pathfinder.architect_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.architect_sessions FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- architect_proposals
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.architect_proposals;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.architect_proposals;
CREATE POLICY "operators_read_all"  ON pathfinder.architect_proposals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.architect_proposals FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- agent_verifications (keeps "service role all" policy untouched)
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_verifications;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_verifications;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_verifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_verifications FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- =============================================================================
-- POST-APPLY VERIFICATION (run via Supabase MCP execute_sql, not from this file)
-- =============================================================================
-- 1. No qual=true policy remains on the 10 tables:
--      SELECT tablename, policyname FROM pg_policies
--        WHERE schemaname='pathfinder' AND qual::text='true'
--          AND tablename IN ('projects','agent_log','data_sources','agent_runs',
--                            'llm_calls','customers','branches','architect_sessions',
--                            'architect_proposals','agent_verifications');
--      Expect: 0 rows.
-- 2. Each table has exactly operators_read_all + operators_write_all (agent_verifications also keeps service role all):
--      SELECT tablename, count(*) FROM pg_policies
--        WHERE schemaname='pathfinder'
--          AND tablename IN ('projects','agent_log','data_sources','agent_runs',
--                            'llm_calls','customers','branches','architect_sessions',
--                            'architect_proposals','agent_verifications')
--      GROUP BY tablename;
--      Expect: 2 for 9 tables, 3 for agent_verifications.
