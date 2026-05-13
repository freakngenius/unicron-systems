# Call Upload Fan-Out — Discovery Report

**Date:** 2026-05-13
**Branch:** `feat/sprint-7-5-h1-inngest-cron-db-driven` (no changes yet — discovery only)
**Kanban card:** _Bug Fix — Call upload fan-out to Atrium_ (Internal Org Kanban, In Process)

---

## 1. Where the transcript-processing prompt lives

Three artifacts encode the transcript-processing intent. Two are referenced by the live pipeline; one is operator-facing only.

### 1a. Live: `EXTRACTION_SYSTEM` in `unicron-platform/lib/calls-action-item-flow.ts:77-92`

This is the programmatic prompt that actually runs in production when a call/transcript.uploaded event fires. Verbatim:

```
You are an action-item extractor for a 2-person company called Unicron Systems.
You read a call transcript and surface every explicit commitment, follow-up, or deliverable.

Output a JSON object with one key "action_items" whose value is an array. Each item must have:
  - title:       short imperative phrase, e.g. "Send Zedcor the pilot SOW"
  - description: one or two sentence rationale based on the transcript context
  - owner:       one of "Kyle", "Keenan", "Curtis", "Co-Pilot", or a free-text external name.
                 "Co-Pilot" means the autonomous AI agent can do this without a human.
                 Use the closest match — never invent owners.
  - outcome:     what "done" looks like in one sentence
  - steps:       array of 1-5 concrete sub-steps
  - priority:    "high" | "medium" | "low" based on urgency signals in the conversation
  - due_iso:     ISO 8601 datetime when a deadline is stated or inferable, else null

If no action items are present, return { "action_items": [] }.
Output ONLY the JSON object — no surrounding text, no markdown fences.
```

Called via Anthropic Sonnet 4.6 with `temperature` default and `max_tokens: 2048`.

### 1b. Registered: `nervous_system.skills` row name=`'transcript'`

Seeded by `supabase/migrations/20260511_seed_calls_transcript_skill.sql` and promoted to `status='active'` by `20260512_ns_action_item_from_call.sql`. `skill_md_path` points at the vault: `unicron-knowledge/wiki/skills/transcript.md`. Trigger event: `call_transcript_uploaded`. Refusal gate: `true`. Run endpoint: `/api/atrium/skills/run`. The DB row is the registration; the runtime prompt is 1a.

### 1c. Operator-facing reference: `unicron-knowledge/wiki/skills/transcript.md`

This is the human-readable specification the migration row points to (Karpathy vault pattern). It describes STEP 1 (store in Notion), STEP 2 (extract to-dos), STEP 3 (act on tasks). The live pipeline implements STEP 1 + STEP 2 programmatically; STEP 3 ("Co-Pilot autonomous execution") is partly implemented via the Internal Org Kanban card creation but does not yet run autonomously.

---

## 2. Pipeline trace

```
UploadCallModal.tsx               (src/atrium/work/UploadCallModal.tsx:198-225)
  └── POST /api/atrium/calls/upload   (api/atrium/calls/upload.ts:163-175)
        └── ingestCallTranscript()        (lib/calls-ingest.ts:39-96)
              ├── createCallTranscriptPage()       (lib/notion-call-transcripts.ts)
              │     → Notion Call Transcripts DB   ✓ confirmed working (Kyle: "Notion row IS created")
              │
              ├── sb.rpc('ns_create_call_transcript_ledger_row', …)
              │     → nervous_system.ledger row    ✗ FAILS at the INSERT
              │
              │  Verbatim Postgres error captured by smoke-testing the RPC
              │  with rollback on 2026-05-13:
              │
              │  ERROR: 42804: column "participants" is of type uuid[] but
              │  expression is of type text[]
              │  HINT: You will need to rewrite or cast the expression.
              │  CONTEXT: PL/pgSQL function
              │  ns_create_call_transcript_ledger_row(text,text,text,text[],
              │  text,text,text,date,text) line 17 at SQL statement
              │
              └── inngest.send({name:'call/transcript.uploaded', …})
                    GATED on `!ledgerErr && result.ledger_id`         (lib/calls-ingest.ts:74)
                    → NEVER FIRES because the RPC above always errors
                    → extractCallActionItemsRun never executes
                    → no nervous_system.action_items rows written
                    → no Internal Org Kanban cards created
                    → no Notion page-body link-back
```

### Broken hop

`lib/calls-ingest.ts:51-61` (the RPC call). The RPC at `supabase/migrations/20260512_ns_create_call_transcript_ledger_row.sql:50-72` passes `p_participants text[]` (whatever the caller sent) directly into `nervous_system.ledger.participants` which is declared `uuid[]` (verified via `information_schema.columns`). Production has zero rows where this RPC has ever succeeded.

### Why the UI looks like success

`api/atrium/calls/upload.ts:184-191` returns HTTP 207 Multi-Status when Notion succeeds but ledger fails. `UploadCallModal.tsx:218-223` reads 207 and calls `setError(...)` — the user sees an error panel but the Notion link is shown. Operator perception: "the Notion side worked, must have worked."

### Secondary defect

Both RPCs `ns_create_call_transcript_ledger_row` (line 76-94) and `ns_create_action_item_from_call` (line 108-121) write:

```sql
INSERT INTO nervous_system.audit_log (table_name, action, target_id, actor, metadata)
```

