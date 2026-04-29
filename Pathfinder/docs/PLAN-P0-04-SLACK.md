# PLAN-P0-04-SLACK — Native Slack bot in customer workspaces

**Status:** v1 draft (awaiting approval) · **Date:** 2026-04-28
**Branch:** `feat/p0-04-slack-bot` · **Worktree:** `Pathfinder-worktrees/p0-04-slack-bot`
**Spec:** `Pathfinder/Pathfinder-Feature-Specs.md` § "P0 Feature 4 — Slack bot in customer workspaces"
**Consumes:** `lib/lead-actions.ts` (P0-03) · optional `pathfinder.outreach_drafts` (P0-02) · existing `lib/briefing.ts` flow

---

## 1. Goal

Replace the single-tenant `SLACK_WEBHOOK_URL` post-pattern with a multi-tenant Slack app installed into each customer's workspace. Reps see high-priority leads as Block Kit messages with three buttons — **Accept**, **Dismiss**, **Snooze**. Tapping a button writes through `lib/lead-actions.ts` and flows to HubSpot via P0-03. Accept opens a modal that captures the rep-attested pipeline value and first-action date before the row is finalized. High-priority leads (score ≥ 90 AND RFP window < 60 days) DM the routed rep immediately, bypassing the Friday digest. The Friday digest itself continues to fire from `lib/briefing.ts` (P0-10 Briefing) — this branch only swaps its delivery from webhook to bot-token.

## 2. Hard constraints (verbatim from the brief)

1. Multi-workspace from day one. Each customer's Slack is a separate install with its own bot token.
2. Action button taps write to `pathfinder.lead_actions` atomically via P0-03's `lib/lead-actions.ts`. No duplicate accept logic.
3. Accept opens a modal capturing `attested_pipeline_value` (numeric) and `first_action_date` (ISO date) before final commit.
4. High-priority alerts (`score >= 90 AND rfp_window < 60 days`) DM the assigned rep immediately, bypassing digest cadence.
5. Friday digest fires from P0-10 Briefing agent, not this bot. We extend `lib/notifications.ts` so the existing briefing flow can target a workspace install rather than a webhook.
6. No code until this plan is approved.

## 3. Architecture decisions (request approval on each)

**D1. Use `@slack/web-api` + manual signature verification, not `@slack/bolt`.**
The brief proposes the Bolt SDK. Bolt's receiver model assumes Express-style middleware and embeds an in-process installer that fights Next.js App Router. The HubSpot webhook from P0-03 (`lib/hubspot/webhook-signature.ts`) already establishes the manual-HMAC pattern we'd reuse. Net effect: one runtime dependency (`@slack/web-api`) instead of three (`@slack/bolt` + `@slack/oauth` + adapters), tighter integration with our existing route conventions. No loss of functionality — Block Kit, modals, OAuth, and conversations.history all live in `web-api`.
**Decision needed:** approve `@slack/web-api`-only or hold to Bolt.

