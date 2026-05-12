-- 20260512_voice_costs_and_allowlist_modes.sql
--
-- Sprint 5 Stream A — Voice Surface Parity Catch-up.
-- Additive: voice_call_transcripts cost-capture columns + supporting indexes,
-- voice_agent_sources calling-mode columns + CHECK constraint.
--
-- Idempotent. Every column uses ADD COLUMN IF NOT EXISTS. Every index uses
-- CREATE INDEX IF NOT EXISTS. The CHECK constraint is added in two steps
-- (NOT VALID, then VALIDATE) so legacy rows do not fail the initial add.
--
-- Production at Atrium origin/main 0ba59bf already has every column and an
-- equivalent of every index from a prior ad-hoc migration; this file is
-- the reproducible record for fresh-environment applies. Re-runs are safe.

ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS cost_usd        numeric(10,4);
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS cost_breakdown  jsonb;
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS vapi_org_id     text;
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS started_at      timestamptz;

CREATE INDEX IF NOT EXISTS voice_call_transcripts_created_at_desc_idx
  ON pathfinder.voice_call_transcripts (created_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_transcripts_source_created_idx
  ON pathfinder.voice_call_transcripts (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_transcripts_vapi_call_id_idx
  ON pathfinder.voice_call_transcripts (vapi_call_id);

ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS allowlist_mode text DEFAULT 'allowlist';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_agent_sources_allowlist_mode_check'
  ) THEN
    ALTER TABLE pathfinder.voice_agent_sources
      ADD CONSTRAINT voice_agent_sources_allowlist_mode_check
      CHECK (allowlist_mode IN ('allowlist','hubspot','open')) NOT VALID;
    ALTER TABLE pathfinder.voice_agent_sources
      VALIDATE CONSTRAINT voice_agent_sources_allowlist_mode_check;
  END IF;
END $$;

ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS hubspot_filter           jsonb;
ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS open_mode_confirmed_by   text;
ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS open_mode_confirmed_at   timestamptz;
