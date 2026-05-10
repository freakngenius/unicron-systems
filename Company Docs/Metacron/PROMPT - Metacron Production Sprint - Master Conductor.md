# PROMPT — Metacron Production Sprint Master Conductor (re-pasteable)

Paste this into a fresh Claude Code session anytime to continue Metacron's path to 100% production-ready end-to-end. Designed to be re-paste-friendly: each new session does its own status check, picks up the next unblocked card, ships it, verifies, moves to next. Continues autonomously until production-ready or hits a hard halt condition.

**Recommended model: Opus** for autonomous orchestration of multi-system work. Sonnet acceptable if Opus unavailable.

---

## Mission

Take Metacron from current state (~70% production-ready for Zedcor flows, multi-tenant + per-org tailoring at 0%) to **100% production-ready end-to-end for any new customer onboarded via Architect**.

End-to-end success means:
- Operator runs Architect with a customer's prompt → real plan + real architecture JSON
- Approve/Deploy → org persisted in pathfinder.organizations with status state machine
- First ingestion fires automatically → real per-org agent runs (real sources, real scoring, real geography)
- Operator clicks "Open Pathfinder for X" in Metacron → tailored Pathfinder dashboard renders with real per-org data, real sources, real metrics, real charts, real errors
- Operator Verify in Metacron → row written to pathfinder.agent_verifications → operator can see verification activity per org
- Zero mock fixtures in customer-facing surfaces. Zero hardcoded Zedcor strings.
- Multi-Vercel verification: Pathfinder + Metacron both green on every merge.

## Operating model

You are running an autonomous sprint loop. Each cycle:

1. **Status check.** Read all of:
   - Metacron Notion kanban (data source `collection://07970e18-984a-4034-b491-cde76b9b1bad`) via notion-fetch + notion-query-data-source-view. Surface every card by stage.
   - Live Supabase state via Supabase MCP (list_migrations, execute_sql for tables in pathfinder.* schema).
   - Git state: latest main commit, open PRs, branches ahead.
   - Vercel deploy status for both projects.
   
2. **Pick next unblocked card.** Priority order:
   - Bug Fixes (production breakage takes precedence)
   - Review (close out PRs that are sitting)
   - In Process (continue work in flight)
   - Not Yet Started, in dependency-respecting order:
     1. Phase 1F Bridge Merge + Verify
     2. Phase 2A Multi-tenant Foundation (Operator-Internal)
     3. Phase 2B Tenant Config Layer (bundled with 2A typically)
     4. Phase 2C Per-Org Agent Dispatch
     5. Phase 2D Real Per-Org Dashboard Data
     6. Phase 2E Onboarding-to-Live Pipeline
     7. Pre-existing Test Stabilization
     8. Production Hardening
   - Skip cards whose declared dependencies (in card content) are unmet. Re-check dependencies fresh each cycle.
   
3. **Read the spec.** Specs live in `Company Docs/Metacron/`. Each card content references its spec path.

4. **Plan the implementation.** Use the `writing-plans` skill before touching code. Output a tight plan: scope, files touched, schema changes, test approach, multi-Vercel impact.

5. **Implement.** Use these skills as appropriate:
   - `test-driven-development`: write failing tests first, then implementation.
   - `using-git-worktrees`: create a fresh worktree for the card's work. Naming: `feat/metacron-<card-id>-<slug>`.
   - `subagent-driven-development`: dispatch parallel sub-agents for independent file changes within the same card.
   - `dispatching-parallel-agents`: when work has multiple independent slices.
   - `systematic-debugging`: when bugs surface during implementation.

6. **Verify.** Use `verification-before-completion` skill. Run:
   - Unit + integration tests
   - Local typecheck + build
   - Local E2E smoke for the changed surface
   - SQL probe for any schema changes (cross-org RLS isolation must be verified)
   - Multi-Vercel preview deploy green for BOTH projects

7. **Code review.** Use `requesting-code-review` skill. Run a self-review pass. Address findings.

8. **Open PR.** PR body must include:
   - What ships (bullet)
   - Spec link
   - Verbatim evidence (test output, SQL probe results, screenshots)
   - Multi-Vercel preview links + statuses
   - Migration drift callout if applicable
   - Risk + rollback paragraph
   
9. **Wait for CI green.** If red, fix on branch (do not force-merge). If repeated failures, document and surface for Cowork.

10. **Merge** when CI is green AND no halt condition triggered.

11. **Post-merge verification.** Use `finishing-a-development-branch` skill:
    - Capture merge SHA + ISO timestamp
    - Multi-Vercel verify production: both projects green, bundle hashes changed, smoke test on production
    - Append to Metacron kanban card: `Implemented at <SHA> · merged at <ISO timestamp>` and move card In Process → Deployed (NOT Verified — human-only)
    - Worktree cleanup via `git worktree remove`

12. **Loop.** Return to step 1. Pick next card. Continue until no unblocked cards remain or a halt condition fires.

## Halt conditions (only halt on these)

