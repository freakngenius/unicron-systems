-- Phase 2 reconciliation: Stream D shipped pathfinder.architect_sessions
-- (migration 0070) with required columns session_type, trigger, input_payload
-- and a CHECK constraint over status in ('in_progress','completed','failed','timed_out').
-- Stream E (PR #36) writes additional columns and uses different status values.
-- This migration:
--   1. Adds Stream E's expected columns as nullable (Stream D's NOT NULLs stay canonical)
--   2. Widens the status CHECK to the union of statuses both streams actually emit
--
-- Stream E code (services/source-onboarder/session.ts) is patched in the same
-- PR to populate Stream D's NOT NULL columns (session_type='discovery',
-- trigger='operator_action', input_payload mirrors `input`) so existing
-- Stream D constraints stay satisfied without widening session_type CHECK.

ALTER TABLE pathfinder.architect_sessions
  ADD COLUMN IF NOT EXISTS agent_role text,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS input jsonb,
  ADD COLUMN IF NOT EXISTS outcome jsonb,
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS total_llm_calls integer,
  ADD COLUMN IF NOT EXISTS total_tool_calls integer,
  ADD COLUMN IF NOT EXISTS created_by_user_email text;

ALTER TABLE pathfinder.architect_sessions DROP CONSTRAINT IF EXISTS architect_sessions_status_check;
ALTER TABLE pathfinder.architect_sessions
  ADD CONSTRAINT architect_sessions_status_check
  CHECK (status IN (
    'in_progress',   -- Stream D
    'running',       -- Stream E createSession
    'completed',     -- Stream D
    'succeeded',     -- Stream E finalizeSession
    'failed',        -- both streams
    'timed_out',     -- both streams
    'needs_assist'   -- Stream E (Tier 2 escalation)
  ));

CREATE INDEX IF NOT EXISTS architect_sessions_agent_role_idx ON pathfinder.architect_sessions (agent_role) WHERE agent_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS architect_sessions_created_by_idx ON pathfinder.architect_sessions (created_by_user_email) WHERE created_by_user_email IS NOT NULL;
