# Pathfinder Funder Onboarding: Claude Code Autonomous Build Kickoff

**Purpose:** Launch a single autonomous Claude Code run that builds, tests, and deploys Funder (Pathfinder organization #3) end to end without stopping, on an isolated branch that cannot touch the live Pathfinder product.
**How to use:** Open Claude Code at the repo root (`/Users/keka/Dropbox/Projects/Unicron Systems`). Paste the block below. Do not answer prompts; the run is autonomous and stops only on a hard-halt.

---

```
You are running an autonomous build sprint for Unicron Systems. Build, test, and integrate Funder onboarding end to end, without stopping for human input. Stop only on a hard-halt condition defined below.

================================================================
HARD CONSTRAINTS, read first, obey always
================================================================

These are direct operational constraints on this session. Read them before executing any tool call.

1. No destructive git operations. Never run `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, or any command that destroys uncommitted state in any worktree. This applies even when the goal is a simple branch update or redeploy.

Worktree pre-flight, mandatory before any branch switch, reset, or checkout: before touching any worktree you did not create in this session, run `git status` first. If any modified or untracked files exist, stop and stash them with `git stash --include-untracked` before proceeding. Never destroy uncommitted work. Safe alternatives to bring a branch current: `git stash --include-untracked` then proceed, or `git fetch origin && git merge --ff-only origin/<branch>` which refuses instead of destroying, or work in a different worktree entirely. Incident reference: 2026-05-10 `git reset --hard` on gate14a-teams-user-connection wiped a MEMORY file.

2. Refusal layer is primary. Every system-modifying action passes through Taboo Keeper validation before execution.

3. Verified column is human-only. Never auto-promote a kanban card to Verified. Only Kyle, Keenan, or Curtis may move a card to Verified.

4. Multi-Vercel verification is non-negotiable. Pathfinder and unicron-platform are separate Vercel projects in the same repo. Verify each independently. This build touches the Pathfinder project only, and only its `funder-onboarding` branch deployment.

5. No time estimates or numeric cost caps. Do not gate work on durations or budgets. Safeguards are auto-merge criteria, auto-revert triggers, and hard-halt conditions.

6. Never commit to `main`. Never touch the production deployment or the live Zedcor surface. All work is isolated on the `funder-onboarding` branch. Do not work on the Zedcor-owned do-not-touch paths listed below.

================================================================
MISSION
================================================================

Funder is Pathfinder organization #3, after Zedcor and Realberry. It is a philanthropic capital deployer. Onboard it as a row in `pathfinder.organizations` carrying an architecture JSON, and build the platform work that org needs to run end to end: source adapters, agent reconfiguration, generic-org rationale, the Weekly Deal Memo, and the schema-driven dashboard.

Funder is NOT a fork. Do not copy the codebase. Do not create a per-customer Supabase schema. It is a configured organization on the existing multi-tenant platform.

The run is done when `/funder` is live on the `funder-onboarding` branch deployment producing real verified opportunities and a Weekly Deal Memo, and one pull request from `funder-onboarding` into `main` is open for human review.

================================================================
READ FIRST, IN FULL
================================================================

1. /Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder/Pathfinder-Funder-Build-Spec.md
   The build spec. Sections 1 and 3 are the operating model and the safeguards. Section 4 is the 10 stage specs. Follow it exactly. It is the source of truth and it has been updated to the isolated-branch model described below.

2. /Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder/Pathfinder-Funder-Blueprint.md
   The blueprint. Why Funder is an org, not a fork. Platform-state inventory, component plan, agent mapping, data sources.

3. /Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder/Pathfinder-Funder-Architecture.json
   The canonical architecture JSON. Persisted into `pathfinder.organizations.architecture` for Funder.

4. Company Docs/Metacron/SPEC - Phase 2A..2E and SPEC - Pathfinder Build-Out Pass.md
   The platform specs the build completes.

5. Pathfinder/docs/PLAN-funder-onboarding.md
   The Stage 1 platform-audit plan, if it already exists from a prior session. Use its findings.

Also read the live code that defines the org model before writing anything: `lib/types/architecture.ts`, `lib/config/resolveArchitecture.ts`, `lib/config/baseTemplate.ts`, `lib/agents/loadOrgArchitecture.ts`, `lib/agents/ranker/genericScorer.ts`, `app/api/cron/ranker/route.ts`.

================================================================
ISOLATION AND MERGE MODEL
================================================================

This run is fully autonomous and auto-merges, but it is isolated from the live product. It never touches `main`.

- Create a long-lived integration branch `funder-onboarding` off `origin/main`. Run `git fetch origin` first, then branch off `origin/main`. Use worktrees for stage work. Never check `funder-onboarding` out in the main working directory. Never touch the `ci-billing-test` branch or the untracked Brand, Web, and docs work in the repo.
- All Funder work lives on `funder-onboarding`. Never commit to `main`. Open no GitHub pull request until the end.
- Each stage works in a worktree on a stage branch off `funder-onboarding`, named `funder-<stage-slug>`, under `Pathfinder-worktrees/`. Build and test there. When the stage auto-merge criteria are met, merge the stage branch into `funder-onboarding` with a plain `git merge`. This is not a GitHub pull request. Push `funder-onboarding`.
- This is authorized and does not conflict with `Pathfinder/CLAUDE.md`: the run never commits to `main` and never self-merges a pull request. The only pull request in the run is the final one below.
- The `funder-onboarding` Vercel branch deployment is Funder's URL for this build. After each stage, verify that branch deployment, not production.

================================================================
RUN PROTOCOL
================================================================

Run the 10 stages in Build-Spec Section 4 in order, autonomously, no pauses.

- Stage 1 is a no-code platform audit. If `Pathfinder/docs/PLAN-funder-onboarding.md` already exists from a prior session, use it; otherwise produce it. It writes corrected platform state and a resized stage plan, then the run continues. Plan-first here is evidence-first, not human-gated.
- Apply the resolved defaults in Build-Spec Section 2 for every open decision. Do not stop to ask.
- Real opportunity data comes from the real public-data source adapters. The portfolio of orgs Funder already funds is seeded synthetic and clearly tagged; adjacency degrades gracefully on it. Do not block on real grantee data.
- After each stage merge, push `funder-onboarding` and verify its branch deployment. If an auto-revert trigger fires, revert that stage merge and retry the stage.

================================================================
SAFEGUARDS, SUMMARY, FULL TEXT IN BUILD-SPEC SECTION 3
================================================================

Auto-merge criteria, a stage merges into `funder-onboarding` when all are true: build, lint, type-check, and area tests pass; stage acceptance criteria met with verbatim evidence recorded in the commit and the build report; no do-not-touch file modified.

Existing-customer regression check, run every stage, recorded not gating: `/zedcor` and `/realberry` render without error, the Zedcor ranker kernel scores a fixed sample of existing Zedcor projects unchanged (exact match), Zedcor crons do not error on a dry run. A regression does NOT halt the run, because the run is isolated from `main`. Log it in the build report as a blocker for the final pull request.

Auto-revert triggers, revert the stage merge into `funder-onboarding` and retry: the branch deployment build fails after the merge; `next build` or type-check breaks on `funder-onboarding`; the merge breaks a previously passing test.

Hard-halt conditions, stop the run and write a halt report: a destructive git operation would be required; a worktree has uncommitted changes that cannot be safely stashed; Stage 1 finds the per-org dispatch path fundamentally broken; a schema change would require destructive alteration of an existing table; three consecutive failed attempts on one stage.

Do-not-touch paths, Zedcor-owned and locked: `lib/scoring.ts`, `lib/zedcor/**`, `app/zedcor/**`, the Zedcor fall-through branch of `app/api/cron/ranker/route.ts`, Zedcor-specific logic in the other cron routes, `_demo-snapshot-2026-04-30/**`. All Funder scoring, rationale, and dashboard work happens in the generic non-Zedcor code path. Any shared-file change must be additive and gated by `organization_id`.

Evidence is recorded verbatim. No hypothesis-driven fixes. If a fix is applied, show the failing output before and the passing output after.

================================================================
KANBAN HYGIENE, START AND END
================================================================

Pathfinder Features Kanban only: https://app.notion.com/p/futuroso/Pathfinder-Features-Kanban-354785c67e7280109d83d06461430f9f, data source collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1.

- At run start: create one card per stage (Build-Spec Section 4) under Not Yet Started.
- When a stage begins: move its card to In Process.
- When a stage is merged into `funder-onboarding` and the branch deployment is verified: move its card to Deployed. Append to the card body `Implemented at <commit-sha> · merged into funder-onboarding at <ISO timestamp>`.
- If a stage hard-halts: move its card to Bug Fixes.
- Never move a card to Verified. Verified is human-only.

================================================================
DEFINITION OF DONE
================================================================

- All 10 stages merged into the `funder-onboarding` branch.
- `/funder` live on the `funder-onboarding` Vercel branch deployment, rendering the thesis-grouped opportunity feed from real public-data opportunities.
- The Phase 2E state machine reached `build_out_complete` for Funder on the branch deployment.
- A Weekly Deal Memo generated from verified Funder opportunities.
- The existing-customer regression check run; its result recorded in the build report.
- Every Funder kanban card in Deployed, none in Verified.
- A build report written to `Pathfinder/docs/REPORT-funder-onboarding.md`: each stage, commit SHAs, verbatim verification evidence, the regression-check result, any auto-reverts, any hard-halt.
- One GitHub pull request, `funder-onboarding` into `main`, open and unmerged, with the build report attached and any regression blocker called out. Do not merge it.

If the run hard-halts, the report states the halted stage, the trigger, the current state, and the exact next action for a human. Then stop.

Begin with Stage 1, or continue from the next unstarted stage if a prior session already completed earlier ones.
```

---

## Notes for Kyle

- One autonomous run. Paste once. It builds and auto-merges all 10 stages onto an isolated `funder-onboarding` branch and does not pause for input. It stops only on a hard-halt.
- It cannot touch the live Pathfinder product. `main`, the production deployment, and Zedcor are never touched. Funder lives on the `funder-onboarding` branch deployment with its own URL for the duration of the build.
- The CLAUDE.md conflict is resolved with nothing to waive: the run never commits to `main` and never self-merges a pull request. Stage integration is plain `git merge` into the isolated branch. The only pull request is the final `funder-onboarding` into `main`, which waits for you.
- Zedcor and Realberry regression checks run every stage but do not halt the run, since the branch is isolated. Any regression is logged as a blocker on the final pull request, for you to resolve before Funder reaches production.
- When you merge that final pull request, Funder joins production as organization #3 on the shared platform, per the blueprint. Until then the branch URL is its home and can serve a pilot demo as-is.
- Two things still cannot be autonomous: the real Funder grantee-portfolio data (the run uses a synthetic portfolio with a documented swap point; the opportunity feed itself is real public data) and the Verified kanban column (human-only).
- If a prior session already finished Stage 1, the run picks up from Stage 2. The Stage 1 audit plan is at `Pathfinder/docs/PLAN-funder-onboarding.md`.
