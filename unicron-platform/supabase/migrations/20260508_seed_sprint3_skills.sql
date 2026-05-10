-- 20260508_seed_sprint3_skills.sql — Sprint 3 Stream E: Skills Registry
--
-- Creates nervous_system.skills table (if not already present from a prior
-- migration), seeds 9 Internal Org / Memory domain skills, and exposes a
-- public RPC ns_list_skills() for use by the Atrium front-end and agent
-- dispatchers.
--
-- Access pattern: agents and the Atrium browser client call
-- ns_list_skills() via Supabase RPC — direct .schema('nervous_system')
-- PostgREST access is not used for skills (consistent with orchestrator
-- team_member lookup pattern from fix #204).
--
-- This migration is additive only — no DROP, no destructive ALTER.

-- ---------------------------------------------------------------------------
-- Ensure uuid-ossp is available (idempotent)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- nervous_system schema (idempotent — created in Sprint 0 nervous_system
-- foundation migration; re-stated here for safety in isolated environments)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS nervous_system;

-- ---------------------------------------------------------------------------
-- nervous_system.skills
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nervous_system.skills (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               text        NOT NULL UNIQUE,
  description        text        NOT NULL,
  domain             text        NOT NULL,
  type               text        NOT NULL CHECK (type IN ('manual', 'scheduled', 'triggered')),
  inputs             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  outputs            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  schedule_cron      text,
  trigger_event      text,
  refusal_gate       boolean     NOT NULL DEFAULT false,
  budget_usd_per_run numeric(10,4),
  active             boolean     NOT NULL DEFAULT true,
  repo               text        NOT NULL DEFAULT 'unicron-systems',
  skill_path         text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION nervous_system.set_skills_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'skills_updated_at_tg'
      AND tgrelid = 'nervous_system.skills'::regclass
  ) THEN
    CREATE TRIGGER skills_updated_at_tg
      BEFORE UPDATE ON nervous_system.skills
      FOR EACH ROW EXECUTE FUNCTION nervous_system.set_skills_updated_at();
  END IF;
END;
$$;

-- RLS
ALTER TABLE nervous_system.skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'skills_read_all'
      AND tablename  = 'skills'
      AND schemaname = 'nervous_system'
  ) THEN
    CREATE POLICY skills_read_all ON nervous_system.skills
      FOR SELECT USING (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'skills_service_write'
      AND tablename  = 'skills'
      AND schemaname = 'nervous_system'
  ) THEN
    CREATE POLICY skills_service_write ON nervous_system.skills
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed Sprint 3 Internal Org / Memory skills
-- ---------------------------------------------------------------------------

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs_schema, outputs_schema, schedule_cron, refusal_gate, budget_usd_per_run, skill_md_path)
VALUES
  (
    'run-decay-tick',
    'Run the Analyst decay tick — archives signals and ledger rows that have decayed below threshold',
    'memory', 'scheduled',
    '[]',
    '[{"type":"vault_doc","location":"wiki/memory/analyst/YYYY-MM-DD.md"}]',
    'TZ=America/Los_Angeles 0 2 * * *',
    false, 0.02,
    'unicron-platform/.claude/skills/run-decay-tick/SKILL.md'
  ),
  (
    'daily-digest',
    'Generate and post the Analyst daily digest — yesterday''s calls, action items, PRs, and decay stats',
    'memory', 'scheduled',
    '[]',
    '[{"type":"vault_doc","location":"wiki/memory/analyst/YYYY-MM-DD.md"},{"type":"slack_message","location":"#orchestrator-feed"}]',
    'TZ=America/Los_Angeles 0 6 * * *',
    false, 0.10,
    'unicron-platform/.claude/skills/daily-digest/SKILL.md'
  ),
  (
    'weekly-retro',
    'Generate the weekly retrospective — sprint outcomes, taboo overrides, top insights, DRI allocation',
    'memory', 'scheduled',
    '[{"name":"week_range","type":"string","required":false,"description":"ISO date range in YYYY-MM-DD/YYYY-MM-DD format (defaults to last 7 days)"}]',
    '[{"type":"vault_doc","location":"wiki/retros/YYYY-WW.md"},{"type":"slack_message","location":"#orchestrator-feed"}]',
    'TZ=America/Los_Angeles 0 22 * * 0',
    false, 0.15,
    'unicron-platform/.claude/skills/weekly-retro/SKILL.md'
  ),
  (
    'vault-search',
    'Semantic search across the knowledge vault — returns ranked docs by relevance',
    'memory', 'manual',
    '[{"name":"query","type":"string","required":true,"description":"Search query in natural language"},{"name":"limit","type":"number","required":false,"description":"Maximum number of results to return (default 10)"}]',
    '[{"type":"vault_doc","location":"ranked list with relevance scores"}]',
    null,
    false, 0.05,
    'unicron-platform/.claude/skills/vault-search/SKILL.md'
  ),
  (
    'propose-taboo-edit',
    'Propose an edit to the taboos register — opens a GitHub PR for peer review',
    'memory', 'manual',
    '[{"name":"proposed_text","type":"string","required":true,"description":"The full proposed content for taboos.md (complete replacement, not a diff)"},{"name":"reason","type":"string","required":true,"description":"Why this edit is proposed — will appear in PR description and audit log"}]',
    '[{"type":"notion_card","location":"internal kanban — taboo edit requests column"},{"type":"vault_doc","location":"PR link recorded in wiki/memory/taboos/proposals/YYYY-MM-DD-<slug>.md"}]',
    null,
    true, 0.02,
    'unicron-platform/.claude/skills/propose-taboo-edit/SKILL.md'
  ),
  (
    'regenerate-master-index',
    'Regenerate the vault master index — rebuilds _master-index.md from current vault directory',
    'memory', 'scheduled',
    '[]',
    '[{"type":"vault_doc","location":"wiki/_master-index.md"}]',
    'TZ=America/Los_Angeles 0 22 * * 0',
    false, 0.08,
    'unicron-platform/.claude/skills/regenerate-master-index/SKILL.md'
  ),
  (
    'vault-lint',
    'Lint the knowledge vault — check for broken links, missing frontmatter, orphan pages',
    'memory', 'scheduled',
    '[]',
    '[{"type":"vault_doc","location":"outputs/reports/wiki-lint-YYYY-WW.md"}]',
    'TZ=America/Los_Angeles 0 22 * * 0',
    false, 0.05,
    'unicron-platform/.claude/skills/vault-lint/SKILL.md'
  ),
  (
    'onboard-team-member',
    'Onboard a new team member — Supabase auth, Notion access invite, Slack welcome, first action item',
    'operations', 'manual',
    '[{"name":"name","type":"string","required":true,"description":"Full name of the new team member"},{"name":"email","type":"string","required":true,"description":"Email address — must match Supabase auth allowlist"},{"name":"role","type":"string","required":true,"description":"Role: founder | cofounder | advisor | contractor"},{"name":"default_surface","type":"string","required":true,"description":"Default Atrium surface: pathfinder | metacron | internal | sales | discovery"}]',
    '[{"type":"ledger_row","location":"nervous_system.ledger"},{"type":"notion_card","location":"internal kanban — onboarding column"},{"type":"slack_message","location":"#orchestrator-feed"}]',
    null,
    true, 0.10,
    'unicron-platform/.claude/skills/onboard-team-member/SKILL.md'
  ),
  (
    'promote-insight-to-memory',
    'Promote a ledger insight to long-term memory — creates a wiki entry from a ledger row insight',
    'memory', 'manual',
    '[{"name":"ledger_id","type":"uuid","required":true,"description":"The ID of the ledger row containing the insight to promote"},{"name":"insight_index","type":"number","required":false,"description":"Which insight in the insights array to promote (default 0 — first insight)"}]',
    '[{"type":"vault_doc","location":"wiki/memory/analyst/insights/YYYY-MM-DD-<slug>.md"}]',
    null,
    false, 0.05,
    'unicron-platform/.claude/skills/promote-insight-to-memory/SKILL.md'
  )
