# PROMPT - Sprint 12: Atrium Companion + Observability + Production-Hardening

Dispatched by the Master Conductor (Sprints 9-12). Self-contained. Final sprint of the Procedural Memory & Skill Forge PRD.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 8 (Atrium Companion).md` (full), `Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 7 (Programmatic Tool Calling).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md`, `Company Docs/Context/ENGINEER BRIEF - Atrium Metacron Pathfinder.md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

**Parent PRD:** `Company Docs/PRD/PRD - Procedural Memory & Skill Forge.md`

---

## HARD CONSTRAINTS - read before any tool call

These constraints apply to this session. Read this section completely before executing any tool call, creating any worktree, or touching any branch.

**No destructive git operations.**
Never run `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, or any command that destroys uncommitted state in any worktree.

**Worktree pre-flight - mandatory before any branch switch, reset, or checkout:**
Before touching any worktree you did not create in this session, run `git status` first. If any modified or untracked files exist, stop and stash them (`git stash --include-untracked`) before proceeding. Never destroy uncommitted work. Safe alternatives: `git stash --include-untracked` then proceed; or `git fetch origin && git merge --ff-only origin/<branch>`; or work in a different worktree entirely.

**Refusal layer is primary.** Every system-modifying action passes through Taboo Keeper validation before execution.

**Verified column is human-only.** Never auto-promote a kanban card to Verified. Only Kyle, Keenan, or Curtis.

**Multi-Vercel verification.** Pathfinder and unicron-platform are separate Vercel projects. Verify each independently after every deployment.

**No time estimates or numeric cost caps.** Never write "~3 hours" or "$40 cap" in prompts or PR descriptions.

**Migration safety rule.** Before any SQL referencing an existing `nervous_system` table, run the `information_schema.columns` query first and write against verified live column names.

---

## This sprint accomplishes

1. Atrium Companion v1 for the three founders: Telegram, Signal, and SMS to the existing ingest pipeline per Addendum 8.
2. The `nervous_system.founder_captures` table, founder identity mapping, and the Now tab Quick Capture surface showing captures with a channel pill.
3. Observability across the procedural-memory layer, Skill Forge, and `execute_skill`: Sentry wiring and Slack alerts per Addenda 6, 7, 8 failure-mode sections.
4. Per-tenant dashboards on Metacron: Skills approved, Skills invoked, refusal hits, cost per Skill.
5. The decay sweep cron confirmed live with its first audit report.
6. The Sprint 12 scenario set at `vault/wiki/scenarios/atrium-companion/` (S8.1 through S8.5).
7. The end-to-end closed-loop demo recorded and the PRD success metrics measured and reported.

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint12-companion-gateway`): the Companion gateway, the three channel integrations, the voice memo path, the `founder_captures` table, founder identity mapping (Addendum 8 sections 2 through 5).
- **Stream B** (worktree `unicron-platform-worktrees/sprint12-now-quick-capture`): the Now tab Quick Capture surface update to show captures with a channel pill.
- **Stream C** (worktree `unicron-platform-worktrees/sprint12-observability`): Sentry wiring and Slack alerts for Skill Forge errors, `execute_skill` failures, Companion gateway errors, and Taboo Keeper refusal volume (not content).
- **Stream D** (worktree `unicron-platform-worktrees/sprint12-metacron-dashboards`): the Metacron per-tenant procedural-memory dashboards.
- **Stream E** (worktree `unicron-knowledge-worktrees/sprint12-scenarios`): the `vault/wiki/scenarios/atrium-companion/` scenario set. Content-only commits.

---

## Pre-conditions

- Sprints 9, 10, and 11 are Deployed or Verified: procedural layer, Skill Forge, and `execute_skill` all live.
- The Sprint 4 voice memo and Deepgram transcript path is live; Companion reuses it.
- Telegram Bot API, Signal-CLI, and Twilio SMS accounts exist. The Slack channel `#alerts-companion` exists, or it is a flagged Kyle manual step.
- Both Vercel projects are green.

---

## Kanban hygiene - start

Locate or create the card "Sprint 12 - Atrium Companion + Observability" on the Internal Org Kanban. Move it from Backlog to In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "Companion gateway live for the three founders across Telegram, Signal, SMS. founder_captures table scoped to founder_id, never customer_id. Now tab Quick Capture shows channel pills. Sentry capturing Skill Forge, execute_skill, and Companion errors. Metacron per-tenant procedural dashboards live. Decay sweep ran with an audit report. Scenarios S8.1 through S8.5 passing. End-to-end closed-loop demo recorded. PRD success metrics measured. Both Vercel projects healthy." Create child cards per stream and move them to In Process before any code is written.

---

## Tasks

### Task 1 - Companion gateway (Stream A)

- Stand up the Companion gateway as a Vercel function, or a small Fly app if Vercel cold-start hurts on Telegram webhooks per Addendum 8 section 2.
- Integrate the Telegram bot, Signal-CLI, and Twilio SMS webhook.
- Implement the voice memo path: Deepgram transcript (the existing Sprint 4 path), then Haiku classifier, then ingest write per Addendum 8 section 5.
- Create the `nervous_system.founder_captures` table per Addendum 8 section 3. Query `information_schema` for the live `nervous_system.team_members` shape before writing the foreign key.
- Seed the founder identity mapping for Kyle, Keenan, and Curtis. Use the static signed token per founder (Addendum 8 section 4).
- Companion writes are scoped to `founder_id`, never `customer_id`. This is a hard invariant.

