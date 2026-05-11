-- Phase 2A completion — per-table organization_id + RLS + missing-column repair
-- Spec: Company Docs/Metacron/SPEC - Phase 2A Multi-tenant Routing & Auth.md
--       §"Customer-data tables get organization_id RLS"
--
-- Closes the gap left by the original Phase 2A migration (20260509_phase2a_auth.sql),
-- which landed organizations + org_memberships + operator_allowlist + auth helpers
-- but did NOT add organization_id to the customer-data tables that downstream
-- queries (e.g. unicron-platform getOrgHealth) actually need to scope by org.
--
-- Also repairs two production-bug schema gaps surfaced when revert(PR #280)
-- diagnosed customersClient errors:
--   - pathfinder.projects has no created_at column
--   - pathfinder.data_sources has no enabled column
--
-- Closes 2 of the 7 RLS-disabled tables (briefings, outreach_drafts) listed
-- in the Metacron kanban "RLS gap on 7 pathfinder tables" Bug Fix card.
-- The remaining 5 (chat_threads, chat_messages, org_geo_config,
-- project_contacts, user_connections) are out of scope for this migration.
--
-- Migration is structured as: ADD COLUMNS (additive, safe) → BACKFILL (Zedcor
-- UUID for all existing rows) → ALTER NOT NULL → INDEX → ENABLE RLS → POLICIES.
-- Wrapped in a single transaction so partial failure rolls back cleanly.

BEGIN;

-- =============================================================================
-- STEP 1 — ADD organization_id (nullable) on the 6 customer-data tables
-- =============================================================================

ALTER TABLE pathfinder.projects        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;
ALTER TABLE pathfinder.agent_log       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;
ALTER TABLE pathfinder.data_sources    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;
ALTER TABLE pathfinder.outreach_drafts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;
ALTER TABLE pathfinder.briefings       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;
ALTER TABLE pathfinder.agent_runs      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES pathfinder.organizations(id) ON DELETE RESTRICT;

-- =============================================================================
-- STEP 2 — Repair missing schema columns the customersClient code expected
-- =============================================================================

ALTER TABLE pathfinder.projects     ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE pathfinder.data_sources ADD COLUMN IF NOT EXISTS enabled    boolean     NOT NULL DEFAULT true;

-- =============================================================================
-- STEP 3 — Backfill all existing rows with Zedcor's organization_id
--   Confirmed live 2026-05-11: id = '6cd87740-7c72-4337-ac79-316a54242eef'
--                              slug = 'zedcor'
-- =============================================================================

UPDATE pathfinder.projects        SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 1825 rows
UPDATE pathfinder.agent_log       SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 16763 rows
UPDATE pathfinder.data_sources    SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 0 rows
UPDATE pathfinder.outreach_drafts SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 87 rows
UPDATE pathfinder.briefings       SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 2 rows
UPDATE pathfinder.agent_runs      SET organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'::uuid WHERE organization_id IS NULL;  -- 1472 rows

-- Sanity probe: every row in every table now has a non-null organization_id.
-- Migration aborts via the NOT NULL alters below if backfill missed any row.

-- =============================================================================
-- STEP 4 — Tighten organization_id to NOT NULL after backfill
-- =============================================================================

ALTER TABLE pathfinder.projects        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE pathfinder.agent_log       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE pathfinder.data_sources    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE pathfinder.outreach_drafts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE pathfinder.briefings       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE pathfinder.agent_runs      ALTER COLUMN organization_id SET NOT NULL;

-- =============================================================================
-- STEP 5 — Index organization_id for the dashboard's per-org rollup queries
--   Each table also gets an (organization_id, created_at DESC) composite where
--   created_at exists, since most reads are "latest N for this org".
-- =============================================================================

CREATE INDEX IF NOT EXISTS projects_org_idx          ON pathfinder.projects (organization_id);
CREATE INDEX IF NOT EXISTS projects_org_created_idx  ON pathfinder.projects (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_log_org_idx         ON pathfinder.agent_log (organization_id);
CREATE INDEX IF NOT EXISTS agent_log_org_created_idx ON pathfinder.agent_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS data_sources_org_idx      ON pathfinder.data_sources (organization_id);

CREATE INDEX IF NOT EXISTS outreach_drafts_org_idx   ON pathfinder.outreach_drafts (organization_id);

CREATE INDEX IF NOT EXISTS briefings_org_idx         ON pathfinder.briefings (organization_id);

CREATE INDEX IF NOT EXISTS agent_runs_org_idx        ON pathfinder.agent_runs (organization_id);

-- =============================================================================
-- STEP 6 — Enable RLS on the two tables that didn't have it
--   (projects, agent_log, data_sources, agent_runs already have RLS=on but
--    no policies — adding the operator-allowlist policy in Step 7 below.)
-- =============================================================================

ALTER TABLE pathfinder.briefings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.outreach_drafts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 7 — Operator-allowlist read+write policies on all 6 tables.
--   Pattern matches Phase 2A §"Customer-data tables get organization_id RLS":
--   operators (allowlist auth) read all org data; service role bypasses RLS
--   automatically (it is not subject to row-level policies on Supabase).
--   No customer role since customers don't log in (per Phase 2A 2026-05-05 update).
-- =============================================================================

-- Drop-and-recreate is safe because no existing operator-allowlist policy
-- exists on these tables (only Phase 2A's organizations + org_memberships +
-- operator_allowlist tables themselves have policies today).

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.projects;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.projects;
CREATE POLICY "operators_read_all"  ON pathfinder.projects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.projects FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_log;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_log;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_log FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.data_sources;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.data_sources;
CREATE POLICY "operators_read_all"  ON pathfinder.data_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.data_sources FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.outreach_drafts;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.outreach_drafts;
CREATE POLICY "operators_read_all"  ON pathfinder.outreach_drafts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.outreach_drafts FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.briefings;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.briefings;
CREATE POLICY "operators_read_all"  ON pathfinder.briefings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.briefings FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_runs;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_runs;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_runs FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

COMMIT;

-- =============================================================================
-- POST-APPLY VERIFICATION (run separately after migration commits)
-- =============================================================================
--
-- 1. Every row has organization_id:
--    SELECT 'projects' AS t, COUNT(*) FILTER (WHERE organization_id IS NULL) AS nulls
--      FROM pathfinder.projects;
--    [...repeat for each of the 6 tables. Expect 0 nulls everywhere.]
--
-- 2. RLS is enabled on all 6:
--    SELECT relname, relrowsecurity FROM pg_class
--      WHERE relnamespace = 'pathfinder'::regnamespace
--      AND relname IN ('projects','agent_log','data_sources','outreach_drafts','briefings','agent_runs');
--    [Expect relrowsecurity=t on all 6.]
--
-- 3. Operator policy exists on all 6:
--    SELECT tablename, policyname FROM pg_policies
--      WHERE schemaname='pathfinder'
--      AND tablename IN ('projects','agent_log','data_sources','outreach_drafts','briefings','agent_runs')
--    ORDER BY tablename, policyname;
--    [Expect 12 rows: 2 policies × 6 tables.]
--
-- 4. Cross-org isolation (anon role): a non-operator JWT cannot read any rows.
--    SET LOCAL ROLE authenticated;
--    SET LOCAL request.jwt.claim.email = 'attacker@example.com';
--    SELECT COUNT(*) FROM pathfinder.projects;  -- expect 0
--    RESET ROLE;
--
-- 5. Operator can read all rows:
--    SET LOCAL ROLE authenticated;
--    SET LOCAL request.jwt.claim.email = 'kyle@unicron.systems';
--    SELECT COUNT(*) FROM pathfinder.projects;  -- expect 1825
--    RESET ROLE;
