-- 20260508_seed_sprint4_productivity_skills.sql — Sprint 4 Stream E: Productivity Skills
--
-- Inserts 3 Productivity domain skills into nervous_system.skills.
-- Follows the column shape established in 20260508_seed_sprint3_skills.sql:
--   name, description, domain, type, inputs, outputs, schedule_cron,
--   refusal_gate, budget_usd_per_run, skill_path
--
-- The nervous_system.skills table, updated_at trigger, RLS, and
-- ns_list_skills() RPC are all created by the Sprint 3 migration.
-- This migration is additive only — no DROP, no destructive ALTER.

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs_schema, outputs_schema, schedule_cron, refusal_gate, budget_usd_per_run, skill_md_path)
VALUES
  (
    'morning-brief',
    'Pull yesterday''s digest, open escalations, and sprint status into a morning briefing Slack DM',
    'productivity', 'manual',
    '[{"name":"team_member_id","type":"uuid","required":false,"description":"Team member to deliver the brief to (defaults to requesting user)"}]',
    '[{"type":"slack_message","location":"DM to requesting team member"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    'TZ=America/Los_Angeles 0 7 * * 1-5',
    false, 0.05,
    'unicron-platform/.claude/skills/morning-brief/SKILL.md'
  ),
  (
    'inbox-triage',
    'Score and sort unprocessed ingest items in the Inbox; surface top 5 for immediate attention',
    'productivity', 'manual',
    '[{"name":"limit","type":"number","required":false,"description":"Maximum number of items to return (default 5, max 20)"}]',
    '[{"type":"ledger_rows","location":"ordered nervous_system.ledger rows with status=''inbox''"}]',
    null,
    false, 0.01,
    'unicron-platform/.claude/skills/inbox-triage/SKILL.md'
  ),
  (
    'quick-capture',
    'Open the Quick Capture modal and route captured content to Inbox via the ingest skill',
    'productivity', 'manual',
    '[]',
    '[{"type":"ui_event","location":"QuickCapture modal (client-side)"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    null,
    false, 0.00,
    'unicron-platform/.claude/skills/quick-capture/SKILL.md'
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
  skill_md_path      = EXCLUDED.skill_md_path,
  active             = true;
