-- 20260510_seed_sprint5_llm_council_skill.sql — Sprint 5 Stream B: LLM Council Skill
--
-- Registers the llm-council-deliberate skill in nervous_system.skills.
-- Follows the column shape established in 20260508_seed_sprint3_skills.sql:
--   name, description, domain, type, inputs, outputs, schedule_cron,
--   refusal_gate, budget_usd_per_run, skill_path
--
-- This migration is additive only — no DROP, no destructive ALTER.

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs, outputs, schedule_cron, trigger_event, refusal_gate, budget_usd_per_run, skill_path)
VALUES
  (
    'llm-council-deliberate',
    '3-model parallel deliberation with anonymous cross-review and Chairman synthesis — use for hard architectural, customer, or vertical decisions',
    'research', 'manual',
    '[{"name":"question","type":"string","required":true,"description":"The question or decision to deliberate on"},{"name":"criteria","type":"string[]","required":true,"description":"Evaluation criteria each panelist must address (non-empty array)"},{"name":"context","type":"string","required":false,"description":"Optional additional context prepended to the deliberation prompt"}]',
    '[{"type":"ledger_row","location":"nervous_system.ledger"},{"type":"audit_log","location":"audit_log (action=council_deliberate)"}]',
    null,
    null,
    false,
    0.20,
    'unicron-platform/.claude/skills/llm-council-deliberate/SKILL.md'
  )
ON CONFLICT (name) DO UPDATE SET
  description        = EXCLUDED.description,
  domain             = EXCLUDED.domain,
  type               = EXCLUDED.type,
  inputs             = EXCLUDED.inputs,
  outputs            = EXCLUDED.outputs,
  schedule_cron      = EXCLUDED.schedule_cron,
  trigger_event      = EXCLUDED.trigger_event,
  refusal_gate       = EXCLUDED.refusal_gate,
  budget_usd_per_run = EXCLUDED.budget_usd_per_run,
  skill_path         = EXCLUDED.skill_path,
  updated_at         = now();
