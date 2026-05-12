-- 20260512_ledger_source_type_extend_for_slack_daily_scan.sql
--
-- nervous_system.ledger.source_type CHECK constraint blocked S2's intended values:
--   'slack_channel_scan' (per-channel summary rows from slack-daily-scan)
--   'decision'           (Elder-style decision rows extracted from Slack scans
--                         and other agentic surfaces)
--
-- Diagnosis: Inngest run wrote 6 action_items + 1 digest row + audit log entry
-- (tables without this constraint), but 0 ledger rows. The RPC raised 23514 and
-- the JS helper swallowed the error as console.error. This migration replaces
-- the constraint with the extended allowlist.
--
-- Applied directly via Supabase MCP at 2026-05-12 03:00 UTC. This file commits
-- the change to the migration history so future projects pick it up cleanly.

alter table nervous_system.ledger
  drop constraint if exists ledger_source_type_check;

alter table nervous_system.ledger
  add constraint ledger_source_type_check
  check (source_type = any (array[
    'call',
    'slack',
    'email',
    'voice_memo',
    'apple_note',
    'cowork_session',
    'agent_run',
    'manual',
    'slack_channel_scan',
    'decision'
  ]));
