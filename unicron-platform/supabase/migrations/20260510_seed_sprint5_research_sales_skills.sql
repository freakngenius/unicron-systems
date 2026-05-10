-- 20260510_seed_sprint5_research_sales_skills.sql — Sprint 5 Stream G: Research/Sales/Discovery Skills
--
-- Registers 10 Research and Sales/Discovery domain skills in nervous_system.skills.
-- 3 skills are active (live run endpoints), 7 are scaffolded (202 placeholder, full impl Sprint 6).
--
-- Schema note: this migration adds a `status` text column (active | scaffolded) to the
-- skills table so the Atrium UI can distinguish live from coming-soon skills without
-- hiding scaffolded rows entirely. The existing boolean `active` column is preserved;
-- scaffolded skills have active=true (visible) but status='scaffolded'.
--
-- Also adds `run_endpoint` text column for explicit routing metadata used by the
-- skills/run endpoint and agent dispatchers.
--
-- This migration is additive only — no DROP, no destructive ALTER.

-- ---------------------------------------------------------------------------
-- Add status and run_endpoint columns if they don't already exist
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system'
      AND table_name   = 'skills'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'scaffolded', 'deprecated'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system'
      AND table_name   = 'skills'
      AND column_name  = 'run_endpoint'
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD COLUMN run_endpoint text;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Update ns_list_skills() RPC to include new columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ns_list_skills()
RETURNS TABLE (
  id                 uuid,
  name               text,
  description        text,
  domain             text,
  type               text,
  inputs             jsonb,
  outputs            jsonb,
  schedule_cron      text,
  refusal_gate       boolean,
  budget_usd_per_run numeric,
  active             boolean,
  status             text,
  run_endpoint       text,
  skill_path         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    id, name, description, domain, type,
    inputs, outputs, schedule_cron, refusal_gate,
    budget_usd_per_run, active, status, run_endpoint, skill_path
  FROM nervous_system.skills
  WHERE active = true
  ORDER BY domain, name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_skills()
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Seed Sprint 5 Research domain skills
-- ---------------------------------------------------------------------------

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs, outputs, refusal_gate, budget_usd_per_run, active, status, run_endpoint, skill_path)
VALUES
  (
    'deep-research',
    'Autoresearch a topic to an 8-15 page synthesized brief with citations in wiki/research/',
    'research', 'manual',
    '[{"name":"topic","type":"string","required":true,"description":"The research topic or question to investigate"},{"name":"depth","type":"string","required":false,"description":"Depth level: quick | standard | deep (default: standard)"}]',
    '[{"type":"vault_doc","location":"wiki/research/YYYY-MM-DD-<slug>.md"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.40,
    true, 'active',
    '/api/skills/deep-research',
    'unicron-platform/.claude/skills/deep-research/SKILL.md'
  ),
  (
    'llm-council-deliberate',
    '3-model parallel deliberation with anonymous cross-review and Chairman synthesis',
    'research', 'manual',
    '[{"name":"question","type":"string","required":true,"description":"The question or decision to deliberate on"},{"name":"criteria","type":"string","required":false,"description":"Evaluation criteria for the Chairman synthesis (optional)"}]',
    '[{"type":"council_result","location":"in-memory + ledger_row"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.25,
    true, 'active',
    '/api/atrium/council-deliberate',
    'unicron-platform/.claude/skills/llm-council-deliberate/SKILL.md'
  ),
  (
    'light-rag-query',
    'Query the vault knowledge graph with a natural language question',
    'research', 'manual',
    '[{"name":"question","type":"string","required":true,"description":"Natural language question to query the vault knowledge graph"}]',
    '[{"type":"rag_results","location":"ranked vault documents with relevance scores"}]',
    false, 0.05,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/light-rag-query/SKILL.md'
  ),
  (
    'morning-trend-scan',
    'Daily brief of industry signals, competitor moves, and market trends',
    'research', 'scheduled',
    '[{"name":"verticals","type":"string","required":false,"description":"Comma-separated verticals to scan (default: all tracked verticals)"}]',
    '[{"type":"vault_doc","location":"wiki/research/trends/YYYY-MM-DD.md"},{"type":"slack_message","location":"#orchestrator-feed"}]',
    'TZ=America/Los_Angeles 0 7 * * 1-5',
    false, 0.15,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/morning-trend-scan/SKILL.md'
  ),
  (
    'competitor-watch',
    'Monitor named competitors for product, pricing, and messaging changes',
    'research', 'scheduled',
    '[{"name":"competitors","type":"string","required":false,"description":"Comma-separated competitor names to monitor (defaults to all tracked competitors)"}]',
    '[{"type":"vault_doc","location":"wiki/research/competitors/YYYY-MM-DD.md"},{"type":"slack_message","location":"#orchestrator-feed"}]',
    'TZ=America/Los_Angeles 0 8 * * 1-5',
    false, 0.12,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/competitor-watch/SKILL.md'
  )