ON CONFLICT (name) DO UPDATE SET
  description        = EXCLUDED.description,
  domain             = EXCLUDED.domain,
  type               = EXCLUDED.type,
  inputs_schema      = EXCLUDED.inputs_schema,
  outputs_schema     = EXCLUDED.outputs_schema,
  schedule_cron      = EXCLUDED.schedule_cron,
  refusal_gate       = EXCLUDED.refusal_gate,
  budget_usd_per_run = EXCLUDED.budget_usd_per_run,
  skill_md_path      = EXCLUDED.skill_md_path;

-- ---------------------------------------------------------------------------
-- ns_list_skills() — public RPC used by Atrium and agents
-- Access pattern: supabase.rpc('ns_list_skills')
-- SECURITY DEFINER so anon/authenticated can read despite nervous_system
-- schema not being exposed via standard PostgREST schema routing.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ns_list_skills();
CREATE OR REPLACE FUNCTION public.ns_list_skills()
RETURNS TABLE (
  id                 uuid,
  name               text,
  description        text,
  domain             text,
  type               text,
  inputs_schema      jsonb,
  outputs_schema     jsonb,
  schedule_cron      text,
  refusal_gate       boolean,
  budget_usd_per_run numeric,
  active             boolean,
  status             text,
  run_endpoint       text,
  skill_md_path      text,
  last_run_at        timestamptz,
  total_runs         integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    id, name, description, domain, type,
    inputs_schema, outputs_schema, schedule_cron, refusal_gate,
    budget_usd_per_run, active, status, run_endpoint, skill_md_path,
    last_run_at, total_runs
  FROM nervous_system.skills
  WHERE active = true
  ORDER BY domain, name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_skills()
  TO authenticated, anon, service_role;
