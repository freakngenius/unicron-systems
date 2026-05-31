-- 20260530_icp_search_foundation.sql
-- ICP Saved Search Stream S1 Foundation.
--
-- Additive migration: creates the two new tables and adds one nullable
-- column to pathfinder.projects. Zero row updates. Zero changes to
-- existing column shapes. Zedcor, Realberry, Funder, and Internal data
-- byte-identical post-apply because no UPDATE/DELETE/ALTER on existing
-- columns is issued.
--
-- Tables:
--   pathfinder.saved_searches  one row per user-defined search
--   pathfinder.search_runs     one row per orchestrator invocation
--
-- Column:
--   pathfinder.projects.saved_search_id  nullable fk back to the
--     saved_search that produced the lead (NULL for all existing rows;
--     populated only for newly-ingested projects under the search flow).

CREATE TABLE IF NOT EXISTS pathfinder.saved_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES pathfinder.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  icp_text        text NOT NULL,
  region          text NOT NULL,
  radius_mi       integer NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','planning','running','complete','failed')),
  architecture    jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_plan     jsonb NOT NULL DEFAULT '{"tier1":[],"tier2":[],"tier3":[]}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_org_idx
  ON pathfinder.saved_searches (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pathfinder.search_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id  uuid NOT NULL REFERENCES pathfinder.saved_searches(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending',
  phase            text,
  progress         jsonb NOT NULL DEFAULT '{"phases":[]}'::jsonb,
  stats            jsonb NOT NULL DEFAULT '{"sources_found":0,"companies_ingested":0,"scored":0,"verified":0}'::jsonb,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_runs_saved_search_idx
  ON pathfinder.search_runs (saved_search_id, created_at DESC);

-- Additive: nullable column. Existing rows remain unchanged; all newly
-- inserted projects from the orchestrator's scrape phase carry this fk.
ALTER TABLE pathfinder.projects
  ADD COLUMN IF NOT EXISTS saved_search_id uuid REFERENCES pathfinder.saved_searches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_saved_search_idx
  ON pathfinder.projects (saved_search_id) WHERE saved_search_id IS NOT NULL;

-- RLS: enable but leave service-role-only (no policies). Matches the
-- posture of pathfinder.chat_threads / chat_messages prior to the
-- restore_anon_read_customer_dashboard_pt* series. Internal route
-- handlers use supabaseAdmin().
ALTER TABLE pathfinder.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathfinder.search_runs    ENABLE ROW LEVEL SECURITY;
