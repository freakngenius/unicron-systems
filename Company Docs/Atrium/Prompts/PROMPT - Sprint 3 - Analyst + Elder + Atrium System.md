# PROMPT — Sprint 3: Analyst + Elder + Atrium System Tab

Dispatched by the Master Conductor. Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

This sprint accomplishes:
1. Implement persistent **Analyst** agent (nightly cron: decay tick, daily digest, weekly memory consolidation, weekly retro, monthly continuity audit, quarterly taboo review, weekly **wiki lint** per Addendum 2 section 2.6, nightly **`_master-index.md` regeneration** per Addendum 2 section 2.4)
2. Implement persistent **Elder** agent (continuity advisory MCP RPC, time-horizon checkpoint integration with verify gate)
3. Implement **Taboo Keeper** as a runtime agent (already a function from Sprint 1; promote to a registered agent with audit trail)
4. Wire verify gate to consult Elder on irreversible cards
5. Build Atrium **System tab** content: agents galaxy, taboos viewer, refusal log, services health
6. Enable autonomous Claude Code dispatch from the Orchestrator (deferred from Sprint 2)
7. **Register Internal Org / Memory skills** in `nervous_system.skills` and write SKILL.md files in `unicron-platform/.claude/skills/`. Activate skills surface buttons in Atrium Home for: `run-decay-tick`, `daily-digest`, `weekly-retro`, `vault-search`, `propose-taboo-edit`, `regenerate-master-index`, `vault-lint`, `promote-insight-to-memory`, `onboard-team-member`

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint3-analyst`): Analyst agent + all scheduled jobs + master-index regeneration + wiki lint (Tasks 1, 8 partial)
- **Stream B** (worktree `unicron-platform-worktrees/sprint3-elder-taboo`): Elder agent + Taboo Keeper promotion + verify gate integration (Tasks 2, 3, 4)
- **Stream C** (worktree `unicron-platform-worktrees/sprint3-orchestrator-autonomy`): autonomous Claude Code dispatch from Orchestrator (Task 5)
- **Stream D** (worktree `unicron-platform-worktrees/sprint3-system-tab`): Atrium System tab UI (Task 6, with Refero references)
- **Stream E** (worktree `unicron-platform-worktrees/sprint3-skills-registry`): register Internal Org / Memory skills + write SKILL.md files + activate buttons (Task 7-new)

Streams are largely independent. Integration after all complete.

---

## Pre-conditions

- Sprint 2 verified
- Slack Orchestrator operational
- Atrium Home tab live
- Persistent agent runtime callable
- All Sprint 1 ingest infrastructure healthy

---

## Kanban hygiene — start

Card "Sprint 3 — Analyst + Elder + Atrium System Tab" → In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "Analyst nightly cron runs and produces digest. Elder responds to advisory queries. Atrium System tab renders agents, taboos, refusal log, services. Verify gate consults Elder for irreversible work."

---

## Tasks

### Task 1 — Analyst agent

Path: `unicron-platform/lib/agents/analyst.ts` + Inngest function `analyst-run`

**Nightly cron** (Vercel cron `0 9 * * *` = 02:00 PT, midnight UTC depending on tz):
1. **Decay tick**: query `nervous_system.signals` and `nervous_system.ledger` rows; for each row, decrement `strength` by formula `strength * (1 - 1/ttl_days)`; rows with `strength < 0.1` flip `status` to `archived` (do not delete)
2. **Daily digest**: aggregate yesterday's events (calls ingested, action items created, PRs merged, taboo bounces, decay archived counts); write narrative summary to `vault/Memory/analyst/YYYY-MM-DD.md`; post short version to `#orchestrator-feed`
3. **Drift flag scan**: action items past due, action items orphaned (no DRI), agents over budget, services degraded; post to `#orchestrator-escalations`

**Weekly cron** (Sunday 22:00 PT):
- Memory consolidation: run `productivity:memory-management` consolidation skill across `vault/Memory/`; PR proposed updates to vault
- Weekly retro: aggregate week's events, sprint outcomes, taboo overrides, top insights; write to `vault/Retros/YYYY-WW.md`; post summary to `#orchestrator-feed`

