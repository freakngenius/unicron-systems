-- 20260513_seed_call_process_and_route_skill.sql
--
-- Goal "Fix Atrium call upload end-to-end" — Condition 2: store the canonical
-- call-processing prompt as a single source of truth on
-- nervous_system.skills.system_prompt. The pipeline (calls-action-item-flow.ts)
-- reads this column at runtime instead of the prior hard-coded EXTRACTION_SYSTEM
-- string. SKILL.md at unicron-platform/skills/call-process-and-route/SKILL.md
-- mirrors the same content verbatim for vault parity.
--
-- Additive only. No DROP, no destructive ALTER. The existing 'transcript'
-- skill (seeded 20260511) is untouched.

-- 1. Add system_prompt column if missing. Skills previously stored the prompt
--    via skill_md_path → external file; the new column lets the pipeline read
--    the body directly without a vault filesystem dependency at runtime.
ALTER TABLE nervous_system.skills
  ADD COLUMN IF NOT EXISTS system_prompt text;

-- 2. Upsert the canonical 'call-process-and-route' skill row. Body is the
--    VERBATIM block from the goal directive (do not edit punctuation, casing,
--    or step labels — the runtime pipeline + Atrium UI both rely on exact
--    parity with SKILL.md and the goal hook).

INSERT INTO nervous_system.skills
  (name, description, domain, type,
   inputs_schema, outputs_schema,
   schedule_cron, trigger_event,
   refusal_gate, budget_usd_per_run,
   active, status,
   run_endpoint, skill_md_path,
   system_prompt)
VALUES
  (
    'call-process-and-route',
    'Process an uploaded call transcript: store in Notion, extract action items + decisions + customer mentions, fan out to Atrium surfaces, act on owner-specific tasks.',
    'operations', 'triggered',
    '[
      {"name":"transcript","type":"string","required":false,"description":"Full transcript text. At least one of transcript or summary_notes is required."},
      {"name":"summary_notes","type":"string","required":false,"description":"Summary or shorthand call notes. At least one of transcript or summary_notes is required."},
      {"name":"date","type":"date","required":false,"description":"Date of the call. Defaults to today if not provided."},
      {"name":"participants","type":"array","required":false,"description":"Array of participant identifiers (team_member names or free-text external names)"},
      {"name":"title","type":"string","required":false,"description":"Optional override for the Notion page title."},
      {"name":"source","type":"string","required":false,"description":"Where the transcript came from: manual_upload | plaud | fathom | zoom"}
    ]'::jsonb,
    '[
      {"type":"notion_page","location":"Unicron Call Transcripts DB (NOTION_DB_CALL_TRANSCRIPTS)"},
      {"type":"action_items","location":"nervous_system.action_items rows linked to the call"},
      {"type":"notion_tasks","location":"Internal Org Kanban tasks (NOTION_DB_INTERNAL_KANBAN) with linked_call_id"},
      {"type":"decisions","location":"nervous_system.ledger source_type=''decision'' rows with insights.call_id"},
      {"type":"customer_mentions","location":"nervous_system.ledger source_type=''customer_mention'' rows with insights.call_id + insights.customer_name"},
      {"type":"ledger_row","location":"nervous_system.ledger source_type=''call'' (created by ns_create_call_transcript_ledger_row)"}
    ]'::jsonb,
    NULL,
    'call/transcript.uploaded',
    true, 0.20,
    true, 'active',
    '/api/atrium/skills/run',
    'unicron-platform/skills/call-process-and-route/SKILL.md',
    $SKILL$A transcript or call notes will follow this command.

STEP 1 — STORE IN NOTION
Fill: Title "[Person/Company] — [Date]"; Date; Participants; Key Takeaways (3-5 bullets); Insights (strategic observations, opportunities, risks); Transcript/Notes (full in page body). Inside: action items template + owner + task + notes.

STEP 2 — EXTRACT TO-DOs
For every action item/commitment/follow-up/deliverable, create separate Notion task in Sprint database (ID 08afe62135ff4e4f80e5ba146a752601) with: Title; Owner (Kyle, Keenan, Curtis, Sales, R0sie, or external); Outcome; Steps; Due date (if inferable); Related call link; Priority.

ROUTING in Atrium: write Decisions to Decisions panel; route call into Daily Digest; update Customer 360 / People / Now / Work / any other affected section.

STEP 3 — PROACTIVELY ACT
IF owner is Kyle, Keenan, or Curtis: prep the task page to turnkey. Draft emails, pull Notion context, gather references, outline talking points. Mark what's ready vs needs human input.
IF owner is YOU (system): execute autonomously. Work until complete or blocked. Log progress. State what's needed if blocked.
IF owner is external: tracking item with follow-up reminder if deadline discussed.

Confirm back: notes stored, N to-dos created, status of started tasks.
Use web search and Perplexity Sonar for research.$SKILL$
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
  system_prompt      = EXCLUDED.system_prompt;

-- 3. Public read RPC the pipeline calls to fetch system_prompt for a skill.
CREATE OR REPLACE FUNCTION public.ns_skill_system_prompt(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT system_prompt FROM nervous_system.skills WHERE name = p_name AND active = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_skill_system_prompt(text) TO authenticated, anon, service_role;
