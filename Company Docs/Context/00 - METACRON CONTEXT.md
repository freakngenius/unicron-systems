# 00 - METACRON CONTEXT

Reference doc for the Metacron-focused Cowork chat. Read this first.

Last updated: 2026-05-02 (rewritten after data loss)

---

## 1. What Metacron is

Metacron is the operator-facing surface of Unicron Systems. While Pathfinder is the customer-facing product (the Zedcor lead-intelligence app), Metacron is what Kyle, Keenan, and the agent-orchestrator engineers use to:

- Watch the agent pipeline run in real-time (Living Intelligence visualizer)
- Configure customer onboarding (per-org settings, scoring weights, source onboarder)
- Review Architect proposals (decomposition, tuning, discovery)
- Monitor cross-customer health (cost trends, eval pass rates, anomaly detection)
- Manage operator team (RBAC, audit log)
- Eventually productize: Conductor (build-time supervisor), plugin marketplace, inter-customer learning

Metacron is the platform that makes Pathfinder (and future customer products) self-designing and operator-supervisable.

## 2. Relationship to Pathfinder

| | Pathfinder | Metacron |
|---|---|---|
| Audience | Customer reps + execs | Operator team |
| Stack | Next.js 14.2 (`Pathfinder/`) | Vite + React 19 (`unicron-platform/`) |
| Vercel project | `pathfinder-ashy` | `unicron-systems` (or new `metacron`) |
| Auth | Basic-auth (Pathfinder) | Magic-link via Supabase Auth |
| Database | `pathfinder.*` schema in Supabase | `unicron.*` schema in same Supabase |
| Domain | unicron.systems/pathfinder/* | metacron.unicron.systems (post-Vercel-setup) |

Both share the same Supabase project and same agent backend. Metacron CONSUMES Pathfinder's data and surfaces it to operators. Pathfinder doesn't know Metacron exists.

## 3. Critical constraints

- Do NOT touch `Pathfinder/` source code. That's the Pathfinder Cowork chat's territory. Cross-app dependencies surface as `MEMORY/operator-todos/` files.
- Do NOT modify `Pathfinder/supabase/migrations/`. Pathfinder owns its schema; Metacron has its own `unicron.*` schema with its own migrations.
- Do NOT touch the Pathfinder Vercel project config.
- Do NOT bypass kanban hygiene (per `feedback_kanban_auto_update.md`).
- Do NOT include time estimates or cost caps in any prompt (per `feedback_prompts_no_estimates_or_caps.md`).
- Do NOT delete files, run `git clean`, or wipe uncommitted work (per `feedback_no_deletes.md`).
- DO commit after every reorganization or move; uncommitted work gets wiped by branch switches.
- DO communicate via shared `MEMORY/` for cross-chat coordination.

## 4. Current state (as of 2026-05-02)

### Deployed in production (Stream C of Zedcor Sprint)

- Living Intelligence visualizer (Canvas-2D React, real-time via Supabase Realtime)
- Activity feed (Supabase Realtime on `pathfinder.agent_log`)
- HUD counters (cost ticker, agent count, active runs)
- Settings drawer wired to `unicron.settings`
- Magic-link authentication (Supabase Auth)
- Architect Inbox UI (consumes Stream D real endpoints; feature-flag-gated `VITE_ARCHITECT_API_ENABLED`)
- Add Source UI (consumes Stream E single-phase API)
- Edit Node panel
- Drive-to-Exit Prompt Patterns library

### Bug Fixes column

- Two-visualizers cleanup verification — Stream C C2 deleted iframe Pixi version (161KB). Need to verify no orphan references remain.
- Conductor Relay v0.1 (Python script) — `scripts/conductor-relay.py`. pexpect can't wrap Claude Code TUI. Needs tmux-based or clipboard-based rebuild.

### Not Yet Started (high-value, near-term)

- Source Onboarder analyze-then-deploy UX
- Coverage Expansion UI (Stream E backend exists; UI is the gap)
- Tier 2 ticket resolution UI
- Customer list view (multi-tenant operator)
- Per-customer health dashboard
- Operator-side customer onboarding wizard
- User management (operator team RBAC)
- Audit log (operator actions)
- Eval pass-rate dashboard
- Cost tracking dashboard (cross-agent, cross-customer)
- Background job monitor (Inngest health)
- Schema migration runner UI
- Force re-run failed agent runs
- Ban/unban a source
- Replay / time-travel debugging
- Connector health dashboard (cross-customer; ties to Pathfinder Connector Framework Sprint)
- Agent Console (per-agent direct interface; SPEC at `Company Docs/Specs/SPEC - Agent Console (Metacron).md`)

### Vision-level (post-pilot)

- Conductor v1.0 daemon (multi-session, web UI)
- Conductor v2.0 productized (per-tenant policies)
- Self-modifying Architect (meta-tuning)
- Inter-customer learning (anonymized signals)
- Spec-compliance checker
- Plugin marketplace (third-party agents)
- Demo theater mode (canned playback)

### Issue #48 status

CLOSED 2026-05-02. Production self-healed post-PR-#47. The 14-route force-dynamic refactor remains a desirable cleanup but not a deploy blocker.

### Vercel deploy

A new `metacron` Vercel project may have been created today (2026-05-02) by Kyle via dashboard. Confirm via `mcp__d0db79fd-...__list_projects`. If exists: domain `metacron.unicron.systems`, root directory `unicron-platform`, framework Vite, build `npm run build`, output `dist`, install `npm ci`. If not: setup runbook in `MEMORY/operator-todos/2026-05-02-c2a-teams-operator-setup.md` or sister chat coordination.

## 5. Kanban

Metacron Features Kanban: https://app.notion.com/p/futuroso/Metacron-Features-KanBan-ef3f9250b6424fb6888e19352d2eb53f

Data source for programmatic updates: `collection://07970e18-984a-4034-b491-cde76b9b1bad`

Column semantics (per `feedback_kanban_column_rules.md`):
- Not Yet Started — backlog
- In Process — actively being built right now
- Review — done but PR not yet merged
- Deployed — merged + deployed but not human-verified
- Bug Fixes — explicit fix needed but not in flight
- Verified — HUMAN-ONLY (only Kyle moves to this column)

Pathfinder Kanban (sibling, do NOT modify cards there): https://app.notion.com/p/futuroso/Pathfinder-Features-Kanban-354785c67e7280109d83d06461430f9f

## 6. Specs and reference docs (under `Company Docs/`)

**Plans** (`Company Docs/Plans/`):
- `00 - TUESDAY DEMO PLAN.md` — Pathfinder Zedcor demo runbook (read for context only)
- `PLAN.md` — older 5-pattern implementation plan (historical)
- `PLAN - Cleanup Sweep (post-sprint).md` — queued cleanup operation

**PRDs** (`Company Docs/PRD/`):
- `PRD - Pathfinder Form-Fit for Zedcor.md`

**Specs** (`Company Docs/Specs/`):
- `SPEC - Cross-Pollination Engine.md`
- `SPEC - Zedcor Data Ingestion.md`
- `SPEC - Demo Polish & Geography Filters.md`
- `SPEC - Connectors (Slack, Teams, HubSpot).md` — shared infrastructure; Metacron has the operator-side health dashboard for it
- `SPEC - Agent Console (Metacron).md` — your primary upcoming work
- `build-specs.md` — older product spec material

**Prompts** (`Company Docs/Prompts/`):
- Sprint launch prompts for Claude Code

**Reports** (`Company Docs/Reports/`):
- `REPORT.md` — 5-pattern build report

**Context** (`Company Docs/Context/`):
- `00 - METACRON CONTEXT.md` — this doc
- `00 - PATHFINDER CHAT CONTEXT.md` — sister chat's context
- `HANDOFF-BRIEF.md` — older context handoff primer

**Vision** (`Company Docs/Vision/`):
- `manifesto.md`
- `karpathy-skill-issue-summary.md`

**Misc Docs** (`Company Docs/Misc Docs/`):
- `BLOCKERS.md`, `STREAM-README.md` — older operational artifacts

**Brand assets** (`Brand/`): Images, Source PSDs, Manifesto Pages, Presentation decks.

**Customer data** (`Customers/Zedcor/`): Excel files (branch list + customer sites).

**Project memory** (`MEMORY/`):
- `MEMORY/audit-unicron-platform.md` — Stream C audit, your primary technical reference
- `MEMORY/audit-pathfinder.md` — sibling app audit
- `MEMORY/progress.md`, `decisions.md`, `conventions.md`, `learnings.md`
- `MEMORY/spec-references.md` — spec → implementation mapping
- `MEMORY/operator-todos/` — pending operator actions
- `MEMORY/zedcor-sprint-live-status.md`, `MEMORY/connector-sprint-live-status.md` — sprint state (read-only context)

## 7. Memory access

The Cowork memory system is shared across chats in the same Cowork space. Both the Pathfinder chat and the Metacron chat see the same auto-loaded memory directory.

Cowork-managed memory (auto-loaded):
`/Users/keka/Library/Application Support/Claude/local-agent-mode-sessions/.../spaces/b307c0fa-.../memory/`

Workspace MEMORY (project-level, shared via filesystem):
`/Users/keka/Dropbox/Projects/Unicron Systems/MEMORY/`

The Metacron chat has read+write access to both.

Active feedback rules (in Cowork memory):
- `feedback_no_time_estimates.md`
- `feedback_bake_into_prompts.md`
- `feedback_multi_vercel_per_repo.md`
- `feedback_kanban_column_rules.md`
- `feedback_prompts_no_estimates_or_caps.md`
- `feedback_kanban_auto_update.md`
- `feedback_token_rigor.md`
- `feedback_no_deletes.md`

Project memories: `project_zedcor_demo_sprint.md`, `project_unicron_relay_automation.md`.

## 8. Cross-chat coordination protocol

1. Don't write to the other chat's territory. Pathfinder writes to `Pathfinder/`, modifies `pathfinder.*` schema, modifies the Pathfinder Vercel project. Metacron writes to `unicron-platform/`, modifies `unicron.*` schema, modifies the Metacron Vercel project.
2. Cross-chat dependencies surface as MEMORY operator-todos. Metacron writes to `MEMORY/operator-todos/2026-05-XX-pathfinder-needs-X.md`; Pathfinder picks up.
3. Shared MEMORY files use named subheadings (e.g., `## Stream M (Metacron) — 2026-05-02`).
4. Both chats follow the same kanban hygiene (`feedback_kanban_auto_update.md`).
5. Both chats follow the same prompt rules (`feedback_prompts_no_estimates_or_caps.md`).
6. Both chats follow `feedback_no_deletes.md`.
7. Production-data risk halts apply to both.

## 9. First-priority candidates for the Metacron chat

Based on the current kanban + recent sprint outputs:

1. **Agent Console (Metacron)** — see `Company Docs/Specs/SPEC - Agent Console (Metacron).md`. Direct per-agent UI. Highest demo value alongside Pathfinder.
2. **Coverage Expansion UI** — Stream E backend exists; UI is the gap. Pairs with the pre-Tuesday Coverage Expansion run for Pittsburgh/Nashville/LA.
3. **Tier 2 ticket resolution UI** — for Source Onboarder escalations.
4. **Two-visualizers cleanup verification** (Bug Fixes) — quick win.
5. **Customer list view + per-customer health dashboard** — required before Pathfinder onboards customer #2.
6. **Connector health dashboard** — pairs with the Pathfinder Connector Framework Sprint.
7. **Eval pass-rate dashboard** — quality story.

The new chat triages priorities based on Kyle's call.

## 10. What this chat should NOT do

- Build features for Pathfinder (`Pathfinder/` directory)
- Modify the Pathfinder Kanban
- Apply Pathfinder schema migrations
- Touch active sprints in the Pathfinder chat
- Productize Conductor v1.0+ (post-pilot timing)
- Delete files, run git clean, or wipe uncommitted work

If a task drifts toward any of these, surface as a coordination request via `MEMORY/operator-todos/`.
