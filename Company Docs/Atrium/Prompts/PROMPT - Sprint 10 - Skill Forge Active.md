# PROMPT - Sprint 10: Skill Forge Active

Dispatched by the Master Conductor (Sprints 9-12). Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md` (full), `Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

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

**Migration safety rule.** Before any SQL referencing an existing `nervous_system` table, run the `information_schema.columns` query first and write the migration against verified live column names.

---

## This sprint accomplishes

1. Skill Forge observation loop live: pull candidate trajectories from the ledger every 6 hours, filter for novelty, distill, self-score, Taboo pre-check, write to `nervous_system.proposed_skills`.
2. The distillation prompt template at `vault/Memory/skills/skill_forge/distill.md`.
3. The Addendum 4 satisfaction validator wired as the pre-queue gate; Taboo Keeper dry-run as the pre-queue secondary gate.
4. The Atrium Library "Proposals" sub-tab: queue cards with trajectory summary, evidence pointers, satisfaction score, Taboo flags, and approve, request-changes, reject actions.
5. The approve flow: Taboo Keeper hard-check, then insert into `nervous_system.skills` with `lifecycle_status = 'approved'` and `author_kind = 'skill_forge'`, then Slack notify.
6. The refinement loop: underperforming approved Skills trigger a new-version proposal with `parent_skill_id` set.
7. Skill Forge telemetry and the `#skill-forge-proposals` and `#alerts-skill-forge` Slack channels.
8. The Sprint 10 scenario set at `vault/wiki/scenarios/skill-forge/` (S6.1 through S6.6).

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint10-skill-forge-loop`): the observation cron, novelty filter, distillation, self-score, Taboo pre-check, write to `proposed_skills` (Addendum 6 sections 3, 5, 6).
- **Stream B** (worktree `unicron-platform-worktrees/sprint10-proposals-ui`): the Atrium Library "Proposals" sub-tab and the approve, request-changes, reject flow (Addendum 6 section 8).
- **Stream C** (worktree `unicron-platform-worktrees/sprint10-refinement-loop`): the refinement loop and version lineage (Addendum 6 section 4).
- **Stream D** (worktree `unicron-knowledge-worktrees/sprint10-distill-prompt-scenarios`): the `distill.md` prompt template and the `vault/wiki/scenarios/skill-forge/` scenario set. Content-only commits.

---

## Pre-conditions

- Sprint 9 is Deployed or Verified: `nervous_system.skills` extended, `proposed_skills` and `skill_invocations` live, Skills API and hybrid search functional, Skill Forge registered as an inert stub.
- The Slack channels `#skill-forge-proposals` and `#alerts-skill-forge` exist. If not, this is a Kyle manual step; flag it in the pre-flight and proceed with code complete, smoke test blocked.
- Both Vercel projects are green.

---

## Kanban hygiene - start

Locate or create the card "Sprint 10 - Skill Forge Active" on the Internal Org Kanban. Move it from Backlog to In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "Skill Forge observation loop produces proposals from real ledger trajectories. Proposals land only in proposed_skills, never in skills directly. Library Proposals sub-tab functional. Approve flow promotes via Taboo Keeper. Refinement loop produces parent-linked versions. Scenarios S6.1 through S6.6 passing. Both Vercel projects healthy." Create child cards per stream and move them to In Process before any code is written.

---

## Tasks

### Task 1 - Observation loop (Stream A)

- Implement the Skill Forge observation Inngest cron at the 6-hour cadence per Addendum 6 section 3: candidate pull, novelty filter (0.85 cosine), distillation, self-score against the Addendum 4 satisfaction validator, Taboo Keeper dry-run, write to `nervous_system.proposed_skills`.
- Enforce the resource caps from Addendum 6 section 5: 20 proposals per cycle, $5 per day budget, no retry on hard refusal.
- Wire the telemetry events from Addendum 6 section 6 to `#alerts-skill-forge` and `nervous_system.audit_log`.
- Post each new proposal as a card to `#skill-forge-proposals`.

### Task 2 - Proposals sub-tab (Stream B)

