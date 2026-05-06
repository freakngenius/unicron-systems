-- Sprint 1 Stream B: Add config column to nervous_system.team_members
-- Stores per-member ingest account IDs and workspace preferences.
-- Idempotent: ADD COLUMN IF NOT EXISTS; UPDATE only touches rows where config is empty/null.

ALTER TABLE nervous_system.team_members ADD COLUMN IF NOT EXISTS config jsonb default '{}'::jsonb;

-- Seed empty ingest_accounts shape for all existing team members
UPDATE nervous_system.team_members
SET config = jsonb_build_object(
  'ingest_accounts', jsonb_build_object(
    'plaud_account_id', null,
    'fathom_user_id', null,
    'slack_user_id', null,
    'gmail_address', null,
    'apple_notes_api_key', null,
    'voice_memo_api_key', null
  ),
  'default_kanban_workspace', 'internal'
)
WHERE config = '{}'::jsonb OR config IS NULL;
