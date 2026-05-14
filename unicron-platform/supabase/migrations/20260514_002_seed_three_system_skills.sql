-- 20260514_002_seed_three_system_skills.sql — Sprint 9 Stream D
--
-- Seeds (or updates in place) the three system Skills called out in
-- Addendum 5 §8 that validate the procedural-memory surface end-to-end
-- before Skill Forge ships:
--
--   1. run_zedcor_weekly_digest
--   2. onboard_county_records_source
--   3. draft_briefing_for_bd_rep
--
-- Lookup at apply time (2026-05-14): none of the three names exist in
-- nervous_system.skills, so this file INSERTs full rows and the
-- ON CONFLICT (name, version) WHERE customer_id IS NULL DO UPDATE branch is the idempotent re-apply path.
--
-- This migration MUST sort lexically AFTER Stream A's
-- 20260514_000_procedural_memory_layer.sql (Addendum 5 §2), because it
-- writes to columns Stream A adds (lifecycle_status, version, author_kind,
-- author_id, approved_by, approved_at, taboo_check_id, evidence). If Stream
-- A lands on a different YYYYMMDD prefix, the conductor renames this file
-- to match. The 000/001/002 suffix scheme is documented in the PR body.
--
-- ──────────────────────────────────────────────────────────────────────
-- Refusal-layer compliance: taboo_check_id placeholder resolution
-- ──────────────────────────────────────────────────────────────────────
-- Addendum 5 §5 requires every write to nervous_system.skills to carry a
-- taboo_check_id. Stream A installs a write trigger that rejects writes
-- without it. The three Skills below ship with PLACEHOLDER taboo_check_id
-- UUIDs of the form 9aaa0000-...-000000000001..3 . Before apply, the
-- conductor:
--
--   1. Runs Taboo Keeper in dry-run mode against each seed (the static
--      Skill payload below, JSON-stringified) and captures the three
--      audit_log.id values returned. Live nervous_system.audit_log
--      columns are id/table_name/action/actor_id/payload/created_at — the
--      check id is audit_log.id.
--   2. Edits this file IN PLACE, replacing each placeholder UUID with the
--      real Taboo Keeper audit_log id from step 1. The placeholders are
--      unique strings to enable a deterministic sed pass:
--
--        sed -i '' \
--          -e "s/dc483fc5-a5c9-467d-a440-dbbce519f8a0/<REAL-ID-1>/" \
--          -e "s/3e6b0a27-06a7-4095-8a75-ab9ee3193412/<REAL-ID-2>/" \
--          -e "s/350a40f9-f738-4766-b124-ae33d96ca069/<REAL-ID-3>/" \
--          20260514_002_seed_three_system_skills.sql
--
--   3. Applies via Supabase MCP apply_migration with the patched file.
--   4. Runs 20260514_002_seed_three_system_skills_verification.sql to
--      confirm all three rows landed with non-null taboo_check_id and
--      lifecycle_status = 'approved'.
--
-- The placeholder approach (vs a CTE resolution against an audit_log row)
-- keeps this migration idempotent and re-runnable: the conductor records
-- the real IDs on first apply, and subsequent runs upsert with the same
-- IDs already in the file. A CTE-based lookup would couple this file to a
-- live audit_log state, which is fragile across replays and backfills.
--
-- ──────────────────────────────────────────────────────────────────────
-- author_id and approved_by — Kyle Kesterson
-- ──────────────────────────────────────────────────────────────────────
-- Verified via nervous_system.team_members lookup 2026-05-14:
--   id    = 7715cb75-8192-42c5-8eff-6fe77dd2f62a
--   name  = Kyle Kesterson
--   email = kyle@demystified.ai
--   role  = founder
-- All three seeds use this id for both author_id and approved_by per
-- Addendum 5 §8 ("hand-authored by Kyle").
--
-- ──────────────────────────────────────────────────────────────────────
-- skill_md_path follow-ups
-- ──────────────────────────────────────────────────────────────────────
-- Only one SKILL.md exists today under unicron-knowledge/wiki/skills/
-- (transcript.md). The three seeds below reference paths under that same
-- directory which the Cowork team (or a follow-up commit on
-- unicron-knowledge) must create:
--
--   unicron-knowledge/wiki/skills/run-zedcor-weekly-digest.md
--   unicron-knowledge/wiki/skills/onboard-county-records-source.md
--   unicron-knowledge/wiki/skills/draft-briefing-for-bd-rep.md
--
-- The PR description enumerates these paths as the follow-up checklist.

