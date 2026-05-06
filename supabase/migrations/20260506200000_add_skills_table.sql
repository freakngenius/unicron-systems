-- Sprint 2 Stream C: nervous_system.skills registry table
-- Skills represent discrete callable actions the system can dispatch.
-- Sprint 2: all active=false (buttons disabled in Atrium).
-- Sprint 3+: individual skills set active=true as implemented.

CREATE TABLE IF NOT EXISTS nervous_system.skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  description     text NOT NULL,
  domain          text NOT NULL CHECK (domain IN (
                    'memory', 'productivity', 'research', 'discovery',
                    'sales', 'marketing', 'operations', 'pathfinder', 'metacron'
                  )),
  type            text NOT NULL CHECK (type IN ('manual', 'scheduled', 'triggered')),
  inputs_schema   jsonb DEFAULT '[]'::jsonb,
  outputs_schema  jsonb DEFAULT '[]'::jsonb,
  schedule_cron   text,
  trigger_event   text,
  refusal_gate    boolean DEFAULT true,
  budget_usd_per_run numeric,
  skill_md_path   text,
  active          boolean DEFAULT false,
  registered_at   timestamptz DEFAULT now(),
  last_run_at     timestamptz,
  total_runs      integer DEFAULT 0
);

-- RLS: authenticated can read; service role writes
ALTER TABLE nervous_system.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ns skills read" ON nervous_system.skills;
CREATE POLICY "ns skills read" ON nervous_system.skills
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service role bypass" ON nervous_system.skills;
CREATE POLICY "service role bypass" ON nervous_system.skills
  USING (true) WITH CHECK (true);

-- Seed Sprint 2 skill stubs (all inactive — activated as sprints complete)
INSERT INTO nervous_system.skills (name, description, domain, type, active) VALUES
  ('vault-cleanup',      'Remove stale and duplicate vault entries',           'memory',       'manual',    false),
  ('daily-digest',       'Summarise yesterday''s activity into analyst memory','memory',       'scheduled', false),
  ('vault-search',       'Semantic search across the knowledge vault',         'memory',       'manual',    false),
  ('morning-brief',      'Produce the morning briefing for the team',          'productivity', 'scheduled', false),
  ('inbox-triage',       'Route and prioritise incoming signals',              'productivity', 'triggered', false),
  ('quick-capture',      'Accept ad-hoc text/photo/voice into the ledger',     'productivity', 'manual',    false),
  ('deep-research',      'Multi-step web research with citations',             'research',     'manual',    false),
  ('lightrag-query',     'Query the LightRAG knowledge graph',                 'research',     'manual',    false),
  ('morning-trend',      'Pull trending signals from the web each morning',    'research',     'scheduled', false),
  ('schedule-call',      'Book a discovery or customer call',                  'discovery',    'manual',    false),
  ('extract-signals',    'Extract FACT/QUESTION/PATTERN/RISK from a source',   'discovery',    'manual',    false),
  ('pipeline-stage',     'Move a lead or deal through pipeline stages',        'sales',        'manual',    false),
  ('generate-proposal',  'Draft a proposal document for a customer',           'sales',        'manual',    false),
  ('blog-post',          'Generate a long-form blog post',                     'marketing',    'manual',    false),
  ('social-post',        'Generate short-form social content',                 'marketing',    'manual',    false),
  ('onboard-member',     'Onboard a new team member into the nervous system',  'operations',   'manual',    false),
  ('propose-taboo-edit', 'Propose an edit to a Taboo Keeper rule',             'operations',   'manual',    false)
ON CONFLICT (name) DO NOTHING;
