# PROMPT - Sprint 9: Procedural Memory Substrate

Dispatched by the Master Conductor (Sprints 9-12). Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md` (registration plus stub only), `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

**Parent PRD:** `Company Docs/PRD/PRD - Procedural Memory & Skill Forge.md`

---

## HARD CONSTRAINTS - read before any tool call

These constraints apply to this session. Read this section completely before executing any tool call, creating any worktree, or touching any branch.

**No destructive git operations.**
Never run `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, or any command that destroys uncommitted state in any worktree.

**Worktree pre-flight - mandatory before any branch switch, reset, or checkout:**
Before touching any worktree you did not create in this session, run `git status` first. If any modified or untracked files exist, stop and stash them (`git stash --include-untracked`) before proceeding. Never destroy uncommitted work. Safe alternatives to bring a branch current: `git stash --include-untracked` then proceed; or `git fetch origin && git merge --ff-only origin/<branch>` (refuses rather than destroys); or work in a different worktree entirely.

**Refusal layer is primary.** Every system-modifying action passes through Taboo Keeper validation before execution.

**Verified column is human-only.** Never auto-promote a kanban card to Verified. Only Kyle, Keenan, or Curtis.

**Multi-Vercel verification.** Pathfinder and unicron-platform are separate Vercel projects. Verify each independently after every deployment.

**No time estimates or numeric cost caps.** Never write "~3 hours" or "$40 cap" in prompts or PR descriptions.

**Migration safety rule.** Before any SQL that references an existing `nervous_system` table, run the `information_schema.columns` query first and write the migration against verified live column names. The Sprint 3 skills migration file and the live schema are known to have diverged.

---

## This sprint accomplishes

1. Extend the live `nervous_system.skills` table into a procedural-memory layer per Addendum 5: additive columns, two net-new companion tables (`proposed_skills`, `skill_invocations`), indexes, RLS, the `taboo_check_id` write trigger.
2. Implement the Skills API surface: list, fetch with version history, hybrid FTS plus vector search with reciprocal rank fusion, invoke (thin pass-through to the existing tool runner in this sprint).
3. Register the Skill Forge agent in `nervous_system.agents` as an inert stub. No observation loop in this sprint.
4. Seed or update three system Skills end to end: `run_zedcor_weekly_digest`, `onboard_county_records_source`, `draft_briefing_for_bd_rep`.
5. Build the Atrium Library tab Skills surface: list, detail, version history. Read-only. No author UI.
6. Wire the Library Skills surface into the existing Now tab skills-surface stub: contextual recommendations via search against current Now state.
7. Author the Sprint 9 scenario set at `vault/wiki/scenarios/procedural-memory/` (S5.1 through S5.6).

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint9-procedural-schema`): the migration, RLS, write trigger, decay cron registration (Addendum 5 sections 2, 3, 5, 6).
- **Stream B** (worktree `unicron-platform-worktrees/sprint9-skills-api`): the Skills API surface and hybrid search (Addendum 5 sections 4, 7).
- **Stream C** (worktree `unicron-platform-worktrees/sprint9-library-skills-ui`): the Atrium Library Skills surface and the Now tab wiring (read-only).
- **Stream D** (worktree `unicron-platform-worktrees/sprint9-skill-forge-stub`): register Skill Forge in `nervous_system.agents` as an inert stub; seed or update the three system Skills.
- **Stream E** (worktree `unicron-knowledge-worktrees/sprint9-scenarios`): author the `vault/wiki/scenarios/procedural-memory/` scenario set. Content-only commits.

---

## Pre-conditions

- Sprints 0 through 8 are Deployed or Verified.
- `nervous_system.skills` is live and seeded (roughly 40 skills from Sprints 3 through 6).
- Taboo Keeper API is live (Sprint 3).
- Addendum 4 scenario and satisfaction primitives are live: `vault/wiki/scenarios/` exists and the LLM judge function runs. Confirm both on day 1; if either is missing, halt and report.
- Both Vercel projects are green per `vercel inspect`.

---

## Kanban hygiene - start

Locate or create the card "Sprint 9 - Procedural Memory Substrate" on the Internal Org Kanban. Move it from Backlog to In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "nervous_system.skills extended in place with all roughly 40 prior skills intact. proposed_skills and skill_invocations created. Skills API and hybrid search live. Library tab Skills surface read-only functional. Skill Forge registered but inert. Scenarios S5.1 through S5.6 authored and passing satisfaction gate. Both Vercel projects healthy." Create child cards per stream and move them to In Process before any code is written.

---

## Tasks

### Task 1 - Migration (Stream A)

