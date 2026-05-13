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

**`Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md`** describes the architecture-driven UI generation step (step 5 of the demo path). Read this too — it's the final phase that makes the customer's Pathfinder fully tailored.

## PRE-AUTH (overnight, expires 7am Pacific)

- Additive migrations may auto-apply without halt: new tables, new columns with safe defaults, new indexes, new RLS policies, new functions. Print every SQL applied for audit.
- Halts remain on: destructive changes, schema renames, RLS leak detection, CI red after 2 fix attempts, production safety triggers, secret leaks, Verified column moves, smoke test failures.
- /codex review approved for parallel execution after every card.

## CYCLE STRUCTURE — each card, every time

1. **Status check + skill discovery.** Run `list_skills` MCP. Snapshot kanban + schema + git + Vercel. Print one-screen summary. Re-read DoD SPEC + Build-Out SPEC if context has shifted.

2. **Pick next card.** Priority: Bug Fixes → Review → In Process → Not Yet Started. Within Not Yet Started, dependency-respecting order:
   - Phase 2C slices 2-6 (org-aware ranker, outreach drafter, verifier, geography, registry, compliance) — parallel-safe between slices in disjoint files
   - Phase 2D Real Per-Org Dashboard Data — parallel with 2C
   - Phase 2E Onboarding-to-Live state machine — depends on 2C + 2D
   - Pathfinder Build-Out Pass (NEW) — depends on 2C + 2D + 2E
   - Customer Profile Architect History (table + UI tab)
   - 2 RLS gaps (artifact_templates, voice_call_artifacts)
   - Atrium env-var collision diagnosis
   - Pre-existing Test Stabilization
   - Production Hardening

3. **Plan.** Use `writing-plans` skill. Tight, file-disjoint, parallel-friendly plan.

4. **Implement.** TDD: failing test first, then green. Use specialized skills as fit:
   - `test-driven-development`
   - `using-git-worktrees` — fresh worktree per card
   - `subagent-driven-development` / `dispatching-parallel-agents` — for file-disjoint slices

5. **Self-verify.** Run build, typecheck, tests, SQL probes, local smoke. All green before proceeding.

6. **External review.** Throw to /codex: `/codex review feat/<branch>`. WHILE /codex runs, IMMEDIATELY pick up the next file-disjoint card in a parallel worktree. Do not idle.

7. **Apply findings.** When /codex returns:
   - Empty/trivial findings → open PR with /codex transcript in body
   - Substantive findings → fold into branch, re-run /codex once, then PR
   - Architectural concerns → file Bug Fix card, halt that card, surface to Kyle in this thread, continue other cards

8. **Multi-Vercel verify.** Pathfinder + unicron-platform both green on preview before merge.

9. **Merge.** Once CI green + multi-Vercel green + /codex passed.

10. **Post-merge.** Move kanban card to Deployed. Capture merge SHA + timestamp. Worktree cleanup via `git worktree remove`.

11. **Re-check DoD.** Would the TestCorp synthetic smoke test pass NOW with the latest main? If yes → run synthetic smoke. If no → continue cycling.

## SELF-REVIEW LOOP

After EVERY card merges, run a fresh DoD smoke check:
- Create or refresh a synthetic test org "TestCorp-<timestamp>"
- Run all 11 smoke steps from the DoD SPEC
- Pass → print "DoD smoke PASS at <commit>" and continue to next card OR halt if all cards done
- Fail → identify which step failed, file Bug Fix card naming the failure, continue cycling

This means: even if you "finish" the planned card list, if the synthetic smoke fails, you keep going. The synthetic smoke is the only true exit condition.

## NEW: PATHFINDER BUILD-OUT PASS — THE DEMO STAR

This is what makes the demo memorable. After 2C + 2D + 2E land:

1. Extend Architect output schema to include `ui_plan` (per Build-Out SPEC)
2. Extend Architect system prompt to generate ui_plan per the customer's vertical
3. Wire Pathfinder renderer to honor ui_plan (KPI strip, charts, lead card layout, filters)
4. Implement build-out verification Inngest function with headless browser + screenshot
5. Add iterate-to-green loop (max 5 attempts)
6. Status flips `build_out_complete` on pass

This is what makes the demo land: operator clicks Accept, system literally builds the agents AND designs the UI, then proves it works by visiting the URL and screenshotting. No demo magic; the system shows its work.

## REAL DATA SOURCES

Every source declared in any active org's `architecture.sources` must be one of:
- **Live** — real adapter producing real rows
- **Tier-2-queued** — declared, operator queue for manual fetch (no silent failure)
- **Voice-agent** — Phase 3+ (no silent failure)
- **Pending** — Source Onboarder explicitly building adapter, declared in UI

If any source returns mock data or fails silently, file a Bug Fix card naming that source and continue cycling. By morning, every source for at least the TestCorp synthetic test org must be Live or have a clear status declared.

## HARD HALT CONDITIONS

Halt and surface to this thread (continue OTHER unblocked cards while halted on one):
- Migration with destructive change → halt that migration, continue other cards
- CI red after 2 fix attempts → halt that card, continue others
- RLS leak detected in any probe → halt entire loop, surface immediately
- Production deploy 5xx spike → auto-revert + halt entire loop, surface immediately
- Secret detected in commit → halt entire loop, surface immediately
- Smoke test fails 3 consecutive times on same step → halt the cycle for that step, surface diagnostic, continue other unrelated cards

DO NOT halt for:
- Single test failure (fix and retry)
- Vercel preview slow (wait, then proceed)
- Mergeable=UNKNOWN (refresh, retry)
- /codex unavailable (skip review for that PR, continue cycling, file follow-up audit card)

## FAILURE MODES — DON'T LOOP FOREVER

If you cycle the same card 3 times without progress (same test failing, same Vercel error, same /codex finding):
- Halt that card
- File Bug Fix detailing every attempt + diagnostic
- Continue cycling other unblocked cards
- Surface the stuck card to Kyle in this thread with current state + next-attempt suggestion

## REPORTING CADENCE

Every 30 minutes of clock time, post a status summary in this thread:
- Cards in-flight (which worktrees, which slices)
- Cards merged this hour
- /codex queue
- Active halts
- DoD smoke pass/fail status

## FINAL DELIVERABLE BY 7AM PACIFIC

Either:
**Path A:** Synthetic TestCorp smoke passes all 11 steps + the demo path (Architect input → Accept → real agents run → tailored Pathfinder live at URL) verified working end-to-end. Print "Demo path GREEN at <timestamp>" and halt.

**Path B:** Some cards still in flight. Print a status summary listing what's green, what's red, what's blocked, what next-cycle would tackle. Kyle will review at 7am.

If Path B and there's still time before 7am, keep cycling. Path A is the goal.

## BEGIN

1. Read DoD SPEC and Build-Out SPEC.
2. Run `list_skills`.
3. Status check (kanban + schema + git + Vercel).
4. Print one-screen summary.
5. Pick first card.
6. Start cycling.

Don't idle. Don't ask permission for things in the pre-auth window. Surface only on actual halt conditions.
