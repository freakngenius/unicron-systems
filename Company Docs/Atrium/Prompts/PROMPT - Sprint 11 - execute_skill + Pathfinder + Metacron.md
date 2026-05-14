# PROMPT - Sprint 11: execute_skill + Pathfinder Migration + Metacron Surface

Dispatched by the Master Conductor (Sprints 9-12). Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 7 (Programmatic Tool Calling).md` (full), `Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md`, `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md`, `Company Docs/PRD/PRD - Pathfinder Form-Fit for Zedcor.md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

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

**Multi-Vercel verification.** Pathfinder and unicron-platform are separate Vercel projects. This sprint touches BOTH. Verify each independently after every deployment. One healthy does not imply the other.

**No time estimates or numeric cost caps.** Never write "~3 hours" or "$40 cap" in prompts or PR descriptions.

**Migration safety rule.** Before any SQL referencing an existing `nervous_system` or `pathfinder` table, run the `information_schema.columns` query first and write against verified live column names.

---

## This sprint accomplishes

1. Day-1 sandbox spike: confirm Inngest `step.run` isolation is sufficient for arbitrary `code_body` execution. Record the decision in the sprint card body and the PR description with verbatim evidence.
2. The `execute_skill` tool per Addendum 7: tool definition, execution path, static-analysis gate, Inngest sandbox with the Vercel-function fallback. Wired into the Slack Orchestrator tool registry.
3. Five hand-authored Pathfinder Skills seeding the chain migration (Ingestor, Verifier, Enricher, AdjacencyMapper, Outreach Drafter patterns).
4. The Pathfinder agent chain migrated: each specialist tries `search_skills` plus `execute_skill` first and falls back to the existing hard-coded chain only on a no-match.
5. The Metacron per-tenant Skill Library UI: list, detail, propose-from-this-run, approval queue. Reuses the Atrium Library components.
6. A SKILL.md import and export path so a Skill is a portable artifact. Phase 1 hook, not a feature.
7. The Sprint 11 scenario set at `vault/wiki/scenarios/execute-skill/` (S7.1 through S7.7).
8. Measured: Pathfinder ingest to BD-rep-screen p50 latency under 15 minutes on the Zedcor lead volume.

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint11-execute-skill`): the `execute_skill` tool, execution path, static-analysis AST gate, sandbox (Addendum 7 sections 1, 2, 3, 4). Includes the day-1 spike.
- **Stream B** (worktree `Pathfinder-worktrees/sprint11-pathfinder-migration`): hand-author the 5 Pathfinder Skills; migrate the specialist agent chain to try `search_skills` plus `execute_skill` first.
- **Stream C** (worktree `unicron-platform-worktrees/sprint11-metacron-skill-library`): the Metacron per-tenant Skill Library UI, reusing Atrium Library components.
- **Stream D** (worktree `unicron-platform-worktrees/sprint11-skill-portability`): the SKILL.md import and export path.
- **Stream E** (worktree `unicron-knowledge-worktrees/sprint11-scenarios`): the `vault/wiki/scenarios/execute-skill/` scenario set. Content-only commits.

---

## Pre-conditions

- Sprints 9 and 10 are Deployed or Verified: procedural layer live, Skill Forge producing and approving proposals.
- Skill Forge has at least a few approved Skills in `nervous_system.skills` for `execute_skill` to resolve against.
- Both Vercel projects are green.

---

## Kanban hygiene - start

Locate or create the card "Sprint 11 - execute_skill + Pathfinder + Metacron" on the Internal Org Kanban. Move it from Backlog to In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "execute_skill live and wired to the Orchestrator. Static-analysis gate rejects unsafe code bodies. Pathfinder chain migrated with fallback intact. Metacron per-tenant Skill Library shipped and a Zedcor admin has approved at least one per-tenant Skill. SKILL.md import and export works. Pathfinder p50 latency under 15 minutes on Zedcor volume. Scenarios S7.1 through S7.7 passing at the 0.90 threshold. Both Vercel projects healthy." Create child cards per stream and move them to In Process before any code is written.

---

## Tasks

### Task 1 - Sandbox spike (Stream A, day 1, blocking)

- Validate that Inngest `step.run` provides sufficient isolation for arbitrary `code_body` execution per Addendum 7 section 4.
- Record the decision in the "Sprint 11" sprint card body and the Stream A PR description with verbatim evidence.
- If Inngest isolation is insufficient, implement the Vercel-function fallback. If both are insufficient, this is a critical halt: escalate to Kyle, do not introduce Modal or Daytona without his decision.

### Task 2 - execute_skill (Stream A)

- Implement the `execute_skill` tool per Addendum 7 sections 1 and 2: resolution, input-schema validation, Taboo Keeper invoke check, sandboxed body or recipe-interpreter execution, output-schema validation, `skill_invocations` row persistence.
- Implement the static-analysis AST gate per Addendum 7 section 3. The AST diff of a changed `code_body` is what Taboo Keeper reviews on a version bump.
- Wire `execute_skill` into the Slack Orchestrator tool registry and add the caller-facing contract section to the Orchestrator system prompt per Addendum 7 section 5.

### Task 3 - Pathfinder migration (Stream B)

- Hand-author 5 Pathfinder Skills seeding the migration: Ingestor, Verifier, Enricher, AdjacencyMapper, Outreach Drafter chain patterns. These pass through the normal human plus Taboo Keeper approval path.
- Migrate the Pathfinder specialist agents: each tries `search_skills` plus `execute_skill` first, falls back to the existing hard-coded chain only on a no-match. The old chain stays in place as the fallback. This is a migration, not a rewrite.

### Task 4 - Metacron per-tenant Skill Library (Stream C)

- Build the Metacron per-tenant Skill Library UI: list, detail, propose-from-this-run, approval queue. Reuse the Atrium Library components.
- Per-tenant Skills are scoped by `customer_id`. A customer admin can run a dry-run preview and approve a per-tenant Skill, which routes through the same Taboo Keeper path.

### Task 5 - Skill portability (Stream D)

- Implement SKILL.md import and export so a Skill can be shared as a portable artifact, aligned to the existing `skill_md_path` convention from Addendum 2. Phase 1 hook only; no marketplace.

### Task 6 - Scenarios (Stream E)

- Author `vault/wiki/scenarios/execute-skill/_index.md` plus one file per scenario S7.1 through S7.7 in the Addendum 4 format. Satisfaction threshold 0.90 for this surface.

### Task 7 - Integration, latency measurement, multi-Vercel verification

- Run the Addendum 4 satisfaction validator over S7.1 through S7.7; each must clear 0.90.
- Measure Pathfinder ingest to BD-rep-screen p50 latency on the Zedcor lead volume. It must drop under 15 minutes. Record the measurement with verbatim evidence in the PR description.
- Confirm a cross-tenant Skill invocation is refused at RLS (S7.4).
- Both Vercel projects build and are healthy. Verify each independently. This sprint touches both; one healthy does not imply the other.

### Task 8 - Continuity log entry

Append a Sprint 11 closeout entry to `vault/Memory/elder/continuity.md`.

---

## Hard halt conditions

- The sandbox spike concludes Inngest isolation is insufficient AND the Vercel fallback is also insufficient. Escalate to Kyle.
- The static-analysis gate has a false negative in red-team testing (it lets `subprocess`, `eval`, or an out-of-allowlist import through).
- Pathfinder p50 latency regresses rather than improving.
- An `execute_skill` call reaches another tenant's data.
- Either Vercel project fails to build.

---

## Auto-merge criteria

- The sandbox spike decision is recorded with verbatim evidence.
- `execute_skill` resolves, validates, Taboo-checks, executes sandboxed, validates output, and persists a `skill_invocations` row.
- The static-analysis gate rejects unsafe code bodies (verified by red-team test).
- The Pathfinder chain tries Skills first and falls back cleanly on a no-match; the old chain is intact.
- The Metacron per-tenant Skill Library renders and a Zedcor admin has approved at least one per-tenant Skill end to end.
- SKILL.md import and export round-trips a Skill.
- Pathfinder p50 latency under 15 minutes on Zedcor volume, measured with evidence.
- Scenarios S7.1 through S7.7 clearing 0.90.
- Both Vercel projects healthy.
- PR descriptions carry verbatim evidence.

## Auto-revert triggers

- The static-analysis gate allows an out-of-allowlist import or `subprocess`, `eval`, `exec`.
- An `execute_skill` invocation crosses a tenant boundary.
- The Pathfinder migration removes the fallback chain before skill coverage is proven.

## Done criteria

1. `execute_skill` live and wired to the Orchestrator.
2. Static-analysis gate functional and red-teamed.
3. Pathfinder chain migrated with the fallback intact.
4. Metacron per-tenant Skill Library shipped; one per-tenant Skill approved by a Zedcor admin.
5. SKILL.md import and export works.
6. Pathfinder p50 latency under 15 minutes on Zedcor volume.
7. Scenarios S7.1 through S7.7 passing at 0.90.
8. Both Vercel projects healthy.
9. Continuity log appended.

## Kanban hygiene - end

Move each child stream card to Deployed, Review, or Bug Fixes per outcome, with the "Implemented at <commit-sha> · merged at <ISO-timestamp>" stamp. Stream B touches the Pathfinder repo; its card still rolls up to the Internal Org Kanban parent for this sprint. Move the parent "Sprint 11 - execute_skill + Pathfinder + Metacron" card to Deployed, Review, or Bug Fixes per the actual outcome, with child outcomes listed in the card body. Never move any card to Verified; that column is human-only.

## Out of scope

- Atrium Companion (Sprint 12).
- Production observability and Sentry wiring (Sprint 12).
- Customer-authored Skills and any marketplace (Phase 3).
- Customer voice modeling (Addendum 11, scoped after Sprint 12).

Begin.