- Run the `information_schema.columns` query on `nervous_system.skills`. Record the verified column list in the PR description.
- Write `unicron-platform/supabase/migrations/<YYYYMMDD>_procedural_memory_layer.sql` per Addendum 5 section 2: additive nullable or defaulted columns on `skills`, the `proposed_skills` and `skill_invocations` tables, indexes, RLS, the `taboo_check_id` write trigger.
- If the `name` UNIQUE constraint conflicts with the composite `(customer_id, name, version)` constraint, replace it and document the before and after in the PR description with verbatim evidence.
- Register the `skills_decay_sweep` nightly Inngest cron alongside the existing Analyst `decayTick`.

### Task 2 - Skills API (Stream B)

- Implement `GET /api/skills`, `GET /api/skills/:id` (with version history via `parent_skill_id` walk), `POST /api/skills/search` (hybrid FTS plus vector plus reciprocal rank fusion per Addendum 5 section 7).
- Implement `GET /api/proposed-skills`, `POST /api/proposed-skills/:id/approve`, `POST /api/proposed-skills/:id/reject`.
- Implement `POST /api/skills/:id/invoke` as a thin pass-through to the existing tool runner. No `execute_skill` in this sprint; that is Sprint 11.

### Task 3 - Library Skills surface (Stream C)

- Build the Atrium Library tab Skills surface: list, detail panel, version history view. Read-only. No author UI in this sprint.
- Surface the new procedural columns (lifecycle_status, version, author_kind, decay_at, run_count, success_count, evidence pointers).
- Wire into the existing Now tab skills-surface stub: contextual recommendations via `POST /api/skills/search` against current Now state.

### Task 4 - Skill Forge stub plus seed Skills (Stream D)

- Register Skill Forge in `nervous_system.agents` per Addendum 6 section 2, with `on_call = false`. No observation loop.
- Seed or update the three system Skills from Addendum 5 section 8. If rows with those names already exist, update them in place to carry the new procedural columns. Do not insert duplicates.

### Task 5 - Scenarios (Stream E)

- Author `vault/wiki/scenarios/procedural-memory/_index.md` plus one file per scenario S5.1 through S5.6, in the Addendum 4 scenario file format.

### Task 6 - Integration and multi-Vercel verification

- Run the Addendum 4 satisfaction validator over S5.1 through S5.6. Each must clear the 0.85 threshold.
- Confirm all roughly 40 pre-existing skills are still readable and invocable with `lifecycle_status = 'approved'`.
- Both Vercel projects build and are healthy. Verify each independently.

### Task 7 - Continuity log entry

Append a Sprint 9 closeout entry to `vault/Memory/elder/continuity.md`.

---

## Hard halt conditions

- The migration fails on Supabase, or it would rename or drop a live column.
- Any pre-existing seeded skill becomes unreadable or uninvocable after the migration.
- Hybrid search returns empty for the seeded Skills.
- An RLS leak across tenants.
- Addendum 4 scenario or satisfaction primitives are missing (pre-condition failure).
- Either Vercel project fails to build.

---

## Auto-merge criteria

- Migration applies cleanly; verified column list in the PR description.
- All roughly 40 prior skills intact and invocable.
- Skills API endpoints return correctly; hybrid search returns the seeded Skills for semantic and exact queries.
- Library tab Skills surface renders list, detail, version history.
- Now tab surfaces at least one contextual Skill given current Now state.
- Skill Forge registered and visible in the Agents Galaxy, inert.
- Scenarios S5.1 through S5.6 authored and clearing the 0.85 satisfaction threshold.
- Both Vercel projects healthy.
- PR description carries verbatim evidence. No hypothesis-driven claims.

## Auto-revert triggers

- Any write to `nervous_system.skills` lands without a `taboo_check_id`.
- The decay sweep retires a Skill that has been run inside its decay window.
- A pre-existing skill row is mutated destructively.

## Done criteria

1. `nervous_system.skills` extended in place; companion tables created; RLS and write trigger live.
2. Skills API and hybrid search functional.
3. Library tab Skills surface read-only functional; Now tab wired.
4. Skill Forge registered, inert.
5. Three system Skills seeded or updated.
6. Scenarios S5.1 through S5.6 authored and passing.
7. Both Vercel projects healthy.
8. Continuity log appended.

## Kanban hygiene - end

Move each child stream card to Deployed (success), Review (PR awaiting merge), or Bug Fixes (partial or failed). Append "Implemented at <commit-sha> · merged at <ISO-timestamp>" to each. Move the parent "Sprint 9 - Procedural Memory Substrate" card to Deployed, Review, or Bug Fixes per the actual outcome, with child outcomes listed in the card body. Never move any card to Verified; that column is human-only.

## Out of scope

- Skill Forge observation loop, distillation, proposals (Sprint 10).
- `execute_skill` (Sprint 11).
- Library tab author UI and Proposals sub-tab (Sprint 10).
- Metacron per-tenant Skill Library (Sprint 11).
- Atrium Companion (Sprint 12).

Begin.
