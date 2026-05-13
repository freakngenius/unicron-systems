# PROMPT — Demo Push Overnight (paste-ready)

Paste this into a fresh Claude Code session. Recommended model: **Opus**. Designed for unhalted overnight execution with built-in self-review + fix loop. The goal is a specific demo path working end-to-end by morning.

---

## DEMO PATH (this is the gate)

By morning, this exact path must work end-to-end for a fresh, never-seen-before customer profile:

1. Operator enters a customer profile via Architect's onboarding ("What signals do you want to capture?" prompt)
2. Architect generates a real preview (business_summary + decomposition + ui_plan)
3. Operator clicks Accept (Approve & Deploy)
4. **System builds REAL — real agents are deployed, real instructions per the Architect's blueprint, agents interconnect per the blueprint, connect to a real data source, real data flows through ingestion → ranker → verifier → enricher → outreach drafter**
5. Final pass: System designs the tailored Pathfinder UI based on `architecture.ui_plan` + current Pathfinder design system. Codes it. Tests it. Iterates until verified working
6. Result: customized Pathfinder live at customer's unique URL (`pathfinder.unicron.systems/[slug]`) showing real per-customer data

No mocks. No hardcoding. No seed data dressed as real. The Architect's blueprint IS the runtime contract.

## DEFINITION OF DONE — read first

**`Company Docs/Metacron/SPEC - Definition of Done - End-to-End Operational.md`** is authoritative truth. Read at the start of every cycle. Re-read after any context compaction.

The 11-step TestCorp synthetic smoke test in that SPEC is the gate. Metacron is not done until a brand-new fictional org passes all 11 steps.

## ADDITIONAL SPEC — Pathfinder Build-Out Pass

**`Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md`** describes the architecture-driven UI generation step (step 5 of the demo path). Read this too.

## PRE-AUTH (overnight, expires 7am Pacific)

- Additive migrations may auto-apply without halt: new tables, new columns with safe defaults, new indexes, new RLS policies, new functions. Print every SQL applied for audit.
- **Scope expansion on the active card is auto-authorized.** If you find more work that fits the active card's intent (more RLS leaks while on the RLS-fix card, more mock fixtures while on the dashboard card, etc.), expand scope and keep going. Do NOT halt to ask permission.
- /codex review approved for parallel execution after every card.
- **Auto-merge authorized** after CI green + multi-Vercel green + /codex pass. Kyle's "Kyle merges only" durable memory is overridden for this window. Post merge SHA + timestamp to chat after each merge.

## HARD HALT CONDITIONS — these are the ONLY reasons to halt

Halt and surface to chat (do NOT continue the active card; CONTINUE other unblocked cards in parallel if safe):

- **Destructive migration** (DROP TABLE, DROP COLUMN, ALTER COLUMN TYPE, DELETE without WHERE, TRUNCATE, schema rename). Surface SQL for Kyle review.
- **RLS leak detected AFTER a fix migration applied** (i.e., the fix didn't take). NOT for finding more leaks while actively fixing leaks — those expand scope automatically.
- **Production 5xx spike post-deploy** → auto-revert + halt entire loop, surface immediately.
- **Secret detected in commit** → halt entire loop, surface immediately. Never push.
- **CI red after 3 fix attempts on the same card** (not 2 — give the loop room).
- **Smoke test fails on the same step 3 consecutive times after fix attempts** → halt that step's cycle, surface diagnostic, continue OTHER cards. Don't loop forever on the same broken thing.
- **Authentication/authorization failure on the deploy pipeline** (token expired, etc.) → halt and surface.
- **Verified column move requested** → never auto-promote. Surface for Kyle to move manually.

DO NOT halt for:

- More work found while doing current work (RLS scope expansion, mock fixture sweep, etc.) — auto-expand.
- Single test failure → fix and retry up to 3 times before halting.
- Vercel preview slow → wait, then proceed.
- Mergeable=UNKNOWN → refresh, retry.
- /codex unavailable → skip review for that PR, log a follow-up audit card, continue cycling.
- Spec interpretation ambiguity → make the call that best serves the demo path goal, document the choice in the PR, continue.

## CYCLE STRUCTURE — each card, every time

1. **Status check + skill discovery.** Run `list_skills` MCP. Snapshot kanban + schema + git + Vercel. One-screen summary. Re-read DoD SPEC + Build-Out SPEC if context has shifted.

2. **Pick next card.** Priority: Bug Fixes → Review → In Process → Not Yet Started.

3. **Plan.** Use `writing-plans` skill. File-disjoint, parallel-friendly plan.

4. **Implement.** TDD: failing test first, then green. Use:
   - `test-driven-development`
   - `using-git-worktrees` — fresh worktree per card
   - `subagent-driven-development` / `dispatching-parallel-agents` — for file-disjoint slices

5. **Self-verify.** Build, typecheck, tests, SQL probes, local smoke. All green.

6. **External review.** `/codex review feat/<branch>`. WHILE /codex runs, IMMEDIATELY pick up the next file-disjoint card in parallel worktree. Do not idle.

7. **Apply findings.** When /codex returns: trivial → PR. Substantive → fold + re-review. Architectural → file Bug Fix, halt that card, continue others.

8. **Multi-Vercel verify.** Pathfinder + unicron-platform both green on preview.

9. **Merge.** Auto-merge once CI green + multi-Vercel green + /codex pass. Post SHA + timestamp to chat.

10. **Post-merge.** Move kanban card to Deployed (never Verified — human only).

11. **Re-check DoD.** Run synthetic smoke. Pass → continue or halt if goal met. Fail → file Bug Fix for failed step, continue cycling.

## SELF-REVIEW LOOP

After EVERY card merges, run a fresh DoD smoke check:
- Create synthetic test org "TestCorp-<timestamp>"
- Run 11 smoke steps from DoD SPEC
- Pass → print "DoD smoke PASS at <commit>" and continue
- Fail → identify failed step, file Bug Fix card, continue cycling

Synthetic smoke is the only true exit condition. Even if planned card list is complete, if smoke fails, keep going.

## PARALLEL SUB-AGENT DISPATCH

Authorized aggressively for file-disjoint cards. Concurrent worktrees:
- Phase 2C slices 2-6
- Phase 2D real dashboard data
- Customer Profile Architect History
- RLS gap sweeps (parallel-safe schema-only)
- Test stabilization
- Production Hardening

## REPORTING CADENCE

Every 30 minutes of clock time, post one line in chat:
- Cards merged this hour (count + names)
- Cards in flight (worktree IDs)
- Active halts (if any)
- Current DoD smoke status

Keep it tight — single line per cycle is fine. Don't ask permission, just report.

## FAILURE MODES — DON'T LOOP FOREVER

If you cycle the same card 3 times without progress:
- Halt that card
- File Bug Fix detailing every attempt + diagnostic
- Continue cycling OTHER cards
- Surface stuck card with current state + suggested next attempt

## FINAL DELIVERABLE BY 7AM PACIFIC

**Path A:** Synthetic smoke passes all 11 steps. Demo path verified. Print "Demo path GREEN at <timestamp>" and halt.

**Path B:** Cards in flight. Print status summary listing what's green / red / blocked / next-cycle target. Kyle reviews at 7am.

If Path B and time before 7am: keep cycling.

## BEGIN

1. Read DoD SPEC and Build-Out SPEC.
2. Run `list_skills`.
3. Status check (kanban + schema + git + Vercel).
4. Print one-screen summary.
5. Pick first card.
6. Start cycling.

Don't idle. Don't ask permission for anything in the pre-auth window. Don't halt on scope expansion. Surface only on actual hard halt conditions.