-- ──────────────────────────────────────────────────────────────────────
-- Skill 1 — run_zedcor_weekly_digest
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO nervous_system.skills (
  name,
  description,
  domain,
  type,
  inputs_schema,
  outputs_schema,
  schedule_cron,
  trigger_event,
  refusal_gate,
  budget_usd_per_run,
  active,
  status,
  run_endpoint,
  skill_md_path,
  system_prompt,
  -- Stream A additions:
  lifecycle_status,
  version,
  author_kind,
  author_id,
  approved_by,
  approved_at,
  taboo_check_id,
  evidence,
  customer_id
)
VALUES (
  'run_zedcor_weekly_digest',
  'Generate the weekly Zedcor account digest: pipeline movement, open action items, scored leads delta, fresh signals, blockers needing Kyle/Keenan attention. Posts to #zedcor-internal and emails the digest summary to Kyle.',
  'customer-success',
  'scheduled',
  '[
    {"name":"week_ending","type":"date","required":false,"description":"ISO date for the end of the week to summarize. Defaults to today (PT)."},
    {"name":"post_to_slack","type":"boolean","required":false,"description":"Default true. Set false to dry-run."},
    {"name":"email_recipients","type":"array","required":false,"description":"Override list of email recipients. Defaults to Kyle."}
  ]'::jsonb,
  '[
    {"type":"slack_message","location":"#zedcor-internal"},
    {"type":"email","location":"kyle@demystified.ai"},
    {"type":"ledger_row","location":"nervous_system.ledger source_type=''digest'' subject=''zedcor_weekly''"}
  ]'::jsonb,
  '0 14 * * MON',  -- Mondays 07:00 PT (14:00 UTC)
  NULL,
  true,
  0.40,
  true,
  'active',
  '/api/atrium/skills/run',
  'unicron-knowledge/wiki/skills/run-zedcor-weekly-digest.md',
  $SKILL$You are generating the weekly Zedcor account digest.

INPUTS
- week_ending: ISO date (default: today, PT).
- post_to_slack: boolean (default: true).
- email_recipients: array of email strings (default: [kyle@demystified.ai]).

STEP 1 — PULL THE WEEK
Query the nervous_system ledger and the pathfinder schema for the 7-day window ending at week_ending:
- Pipeline movement on Zedcor customer rows (stage changes, new leads, lost leads).
- Open action items where customer = Zedcor or where the call referenced Zedcor.
- Scored-lead deltas: top 5 new leads scored this week, top 5 score drops.
- Fresh signals: news, sam.gov, USAspending, Harris County rows tagged zedcor.
- Blockers: any action_items with status=blocked and owner in (Kyle, Keenan, Curtis).

STEP 2 — STRUCTURE THE DIGEST
Sections, in this order, with short factual bullets (no marketing language):
1. Pipeline movement (1-3 lines).
2. Action items needing human attention (owner + ask + age).
3. Scored leads delta (top 5 up, top 5 down).
4. Fresh signals (max 5, with source).
5. Blockers + asks (explicit).

STEP 3 — POST + EMAIL
- IF post_to_slack: post to #zedcor-internal as a single threaded message.
- Always: email the digest summary to email_recipients.
- Write a ledger row source_type='digest', subject='zedcor_weekly', with the digest body and pointers to underlying signals.

STEP 4 — RECORD
Return: { posted: bool, slack_ts: string|null, email_message_ids: string[], ledger_row_id: uuid }.$SKILL$,
  'approved',
  1,
  'human',
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,  -- Kyle Kesterson
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  now(),
  'dc483fc5-a5c9-467d-a440-dbbce519f8a0'::uuid,  -- PLACEHOLDER: conductor patches before apply
  '[]'::jsonb,
  NULL  -- system Skill, not tenant-scoped
)
ON CONFLICT (name, version) WHERE customer_id IS NULL DO UPDATE SET
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
  system_prompt      = EXCLUDED.system_prompt,
  lifecycle_status   = EXCLUDED.lifecycle_status,
  version            = EXCLUDED.version,
  author_kind        = EXCLUDED.author_kind,
  author_id          = EXCLUDED.author_id,
  approved_by        = EXCLUDED.approved_by,
  approved_at        = EXCLUDED.approved_at,
  taboo_check_id     = EXCLUDED.taboo_check_id,
  evidence           = EXCLUDED.evidence,
  customer_id        = EXCLUDED.customer_id;