…but the live audit_log schema is `(id, table_name, action, actor_id, payload, created_at)`. Once the participants type mismatch is patched, the audit_log INSERT will be the next failure.

---

## 3. Scope gaps vs goal directive

The goal directive references three artifacts that do not exist in the architecture as named:

| Goal #4 requirement | Live architecture |
|---|---|
| INSERT into `nervous_system.decisions` | No such table. Decisions are stored as `nervous_system.ledger` rows with `source_type='decision'` (12 such rows exist; surfaced by `ns_list_ledger_decisions` and `ns_now_decisions_7d`). |
| INSERT into `nervous_system.customer_mentions` | No such table. Closest pattern: `nervous_system.ledger.customer_id` foreign-key + `nervous_system.customers` rows. There is no per-mention table yet. |
| ledger `source_type='call_upload'` | `nervous_system.ledger.source_type` CHECK constraint allows only `'call','slack','email','voice_memo','apple_note','cowork_session','agent_run','manual','slack_channel_scan','decision'`. Canonical value used by the current C3 RPC: `'call'`. |

Three viable resolutions for the fan-out scope:

A. **Map goal language to existing architecture** (recommended): decisions → `ledger` rows source_type=`'decision'` linked to the call's ledger via `insights.parent_call_id`; customer mentions → array on the call's `ledger.insights.mentioned_customers` plus update of `ledger.customer_id` when one match dominates; source_type stays `'call'`. Zero new tables. Matches the pattern already used by `ns_slack_daily_scan_insert_decision`.

B. **Create new tables** `nervous_system.decisions` and `nervous_system.customer_mentions` as named by the goal. Larger migration footprint; requires Atrium UI work to surface them separately.

C. **Fix root-cause only, defer the wider fan-out to a follow-up** card. Smallest change; will not satisfy Goal Conditions #4/#5/#6.

This decision is gating the next commit and needs Kyle.

---

## 4. Production state snapshot (2026-05-13)

- `nervous_system.ledger` total rows: 47. None are call-class.
- `nervous_system.action_items` total rows: 20. None reference any call (no `related_call_id` populated where source is a call upload).
- `nervous_system.calls` mirror: 0 rows (C4 cron `notionCallsSyncCron` has not yet populated; tracked separately).
- `nervous_system.skills` row `'transcript'`: present, `status='active'`, `refusal_gate=true`.
- Notion side: working (Kyle's confirmation; latest Calls Ingestion sprint deployed at 2026-05-12).

---

## 5. Fix plan (pending Kyle's scope choice in §3)

Regardless of A/B/C, these two patches are mandatory:

1. **Migration `20260513_fix_call_transcript_ledger_row.sql`** — recreate `public.ns_create_call_transcript_ledger_row` to:
   - Resolve participant strings → `team_members.id` UUIDs (case-insensitive name match), drop unresolved names, write the resolved UUID array into `ledger.participants` (uuid[]).
   - Persist the original participant strings into `insights.participants` (already done — keep).
   - Update the embedded `audit_log` INSERT to use `(table_name, action, actor_id, payload)`. `actor_id` is nullable, so pass `NULL` when `p_uploaded_by` is an email (no auth.users uuid lookup yet).

2. **Migration `20260513_fix_action_item_audit_log_cols.sql`** — recreate `public.ns_create_action_item_from_call` with the same audit_log column fix.

If Kyle picks (A), an additional patch:

3. **lib/calls-action-item-flow.ts** — extend `EXTRACTION_SYSTEM` to also output `decisions[]` and `customer_mentions[]`; in `runActionItemExtraction()`, for each decision write a ledger row via a new `ns_create_decision_from_call` RPC (source_type='decision', linked back to the parent call's ledger.id via `insights.parent_call_id`); for each customer mention resolve to a `customers` row by case-insensitive name match and patch the parent call's `ledger.customer_id` + `ledger.insights.mentioned_customers`.

4. **api/atrium/calls/upload.ts** — change the response shape to await action-item extraction synchronously so the upload modal can render counts before closing; or return early and have the modal poll a new `/api/atrium/calls/:ledger_id/extraction-status` endpoint until the extraction has completed (UI feedback per Goal #6).

5. **Atrium surface verification** — `CallsLog` already reads from `ns_list_ledger_calls` (filter `source_type IN ('call','voice_memo')` — will pick up the new ledger rows automatically). `ActionItems` (Now > Action Items) and `DecisionsTimeline` will pick up the new rows once the migrations apply and the next upload runs.

---

## 6. Evidence

- Live error captured by smoke-test of the RPC inside a rolled-back transaction (Supabase MCP `execute_sql`).
- Live schema confirmed via `information_schema.columns` on `nervous_system.ledger` (participants → ARRAY/_uuid).
- Live RPC source confirmed via `pg_get_functiondef` on `public.ns_list_ledger_calls`.
- Live ledger source_type distribution confirmed via `SELECT source_type, COUNT(*), MAX(created_at) GROUP BY source_type`.
- Code path confirmed via reads of `api/atrium/calls/upload.ts`, `lib/calls-ingest.ts`, `lib/calls-action-item-flow.ts`, `lib/agents/inngest-fns.ts:486-516`, `src/atrium/work/UploadCallModal.tsx`, `src/atrium/work/CallsLog.tsx`.

No code changes proposed for branch `feat/sprint-7-5-h1-inngest-cron-db-driven`. New work will land on `fix/call-upload-fanout` once Kyle picks the scope in §3.