**Monthly cron** (1st of month):
- Continuity audit: re-read `Memory/elder/continuity.md`, flag commitments approaching `active_until`, propose updates

**Quarterly cron** (Jan/Apr/Jul/Oct 1st):
- Taboo review: surface taboo overrides from prior 90 days; propose edits to `Memory/taboos.md` via PR

Memory: `vault/Memory/analyst/YYYY-MM-DD.md` daily logs + `vault/Memory/analyst/index.md` long-term index.

### Task 2 — Elder agent

Path: `unicron-platform/lib/agents/elder.ts` + Inngest function `elder-advise`

**Triggers:**
- MCP RPC `elder.advise(decision_type, scope, summary)` — synchronous, returns advisory
- Inline call from Orchestrator before dispatching irreversible work
- Inline call from verify gate when card priority = `irreversible`

**Logic:**
1. Read full `Memory/elder/continuity.md` (cached, refresh on file mtime change)
2. Read `Memory/seven_generations.md`
3. Send decision context + continuity content to Anthropic with prompt: identify relevant prior commitments; classify advisory as `compatible | conflict | requires_explicit_override`
4. Return `{ flag, relevant_commitments: [...], notes: string }`

**On `requires_explicit_override`:**
- Post to `#orchestrator-escalations` with the decision and conflicting commitments
- Block the action until human override (Kyle, Keenan, or Curtis acknowledges in Slack thread)
- Override action writes a new continuity log entry referencing the prior commitment as `Supersedes`

Memory: `vault/Memory/elder/continuity.md` (append-only) + `vault/Memory/elder/seven_generations.md` (versioned).

### Task 3 — Promote Taboo Keeper to registered agent

Sprint 1 implemented Taboo Keeper as a function. Now wrap it as a runtime agent:
- Register in `nervous_system.agents` with archetype=`taboo_keeper`
- Audit log every call (action validated, verdict, latency)
- Atrium System tab surfaces its hit count, bounce rate, override frequency

### Task 4 — Wire verify gate to Elder

Update verify gate logic (lives in kanban writer or a separate verify module):
- When a kanban card moves toward `Deployed`, check `priority`
- If `irreversible`, call Elder `elder.advise` synchronously
- If Elder returns `requires_explicit_override`, block promotion; post to escalations
- Card promotion proceeds only after override is acknowledged

### Task 5 — Enable autonomous Claude Code dispatch

Sprint 2 had Orchestrator generate paste-ready prompts that Kyle relayed. Now:
- Add a `dispatchClaudeCode(prompt, sprint_id)` function that sends the prompt to a Claude Code endpoint or workspace via API
- The Orchestrator decides whether to relay-to-human or dispatch-directly based on:
  - Directive matches a registered safe pattern (e.g., "create an action item", "search memory", "reassign DRI") → autonomous
  - Directive involves production code or schema changes → relay-to-human as paste-ready prompt
  - Always passes through Taboo Keeper first
- Audit log every autonomous dispatch with the full prompt and decision rationale

### Task 6 — Atrium System tab

Path: `unicron-platform/src/atrium/System.tsx` and sub-components

**6.1 Agents galaxy view** (`AgentsGalaxy.tsx`)
- Visual representation of every agent (D3 force-directed graph or simpler grid)
- Per agent: name, archetype, last run, cost, budget remaining, active status
- Click for detail panel: config, watches list, recent runs (last 10), recent outputs
- Edit affordances: toggle active, adjust budget, change watches list — all routes through `/api/atrium/agents/:id` server endpoint with Taboo Keeper validation

**6.2 Taboos viewer** (`TaboosViewer.tsx`)
- Read-render `Memory/taboos.md` with markdown formatting
- "Propose edit" button opens a vault PR via GitHub API; reviewer is the other peer-tier member; merge triggers Taboo Keeper reload
- "Recent overrides" sub-section: list every Taboo bounce that was overridden (audit log query)