-- ──────────────────────────────────────────────────────────────────────
-- Skill 2 — onboard_county_records_source
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO nervous_system.skills (
  name,
  description,
  domain,
  type,
  inputs_schema,
  outputs_schema,
  schedule_cron,
  trigger_event,
  refusal_gate,
  budget_usd_per_run,
  active,
  status,
  run_endpoint,
  skill_md_path,
  system_prompt,
  lifecycle_status,
  version,
  author_kind,
  author_id,
  approved_by,
  approved_at,
  taboo_check_id,
  evidence,
  customer_id
)
VALUES (
  'onboard_county_records_source',
  'Onboard a new county records data source (e.g., Harris County Engineering, HCFCD, Tarrant County Procurement): probe the endpoint or portal, classify it, propose a Source row with cadence + extraction shape, draft the Architect-Inbox card for human approval. Does NOT auto-enable the source.',
  'data-onboarding',
  'manual',
  '[
    {"name":"county","type":"string","required":true,"description":"County name, e.g., Harris, Tarrant, Bexar."},
    {"name":"agency","type":"string","required":true,"description":"Agency or office name, e.g., Engineering, Flood Control District, Procurement."},
    {"name":"url","type":"string","required":true,"description":"Portal or endpoint URL to probe."},
    {"name":"record_type","type":"string","required":false,"description":"contracts | bids | permits | inspections | meeting_minutes. Inferred if omitted."},
    {"name":"cadence_hint","type":"string","required":false,"description":"Caller hint: daily | weekly | event-driven. Source Onboarder may override."}
  ]'::jsonb,
  '[
    {"type":"architect_inbox_card","location":"nervous_system.inbox (status=pending)"},
    {"type":"source_proposal","location":"nervous_system.source_proposals row"},
    {"type":"probe_report","location":"nervous_system.ledger source_type=''source_probe''"}
  ]'::jsonb,
  NULL,
  NULL,
  true,
  0.30,
  true,
  'active',
  '/api/atrium/skills/run',
  'unicron-knowledge/wiki/skills/onboard-county-records-source.md',
  $SKILL$You are onboarding a new county records data source.

INPUTS
- county (required): county name.
- agency (required): agency or office name.
- url (required): portal or endpoint URL.
- record_type: inferred from the page if omitted.
- cadence_hint: caller suggestion; not authoritative.

STEP 1 — PROBE
Fetch the URL. Classify:
- Endpoint type: html_portal | json_api | csv_download | rss | pdf_index.
- Auth requirement: none | login | api_key | captcha.
- Pagination: none | offset | cursor | scroll.
- Record volume estimate (rows visible on page 1 × estimated page count).
- Update cadence (look for "last updated", RSS pubDate, or schedule disclosure).
Write the probe result to nervous_system.ledger source_type='source_probe'.

STEP 2 — CLASSIFY + PROPOSE
- record_type: contracts | bids | permits | inspections | meeting_minutes.
- extraction_shape: a JSON Schema for the canonical row.
- recommended_cadence: cron string OR event-trigger spec.
- estimated_yield: rows/week.
- risk_flags: captcha, JS-heavy, robots.txt disallow, paywall, terms-of-service concern.

STEP 3 — DRAFT THE ARCHITECT-INBOX CARD
Insert into nervous_system.inbox:
- kind: 'source_proposal'
- payload: { county, agency, url, record_type, extraction_shape, recommended_cadence, estimated_yield, risk_flags, probe_ledger_row_id }
- status: 'pending'
- requires_human_approval: true

DO NOT enable the source. DO NOT write to nervous_system.sources directly. The Architect Inbox card is the human-approval gate. Source Onboarder ingests the approved proposal.

STEP 4 — RETURN
Return: { probe_ledger_row_id, inbox_card_id, recommended_cadence, risk_flags }.

REFUSAL CASES
- captcha required + no captcha-solver wired: do not stall the user; return a probe with risk_flags=['captcha'] and an inbox card flagged for human resolution.
- terms-of-service violation detected (e.g., "no automated scraping"): hard refuse, log the refusal to ledger, return { refused: true, reason }.$SKILL$,
  'approved',
  1,
  'human',
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  now(),
  '3e6b0a27-06a7-4095-8a75-ab9ee3193412'::uuid,  -- PLACEHOLDER: conductor patches before apply
  '[]'::jsonb,
  NULL
)
ON CONFLICT (name, version) WHERE customer_id IS NULL DO UPDATE SET
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
  system_prompt      = EXCLUDED.system_prompt,
  lifecycle_status   = EXCLUDED.lifecycle_status,
  version            = EXCLUDED.version,
  author_kind        = EXCLUDED.author_kind,
  author_id          = EXCLUDED.author_id,
  approved_by        = EXCLUDED.approved_by,
  approved_at        = EXCLUDED.approved_at,
  taboo_check_id     = EXCLUDED.taboo_check_id,
  evidence           = EXCLUDED.evidence,
  customer_id        = EXCLUDED.customer_id;

