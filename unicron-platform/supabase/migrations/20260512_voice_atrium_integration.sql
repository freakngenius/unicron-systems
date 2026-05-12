-- =============================================================================
-- 20260512_voice_atrium_integration.sql
--
-- Sprint 5 Stream A — Atrium x Voice Agents foundation merge (v2).
-- Spec: unicron-platform/docs/voice/atrium-voice-integration-spec.md
--
-- Idempotent. Most of this migration is a no-op against the live anfihcusvekpovcchpoh
-- project (the prototype already created the 5 pathfinder.voice_* tables and
-- the customers.facts/facts_updated_at columns; the prototype's old mock_mode
-- column has already been dropped). The genuinely new state introduced here:
--
--   • CREATE SCHEMA metacron
--   • CREATE TABLE metacron.operator_allowlist  (NEW — internal operator gate)
--   • INSERT 4 seed rows for kyle / keenan / curtis / team @unicron.systems
--
-- Voice table CREATE statements are kept here in full DDL form so the migration
-- recreates the schema cleanly on a fresh Supabase project (e.g. a future
-- staging clone). Constraint names and CHECK clauses match what is currently
-- on the live project (introspected via pg_get_constraintdef).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. metacron schema + operator_allowlist  (NEW)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS metacron;

CREATE TABLE IF NOT EXISTS metacron.operator_allowlist (
  email     text PRIMARY KEY,
  role      text NOT NULL CHECK (role IN ('founder','advisor','team')),
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  text,
  notes     text
);

ALTER TABLE metacron.operator_allowlist ENABLE ROW LEVEL SECURITY;
-- No anon policies. Service role only — api/_lib/voiceAuth.ts reads via
-- SUPABASE_SERVICE_ROLE_KEY after verifying the caller's Bearer JWT.

