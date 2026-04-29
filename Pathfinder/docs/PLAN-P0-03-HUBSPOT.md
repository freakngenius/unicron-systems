# PLAN — P0 Feature 3: HubSpot bidirectional sync

**Branch:** `feat/p0-03-hubspot-sync` (worktree-isolated, off `origin/main` at `6909640`)
**Spec:** `Pathfinder/Pathfinder-Feature-Specs.md` § "P0 Feature 3 — HubSpot bidirectional sync" (lines 155–174)
**Status:** approved 2026-04-28. Decisions folded in below; building now.

### Approval decisions
- **Q1.** P0-03 owns `lib/lead-actions.ts` and bootstraps `pathfinder.lead_actions`. Public interface documented in `docs/LEAD-ACTIONS-API.md` so P0-04 + P0-01 wire against a stable contract.
- **Q2.** Ship `POST /api/hubspot/push-deal` only. Human triggers land in P0-04 (Slack bot) and P0-01 (chat panel).
- **Q3.** Path (a). `docs/HUBSPOT-SANDBOX-SETUP.md` walks Kyle through HubSpot account → Private App → token → Vercel env. Live test before merge.
- **Q4.** Full 7-stage map (5 HubSpot-mirrored + 2 local-only).
- **Env rename.** `HUBSPOT_WEBHOOK_SECRET` → `HUBSPOT_APP_SECRET`. Bearer token env name is `HUBSPOT_API_KEY` (Kyle's chosen name; matches the value he'll drop in Vercel).

---

## 1. Goal

When a rep accepts a Pathfinder lead, the lead pushes to HubSpot as a deal record stamped with `pathfinder_lead_id`. When a HubSpot deal stage transitions (first-meeting-booked, proposal-sent, closed-won, …), HubSpot calls a Pathfinder webhook and the matching `pathfinder.lead_actions` row is updated so attribution math works.

Acceptance gates from the spec:
- Accepted leads appear in HubSpot pipeline within 30s of accept.
- Each deal carries `pathfinder_lead_id` (custom property) and the original ranker rationale (note attached to the deal).
- HubSpot stage transitions reflect in `pathfinder.lead_actions` within 60s.
- Closed-won transitions trigger attribution math (mark `lead_actions.status='closed_won'` and stamp `closed_won_amount`, `closed_won_at`).