### Task 2 - Now tab Quick Capture (Stream B)

- Update the Now tab Quick Capture surface to show captures with a channel pill ("via Telegram", "via Signal", "via SMS").

### Task 3 - Observability (Stream C)

- Wire Sentry: Skill Forge errors, `execute_skill` failures, Companion gateway errors, Taboo Keeper refusals (volume only, never content).
- Wire the Slack alerts from the Addenda 6, 7, 8 failure-mode sections to their channels.

### Task 4 - Metacron per-tenant dashboards (Stream D)

- Build the Metacron per-tenant procedural-memory dashboards: Skills approved, Skills invoked, refusal hits, cost per Skill.

### Task 5 - Decay sweep confirmation

- Confirm the `skills_decay_sweep` cron from Sprint 9 is live. Trigger or observe its first sweep and confirm it emits an audit report to `nervous_system.audit_log` and a one-line summary to `#orchestrator-feed`.

### Task 6 - Scenarios (Stream E)

- Author `vault/wiki/scenarios/atrium-companion/_index.md` plus one file per scenario S8.1 through S8.5 in the Addendum 4 format.

### Task 7 - Integration, demo, metrics, multi-Vercel verification

- Run the Addendum 4 satisfaction validator over S8.1 through S8.5; each must clear 0.85.
- Record the end-to-end closed-loop demo: a founder voice-memos a Zedcor todo into Telegram, it lands on the next-morning Now tab, it triggers a Skill suggestion, the Skill executes via `execute_skill`, the result returns to the ledger. Store the recording reference in the sprint card body.
- Measure and report the PRD success metrics: Skills authored by Skill Forge per week, Orchestrator pipelines using `execute_skill`, Pathfinder p50 latency and per-lead cost, Library tab non-human-authored share, Companion captures per week, refusal-layer override rate. Write the measured values into the closeout report.
- Both Vercel projects build and are healthy. Verify each independently.

### Task 8 - Continuity log entry and PRD closeout

- Append a Sprint 12 closeout entry to `vault/Memory/elder/continuity.md`.
- Note in the closeout that the substrate is ready for Addenda 9 through 11 (Goal-Pursuit Loop, Architect Self-Improvement, Customer Voice Model) to be scoped against real Skill Forge output.

---

## Hard halt conditions

- Sentry is not capturing Skill Forge errors.
- The Companion drops captures silently (no webhook retry recovery).
- A founder capture lands with a `customer_id` set.
- The decay sweep retires a Skill that has been run inside its decay window.
- Either Vercel project fails to build.

---

## Auto-merge criteria

- Companion gateway live across all three channels; voice memo path produces transcript plus structured intent.
- `founder_captures` rows are scoped to `founder_id`, never `customer_id`; cross-founder reads are blocked by RLS.
- Now tab Quick Capture shows channel pills.
- Sentry captures Skill Forge, `execute_skill`, and Companion errors; Slack alerts fire to the correct channels.
- Metacron per-tenant procedural dashboards render with real data.
- The decay sweep ran and emitted an audit report.
- Scenarios S8.1 through S8.5 clearing 0.85.
- The end-to-end demo is recorded; PRD success metrics are measured and written into the closeout.
- Both Vercel projects healthy.
- PR descriptions carry verbatim evidence.

## Auto-revert triggers

- A founder capture is written with a `customer_id`.
- The Companion gateway acknowledges a webhook with a 2xx but does not persist the capture (silent drop).
- The decay sweep retires a recently-run Skill.

## Done criteria

1. Atrium Companion v1 live for the three founders.
2. `founder_captures` table scoped correctly; Now tab Quick Capture shows channel pills.
3. Observability wired across the procedural layer, Skill Forge, and `execute_skill`.
4. Metacron per-tenant procedural dashboards live.
5. Decay sweep confirmed live with an audit report.
6. Scenarios S8.1 through S8.5 passing.
7. End-to-end closed-loop demo recorded; PRD success metrics measured and reported.
8. Both Vercel projects healthy.
9. Continuity log appended; PRD closeout note written.

## Kanban hygiene - end

Move each child stream card to Deployed, Review, or Bug Fixes per outcome, with the "Implemented at <commit-sha> · merged at <ISO-timestamp>" stamp. Move the parent "Sprint 12 - Atrium Companion + Observability" card to Deployed, Review, or Bug Fixes per the actual outcome, with child outcomes listed in the card body. Never move any card to Verified; that column is human-only. After this sprint the Master Conductor generates the PRD completion report.

## Out of scope

- Addendum 9 (Goal-Pursuit Loop), Addendum 10 (Architect Self-Improvement), Addendum 11 (Customer Voice Model). These are scoped after this sprint ships, against real Skill Forge output.
- Customer-facing Companion access. Internal-only, three founders.
- Bidirectional chat with Atrium agents from the Companion channels.
- The full production-hardening gap from the Engineer Brief beyond observability. This sprint closes the observability slice; the rest stays with the engineer.

Begin.
