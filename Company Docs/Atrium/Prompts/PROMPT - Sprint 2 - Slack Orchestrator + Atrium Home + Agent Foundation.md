# PROMPT — Sprint 2: Slack Orchestrator + Atrium Home + Agent Foundation

Dispatched by the Master Conductor. Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

This sprint accomplishes:
1. Build the Slack Orchestrator (custom workspace app) with DM, mention, slash command, and channel-posting handlers
2. Implement the Orchestrator agent: receives intent, runs Taboo Keeper, decomposes, dispatches, replies
3. Build the Atrium Home tab (Now view) with live data: greeting, status pulse, top of mind, calendar, digest, throttled activity feed, quick capture
4. Add the **"Run a Skill" surface** to Atrium Home per Addendum 2 section 1.4 (stub initially; populated by Sprints 3, 5, 6)
5. Provision `nervous_system.skills` registry table for the skills surface
6. Lay the persistent agent foundation: Inngest functions for agent runs, memory file conventions, service-role git push for agent memory
7. Apply Refero design references (per Addendum 2 section 3) for Atrium Home visual language

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint2-slack-app`): Slack channels + Slack app + event handler + slash commands (Tasks 1-4)
- **Stream B** (worktree `unicron-platform-worktrees/sprint2-orchestrator-agent`): Orchestrator agent + persistent agent runtime (Tasks 5-6)
- **Stream C** (worktree `unicron-platform-worktrees/sprint2-atrium-home`): Atrium Home tab + skills surface + skills registry table + Refero references (Tasks 7-9, plus new Task 7b)
- **Stream D** (worktree `Pathfinder-worktrees/sprint2-quick-capture`): quick capture wiring (Task 8)

Streams A and B integrate (B's agent receives events from A's handler). Streams C and D are mostly independent. Integration after all complete.

## Refero design integration (Stream C)

Before building any Atrium Home component, query Refero MCP for design context:
- `https://refero.design/pages/52bb2c69-2d28-4fdf-8164-6f01a58eba78`
- `https://refero.design/pages/198ab5d6-1b94-4a92-88c0-97fb0dc9c9e7`

Synthesize a hybrid: navigation, density, and information hierarchy patterns from both. Apply to Atrium Home. Document the chosen design tokens (color palette, type, spacing, radius, shadow, animation timing) in `unicron-knowledge/wiki/specs/atrium-design-tokens.md` for future sprints to reference.

If Refero MCP returns image references only (not extractable component specs), use them as visual guides — humans (or Claude on visual review) compare implementation to references for fidelity.

This sprint does NOT build the Analyst, Elder, or other persistent agents (Sprint 3). It builds the runtime they all share.

---

## Pre-conditions

- Sprint 1 verified (kanban Verified)
- `nervous_system.customers` exists with Zedcor seed
- `/api/ingest` real handler operational
- `atrium.unicron.systems` serves auth-gated shell
- Notion MCP, Slack MCP, Supabase CLI, Vercel CLI, Google Calendar MCP available
- Slack workspace exists for Unicron with channels `#general`, `#discovery`, plus four to be created: `#orchestrator-feed`, `#orchestrator-escalations`, `#pathfinder-action-items`, `#metacron-action-items`, `#internal-action-items`, `#sales-action-items`

If any pre-condition fails, halt and report.

---

## Kanban hygiene — start

1. Card "Sprint 2 — Slack Orchestrator + Atrium Home + Agent Foundation" → In Process
2. DRI: Kyle. Surface: Architecture. Source: Sprint Plan.
3. Verify Criteria: "Slack Orchestrator app installed in workspace. DM with directive returns parsed action items. Atrium Home tab renders live data with throttled activity feed. Persistent agent runtime accepts and runs a test agent. Pathfinder and unicron-platform Vercel deployments healthy."

---

## Tasks

### Task 1 — Create Slack channels