-- ──────────────────────────────────────────────────────────────────────
-- Skill 3 — draft_briefing_for_bd_rep
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO nervous_system.skills (
  name,
  description,
  domain,
  type,
  inputs_schema,
  outputs_schema,
  schedule_cron,
  trigger_event,
  refusal_gate,
  budget_usd_per_run,
  active,
  status,
  run_endpoint,
  skill_md_path,
  system_prompt,
  lifecycle_status,
  version,
  author_kind,
  author_id,
  approved_by,
  approved_at,
  taboo_check_id,
  evidence,
  customer_id
)
VALUES (
  'draft_briefing_for_bd_rep',
  'Draft a pre-call briefing for a Zedcor BD rep before they walk into a meeting: account history, last 3 touchpoints, open action items, scored-lead context, talking points, two open questions. Returns a single markdown document and writes a ledger row.',
  'sales',
  'manual',
  '[
    {"name":"customer_id","type":"uuid","required":false,"description":"pathfinder.customers.id. Either customer_id or account_name is required."},
    {"name":"account_name","type":"string","required":false,"description":"Free-text account name fallback when customer_id is unknown."},
    {"name":"meeting_at","type":"timestamptz","required":false,"description":"Scheduled meeting time. Defaults to next calendar event with that account."},
    {"name":"rep_name","type":"string","required":true,"description":"BD rep the briefing is for."}
  ]'::jsonb,
  '[
    {"type":"markdown_doc","location":"returned in response body"},
    {"type":"ledger_row","location":"nervous_system.ledger source_type=''briefing'' subject=account_name"}
  ]'::jsonb,
  NULL,
  NULL,
  true,
  0.25,
  true,
  'active',
  '/api/atrium/skills/run',
  'unicron-knowledge/wiki/skills/draft-briefing-for-bd-rep.md',
  $SKILL$You are drafting a pre-call briefing for a Zedcor BD rep.

INPUTS
- customer_id OR account_name (one required).
- meeting_at (default: next scheduled meeting with that account).
- rep_name (required): who the briefing is for.

STEP 1 — RESOLVE THE ACCOUNT
- IF customer_id: pull pathfinder.customers + linked pathfinder.contacts.
- ELSE: fuzzy-match account_name against pathfinder.customers.name. Confirm the top match has at least one signal in the last 90 days; otherwise return { resolved: false, candidates: [...] }.

STEP 2 — PULL CONTEXT
- Last 3 touchpoints (calls, emails, Slack threads) from nervous_system.ledger filtered by customer.
- Open action_items where customer = this account.
- Top scored leads (pathfinder.leads) for this account in the last 30 days.
- Pipeline stage (pathfinder.pipeline_stages) + last stage change.
- Two competitor mentions or risk signals from the last 14 days (search nervous_system.ledger for customer_mention rows + news source).

STEP 3 — DRAFT THE BRIEFING (markdown, sections in this order)
1. WHO + WHEN (account, contacts on the call, meeting_at, rep_name).
2. WHERE THINGS STAND (pipeline stage, one-line stage history).
3. LAST 3 TOUCHPOINTS (each: date, channel, who, gist, follow-up status).
4. OPEN ACTION ITEMS (each: owner, ask, age, blockers).
5. NEW SIGNALS (max 3, with source citation).
6. TALKING POINTS (3 bullets — specific, not generic).
7. TWO OPEN QUESTIONS for the rep to ask (designed to surface buying signals or blockers).
8. DO-NOT-MENTION (any taboo topics or red flags from the ledger — Curtis-tier sensitive notes etc.).

STEP 4 — RECORD
Write a ledger row source_type='briefing', subject=account_name, with the briefing body and the rep_name.

STEP 5 — RETURN
Return: { resolved: true, briefing_md: string, ledger_row_id: uuid }.

REFUSAL CASES
- Account not resolved + no candidates above 0.7 similarity: return { resolved: false, reason }.
- Sensitive topic in DO-NOT-MENTION conflicts with a TALKING POINT: drop the talking point, log refusal to ledger, do not surface the topic.$SKILL$,
  'approved',
  1,
  'human',
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  now(),
  '350a40f9-f738-4766-b124-ae33d96ca069'::uuid,  -- PLACEHOLDER: conductor patches before apply
  '[]'::jsonb,
  NULL
)
ON CONFLICT (name, version) WHERE customer_id IS NULL DO UPDATE SET
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
  system_prompt      = EXCLUDED.system_prompt,
  lifecycle_status   = EXCLUDED.lifecycle_status,
  version            = EXCLUDED.version,
  author_kind        = EXCLUDED.author_kind,
  author_id          = EXCLUDED.author_id,
  approved_by        = EXCLUDED.approved_by,
  approved_at        = EXCLUDED.approved_at,
  taboo_check_id     = EXCLUDED.taboo_check_id,
  evidence           = EXCLUDED.evidence,
  customer_id        = EXCLUDED.customer_id;

-- Audit log entry for the seed batch.
INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
VALUES (
  'nervous_system.skills',
  'system_skills_seeded',
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,  -- Kyle Kesterson
  jsonb_build_object(
    'sprint', 9,
    'spec', 'Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md',
    'skills', jsonb_build_array(
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    ),
    'lifecycle_status', 'approved',
    'author_kind', 'human',
    'note', 'taboo_check_id placeholders patched by conductor pre-apply'
  )
);