**6.3 Refusal log** (`RefusalLog.tsx`)
- Table of every Taboo Keeper bounce: timestamp, action, matched taboo, reason, override status, decider
- Filters: date range, taboo, decider, action_type
- Export to CSV for quarterly review

**6.4 Services health** (`ServicesHealth.tsx`)
- Auto-detected status of every connected service (Supabase, Vercel, OpenAI, Anthropic, Slack, Notion, GitHub, Plaud, Fathom, Google Calendar, etc.)
- Per service: status (green/yellow/red), last successful call, error rate (last 24h), latency p95
- Re-auth flow surfaces inline when degraded due to expired tokens

### Task 7 — Server endpoints for System tab edits

Path: `unicron-platform/api/atrium/`

Build:
- `PATCH /api/atrium/agents/:id/config` — update agent config; Taboo Keeper validates
- `PATCH /api/atrium/agents/:id/budget` — update budget; Taboo Keeper validates
- `PATCH /api/atrium/agents/:id/active` — toggle active; Taboo Keeper validates
- `POST /api/atrium/taboos/propose-edit` — opens vault PR with proposed taboos.md content
- `POST /api/atrium/taboos/override/:bounce_id` — override a bounce with reason; writes continuity log entry

All endpoints:
- Require authenticated user with email in allowlist
- Run Taboo Keeper before persisting
- Write audit_log row with actor, before-state, after-state
- Return 403 with reason if Taboo bounces

### Task 8 — Multi-Vercel verification

- Both projects deploy healthy
- Trigger Analyst nightly cron manually; verify digest written to vault and posted to `#orchestrator-feed`
- Call Elder `elder.advise` with a test decision; verify response shape
- Atrium System tab loads all four sub-views with real data
- Edit smoke test: change an agent's budget via System tab; verify Taboo Keeper validation, audit log row, value persisted
- Verify gate smoke test: create an action_item with priority=irreversible; manually move toward Deployed; verify Elder is consulted and blocks if conflict found

### Task 9 — Continuity log

Append entry. Note: Analyst and Elder are now operational; the system can self-improve.

---

## Hard halt conditions

- Analyst nightly cron cannot run (Inngest scheduling failure)
- Elder cannot read continuity log
- Verify gate integration breaks existing kanban writer
- System tab cannot load agents from `nervous_system.agents`
- Edit endpoints fail Taboo Keeper integration
- Either Vercel project fails to build

---

## Auto-merge criteria

- Analyst, Elder, Taboo Keeper all registered in `agents` table with audit trail
- Analyst nightly cron tested manually; produces digest
- Elder advisory MCP RPC callable; returns correct shape for `compatible`, `conflict`, `requires_explicit_override`
- Verify gate calls Elder for irreversible cards
- Autonomous Claude Code dispatch tested for a safe pattern (e.g., create action_item)
- All four System tab sub-views render with real data
- All four edit endpoints route through Taboo Keeper and audit log
- Both Vercel deployments healthy
- PR description has verbatim evidence

---

## Auto-revert triggers

- Analyst nightly cron causes Supabase load spike (>2x baseline)
- Elder advisory blocks all kanban progression (false-positive conflicts)
- Edit endpoints introduce auth bypass

---

## Done criteria

1. Analyst registered, scheduled jobs configured, decay tick + digest verified
2. Elder registered, advisory RPC callable, integrated with verify gate
3. Taboo Keeper registered as agent with audit trail
4. Verify gate consults Elder on irreversible cards
5. Orchestrator can autonomously dispatch for safe patterns
6. Atrium System tab fully functional (agents, taboos, refusal log, services)
7. Edit endpoints all Taboo-Keeper-gated and audit-logged
8. Both Vercel projects healthy
9. Continuity log appended

---

## Out of scope

- Atrium Now full polish (Sprint 4)
- Atrium Work tab (Sprint 4)
- Voice memo, Apple Notes, mobile capture (Sprint 4)
- Email ingest (Sprint 5)
- Wiki content (Sprint 6)
- PWA (Sprint 7)

Begin.