INSERT INTO metacron.operator_allowlist (email, role, added_by, notes) VALUES
  ('kyle@unicron.systems',   'founder', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('keenan@unicron.systems', 'founder', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('curtis@unicron.systems', 'advisor', 'spec-v2', 'Sprint 5 Stream A seed'),
  ('team@unicron.systems',   'team',    'spec-v2', 'Sprint 5 Stream A seed')
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. pathfinder.voice_agent_sources  (no-op on anfihcusvekpovcchpoh)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pathfinder.voice_agent_sources (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_org_id                 text NOT NULL,
  source_name                     text NOT NULL,
  vertical                        text,
  status                          text NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','active','paused','archived')),
  allowlist_phones                text[] NOT NULL DEFAULT ARRAY[]::text[],
  vapi_assistant_id               text,
  vapi_phone_number_id            text,
  voice_provider                  text NOT NULL DEFAULT 'elevenlabs',
  voice_id                        text,
  voice_model                     text,
  llm_model                       text NOT NULL DEFAULT 'claude-sonnet-4.5',
  llm_temperature                 numeric NOT NULL DEFAULT 0.85,
  endpointing_wait_seconds        numeric NOT NULL DEFAULT 0.7,
  system_prompt                   text NOT NULL,
  first_message                   text NOT NULL,
  knowledge_pack                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_email           text NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  agent_type                      text NOT NULL DEFAULT 'discovery'
                                    CHECK (agent_type IN ('discovery','sdr','procurement_checkin','procurement_pull','custom')),
  variable_schema                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice_stability                 numeric DEFAULT 0.5,
  voice_similarity_boost          numeric DEFAULT 0.75,
  voice_style                     numeric DEFAULT 0.0,
  voice_speed                     numeric DEFAULT 1.0,
  voice_use_speaker_boost         boolean DEFAULT true,
  use_case_label                  text,
  draft_config                    jsonb,
  published_at                    timestamptz,
  has_draft                       boolean NOT NULL DEFAULT false,
  first_message_mode              text NOT NULL DEFAULT 'assistant-speaks-first'
                                    CHECK (first_message_mode IN (
                                      'assistant-speaks-first',
                                      'assistant-waits-for-user',
                                      'assistant-speaks-first-with-model-generated-message'
                                    )),
  active_variant_count            integer NOT NULL DEFAULT 1,
  agent_goal                      text,
  autopilot_enabled               boolean NOT NULL DEFAULT true,
  autopilot_confidence_threshold  numeric NOT NULL DEFAULT 0.7,
  artifact_template_key           text,
  allowlist_mode                  text NOT NULL DEFAULT 'allowlist'
                                    CHECK (allowlist_mode IN ('allowlist','hubspot','open')),
  hubspot_filter                  jsonb,
  open_mode_confirmed_by          text,
  open_mode_confirmed_at          timestamptz
);

-- mock_mode cleanup per spec §13.5 — already dropped on live project; this is
-- the no-op confirmation in case anyone re-applies on a fresh DB that still
-- carries the column.
ALTER TABLE pathfinder.voice_agent_sources DROP COLUMN IF EXISTS mock_mode;

-- ---------------------------------------------------------------------------
-- 3. pathfinder.voice_call_transcripts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pathfinder.voice_call_transcripts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                uuid NOT NULL
                             REFERENCES pathfinder.voice_agent_sources(id) ON DELETE CASCADE,
  customer_org_id          text NOT NULL,
  vapi_call_id             text UNIQUE,
  to_phone                 text NOT NULL,
  from_phone               text NOT NULL,
  contact_name             text,
  related_project_id       text,
  related_lead_contact_id  uuid,
  call_status              text NOT NULL DEFAULT 'queued'
                             CHECK (call_status IN (
                               'queued','dialing','in-progress','ended','failed','rejected_not_allowlisted'
                             )),
  ended_reason             text,
  duration_seconds         integer,
  recording_url            text,
  transcript               jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary                  text,
  sentiment                text,
  followups                jsonb NOT NULL DEFAULT '[]'::jsonb,
  operator_review_status   text NOT NULL DEFAULT 'pending'
                             CHECK (operator_review_status IN (
                               'pending','approved','rejected','needs_followup'
                             )),
  operator_notes           text,
  reviewed_by_user_email   text,
  reviewed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  ended_at                 timestamptz,
  structured_data          jsonb,
  outcome                  text,
  success_score            numeric,
  raw_payload              jsonb,
  prompt_version_id        uuid,
  memory_pack_id           uuid,
  callee_phone             text,
  cost_usd                 numeric,
  cost_breakdown           jsonb,
  vapi_org_id              text,
  started_at               timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. pathfinder.voice_call_attempts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pathfinder.voice_call_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid REFERENCES pathfinder.voice_agent_sources(id),
  agent_type          text NOT NULL,
  customer_org_id     text,
  config_id           uuid,
  target_office_key   text,
  hubspot_contact_id  text,
  to_phone            text NOT NULL,
  status              text NOT NULL DEFAULT 'queued',
  vapi_call_id        text,
  transcript_row_id   uuid REFERENCES pathfinder.voice_call_transcripts(id),
  attempt_count       integer NOT NULL DEFAULT 1,
  outcome             text,
  scheduled_for       timestamptz NOT NULL DEFAULT now(),
  claimed_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  error_message       text
);

-- ---------------------------------------------------------------------------
-- 5. pathfinder.procurement_pull_configs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pathfinder.procurement_pull_configs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_org_id             text NOT NULL,
  config_name                 text NOT NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  target_offices              jsonb NOT NULL DEFAULT '[]'::jsonb,
  pull_objective              text NOT NULL,
  qualifying_questions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice_id                    text,
  agent_name                  text NOT NULL DEFAULT 'Sarah',
  caller_brand                text NOT NULL DEFAULT 'Unicron Systems',
  disclosure_text             text NOT NULL,
  quiet_hours_start           time DEFAULT '20:00:00'::time,
  quiet_hours_end             time DEFAULT '08:00:00'::time,
  state_specific_compliance   jsonb DEFAULT '{}'::jsonb,
  field_mapping               jsonb DEFAULT '{}'::jsonb,
  vapi_assistant_id           text,
  vapi_phone_number_id        text,
  voice_agent_source_id       uuid REFERENCES pathfinder.voice_agent_sources(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- voice_call_attempts.config_id references procurement_pull_configs but the FK
-- can't be declared above (forward reference). Add it now if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_call_attempts_config_id_fkey'
  ) THEN
    ALTER TABLE pathfinder.voice_call_attempts
      ADD CONSTRAINT voice_call_attempts_config_id_fkey
      FOREIGN KEY (config_id) REFERENCES pathfinder.procurement_pull_configs(id);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 6. pathfinder.customer_call_extractions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pathfinder.customer_call_extractions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id            uuid NOT NULL
                             REFERENCES pathfinder.voice_call_transcripts(id) ON DELETE CASCADE,
  customer_org_id          text NOT NULL REFERENCES pathfinder.customers(id),
  extracted_at             timestamptz NOT NULL DEFAULT now(),
  model                    text NOT NULL,
  decision_makers          jsonb NOT NULL DEFAULT '[]'::jsonb,
  pain_points              jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_signals           jsonb NOT NULL DEFAULT '[]'::jsonb,
  timing_signals           jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitors              jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action              text,
  signal_strength          numeric,
  verifier_confidence      numeric,
  raw_response             jsonb,
  applied_to_customer_at   timestamptz,
  review_status            text NOT NULL DEFAULT 'pending'
);

-- ---------------------------------------------------------------------------
-- 7. pathfinder.customers — facts rollup columns
-- ---------------------------------------------------------------------------

ALTER TABLE pathfinder.customers
  ADD COLUMN IF NOT EXISTS facts             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS facts_updated_at  timestamptz;

COMMENT ON COLUMN pathfinder.customers.facts IS
  'Rolled-up structured facts from voice calls. Buckets: decision_makers, '
  'pain_points, budget_signals, timing_signals, competitors, next_action. '
  'Each fact carries last_seen_at + source_call_id + confidence.';