Hard constraints from the prompt:
- Custom property `pathfinder_lead_id` on every pushed deal.
- Webhook authenticates against `HUBSPOT_APP_SECRET` (HubSpot Private App secret; HubSpot's v3 signature is HMAC-SHA256 keyed by it).
- Stage map documented in `docs/HUBSPOT-STAGE-MAP.md`.
- All HubSpot HTTP calls retry on 429 with exponential backoff that honors `Retry-After`.
- Every push and every webhook is audit-logged to `pathfinder.agent_log` with `agent_name='hubspot-sync'`.

---

## 2. Scope

### Net-new files (this branch creates)
- `lib/hubspot/client.ts` — HubSpot REST wrapper (auth, retry-on-429, audit hook).
- `lib/hubspot/deal-mapper.ts` — `Project + lead_actions row → DealCreatePayload` translation.
- `lib/hubspot/stage-map.ts` — exported constant tables. Source of truth re-imported by docs.
- `lib/lead-actions.ts` — accept-flow library (see §3 / open question Q1). Records the `accepted` row, calls the HubSpot push, persists deal id + sync state back to the row.
- `app/api/hubspot/push-deal/route.ts` — POST endpoint called by `lib/lead-actions.ts` (and later by Slack-bot accept actions in P0-04).
- `app/api/webhooks/hubspot/route.ts` — POST endpoint receiving HubSpot deal-stage subscription callbacks; v3 signature verification + idempotent stage-update.
- `supabase/migrations/0011_hubspot_sync.sql` — creates `pathfinder.lead_actions` (does not exist on main today; see §4) and broadens the `agent_log` / `agent_runs` `agent_name` CHECK constraint to include `'hubspot-sync'`.
- `docs/HUBSPOT-STAGE-MAP.md` — human-readable bidirectional stage map.
- `__tests__/hubspot/deal-mapper.test.ts` — pure-function unit tests on the mapper.
- `__tests__/hubspot/client.test.ts` — retry-on-429 logic with a fetch stub.
- `__tests__/hubspot/webhook-signature.test.ts` — v3 signature verification round-trip with a fixture body.
- `__tests__/api/hubspot/push-deal.test.ts` — route-level integration test against the live Supabase project (same pattern as `__tests__/api/cron/verifier.test.ts`), using a stubbed HubSpot client.
- `__tests__/api/webhooks/hubspot.test.ts` — route-level integration test feeding a signed payload.

### Edits to shared files (additive only — coordinate)
- `lib/types.ts` — add `'hubspot-sync'` to `AgentName`, add `LeadAction` interface + table entry in `PathfinderDatabase`. **Append-only** edits to avoid stepping on the cherry-pick on `feat/outreach-drafter` and the chat additions on `feat/p0-01-intelligence-chat`.
- `.env.example` — append `HUBSPOT_API_KEY`, `HUBSPOT_APP_SECRET`, `HUBSPOT_PORTAL_ID`, `HUBSPOT_DEAL_PIPELINE_ID`, plus the five `HUBSPOT_STAGE_*_ID` env names listed in §7.

### Files I will **not** touch
- `vercel.json` (push-deal and webhook are event-driven HTTP; no cron entries needed).
- `package.json` / `package-lock.json` (HubSpot calls go through the existing global `fetch`; no new deps).
- Any UI / dashboard component (the dashboard's accept button is out of scope for this branch — see §3 / Q2).

If I discover I must touch anything outside this list, I stop and ask.

---

## 3. Open questions for Kyle (need answers before code)

### Q1. `lib/lead-actions.ts` ownership
The prompt's "Touches" list reads `lib/lead-actions.ts (call HubSpot push on accept)`, implying the file already exists. It does not. Neither `feat/outreach-drafter` nor `feat/p0-01-intelligence-chat` create it; the chat branch's plan explicitly defers `lead_actions` creation to "whichever branch creates `outreach_drafts` and `lead_actions` (likely P0 #3 HubSpot bidirectional sync)."

**Proposed:** this branch becomes the bootstrap for `lead_actions`. We create the table, the canonical accept-flow library, and the audit columns up front, so P0-04 (Slack bot) and the chat panel's "Accept" action both call into the same library.

**Asking:** is that the right scope, or do you want this branch to assume a stub from elsewhere?

### Q2. Where does the accept *trigger* come from?
The dashboard does not currently have an accept button (no UI references to "accept" found on `origin/main`). The Slack bot (P0-04) and the chat panel's `accept_lead_to_hubspot` action will both eventually call the push endpoint. For this branch I plan to expose `app/api/hubspot/push-deal` as the only caller surface and not add UI. The chat branch's deferred-action audit (`chat_messages.kind='action_result'` with `payload.status='deferred'`) can be backfilled by a follow-up job once `lib/lead-actions.ts` lands.

**Asking:** OK to leave the trigger surface to P0-04 and a chat-branch follow-up?

### Q3. HubSpot account state
The end-to-end test step in the prompt assumes a HubSpot sandbox. We don't have one wired into env yet. Two paths:
- **a.** I document the env vars + sandbox checklist and run the integration test step manually after Kyle (or you) drops sandbox creds in Vercel + `.env.local`.
- **b.** I stub the HubSpot client end-to-end and ship the PR; Kyle wires the live sandbox after merge.

**Recommend (a)** so the spec's "appears in HubSpot within 30s" gate is verified before the merge, not after. Either way the unit + signature + retry tests run without a live HubSpot.

### Q4. Deal pipeline + stage IDs
Stage IDs are HubSpot-portal-specific opaque strings (e.g. `presentationscheduled`, or numeric IDs on custom pipelines). I'll keep them in env vars (`HUBSPOT_STAGE_*_ID`) and document the discovery script. **Asking:** do you want the seven canonical Zedcor stages or something narrower for the pilot?

---

## 4. Migration design — `0011_hubspot_sync.sql`

Picks `0011` to leave room behind `0009_chat.sql` (intelligence-chat branch) and `0010_outreach_drafts.sql` (outreach-drafter branch). If either of those merges with a different number, I'll renumber before opening the PR.

```sql
-- 1. Broaden agent_name whitelist
alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync'
  ));
-- (mirror on agent_runs)

-- 2. lead_actions table
create type pathfinder.lead_action_status as enum (
  'accepted','meeting_booked','proposal_sent','closed_won','closed_lost','dismissed','snoozed'
);

create table pathfinder.lead_actions (
  id                       bigserial primary key,
  project_id               text not null references pathfinder.projects(id) on delete cascade,
  actor_email              text not null,
  status                   pathfinder.lead_action_status not null default 'accepted',
  attested_pipeline_value  numeric(14,2),     -- rep-attested at accept (P0-04 modal)
  first_action_date        date,              -- rep-attested at accept (P0-04 modal)
  note                     text,              -- free-form rep note
  -- HubSpot sync columns (this branch's reason to exist)
  hubspot_deal_id          text,
  hubspot_pipeline_id      text,
  hubspot_stage_id         text,
  hubspot_pushed_at        timestamptz,
  hubspot_last_event_at    timestamptz,
  hubspot_last_event_id    text,              -- for idempotency on webhook replay
  closed_won_amount        numeric(14,2),
  closed_won_at            timestamptz,
  closed_lost_reason       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (project_id, actor_email)            -- one accept per rep per project
);

create index lead_actions_project_idx        on pathfinder.lead_actions(project_id);
create index lead_actions_status_idx         on pathfinder.lead_actions(status, updated_at desc);
create index lead_actions_hubspot_deal_idx   on pathfinder.lead_actions(hubspot_deal_id) where hubspot_deal_id is not null;

-- 3. RLS (anon read, service-role write — match existing pattern)
alter table pathfinder.lead_actions enable row level security;
create policy lead_actions_read  on pathfinder.lead_actions for select to anon, authenticated using (true);
create policy lead_actions_write on pathfinder.lead_actions for all    to service_role using (true) with check (true);

-- 4. updated_at trigger
create or replace function pathfinder.touch_lead_actions_updated_at() …
create trigger lead_actions_touch_updated_at before update on pathfinder.lead_actions …
```

Conflict check vs other branches:
- Migration `0009_chat.sql` (chat branch) and `0010_outreach_drafts.sql` (outreach branch) don't touch `agent_log` constraints. Mine does. If either of those branches merges before mine and adds something in the same constraint, I'll fold their additions into my drop/recreate so the final state is the union.
- `pathfinder.lead_actions` is unique to this branch — no conflict expected.

---

## 5. Library design

### `lib/hubspot/client.ts`
- `createHubspotClient({ token, fetchImpl?, log? })` returns a small object with three methods:
  - `createDeal(input)` — `POST /crm/v3/objects/deals` with `{ properties: { …, pathfinder_lead_id } }`.
  - `attachNote({ dealId, body })` — uses Engagements v3 (`POST /crm/v3/objects/notes` + association call) so we attach the ranker rationale as a deal note (acceptance criterion).
  - `ensureCustomProperty()` — idempotent `POST /crm/v3/properties/deals` for `pathfinder_lead_id`. Called once at boot via a small bootstrap script (or lazily on first push, guarded behind a 5-minute in-memory cache).
- Retry policy lives here:
  - `fetch` wrapper that on `429` reads `Retry-After` (seconds) and waits, otherwise applies exponential backoff `300ms · 2^n + jitter` capped at 30s, max 5 attempts.
  - On terminal failure, throws `HubspotError` carrying status + body for the audit log.
- Auth: `Authorization: Bearer ${token}`. Token comes from `HUBSPOT_API_KEY` env (HubSpot Private App token, scoped `crm.objects.deals.read|write` and `crm.objects.notes.write`).

### `lib/hubspot/deal-mapper.ts`
Pure functions, easy to unit-test:
- `projectToDealProperties(project, leadAction, branch?, customer?)` → `{ dealname, pipeline, dealstage, amount, closedate, pathfinder_lead_id, pathfinder_branch_code, pathfinder_score }`.
- `dealnameFor(project)` — `"<project.title> · <branch.code>"`, capped at 255 chars (HubSpot limit).
- `closedateFor(project)` — heuristic: `posted_date + 90d` if no project_value-based estimate, else +120d. Documented inline.
- `noteBodyFor(project, leadAction)` — markdown body of the ranker rationale + `outreach_hook` + a Pathfinder dashboard deep link (`publicUrl()` reused from `lib/public-url.ts`).
- All HubSpot stage IDs read from `lib/hubspot/stage-map.ts`, which reads env at call time — no module-init throws so build doesn't break in environments without the env (mirrors `lib/briefing.ts` pattern).

### `lib/hubspot/stage-map.ts`
Exports two functions and one constant:
```ts
export const PATHFINDER_STAGES = [
  'accepted','meeting_booked','proposal_sent','closed_won','closed_lost','dismissed','snoozed'
] as const;

export function pathfinderStatusForHubspotStageId(stageId: string): LeadActionStatus | null;
export function hubspotStageIdForPathfinderStatus(status: LeadActionStatus): string | null;
```
Backed by an env-driven lookup table. `docs/HUBSPOT-STAGE-MAP.md` is the human-readable form.

### `lib/lead-actions.ts`
- `acceptLead({ projectId, actorEmail, attestedPipelineValue, firstActionDate, note })`:
  1. Upsert into `pathfinder.lead_actions` with `status='accepted'` (service-role client).
  2. Call `pushDealForLeadAction(leadActionId)` — async, non-blocking failure (lead_actions still records the accept; HubSpot retry logged).
  3. Audit `agent_log` with `agent_name='hubspot-sync'`, `event_type='accept_recorded'`.
- `pushDealForLeadAction(leadActionId)`:
  1. Load the lead_action + project + branch + warm customer.
  2. Build deal payload via `deal-mapper`.
  3. Call HubSpot client's `createDeal` then `attachNote`.
  4. Update lead_action with `hubspot_deal_id`, `hubspot_pipeline_id`, `hubspot_stage_id`, `hubspot_pushed_at`.
  5. Audit `event_type='deal_pushed'` (success) or `'deal_push_failed'` (failure with reason).
- `applyHubspotStageEvent({ dealId, newStageId, eventId, occurredAt, amount? })`:
  1. Idempotency: skip if `hubspot_last_event_id = eventId`.
  2. Map stage → status via `stage-map`.
  3. Update lead_action; if `closed_won`, also stamp `closed_won_amount` (preferring webhook-supplied `amount`, falling back to `attested_pipeline_value`) and `closed_won_at`.
  4. Audit `event_type='stage_event'` with the full payload.

---

## 6. Routes

### `POST /api/hubspot/push-deal`
- Body: `{ project_id: string, actor_email: string, attested_pipeline_value?: number, first_action_date?: string, note?: string }`.
- Auth: `Authorization: Bearer ${CRON_SECRET}` (re-using the existing internal-call secret, mirroring how cron routes are gated). Only Pathfinder server-side callers ever hit this; HubSpot itself does not call this route.
- On success: `{ ok: true, lead_action_id, hubspot_deal_id }`. On failure: `{ ok: false, error, lead_action_id }` (still 200 if the accept was recorded, since HubSpot push failure is retried out-of-band).

### `POST /api/webhooks/hubspot`
- Reads raw body (signature is over the unparsed body — needs `await req.text()`, then `JSON.parse` after verification).
- Verifies `X-HubSpot-Signature-v3`:
  - Reject if `X-HubSpot-Request-Timestamp` is missing or > 5 min skewed.
  - Build `requestMethod + requestUri + requestBody + timestamp`, HMAC-SHA256 with `HUBSPOT_APP_SECRET`, base64, constant-time compare.
- Parses HubSpot's array body (each subscription delivers one or more change events).
- For each `dealstage`-property change: call `applyHubspotStageEvent` with `dealId = objectId`, `newStageId = propertyValue`, `eventId = eventId`, `occurredAt = occurredAt`.
- Returns `200 { ok: true, processed: n, skipped: m }` even on partial failure (HubSpot retries non-2xx and we don't want a single bad event to block the batch); failures audit-log individually.

---

## 7. Stage map (proposed; refines based on Q4)

Pathfinder status ← HubSpot internal stage id (env-driven):

| Pathfinder `lead_actions.status` | HubSpot stage (display name)     | Env var holding the id      |
| -------------------------------- | -------------------------------- | --------------------------- |
| `accepted`                       | "Lead pushed from Pathfinder"    | `HUBSPOT_STAGE_ACCEPTED_ID` |
| `meeting_booked`                 | "First Meeting Booked"           | `HUBSPOT_STAGE_MEETING_ID`  |
| `proposal_sent`                  | "Proposal Sent"                  | `HUBSPOT_STAGE_PROPOSAL_ID` |
| `closed_won`                     | "Closed Won"                     | `HUBSPOT_STAGE_WON_ID`      |
| `closed_lost`                    | "Closed Lost"                    | `HUBSPOT_STAGE_LOST_ID`     |
| `dismissed`                      | (no HubSpot mirror — local only) | —                           |
| `snoozed`                        | (no HubSpot mirror — local only) | —                           |

`docs/HUBSPOT-STAGE-MAP.md` will print this table verbatim plus discovery instructions (`GET /crm/v3/pipelines/deals` to enumerate stage IDs in the portal).

---

## 8. Error handling, retry, and audit

- **HubSpot 429** — handled inside `lib/hubspot/client.ts`. Honors `Retry-After`. Audit log emits `event_type='rate_limited'` with `retry_after_seconds`.
- **HubSpot 5xx** — exponential backoff (5 attempts, max 30s cap). Final failure surfaces to `lib/lead-actions.ts` and is audit-logged with `event_type='deal_push_failed'`. The `lead_actions` row is left in `accepted` status with `hubspot_deal_id IS NULL` so a daily reconcile cron (out of scope for this PR — added as a follow-up todo) can retry.
- **HubSpot 4xx other** — terminal; audit-logged; no retry. Surfaced as the route response.
- **Webhook bad signature** — `401`, audit-logged with the offending IP and timestamp delta. Body is **not** logged (could contain customer data).
- **Webhook unknown stage id** — audit-logged at `event_type='stage_unknown'`; the row is left untouched. Prevents silently corrupting `status`.
- **Webhook duplicate event** — short-circuit on `hubspot_last_event_id`; audit-logged at `event_type='stage_replayed_skip'`.

Every audit row uses `agent_name='hubspot-sync'`. Event types: `accept_recorded`, `deal_pushed`, `deal_push_failed`, `rate_limited`, `webhook_received`, `stage_event`, `stage_unknown`, `stage_replayed_skip`, `signature_failed`.

---

## 9. Security

- **`HUBSPOT_API_KEY`** — Bearer token for outbound HubSpot calls (HubSpot Private App token). Server-only env. Never logged.
- **`HUBSPOT_APP_SECRET`** — HubSpot Private App secret used to verify the v3 webhook signature (HMAC-SHA256 over `requestMethod + requestUri + requestBody + timestamp`). Server-only env. Never logged.
- **`CRON_SECRET`** — gates `/api/hubspot/push-deal` (internal-only callers). Same pattern as `app/api/cron/*`.
- **Idempotency** — `lead_actions.unique (project_id, actor_email)` prevents double-accepts; webhook idempotency via `hubspot_last_event_id`.
- **No PII to logs** — webhook body is not echoed in audit rows on signature failure; the success path stores HubSpot's structured event data (object id, stage id, timestamp) but not free-form note text from HubSpot replies.

---

## 10. Testing strategy

- **Unit (vitest, no network):**
  - `deal-mapper.test.ts` — covers (a) name truncation, (b) closedate heuristic both branches, (c) custom-property always present, (d) note body includes rationale + warm-intro line + dashboard link, (e) stage-map round-trip for each Pathfinder status that has a HubSpot mirror.
  - `client.test.ts` — fetch stub returning `429` with `Retry-After: 1`, asserts retry happens once and a final 200 is returned. Second case: terminal `500` after 5 attempts throws `HubspotError`.
  - `webhook-signature.test.ts` — fixture body + timestamp + secret; positive case verifies, negative cases (wrong secret, stale timestamp, mutated body) reject.
- **Integration (vitest against live Supabase project, gated on env presence — same pattern as `__tests__/api/cron/verifier.test.ts`):**
  - `push-deal.test.ts` — synthetic project + accept call → asserts `lead_actions` row created with HubSpot fields populated (HubSpot client stubbed to return a fixed deal id). All synthetic rows tagged `_hubspot_test_<ts>` and cleaned up in `afterAll`.
  - `webhooks/hubspot.test.ts` — feeds a signed payload simulating a stage transition → asserts `lead_actions.status` flips, audit row appears, replay short-circuits.
- **Live end-to-end (manual, only if Q3 path **a**):**
  - With sandbox creds in Vercel preview env, accept a synthetic lead via `curl` to `/api/hubspot/push-deal`, eyeball the deal in HubSpot UI, manually drag it to "First Meeting Booked", confirm `lead_actions.status='meeting_booked'` within 60s.

CI: `npm run typecheck && npm run lint && npm test` must all pass. No new deps, so no install drift.

---

## 11. Build sequence (after approval)

1. **Install deps in worktree** so `npm test` and `npm run typecheck` work.
2. **Migration first** (`0011_hubspot_sync.sql`) — apply via Supabase MCP to a branch DB or, if Kyle prefers, queue the SQL in the PR for production apply at merge time. State preference in the PR.
3. **Library scaffolding** — `client.ts`, `deal-mapper.ts`, `stage-map.ts`, `lead-actions.ts` shells with TODOs.
4. **Unit tests for `deal-mapper.ts` first (TDD).** Implement until green.
5. **Unit tests for `client.ts` retry behavior (TDD).** Implement until green.
6. **Webhook signature tests (TDD).** Implement until green.
7. **Wire push route + webhook route.** Manual probe with `curl` (signed body) before integration tests.
8. **Integration tests** (gated on env). Run locally + dry-run on Vercel preview.
9. **`docs/HUBSPOT-STAGE-MAP.md`** — final form, committed alongside the env additions.
10. **`.env.example` additions, types.ts additions, single squashed commit per logical step** (migration, lib, push route, webhook, docs, tests). Atomic so PR review is clean.
11. **Push branch, open PR.** Do not merge.

Checkpoint: if any of the open questions surfaces a "no" from Kyle, I revise this plan before starting step 1.

---

## 12. Out of scope (capture as follow-ups, not this PR)

- Slack-bot accept UI (`P0-04`).
- Dashboard "Accept" button.
- Daily reconcile cron that retries `lead_actions` rows with `hubspot_deal_id IS NULL`.
- Backfill of chat-branch deferred-action rows once `lead_actions` exists.
- Attribution math beyond stamping `closed_won_amount` (e.g. branch-level rollups for the Briefing agent).
- Salesforce parity (`P2 #27`).