Create via Slack MCP if not yet present:
- `#orchestrator-feed` (public; digests and retros)
- `#orchestrator-escalations` (private; Kyle, Keenan, Curtis only)
- `#pathfinder-action-items`, `#metacron-action-items`, `#internal-action-items`, `#sales-action-items` (private; Kyle, Keenan, Curtis)

Set channel topics describing purpose. Pin a "Welcome" message in `#orchestrator-feed` linking to `atrium.unicron.systems`.

### Task 2 — Create Slack app "Unicron Orchestrator"

- Build via Slack API as a custom workspace app (not Slack MCP bot user; per SPEC v0.2 decision, custom app for polish)
- Required scopes: `chat:write`, `app_mentions:read`, `im:read`, `im:write`, `channels:history` (for designated channels), `users:read`, `commands` (for slash commands)
- Bot user name: `Orchestrator`
- Install to Unicron workspace
- Webhook URL: `https://atrium.unicron.systems/api/slack/events`
- Slash command endpoints: `/api/slack/commands`
- Store bot token in Vercel env: `SLACK_ORCHESTRATOR_BOT_TOKEN`

### Task 3 — Build Slack event handler

Path: `unicron-platform/api/slack/events.ts` (or in Pathfinder if API routes consolidate there; let's say unicron-platform since Atrium is there)

Handle events:
- `message.im` (DM): parse, dispatch to Orchestrator agent
- `app_mention`: parse, dispatch to Orchestrator agent in channel context
- `member_joined_channel`: log to ledger as a participation signal

Verify Slack request signature on every request. Return 200 quickly; do real work in Inngest.

### Task 4 — Build slash command handler

Path: `unicron-platform/api/slack/commands.ts`

Implement four slash commands:
- `/orchestrator status` — query active sprints and DRIs across kanbans, return ephemeral message
- `/orchestrator escalations` — list open `#orchestrator-escalations` items, return ephemeral
- `/orchestrator memory <query>` — semantic search over ledger via pgvector RPC, return ephemeral
- `/orchestrator dri <action_item_id> <team_member>` — reassign DRI, post confirmation in channel

### Task 5 — Implement Orchestrator agent

Path: `unicron-platform/lib/agents/orchestrator.ts` (and Inngest function `orchestrator-run`)

Agent contract:
- Trigger: Slack DM/mention forwarded by event handler
- Inputs: `{ slack_user_id, channel_id, message_text, thread_ts? }`
- Logic:
  1. Map `slack_user_id` to `team_member`; if not in allowlist, reply "Access denied"
  2. Run intent through Taboo Keeper
  3. If Taboo bounces, reply with reason; halt
  4. Decompose intent into one of: `dispatch_claude_code | create_action_item | semantic_search | reassign_dri | escalate | reply_only`
  5. For `dispatch_claude_code`: generate paste-ready Claude Code prompt with kanban hygiene baked in; reply in Slack with the prompt for Kyle's relay (autonomous dispatch deferred to Sprint 3 once persistent agent infra is solid)
  6. For `create_action_item`: build action_item row, dispatch kanban writer (Sprint 1 module), reply with link
  7. For `semantic_search`: query ledger via pgvector, reply with results
  8. For `reassign_dri`: update action_item, post confirmation
  9. For `escalate`: post to `#orchestrator-escalations` and reply
  10. For `reply_only`: simple acknowledgment
- Outputs: Slack reply + audit log entry + (optional) ledger row + (optional) action item

Memory: `vault/Memory/orchestrator/YYYY-MM-DD.md` daily log. Read on session start, write at session end.

### Task 6 — Persistent agent runtime foundation

Path: `unicron-platform/lib/agents/runtime.ts`

Provide:
- `loadAgentMemory(agent_name): Promise<string>` — fetches today's daily log + index from vault
- `writeAgentMemory(agent_name, entry): Promise<void>` — appends to daily log, commits via service-role git push
- `runAgent(agent_name, inputs): Promise<output>` — wraps the agent function with memory load/write, audit log, budget check
- Budget enforcement: read `agents.budget`, check `current_spent_usd < limit_usd_per_period`; if exceeded, return abstain with reason

Inngest function shells:
- `orchestrator-run` (triggered by Slack events)
- Placeholder `analyst-run`, `elder-run`, `taboo-keeper-run` (Sprint 3 fills logic)

### Task 7 — Build Atrium Home tab (Now view)

Path: `unicron-platform/src/atrium/Now.tsx` (or equivalent based on existing Vite + React structure)

Components per SPEC section 7:
- **Header**: greeting (time-of-day adaptive), date, time, status pulse (4 indicators)
- **Status pulse**: agent fleet (read `agents.active` and recent run errors), escalations count (read `#orchestrator-escalations` recent unresolved messages), budget burn (read `agents.budget` aggregated), decay alerts (read Analyst flags or compute from signals.last_touched aging)
- **Top of mind**: 3-5 cards per attention-scoring heuristic (open escalations, calls flagged by ingest, sprints in flight, customer health alerts, calendar items in next 4 hours)
- **Today's calendar**: next 3 events for current user via Google Calendar MCP
- **Yesterday's digest**: read latest from `vault/Memory/analyst/YYYY-MM-DD.md` (will be empty until Sprint 3; show "Digest builds tomorrow" placeholder)
- **Live activity feed**: subscribe to Supabase Realtime on `nervous_system.ledger` and `nervous_system.audit_log`; throttle to max 1 event per 30 seconds; dedupe within 5-minute window; group by source_type
- **Always-visible**: global search bar (`/` keyboard shortcut), quick capture button

Throttling rules per SPEC section 20.

### Task 7b — Skills surface on Atrium Home (Stream C)

Add the "Run a Skill to begin" surface per Addendum 2 section 1.4. Layout matches the Chase AI Agentic OS pattern:

```
RUN A SKILL TO BEGIN
[click a skill · press run · or type any prompt]

[prompt textarea]
[RUN →] [CLEAR]

MEMORY:    [Vault Cleanup] [Daily Digest] [Vault Search]
PRODUCTIVITY: [Morning Brief] [Inbox Triage] [Quick Capture]
RESEARCH:  [Deep Research] [LightRAG Query] [Morning Trend]
DISCOVERY: [Schedule Call] [Extract Signals]
SALES:     [Pipeline Stage] [Generate Proposal]
MARKETING: [Blog Post] [Social Post]
OPERATIONS: [Onboard Member] [Propose Taboo Edit]
```

For Sprint 2, the skill buttons render as **disabled placeholders** with tooltips "Coming in Sprint 3 — 6". Skills registry is provisioned (see below) so each sprint that builds a skill registers it and the button activates automatically when the skill is available.

Provision `nervous_system.skills` table:

```sql
CREATE TABLE IF NOT EXISTS nervous_system.skills (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text not null,
  domain text not null check (domain in ('memory','productivity','research','discovery','sales','marketing','operations','pathfinder','metacron')),
  type text not null check (type in ('manual','scheduled','triggered')),
  inputs_schema jsonb default '[]'::jsonb,
  outputs_schema jsonb default '[]'::jsonb,
  schedule_cron text,
  trigger_event text,
  refusal_gate boolean default true,
  budget_usd_per_run numeric,
  skill_md_path text,
  active boolean default false,
  registered_at timestamptz default now(),
  last_run_at timestamptz,
  total_runs integer default 0
);
```

Atrium reads this table to render the skills surface. Each button: skill `name` (display) → click → POST to `/api/atrium/skills/:id/run` with input params → server-side dispatch + audit log + Taboo Keeper validation.

Sprint 3 onward: Analyst registers each new skill by writing a row + linking SKILL.md path. The button activates when `active=true`.

Forecast and recent-runs panels (right side of skills surface) read from `nervous_system.audit_log` filtered by skill runs. Sprint 2 stubs them; Sprint 3 populates.

### Task 8 — Quick capture wiring

Path: `unicron-platform/src/atrium/QuickCapture.tsx`

Three modes:
- **Voice**: tap mic, record (Web MediaRecorder API), upload to `/api/ingest` with `source_type=voice_memo`
- **Text**: textarea, post to `/api/ingest` with `source_type=manual`
- **Photo**: file input, post with photo as base64 evidence to `/api/ingest`

All routes through the same `/api/ingest` endpoint with current user's API key.

For voice transcription: server-side Whisper call before downstream ingest skill. (Voice memo full skill is Sprint 4; for Sprint 2, support text and photo capture; voice can return `not_yet_implemented` with the transcript URL stored for Sprint 4 retry.)

### Task 9 — Mobile responsiveness for Now tab

Test at 320px to 768px viewport widths. Tabs should collapse to a hamburger menu on phone width. Status pulse stacks vertically. Top of mind cards full width. Activity feed full width.

### Task 10 — Multi-Vercel verification

- `vercel inspect` for Pathfinder: green
- `vercel inspect` for unicron-platform: green
- Smoke test: DM Orchestrator with "Hello" from Kyle's Slack account; expect a parsed reply
- Smoke test: send `/orchestrator status` slash command; expect ephemeral response with active sprints
- Smoke test: open `atrium.unicron.systems` from logged-in browser; expect Now tab with live status pulse
- Smoke test: trigger an event that causes ledger write; verify it appears in activity feed within 60 seconds

### Task 11 — Continuity log

Append to `Memory/elder/continuity.md`:

```markdown
## YYYY-MM-DD — Sprint 2 ratified
- **Type:** architectural_decision
- **Substance:** Slack Orchestrator app live in workspace. Atrium Home tab serves live data. Persistent agent runtime ready for Analyst/Elder in Sprint 3.
- **Evidence:** PR <url>, commit <sha>, kanban card <link>
- **Active_until:** indefinite
```

---

## Hard halt conditions

- Slack workspace permissions insufficient to install custom app
- Slack signature verification fails (any request lacks valid signature)
- Atrium Home tab cannot subscribe to Supabase Realtime
- Quick capture cannot reach `/api/ingest` (CORS, auth, or routing failure)
- Either Vercel project fails to build
- Smoke tests fail

---

## Auto-merge criteria

- All Slack channels created
- Slack app installed and responsive to DM, mention, slash commands
- Atrium Home tab renders with live data
- Activity feed throttle and dedupe verified
- Quick capture (text + photo) operational
- Mobile responsive verified at 375px, 414px, 768px
- Both Vercel projects deploy healthy
- Smoke tests pass
- PR description has verbatim evidence

---

## Auto-revert triggers

- Slack app spam-blocked or rate-limited (revert; reduce activity)
- Activity feed causes Atrium client to lag or crash
- `/api/ingest` regression after Slack handler integration

---

## Kanban hygiene — end

Same rules as Sprint 1: Deployed / Review / Bug Fixes / Backlog per outcome. Never auto-promote to Verified.

---

## Done criteria

1. Six Slack channels exist with topics and pins
2. Slack Orchestrator app installed; bot named `Orchestrator`
3. Event handler responds to DM, mention; slash commands work
4. Orchestrator agent decomposes intent and replies (Taboo-checked)
5. Persistent agent runtime: `loadAgentMemory`, `writeAgentMemory`, `runAgent` all callable; budget enforcement working
6. Atrium Home tab renders all components with live data (or graceful fallback for digest-not-yet-built)
7. Throttled activity feed verified
8. Quick capture text + photo modes work
9. Mobile responsive at three viewport widths
10. Continuity log appended

---

## Out of scope

- Analyst nightly cron (Sprint 3)
- Elder continuity advisory MCP RPC (Sprint 3)
- Voice memo Whisper integration (Sprint 4)
- Atrium tabs other than Now (Sprints 3-7)
- Autonomous Claude Code dispatch from Orchestrator (Sprint 3 once persistent agent infra is robust)

Begin.