**D2. Multi-workspace token storage in `pathfinder.slack_workspaces`.**
New table holds the per-team install record (team_id, bot_token, scope, installer info, default alert channel, created_at). Reads gated to service role; the bot never touches the table from a request handler running with the anon key. Migration `0012_slack_workspaces.sql` (numbering after P0-03's 0011 to keep ordering deterministic across PRs).

**D3. High-priority routing via a per-workspace channel map, with `<!here>` mention; not per-rep DM (yet).** [APPROVED 2026-04-28 with refinements]
"Assigned rep" is unmodelled today — `pathfinder.branches` has no rep contact, no Slack user_id, no email. Building a rep-to-Slack-user mapping UI is out of scope for this branch. The plan instead ships a `(workspace_id, branch_id) → channel_id` routing table populated by an admin-only API (or seeded manually for the Zedcor pilot). High-priority channel posts include an `<!here>` mention to approximate immediate-attention behaviour. Per-rep DM is documented in `docs/SLACK-APP-SETUP.md` § "Planned v2: Per-rep DM mapping" so the sequencing is intentional, not an oversight.

**D4. High-priority alert detection runs as a Vercel cron at `/api/cron/slack-alerts`, every 10 minutes, with a 7-day re-alert TTL.** [APPROVED 2026-04-28 with refinements]
Alternatives considered: (a) database trigger — adds Postgres complexity, harder to test; (b) hook into Verifier — couples agents that should stay independent. The cron polls `pathfinder.projects` for verified rows where `verified=true AND score >= 90 AND rfp_window_check` and either have never been alerted or were last alerted more than 7 days ago. Dedup column on `pathfinder.projects`: `slack_alert_sent_at timestamptz` (added by 0012). The TTL lets a project that gets re-ranked high-priority later (after Pulse tunes scoring weights) re-alert without forcing a manual reset; without the TTL, score increases would be silent.

**D5. Block Kit messages live in `lib/slack/messages.ts`, not inline in handlers.**
Pure builders. One-lead message, per-branch digest, accept-modal, and post-action update are exported as functions taking shape-typed input. Snapshot tests verify Block Kit JSON.

**D6. RFP-window proxy: `now - posted_date < 60 days` for v1.** [APPROVED 2026-04-28 with caveat]
The schema has no `rfp_close_date` field. Best proxy is `pathfinder.projects.posted_date`. The "RFP window < 60 days" rule becomes "`posted_date IS NOT NULL AND now - posted_date < 60 days`."
**Known simplification (documented in `lib/slack/alerts.ts` at the query site):** this proxy actually captures FRESH projects, not projects with imminent RFP cycles. A project posted 7 days ago has lots of runway; a project posted 55 days ago is closer to RFP. For the demo, "fresh + high-score" is a reasonable urgency signal. Refined logic eventually is "posted between 30 and 75 days ago" (we're nearing RFP but still have time to act on it) — refine when we have real Zedcor accept-rate data telling us which proxy actually matches their pipeline behavior.

## 4. Data model — `0012_slack_workspaces.sql`

```sql
-- Workspace install record. One row per customer Slack workspace.
create table pathfinder.slack_workspaces (
  team_id              text primary key,        -- Slack T0123…
  team_name            text not null,
  bot_user_id          text not null,           -- Slack U0123…
  bot_token            text not null,           -- xoxb-…
  app_id               text not null,
  scope                text not null,
  installer_user_id    text,                    -- Slack user that did the install
  installer_email      text,
  default_alert_channel_id text,                -- fallback channel for unrouted alerts
  installed_at         timestamptz not null default now(),
  uninstalled_at       timestamptz,
  raw_oauth_payload    jsonb                    -- full v2.access response for audit/replay
);

-- Per-branch routing. Created via admin-only seed for the Zedcor pilot.
create table pathfinder.slack_branch_routes (
  team_id        text not null references pathfinder.slack_workspaces(team_id) on delete cascade,
  branch_id      text not null references pathfinder.branches(id) on delete cascade,
  channel_id     text not null,
  -- optional per-branch DM target. null until per-rep mapping ships.
  rep_user_id    text,
  rep_email      text,
  primary key (team_id, branch_id)
);

-- Per-message audit so we can update buttons in-place after a click.
create table pathfinder.slack_messages (
  id              bigserial primary key,
  team_id         text not null references pathfinder.slack_workspaces(team_id) on delete cascade,
  channel_id      text not null,
  ts              text not null,                 -- Slack message ts (the id)
  project_id      text not null references pathfinder.projects(id) on delete cascade,
  kind            text not null check (kind in ('digest_item','high_priority_dm','high_priority_post')),
  posted_at       timestamptz not null default now(),
  resolved_at     timestamptz,                   -- stamped when a button is tapped
  resolved_by     text,                          -- Slack user_id that tapped
  resolved_action text check (resolved_action in ('accept','dismiss','snooze'))
);

create unique index slack_messages_ts_idx on pathfinder.slack_messages(team_id, channel_id, ts);
create index slack_messages_project_idx on pathfinder.slack_messages(project_id, posted_at desc);

-- Per-project dedup for high-priority DMs.
alter table pathfinder.projects
  add column slack_alert_sent_at timestamptz;

-- Widen agent_log/agent_runs whitelist to include 'slack-bot'.
alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot'
  ));

alter table pathfinder.agent_runs drop constraint agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot'
  ));

-- RLS. Same pattern as 0011.
alter table pathfinder.slack_workspaces enable row level security;
alter table pathfinder.slack_branch_routes enable row level security;
alter table pathfinder.slack_messages enable row level security;

-- Service-role-only writes; no anon read of bot_tokens.
create policy slack_workspaces_admin on pathfinder.slack_workspaces for all
  to service_role using (true) with check (true);
create policy slack_branch_routes_admin on pathfinder.slack_branch_routes for all
  to service_role using (true) with check (true);
create policy slack_messages_admin on pathfinder.slack_messages for all
  to service_role using (true) with check (true);
```

**Coordination note on the `agent_log` constraint:** P0-03 (`0011_hubspot_sync.sql`) already widens this to add `'hubspot-sync'`. If P0-03 has merged when 0012 lands, 0012's `drop constraint … add constraint …` simply re-creates the constraint with both names. If P0-03 hasn't merged, our migration runs first and P0-03's must be rebased — that's the order P0-03's plan already accepts. No conflict either way.

## 5. Module map — `Pathfinder/lib/slack/`

```
lib/slack/
  bot.ts          — Slack web-api client factory, signature verification helper,
                    workspace-token lookup. Single entry for "give me a client
                    for team_id T0123" → returns @slack/web-api WebClient.
  install.ts      — OAuth flow handlers: build install URL, exchange code,
                    persist to slack_workspaces. Pure logic; routes call into it.
  messages.ts     — Block Kit builders. Pure functions, snapshot-tested.
                      buildLeadMessage(project, branch, customer) → blocks
                      buildDigestMessage(branchSummary, opportunities) → blocks
                      buildAcceptModal(project) → view payload
                      buildPostActionUpdate(project, action, actorEmail) → blocks
  actions.ts      — Button + modal-submit dispatch. Owns the flow:
                      onAcceptClick → open modal
                      onAcceptModalSubmit → call lib/lead-actions.acceptLead → update message
                      onDismissClick → call lib/lead-actions.recordLocalAction(dismissed) → update message
                      onSnoozeClick → call lib/lead-actions.recordLocalAction(snoozed) → update message
  alerts.ts       — High-priority detection + DM/post. Reads new high-priority
                    projects, picks routes, calls bot.ts to send, stamps
                    slack_alert_sent_at + slack_messages row. Used by
                    /api/cron/slack-alerts.
```

**Boundary discipline:** `bot.ts` is the only module that talks to Slack network APIs; `messages.ts` is pure builders; `actions.ts` and `alerts.ts` orchestrate but call into both. Routes are thin parsers + dispatchers. Same separation we use in `lib/briefing.ts` ↔ `lib/notifications.ts`.

## 6. API routes (Next.js App Router)

```
app/api/slack/
  install/
    start/route.ts       — GET: build OAuth URL; 302 to slack.com/oauth/v2/authorize.
                            BASIC-AUTH GATED via middleware.ts (operator only).
    callback/route.ts    — GET ?code=…&state=…: verify state, exchange code,
                            persist slack_workspaces row, 302 to /install/success.
                            PUBLIC (Slack hits it without credentials); auth via
                            HMAC-signed state + Slack's own code exchange.
  events/route.ts        — POST: Slack Events API webhook.
                            url_verification: echo challenge.
                            app_uninstalled: stamp slack_workspaces.uninstalled_at.
                            (No message events subscribed for v1.) PUBLIC; signed.
  actions/route.ts       — POST: Slack interactivity (button + modal_submit).
                            Verifies signing secret, dispatches into lib/slack/actions.ts.
                            Slack requires a 200 within 3s — we ack immediately,
                            do work async. Modal opens use trigger_id within 3s. PUBLIC; signed.
app/api/cron/slack-alerts/route.ts  — GET: high-priority DM cron, every 10 min.
                            Auth: Bearer ${CRON_SECRET}.
```

Auth on `/cron/slack-alerts` matches the existing pattern (`Bearer ${CRON_SECRET}` or `?secret=`). `events`, `actions`, and `install/callback` are all exempted from basic-auth in `middleware.ts`; events and actions verify the Slack signing secret (`X-Slack-Signature` + `X-Slack-Request-Timestamp`, HMAC-SHA256 over `v0:{ts}:{body}`); install/callback verifies the OAuth state token + Slack's code exchange.

## 7. Message designs (Block Kit, summarized)

**Per-lead message (DM or channel post):**
- Header: project title. High-priority channel posts prepend a leading `<!here>` mention as an `mrkdwn` section so the channel's online members get pinged. (DMs do not need the mention.)
- Context strip: `score · value · distance · source · branch`.
- Section: 2-line rationale snippet.
- Actions: four buttons — `Accept` (primary), `Dismiss`, `Snooze 24h`, `Snooze 7d`. Each carries `action_id=accept|dismiss|snooze_24h|snooze_7d` and a JSON payload with `project_id` and the originating `slack_messages.id`. Both snooze actions call `recordLocalAction({status: 'snoozed'})` with the duration encoded in `note` (e.g. `"snoozed 7d via slack"`); the alerts cron reads the most recent snooze action per project and skips re-alerts until the duration elapses.

**Per-branch digest (used by the Friday brief):**
- Header: `Friday brief · {branch} · {date}`.
- Status strip (mono): same shape as the email's status line.
- Up to 5 leads, each rendered as a section with a stripped-down version of the per-lead message (no per-lead buttons in the digest — buttons come on the high-priority alerts; digest items deep-link to the dashboard).
- Footer button: `Open operations console`.

**Accept modal:**
- Title: `Accept lead — {project title (truncated)}`.
- Block 1: number_input — `Estimated pipeline value (USD)` (required, ≥ 0).
- Block 2: datepicker — `First-action date` (required, default = today).
- Block 3: optional plain_text_input — `Note` (multiline).
- Submit: `Confirm accept`. Cancel: `Cancel`.
- `private_metadata` carries `{ project_id, slack_messages_id }` so the submit handler knows which message to update.

**Post-action update (replaces the original buttons):**
- Same header + context strip.
- Buttons replaced with a single context line: `Accepted by @user · pipeline $XXX · first action 2026-05-02`. Or `Dismissed by @user`. Or `Snoozed by @user (24h)` / `(7d)`.
- For accepts only (per Q7 recommendation): a thread reply on the same message with the rep's note (if any) and a HubSpot deep-link `View deal in HubSpot ›` once the deal id is known. Dismiss and snooze do not get a thread reply.

Block Kit snapshots live in `__tests__/slack/messages.test.ts`.

## 8. Accept-flow sequence (end-to-end)

```
Tap [Accept]
   → POST /api/slack/actions
     → verify signature
     → ack 200 within 3s
     → buildAcceptModal(project)  ─ async ─→ slack.views.open(trigger_id)
Submit modal
   → POST /api/slack/actions  (type=view_submission)
     → verify signature
     → parse pipeline_value + first_action_date + note + private_metadata
     → acceptLead({ projectId, actorEmail = installer-or-route-email,
                    attestedPipelineValue, firstActionDate, note })   ← lib/lead-actions.ts
     → buildPostActionUpdate(...)  → slack.chat.update(channel, ts, blocks)
     → update pathfinder.slack_messages: resolved_at, resolved_by, resolved_action='accept'
     → ack 200 (empty body)
```

`acceptLead` is upsert-idempotent on `(project_id, actor_email)` per the P0-03 contract, so a double-tap by the same user is a no-op. A second user tapping after the message has been resolved is prevented client-side: the `chat.update` removed the buttons. We additionally guard server-side: if `slack_messages.resolved_at IS NOT NULL`, we 200 with no-op and audit-log `duplicate_button_tap`.

**Actor email resolution.** `acceptLead` requires `actorEmail`. Slack gives us `user.id` on every interaction. We resolve via `slack.users.info` → email, cached per workspace (in-memory LRU; lives only for the route runtime — Vercel functions are short-lived). Fallback when the user's Slack profile has no email visible: use the install record's `installer_email`. Audit-logged either way.

## 9. High-priority DM / post cron

`/api/cron/slack-alerts` runs every 10 minutes (Vercel cron in `vercel.json`):

```
1. Select projects WHERE
     verified = true
     AND score >= 90
     AND posted_date IS NOT NULL
     AND now - posted_date < interval '60 days'    -- v1 proxy; see D6 caveat
     AND (slack_alert_sent_at IS NULL
          OR slack_alert_sent_at < now() - interval '7 days')   -- 7-day re-alert TTL
     AND nearest_branch_id IS NOT NULL
   ORDER BY score DESC LIMIT 50.
2. For each row, exclude any whose latest lead_actions row has
     status='snoozed' AND
     (snoozed_at + duration) > now()
   where duration is parsed from the snooze note ('snoozed 24h' → 24h, 'snoozed 7d' → 7d;
   default 24h if note missing).
3. Look up (workspace, channel, rep_user_id) via slack_branch_routes joined on
   branches → slack_workspaces.
4. If rep_user_id present: open IM and post (chat.postMessage to user channel) — no <!here>.
5. Else: chat.postMessage to channel_id, with a leading <!here> mrkdwn block to
   approximate the immediate-attention behaviour we'd get from a per-rep DM.
6. Persist a slack_messages row, then stamp projects.slack_alert_sent_at = now().
7. agent_log row per send: slack-bot/high_priority_alert.
```

Failures are non-fatal per row; the cron logs and continues. The `slack_alert_sent_at` stamp only updates on a successful post, so retries on the next tick are automatic and idempotent. The 7-day TTL means a project re-alerts at most weekly even if its score keeps climbing — preventing alert fatigue while keeping Pulse-tuned re-ranks visible.

## 10. Multi-workspace install (OAuth v2)

The install flow splits across two endpoints because they have different auth requirements (per Q6):

**`GET /api/slack/install/start`** — operator-initiated install URL builder. **Gated behind basic-auth** via the existing `middleware.ts` rule (the same gate that protects the dashboard). Builds:
```
https://slack.com/oauth/v2/authorize
  ?client_id={SLACK_CLIENT_ID}
  &scope={comma-list, see below}
  &redirect_uri={NEXT_PUBLIC_BASE_URL}/api/slack/install/callback
  &state={signed-csrf-token}
```
Then `302` redirects to that Slack URL. Only operators with the basic-auth password can initiate an install. Slack's authorize page itself handles customer authentication.

**`GET /api/slack/install/callback?code=…&state=…`** — Slack's redirect target after the customer approves the app. **Cannot be basic-auth-gated** because Slack does not send credentials. `middleware.ts` is updated to exempt this exact path. Authentication is via the OAuth `state` token (HMAC-signed with `CRON_SECRET`) plus the code exchange itself:

1. Verify `state` (HMAC-signed; reject if missing or invalid). State carries no PII; just a 32-byte nonce.
2. POST `oauth.v2.access` with `code`, `client_id`, `client_secret`. Slack's response is the proof — only Slack itself could have produced a valid `code` for our `client_id`.
3. Persist the response into `pathfinder.slack_workspaces`. `bot_token` field stores `xoxb-…`. Upsert on `team_id` so re-installs replace the prior token.
4. `302` → `/install/success?team={team_id}` (a public success page; no PII).

`middleware.ts` exemption note: the matcher already supports per-path overrides; we add `/api/slack/install/callback` and `/api/slack/events` and `/api/slack/actions` to the public list, since all three are signed-payload endpoints that verify their own authenticity and must be reachable without browser credentials.

**Required Slack scopes** (final list goes into `docs/SLACK-APP-SETUP.md`):
- `chat:write` — post messages.
- `chat:write.public` — post into channels we're not in (optional; we'll prefer invited channels).
- `commands` — future slash commands (not used in v1, declared for forward-compat).
- `users:read`, `users:read.email` — resolve actor email from user_id.
- `im:write` — open DM with rep_user_id when routes specify one.
- `views:write` — open the Accept modal.
- `team:read` — used during install confirmation.

**Required event subscriptions:**
- `app_uninstalled` — to stamp `uninstalled_at`.

**Interactivity:** request URL → `{NEXT_PUBLIC_BASE_URL}/api/slack/actions`.

## 11. Touches on `lib/notifications.ts`

Today, `briefing.ts` calls `sendSlack(text, blocks)` against `process.env.SLACK_WEBHOOK_URL`. We add a parallel function:

```ts
export async function sendSlackDigest(args: {
  teamId: string;
  channelId: string;
  text: string;
  blocks: SlackBlock[];
}): Promise<DeliveryResult>
```

Implementation calls `lib/slack/bot.getClient(teamId).chat.postMessage(...)`. The existing `sendSlack` stays for the webhook fallback (we don't delete it; one merged customer can still use a webhook in dev/test). `briefing.ts` chooses based on whether a `slack_workspaces` row exists for the briefing's recipient workspace:

```
if has-bot-install: sendSlackDigest({ teamId, channelId, text, blocks })
else if SLACK_WEBHOOK_URL: sendSlack({ text, blocks })  (existing path)
else: skip slack delivery
```

This is the only edit to `briefing.ts`; the merge with P0-10 (Briefing) is line-local. Per the brief: "trust git's three-way merge with other branches that touch this file." If P0-10 also rewrites the slack delivery branch, the loser rebases.

## 12. Migration coordination

| File | Order | Owner branch | Adds |
| --- | --- | --- | --- |
| 0010_outreach_drafts.sql | 10 | feat/p0-02-outreach-drafter | `outreach_drafts` table |
| 0011_hubspot_sync.sql | 11 | feat/p0-03-hubspot-sync | `lead_actions` table; widens agent_name to `hubspot-sync` |
| **0012_slack_workspaces.sql** | **12** | **feat/p0-04-slack-bot (this)** | **`slack_workspaces`, `slack_branch_routes`, `slack_messages`; `projects.slack_alert_sent_at`; widens agent_name to `slack-bot`** |

The constraint widening in 0012 is idempotent: if 0011 hasn't merged, 0012's `add constraint` simply includes both `hubspot-sync` and `slack-bot`. If 0011 merged first (which is the expected order — P0-03 dependency), 0012 re-creates with the union. Either way the final state is correct.

## 13. Test plan

- Unit: `lib/slack/messages.ts` Block Kit snapshots for lead message, digest, modal, post-action update.
- Unit: `lib/slack/install.ts` — state token sign/verify; OAuth response → row insert.
- Unit: signature-verification helper — happy path + tampered payload + replayed timestamp (>5min old → reject).
- Unit: `lib/slack/alerts.ts` — query selects only matching rows; idempotency on `slack_alert_sent_at`.
- API: `app/api/slack/actions/route.ts` — modal_submit happy path + post-resolution no-op + signature failure 401.
- API: `app/api/slack/install/route.ts` — first-time install + duplicate install (upsert) + invalid state.
- Integration (manual, end-to-end): personal/test Slack workspace, full button flow including modal. Documented in `docs/SLACK-APP-SETUP.md` § "Test workspace walkthrough."
- Mocks: a fake `WebClient` in `__tests__/slack/_fakes.ts` that records the calls. No live Slack API in CI.

## 14. Build sequence

1. **Slack App config doc** — `docs/SLACK-APP-SETUP.md`. Lists scopes, event subscriptions, interactivity URL, OAuth redirect URL (`/api/slack/install/callback`). Kyle creates the app on api.slack.com using this doc; populates env vars in Vercel before merge.
2. **Migration 0012** + types regen. Add new types to `lib/types.ts`.
3. **`lib/slack/bot.ts`** — client factory + signature helper + workspace lookup.
4. **`lib/slack/install.ts`** + `app/api/slack/install/start/route.ts` (basic-auth-gated) + `app/api/slack/install/callback/route.ts` (public, signed-state) + `middleware.ts` exemptions.
5. **`lib/slack/messages.ts`** — Block Kit builders (4-button per-lead message, modal, post-action update, optional accept thread reply) + snapshot tests.
6. **`lib/slack/actions.ts`** + `app/api/slack/actions/route.ts` — button dispatch + modal submit + accept thread reply. Wire to `lib/lead-actions.ts`.
7. **`lib/slack/alerts.ts`** + `app/api/cron/slack-alerts/route.ts` — high-priority DM/channel post with `<!here>` for channel posts, 7-day TTL, snooze-aware. Add to `vercel.json` cron schedule.
8. **`lib/notifications.ts`** — add `sendSlackDigest`. **Do not** delete `sendSlack` (webhook fallback).
9. **`app/api/slack/events/route.ts`** — minimal handler for `url_verification` + `app_uninstalled`.
10. **End-to-end smoke test** in personal Slack workspace. Capture screenshots into `docs/SLACK-APP-SETUP.md` § Walkthrough.
11. **Push branch, open PR.**

## 15. Env vars added

| Var | Purpose | Set by |
| --- | --- | --- |
| `SLACK_SIGNING_SECRET` | HMAC for events/actions | Kyle in Vercel |
| `SLACK_BOT_TOKEN` | Dev fallback only — production reads from `slack_workspaces.bot_token` | Kyle in Vercel (test workspace) |
| `SLACK_CLIENT_ID` | OAuth | Kyle in Vercel |
| `SLACK_CLIENT_SECRET` | OAuth | Kyle in Vercel |

Existing `SLACK_WEBHOOK_URL` is **kept as a fallback** for the briefing flow when no workspace install exists. Removing it is a separate cleanup once Zedcor's workspace is installed.

## 16. Open questions — resolution log

1. **Per-rep DM mapping.** [RESOLVED 2026-04-28] Per-channel routing via `slack_branch_routes` ships in v1. High-priority channel posts include `<!here>` to approximate immediate-attention behaviour. Per-rep DM is documented as planned v2 in `docs/SLACK-APP-SETUP.md`.
2. **Bolt vs. web-api (D1).** [RESOLVED 2026-04-28] `@slack/web-api` only. Manual HMAC pattern reused from P0-03.
3. **Snooze duration.** [RESOLVED 2026-04-28] Two-button design: `Snooze 24h` (default) and `Snooze 7d` (secondary). Both record `status='snoozed'` via `recordLocalAction`; duration encoded in the note string. Alerts cron enforces the suppression window.
4. **RFP-window proxy (D6).** [RESOLVED 2026-04-28 with caveat] `now - posted_date < 60 days` for v1. Comment in `lib/slack/alerts.ts` notes this captures FRESH not IMMINENT-RFP, and the better proxy ("posted between 30 and 75 days ago") is a follow-up once Zedcor accept-rate data tells us which framing matches their pipeline.
5. **Cron cadence.** [RESOLVED 2026-04-28] 10-minute cron approved. No need for 1-minute tier.
6. **Install authentication.** [RESOLVED 2026-04-28] Split into two endpoints: `GET /api/slack/install/start` is basic-auth-gated (operator-only); `GET /api/slack/install/callback` is public (Slack can't send basic-auth credentials), authenticated via OAuth state token + code exchange. `middleware.ts` exempts the callback path plus `/api/slack/events` and `/api/slack/actions`.
7. **Post-resolution message visibility.** [RESOLVED 2026-04-28] Buttons replaced in-place with a context line (`Accepted by @user · pipeline $X · first action 2026-05-02` / `Dismissed by @user` / `Snoozed by @user (24h)` or `(7d)`). For accepts only: a thread reply on the original message with the rep's note (when present) and a `View deal in HubSpot ›` deep-link once the deal id is known. Dismiss and snooze get no thread reply. Rationale: accepts have stakeholder-readable details a manager will want to find via Slack search later; dismiss/snooze are inventory hygiene with no audit-worthy content.

## 17. Non-goals (explicitly out of scope for this branch)

- Slash commands (`/pathfinder …`) — the scopes list declares `commands` for forward-compat, but no command handlers ship.
- Reactji-driven actions (`:thumbsup:` accept).
- Per-rep Slack-user mapping UI in settings — Open Question #1.
- Customer-facing install wizard at `unicron.systems/install` — the `GET /api/slack/install` URL is operator-only for the pilot.
- Slack Connect / shared channels — not needed for the bot install pattern.
- Replacing the existing webhook delivery in `lib/notifications.ts` — kept as fallback.

---

**Approval requested on:**
- Architecture decisions D1–D6.
- Open questions 1–7.
- Migration ordering (0012 after P0-03's 0011).
- The build sequence in §14.

Once approved, I'll write `docs/SLACK-APP-SETUP.md` first (Kyle uses it to create the app on api.slack.com), then proceed through §14 in order.
