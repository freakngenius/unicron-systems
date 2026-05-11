-- 20260511_seed_calls_transcript_skill.sql — Calls Ingestion Sprint Stream C1
--
-- Seeds the 'transcript' skill into nervous_system.skills.
-- Skill body lives in the unicron-knowledge vault (Karpathy raw/wiki/outputs
-- pattern); this is the first skill whose skill_md_path points outside of
-- unicron-platform/.claude/skills/. The skill loader (runtime resolution
-- comes online in C3/C6) reads the .md from the vault checkout alongside
-- the platform repo.
--
-- Used when a transcript or call notes are uploaded via Atrium Work > Calls
-- (manual upload modal, or pushed by the Plaud / Fathom / Zoom auto-ingestion
-- connectors). The skill performs STEP 1 store-in-Notion, STEP 2 extract
-- to-dos, STEP 3 act-on-tasks per owner (team-member prep / Co-Pilot
-- autonomous execution / external follow-up).
--
-- refusal_gate=true because the skill makes external writes (Notion DB pages
-- + Notion Kanban tasks) and creates Atrium action_items autonomously. The
-- Taboo Keeper layer wraps every state change per HARD CONSTRAINT 2 of the
-- Internal Nervous System spec.
--
-- status='scaffolded' for now — the run endpoint (api/atrium/skills/run.ts)
-- will return 202 until C2 (Notion service module) + C3 (modal dispatch) +
-- C6 (action item extraction) ship. Promotion to status='active' happens in
-- C6's migration once the full pipeline is wired.
--
-- Additive only. No DROP, no destructive ALTER.

INSERT INTO nervous_system.skills
  (name, description, domain, type, inputs_schema, outputs_schema,
   schedule_cron, trigger_event, refusal_gate, budget_usd_per_run,
   active, status, run_endpoint, skill_md_path)
VALUES
  (
    'transcript',
    'Store a call transcript in the Notion Call Transcripts DB, extract every action item with owner / outcome / steps / priority, then act on each task per owner (team-member prep, Co-Pilot autonomous execution, or external follow-up)',
    'operations', 'triggered',
    '[
      {"name":"transcript","type":"string","required":false,"description":"Full transcript text. At least one of transcript or summary_notes is required."},
      {"name":"summary_notes","type":"string","required":false,"description":"Summary or shorthand call notes. At least one of transcript or summary_notes is required."},
      {"name":"date","type":"date","required":false,"description":"Date of the call. Defaults to today if not provided."},
      {"name":"participants","type":"array","required":false,"description":"Array of participant identifiers (team_member uuids or free-text external names)"},
      {"name":"title","type":"string","required":false,"description":"Optional override for the Notion page title. Defaults to [Person/Company] — [Date]."},
      {"name":"source","type":"string","required":false,"description":"Where the transcript came from: manual_upload | plaud | fathom | zoom"}
    ]'::jsonb,
    '[
      {"type":"notion_page","location":"Unicron Call Transcripts DB (NOTION_DB_CALL_TRANSCRIPTS)"},
      {"type":"action_items","location":"nervous_system.action_items rows linked to the call"},
      {"type":"notion_tasks","location":"Internal Org Kanban tasks (NOTION_DB_INTERNAL_KANBAN) with linked_call_id"},
      {"type":"ledger_row","location":"nervous_system.ledger source_type=''call''"}
    ]'::jsonb,
    NULL,
    'call_transcript_uploaded',
    true, 0.20,
    true, 'scaffolded',
    '/api/atrium/skills/run',
    'unicron-knowledge/wiki/skills/transcript.md'
  )
ON CONFLICT (name) DO UPDATE SET
  description        = EXCLUDED.description,
  domain             = EXCLUDED.domain,
  type               = EXCLUDED.type,
  inputs_schema      = EXCLUDED.inputs_schema,
  outputs_schema     = EXCLUDED.outputs_schema,
  schedule_cron      = EXCLUDED.schedule_cron,
  trigger_event      = EXCLUDED.trigger_event,
  refusal_gate       = EXCLUDED.refusal_gate,
  budget_usd_per_run = EXCLUDED.budget_usd_per_run,
  active             = EXCLUDED.active,
  status             = EXCLUDED.status,
  run_endpoint       = EXCLUDED.run_endpoint,
  skill_md_path      = EXCLUDED.skill_md_path,
  updated_at         = now();