Halt and surface to Kyle (do not retry, do not hypothesize, do not work around) when:

- **Migration apply.** Always print SQL and wait for Kyle's "apply" reply before calling `apply_migration`. Never auto-apply.
- **Peer dependency missing.** If a card depends on `pathfinder.organizations` or other peer-owned schema and that doesn't exist in production, surface to Cowork. Do not absorb peer's work without explicit Cowork direction.
- **CI red after 2 fix attempts.** Document the failure, surface to Cowork.
- **E2E smoke fails post-implementation.** Halt, capture failure mode.
- **RLS leak detected.** Halt immediately. Cross-org isolation is non-negotiable.
- **Production safety triggered.** 5xx rate spike post-deploy → auto-revert + halt + surface.
- **Verified column move requested.** That column is human-only. Never auto-promote.
- **Secret detected.** gitleaks finds a secret → halt, never push.
- **Cross-app boundary uncertainty.** If a change might affect both Pathfinder + unicron-platform Vercel projects in unexpected ways, surface to Cowork before merging.

## Hard constraints (apply throughout)

- No deletes (rm, git clean, reset --hard, wipe uncommitted work). Archive instead. Commit before branch switch.
- No time estimates anywhere.
- No cost caps in code or config.
- No promotion to Verified column (human-only).
- No force-push, no force-merge.
- Multi-Vercel verification is mandatory: Pathfinder + Metacron are independent Vercel projects. One green does not imply the other.
- Verbatim evidence in PR descriptions (logs, schema queries, test output) — no hypothesis-driven claims.
- Cross-app boundary changes require explicit justification in PR body (Path B precedent).

## Skills you should invoke each cycle

Mandatory:
- `writing-plans` — before implementation
- `test-driven-development` — for any new code
- `verification-before-completion` — before claiming done
- `requesting-code-review` — before opening PR
- `finishing-a-development-branch` — at merge

As needed:
- `systematic-debugging` — bugs
- `using-git-worktrees` — every new card gets its own worktree
- `subagent-driven-development` / `dispatching-parallel-agents` — when work is parallelizable

## Spec + reference paths

Specs (read as needed):
- `Company Docs/Metacron/PRD - Phase 2 Tailored Pathfinder.md`
- `Company Docs/Metacron/SPEC - Phase 2A Multi-tenant Routing & Auth.md`
- `Company Docs/Metacron/SPEC - Phase 2B Tenant Config Layer.md`
- `Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md`
- `Company Docs/Metacron/SPEC - Phase 2D Dynamic UI Rendering.md`
- `Company Docs/Metacron/SPEC - Phase 2E Onboarding Completion Loop.md`
- `Company Docs/Metacron/SPEC - Real Per-Org Dashboard Data.md`
- `Company Docs/Metacron/SPEC - Production Hardening.md`
- `Company Docs/Metacron/SPEC - Architect Business Summary Panel.md` (already shipped — for reference)
- `Company Docs/Metacron/SPEC - Connectors (Slack, Teams, HubSpot).md`
- `Company Docs/Metacron/SPEC - Agent Console (Metacron).md`

Operating context:
- `CLAUDE.md` (project root) — operating principles, two-engine rule
- `MEMORY/` — established preferences, project state, audit notes, operator-todos

## Kanban hygiene (never skip)

- At cycle start: pick card → move Not Yet Started → In Process. Capture timestamp.
- At PR open: card → Review.
- At merge: card → Deployed. Append `Implemented at <SHA> · merged at <ISO timestamp>` to card content.
- Verified: human-only. Never touch.
- If you create a worktree but don't ship (halt before PR): keep card in In Process with a note about the halt reason.

## First action when this prompt is pasted

1. Print: "Metacron Production Sprint — cycle starting at <timestamp>"
2. Run status check (kanban, schema, git, Vercel) and print a one-screen summary.
3. Identify the next unblocked card.
4. Print: "Picking up: [card title]" with brief reasoning.
5. Begin cycle from step 3 (Read the spec).

## When all cards are done

When zero unblocked cards remain in Not Yet Started + In Process + Bug Fixes:

1. Run end-to-end production-readiness check:
   - Create a synthetic test org via Architect
   - Verify org persists, status state machine fires, dashboard renders with real data
   - Verify operator-Verify-to-bridge round trip
   - Verify multi-Vercel green
   - Verify RLS isolation across orgs
   - Verify zero mock fixtures in customer-facing surfaces
2. If all pass: print "Metacron is production-ready end-to-end as of <timestamp>" and halt.
3. If any fail: file Bug Fixes cards on Metacron kanban and continue cycling.

## Re-paste behavior

This prompt is designed to be re-pasted. Each fresh CC session:
- Starts clean, no carryover assumptions
- Re-runs status check from live state (not memory)
- Picks the right next card based on actual current dependencies
- Continues from wherever the previous session left off

Re-pasting cannot duplicate work because card-state is the source of truth (In Process cards belong to whoever started them; new sessions skip In Process cards unless the worktree is unowned/abandoned).

Begin.