ON CONFLICT (name) DO UPDATE SET
  description        = EXCLUDED.description,
  domain             = EXCLUDED.domain,
  type               = EXCLUDED.type,
  inputs             = EXCLUDED.inputs,
  outputs            = EXCLUDED.outputs,
  schedule_cron      = EXCLUDED.schedule_cron,
  refusal_gate       = EXCLUDED.refusal_gate,
  budget_usd_per_run = EXCLUDED.budget_usd_per_run,
  active             = EXCLUDED.active,
  status             = EXCLUDED.status,
  run_endpoint       = EXCLUDED.run_endpoint,
  skill_path         = EXCLUDED.skill_path,
  updated_at         = now();

-- ---------------------------------------------------------------------------
-- Seed Sprint 5 Sales/Discovery domain skills
-- ---------------------------------------------------------------------------

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs, outputs, refusal_gate, budget_usd_per_run, active, status, run_endpoint, skill_path)
VALUES
  (
    'schedule-discovery-call',
    'Draft outreach and schedule a discovery call with a named prospect',
    'sales', 'manual',
    '[{"name":"prospect_name","type":"string","required":true,"description":"Full name of the prospect"},{"name":"company","type":"string","required":false,"description":"Prospect company name"},{"name":"context","type":"string","required":false,"description":"Any context about the prospect or relationship"}]',
    '[{"type":"draft_email","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.08,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/schedule-discovery-call/SKILL.md'
  ),
  (
    'extract-vertical-signals',
    'Identify emerging signals from recent call/email/note ingest',
    'sales', 'manual',
    '[{"name":"lookback_hours","type":"number","required":false,"description":"Hours of ingest history to analyze (default 48)"},{"name":"vertical","type":"string","required":false,"description":"Filter to a specific vertical"}]',
    '[{"type":"signals_list","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.10,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/extract-vertical-signals/SKILL.md'
  ),
  (
    'draft-follow-up-email',
    'Generate a personalized follow-up email for a given contact',
    'sales', 'manual',
    '[{"name":"contact_name","type":"string","required":true,"description":"Name of the contact to follow up with"},{"name":"context","type":"string","required":false,"description":"Context about the previous interaction (pulled from ledger if omitted)"}]',
    '[{"type":"draft_email","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.06,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/draft-follow-up-email/SKILL.md'
  ),
  (
    'track-pipeline-stage',
    'Update a customer stage in the pipeline with a note',
    'sales', 'manual',
    '[{"name":"customer_id","type":"uuid","required":true,"description":"UUID of the customer record to update"},{"name":"new_stage","type":"string","required":true,"description":"New pipeline stage: lead | qualified | proposal | negotiation | closed_won | closed_lost"},{"name":"note","type":"string","required":false,"description":"Optional note to attach to the stage change"}]',
    '[{"type":"db_update","location":"nervous_system.customers (stage field)"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    false, 0.01,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/track-pipeline-stage/SKILL.md'
  ),
  (
    'generate-proposal',
    'Draft a discovery-informed proposal for a named customer',
    'sales', 'manual',
    '[{"name":"customer_id","type":"uuid","required":false,"description":"UUID of the customer (uses recent ledger context if provided)"},{"name":"customer_name","type":"string","required":false,"description":"Customer name (used if customer_id not provided)"},{"name":"focus","type":"string","required":false,"description":"Specific focus area or problem to address in the proposal"}]',
    '[{"type":"vault_doc","location":"wiki/sales/proposals/YYYY-MM-DD-<slug>.md"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    true, 0.30,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/generate-proposal/SKILL.md'
  )
ON CONFLICT (name) DO UPDATE SET
  description        = EXCLUDED.description,
  domain             = EXCLUDED.domain,
  type               = EXCLUDED.type,
  inputs             = EXCLUDED.inputs,
  outputs            = EXCLUDED.outputs,
  schedule_cron      = EXCLUDED.schedule_cron,
  refusal_gate       = EXCLUDED.refusal_gate,
  budget_usd_per_run = EXCLUDED.budget_usd_per_run,
  active             = EXCLUDED.active,
  status             = EXCLUDED.status,
  run_endpoint       = EXCLUDED.run_endpoint,
  skill_path         = EXCLUDED.skill_path,
  updated_at         = now();
