-- 20260510_seed_sprint6_marketing_skills.sql — Sprint 6 Stream E: Marketing Skills
--
-- Seeds 4 Marketing domain skills into nervous_system.skills.
-- All four skills are active (live run endpoints at /api/atrium/skills/run).
--
-- Column shape (as patched in sprint 5): inputs_schema, outputs_schema, skill_md_path,
-- status (active | scaffolded | deprecated), run_endpoint.
-- No DROP, no destructive ALTER — additive only.

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs_schema, outputs_schema, schedule_cron, refusal_gate, budget_usd_per_run, active, status, run_endpoint, skill_md_path)
VALUES
  (
    'draft-blog-post',
    'Draft a blog post on a given topic using our brand voice and recent company context from the vault',
    'marketing', 'manual',
    '[{"name":"topic","type":"string","required":true,"description":"The blog post topic or title"},{"name":"target_audience","type":"string","required":false,"description":"Intended audience for the post (e.g. construction security buyers, investors)"}]',
    '[{"type":"draft_text","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    NULL,
    false, 0.12,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/draft-blog-post/SKILL.md'
  ),
  (
    'draft-social-post',
    'Draft social posts (LinkedIn, Twitter) for a topic, campaign, or recent milestone',
    'marketing', 'manual',
    '[{"name":"topic","type":"string","required":true,"description":"The topic, campaign, or milestone to post about"},{"name":"platform","type":"string","required":false,"description":"Target platform: linkedin | twitter | both (default: both)"}]',
    '[{"type":"draft_text","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    NULL,
    false, 0.06,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/draft-social-post/SKILL.md'
  ),
  (
    'generate-positioning-deck',
    'Generate a slide-by-slide positioning deck outline for a specific audience segment',
    'marketing', 'manual',
    '[{"name":"audience","type":"string","required":true,"description":"Target audience segment (e.g. construction security buyers, municipal procurement)"},{"name":"product","type":"string","required":false,"description":"Product to position: pathfinder | metacron (default: pathfinder)"}]',
    '[{"type":"deck_outline","location":"returned in response as JSON slides array"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    NULL,
    false, 0.15,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/generate-positioning-deck/SKILL.md'
  ),
  (
    'update-manifesto-page',
    'Propose updates to a manifesto page based on recent company developments and vault context',
    'marketing', 'manual',
    '[{"name":"page_slug","type":"string","required":true,"description":"Slug of the manifesto page to update (e.g. why-we-build)"},{"name":"proposed_changes","type":"string","required":true,"description":"Description of the changes to propose — what to add, remove, or reframe"}]',
    '[{"type":"draft_text","location":"returned in response"},{"type":"ledger_row","location":"nervous_system.ledger"}]',
    NULL,
    false, 0.08,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/.claude/skills/update-manifesto-page/SKILL.md'
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
  active             = EXCLUDED.active,
  status             = EXCLUDED.status,
  run_endpoint       = EXCLUDED.run_endpoint,
  skill_md_path      = EXCLUDED.skill_md_path;