- Build the Atrium Library "Proposals" sub-tab per Addendum 6 section 8: queue cards showing trajectory summary, evidence pointers, satisfaction score, confidence flag, Taboo soft flags, and the diff against any existing Skill when `parent_skill_id` is set.
- Implement the approve flow: Taboo Keeper hard-check, then insert into `nervous_system.skills` with `lifecycle_status = 'approved'`, `author_kind = 'skill_forge'`, `approved_by`, `approved_at`, `taboo_check_id`. Notify `#skill-forge-proposals`.
- Implement request-changes and reject with reason.

### Task 3 - Refinement loop (Stream C)

- Implement the refinement loop per Addendum 6 section 4: detect approved Skills with `success_count / run_count < 0.7` over the last 10 invocations and `run_count >= 10`, distill a refinement as a new version with `parent_skill_id` set, queue it.
- On approval of a refinement, move the old Skill to `lifecycle_status = 'retired'` and the new version takes the `name` at `version + 1`.

### Task 4 - Distillation prompt and scenarios (Stream D)

- Author `vault/Memory/skills/skill_forge/distill.md`, the distillation prompt template.
- Author `vault/wiki/scenarios/skill-forge/_index.md` plus one file per scenario S6.1 through S6.6 in the Addendum 4 format.

### Task 5 - Integration and multi-Vercel verification

- Run the Addendum 4 satisfaction validator over S6.1 through S6.6; each must clear 0.85.
- Confirm Skill Forge produces at least 3 proposals from real ledger trajectories within 48 hours of activation, and that at least 1 is approved end to end and is invocable from the Library tab.
- Confirm Skill Forge cannot write to `nervous_system.skills` directly (the Addendum 5 write trigger holds).
- Both Vercel projects build and are healthy. Verify each independently.

### Task 6 - Continuity log entry

Append a Sprint 10 closeout entry to `vault/Memory/elder/continuity.md`.

---

## Hard halt conditions

- Skill Forge writes ever land in `nervous_system.skills` without a `taboo_check_id`.
- Taboo Keeper hard-refuses 5 or more proposals in 24 hours (per Addendum 6 telemetry).
- The proposal queue grows past 50 unreviewed.
- The refinement loop mutates an approved Skill in place rather than creating a new version.
- Either Vercel project fails to build.

---

## Auto-merge criteria

- Observation loop runs on cadence and writes to `proposed_skills` only.
- Proposals sub-tab renders queue cards with all required fields; approve, request-changes, reject all functional.
- Approve flow promotes via Taboo Keeper hard-check; promoted Skills are invocable.
- Refinement loop produces parent-linked new versions; never mutates in place.
- Telemetry events fire to the correct Slack channels and to `audit_log`.
- Scenarios S6.1 through S6.6 authored and clearing 0.85.
- Both Vercel projects healthy.
- PR description carries verbatim evidence.

## Auto-revert triggers

- Any Skill Forge write path to `nervous_system.skills` that bypasses the proposal queue.
- An approved Skill mutated in place by the refinement loop.
- The approve flow inserts a Skill without a `taboo_check_id`.

## Done criteria

1. Skill Forge observation loop live and producing proposals.
2. Proposals sub-tab functional; approve flow promotes via Taboo Keeper.
3. Refinement loop produces parent-linked versions.
4. Telemetry wired.
5. Scenarios S6.1 through S6.6 passing.
6. At least 1 proposal approved end to end and invocable.
7. Both Vercel projects healthy.
8. Continuity log appended.

## Kanban hygiene - end

Move each child stream card to Deployed, Review, or Bug Fixes per outcome, with the "Implemented at <commit-sha> · merged at <ISO-timestamp>" stamp. Move the parent "Sprint 10 - Skill Forge Active" card to Deployed, Review, or Bug Fixes per the actual outcome, with child outcomes listed in the card body. Never move any card to Verified; that column is human-only.

## Out of scope

- `execute_skill` (Sprint 11).
- Pathfinder agent chain migration (Sprint 11).
- Metacron per-tenant Skill Library (Sprint 11).
- Atrium Companion (Sprint 12).
- Sentry wiring for Skill Forge errors (Sprint 12).

Begin.
