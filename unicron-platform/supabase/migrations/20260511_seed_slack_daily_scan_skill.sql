-- 20260511_seed_slack_daily_scan_skill.sql — Stream S3
--
-- Registers the "Run Slack Daily Scan" skill in nervous_system.skills so it
-- appears in the Atrium Now > Skills tray. Pressing Run dispatches against
-- /api/atrium/skills/run with skill_slug='slack-daily-scan', which sends the
-- 'slack/daily-scan.run' Inngest event so the same code path as the 06:00 PT
-- cron executes — no duplicate logic.

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs_schema, outputs_schema, schedule_cron, refusal_gate, budget_usd_per_run, active, status, run_endpoint, skill_md_path)
VALUES
  (
    'slack-daily-scan',
    'Scan every bot-member Slack channel''s last 24h, extract action items + decisions, synthesize a top theme, and upsert today''s digest. Fires on demand; the 06:00 PT cron runs the same path automatically.',
    'productivity',
    'manual',
    '[
      {"name":"date","type":"string","required":false,"description":"YYYY-MM-DD digest date. Defaults to today (PT)."},
      {"name":"dryRun","type":"boolean","required":false,"description":"If true, no DB writes — returns extraction counts only. Useful for sanity-checking summaries before they land."}
    ]'::jsonb,
    '[
      {"type":"digest_row","location":"nervous_system.slack_daily_digest"},
      {"type":"ledger_rows","location":"nervous_system.ledger (source_type=slack_channel_scan + decision)"},
      {"type":"action_items","location":"nervous_system.action_items"}
    ]'::jsonb,
    'TZ=America/Los_Angeles 0 6 * * *',
    false,    -- refusal_gate handled in-loop via bounded writes + audit_log
    0.05,     -- per-run budget estimate (Haiku-per-channel + Sonnet top-theme; conservative)
    true,
    'active',
    '/api/atrium/skills/run',
    'unicron-platform/lib/agents/slack-daily-scan.ts'
  )
ON CONFLICT (name) DO UPDATE SET
  description    = EXCLUDED.description,
  inputs_schema  = EXCLUDED.inputs_schema,
  outputs_schema = EXCLUDED.outputs_schema,
  schedule_cron  = EXCLUDED.schedule_cron,
  active         = EXCLUDED.active,
  status         = EXCLUDED.status,
  run_endpoint   = EXCLUDED.run_endpoint,
  skill_md_path  = EXCLUDED.skill_md_path;
