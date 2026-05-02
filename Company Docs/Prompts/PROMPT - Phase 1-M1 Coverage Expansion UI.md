# PROMPT — Phase 1 / Stream M1: Coverage Expansion Modal

Paste-ready Claude Code launch prompt. Generated 2026-05-02 post-Phase-0.5 close-out (PR #75 merged at `4f5c3d6`, agent console foundation shipped). Boilerplate-baked version. Parallel-safe with M2, M3, M4, M5 — all five Phase 1 streams are file-disjoint.

## Goal

Implement the Coverage Expansion agent modal per `SPEC - Agent Console (Metacron).md` §5.1. Uses the Phase 0.5 shell. Maps Stream E's already-shipped `/api/coverage/goals*` endpoints into the unified `unicron.agent_dispatches` + `agent_dispatch_events` pattern.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` §5.1 + §4 + §6

## Read first (in order)

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md` — canonical safety + workflow constraints. Hard constraints block from this file is copied verbatim below.
2. `Company Docs/Specs/SPEC - Agent Console (Metacron).md` (§5.1 the focus)
3. `Company Docs/Specs/SPEC - Coverage Expansion Agent.md` (if present; else check git history)
4. `Company Docs/Context/00 - METACRON CONTEXT.md`
5. `MEMORY/audit-unicron-platform.md` — Stream C ↔ Stream E Coverage Expansion contract section
6. Phase 0.5 outputs at `unicron-platform/src/components/agent-console/*`, `unicron-platform/src/lib/agentConsoleClient.ts`, `unicron-platform/src/lib/agentRegistry.ts`, `unicron-platform/src/views/AgentsView.tsx`

## Phase 0.5 baseline

- main HEAD: `4f5c3d6` (PR #75 merged 2026-05-02T21:10:43Z)
- `unicron.agent_dispatches` + `unicron.agent_dispatch_events` tables in production Supabase (project `anfihcusvekpovcchpoh`); `agent_run_id` is `bigint` not `uuid` (FK to `pathfinder.agent_runs.id`)
- Both tables in `supabase_realtime` publication
- Agent console shell components shipped: `AgentModalShell`, `AgentInputForm`, `AgentLiveExecution`, `AgentResult`, `AgentHistoryGrid`, `AgentTile`, `AgentsView`
- Routing: tab-state-based (no react-router). Modals open within the `Agents` tab via component state. Add a new agent by registering in `agentRegistry.ts` and the AgentsView grid renders the card.
- Three Vercel projects healthy: `metacron` (prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz), `pathfinder`, `unicron-systems`
- `metacron.unicron.systems` custom domain attach status: verify before starting (Vercel → metacron → Settings → Domains). If not attached, surface to Kyle and proceed; PR can ship without it but verification curl will use the deploy URL instead.

## Hard constraints

```
## Hard constraints

**File system:**
- DO NOT delete files. Per `feedback_no_deletes.md` — never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or any operation that wipes uncommitted work.
- If a file appears stale or duplicate, MOVE it to `_archive/<descriptive-name>` rather than delete.
- Build artifacts (`.next/`, `dist/`, `node_modules/`, `test-results/`, `coverage/`, `.DS_Store`) are exempt — those can be cleaned/regenerated.
- Source-of-truth content (docs, code, configs, customer data, MEMORY files) is NEVER deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files. Don't leave uncommitted work between gates.
- COMMIT before any branch switch, pull, or stash. Untracked + uncommitted work gets wiped by `git checkout`.
- Use `git mv` (not `mv`) for renames so git tracks them as renames, not delete+add.
- If state needs to be set aside, use `git stash --include-untracked` (never plain `git stash`).
- Never `git clean`, never `git checkout -- <untracked-path>`, never `git reset --hard <ref>`.

**Folder structure:**
- New artifacts go to canonical paths under `Company Docs/`, `Brand/`, or `Customers/`. See folder layout in the boilerplate file.
- Do NOT create new top-level folders without coordination.
- Do NOT create files at workspace root (only CLAUDE.md and README.md belong there).
- Do NOT touch `_demo-snapshot-*/` or `Snapshots/*/` — locked rollback artifacts.

**Cross-app boundaries:**
- Pathfinder chat owns: `Pathfinder/`, `pathfinder.*` schema, `pathfinder-ashy` Vercel project, Pathfinder Kanban.
- Metacron chat owns: `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- Marketing site code: cross-cutting; coordinate before changes.
- Don't write to the other chat's territory. Surface dependencies via `MEMORY/operator-todos/`.

**Kanban hygiene** (per `feedback_kanban_auto_update.md`):
- At start of each gate: card → "In Process" via `notion-update-page`
- At end: card → "Deployed" / "Review" / "Bug Fixes" / "Not Yet Started" per outcome
- Never to "Verified" — Kyle-only
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` footer to card content on merge

**Auto-merge criteria (ALL must be true):**
1. CI green (lint, typecheck, test, spec-references-check)
2. Local pre-flight: `npm ci && npm run typecheck && npm test` from `unicron-platform/`
3. No merge conflicts (`gh pr view --json mergeable` = MERGEABLE)
4. PR body has verbatim evidence of the gate's verification
5. Stream-specific eval/smoke per spec acceptance criteria
6. Additive migrations only (no DROP, no destructive ALTER)
7. Multi-Vercel state captured before merge (Pathfinder + metacron + unicron-systems projects)

**Auto-revert triggers (revert immediately if any):**
- Vercel deploy ERROR for the merge commit on metacron (your project)
- Smoke test fails post-deploy
- Previously-200 routes return 5xx
- `pathfinder.llm_calls` writes go to zero in 15 min (telemetry regression)
- Cost spike >3x baseline

**Auto-revert procedure:**
git checkout main && git pull origin main
git revert <merge-sha> --no-edit
git push origin main

**Hard halt conditions (wake Kyle):**
1. Production-data destruction risk
2. Auth boundary changes (middleware.ts, RLS policies, basic-auth)
3. Customer-facing commitment (billing, external messaging, modifying customer data submitted by them)
4. 3 consecutive auto-reverts (systemic issue)
5. Vercel error you cannot trace via `get_deployment_build_logs`
6. Schema collision with already-applied migrations on live Supabase
7. Token leak indicator in logs

**No numeric estimates** — no time estimates, no cost caps. Track cost in wake-up report; halt only on the explicit hard-halt list above.

**Tone for Kyle's review:**
- Tight, no fluff in chat reports
- Verbatim evidence in PR descriptions
```

## Endpoints to wire (Stream E shipped)

- `POST /api/coverage/goals` — create draft + queue estimate
- `GET /api/coverage/goals` — list (history grid source)
- `GET /api/coverage/goals/[id]` — detail + candidates
- `POST /api/coverage/goals/[id]/run` — approve + dispatch

## Bridge: dispatches ↔ goals

- On Dispatch: insert `unicron.agent_dispatches` row (`agent_name='coverage-expansion'`, `status='running'`), then `POST /api/coverage/goals`. Store `goal_id` in `result_payload.goal_id`.
- During run: poll Stream E sessions endpoint for `reasoning_log`. For each new line append to `unicron.agent_dispatch_events` (`event_type='reasoning'` or `'tool_call'`).
- On Verify: write `verified_by_user_id` + `verified_at` to dispatch row, then `POST /api/coverage/goals/[id]/run`. Phase 1F will additionally write `pathfinder.agent_verifications`; until 1F merges, leave a TODO comment referencing the operator-todo path filed in Phase 0.5.

## In-scope files

- `unicron-platform/src/views/agents/CoverageExpansionModal.tsx` (new) — uses `AgentModalShell`
- `unicron-platform/src/lib/agents/coverageExpansionAgent.ts` (new) — registry entry: name, icon, role, formSchema, resultRenderer, dispatchHandler
- `unicron-platform/src/components/agents/coverage/CoverageInputForm.tsx` (new) — vertical, geo (metro + radius slider; CSS placeholder if no map library yet), target lead count, signal keywords, lookback, optional budget cap
- `unicron-platform/src/components/agents/coverage/CoverageResultPanel.tsx` (new) — final source list, Tier 1 vs Tier 2 grouping, lead pool delta, Commit-to-production button
- `unicron-platform/src/lib/coverageClient.ts` (new — separate from `agentConsoleClient.ts`) — typed wrapper for the four Stream E endpoints
- `unicron-platform/src/lib/contracts/coverage.ts` (new) — wire types
- `unicron-platform/src/data/mocks.ts` (additive — `coverageDispatchesMock`, `coverageGoalsMock`)
- `unicron-platform/src/lib/agentRegistry.ts` (extend — register `coverage-expansion`; do NOT modify other registry entries)
- `unicron-platform/__tests__/agents/coverage/*.test.ts` (new — input form validation, dispatch flow mock, result panel render, history grid integration)

## Out of scope

- `AgentModalShell`, `AgentLiveExecution`, `AgentHistoryGrid`, `AgentResult`, `AgentInputForm`, `AgentTile`, `AgentsView` (Phase 0.5 owns)
- `agentConsoleClient.ts` (Phase 0.5 owns; do not modify)
- Source Onboarder modal (M2)
- Architect modal (M4)
- Cross-Pollination modal (M5)
- `pathfinder.agent_verifications` writes (Phase 1F)
- Map library introduction (CSS placeholder is fine; if real map needed, file an operator-todo and stop short of installing)

## UX requirements (per SPEC §5.1)

**Input panel:**
- Vertical dropdown (default `pathfinder-default`)
- Geography: metro + radius slider, OR list of metros for batch
- Target lead count (numeric)
- Signal keywords (chip input, suggestable)
- Lookback window (dropdown: 14d / 30d / 60d / 90d)
- Budget cap (optional; defaults to org config)

**Live panel:**
- Streaming candidate sources list — each: name, type (Tier 1/2), confidence, expected lead lift, status (queued / investigating / onboarding / done / failed)
- Map visualization (or CSS placeholder grid) showing candidate geographic positions

**Result panel:**
- Final source list with metadata
- Tier 1 onboarded auto-verified by Source Onboarder pass
- Tier 2 queued — operator clicks each → opens Tier2 review modal (M2 ships `Tier2ResolveModal` and exports it; M1 imports as a peer dep — file a coordination note if M2 hasn't merged yet, then ship M1 with placeholder Tier 2 link until M2 lands)
- Lead pool delta (before/after counts)
- "Commit to production" button (default yes)

**History grid:** prior dispatches; tile shows summary + cost + verification state; click → reload that run.

**Mock mode** (`VITE_COVERAGE_API_ENABLED=false`): full demoable flow against fixtures.

## Sprint-specific auto-merge criteria (additive to boilerplate)

- Modal renders end-to-end in mock mode (input → dispatch → live → result → verify)
- Real-mode dispatch creates `unicron.agent_dispatches` row + POSTs to `/api/coverage/goals` successfully
- Live panel receives at least one `agent_dispatch_events` row during a real-mode dispatch
- Verify action POSTs to `/api/coverage/goals/[id]/run`
- `metacron` Vercel preview deploy state=READY
- Existing views (Visualizer, Activity Feed, Architect Inbox, Add Source, Settings) render unchanged on the metacron preview deploy (screenshot grid in PR)

## Sprint-specific hard halts

- Coverage backend requires a `pathfinder.*` migration that didn't ship (surface to Kyle)
- Map picker library installation needed (file an operator-todo, ship CSS placeholder)
- `agent_dispatches` write fails with RLS error (surface — Phase 0.5 should have configured this)

## Multi-Vercel verification rule

Before declaring shipped, verify each independently — `metacron`, `unicron-systems`, `pathfinder` — most recent main deploy state=READY. Any one failing post-merge triggers auto-revert per boilerplate.

## Kanban hygiene

Card: **"Coverage Expansion Modal"** — RENAME existing "Coverage Expansion UI" card if present, else CREATE new card via `notion-create-pages` (`collection://07970e18-984a-4034-b491-cde76b9b1bad`).
- At run start: move to `In Process`
- At run end: `Deployed` / `Review` / `Bug Fixes` per outcome. NEVER `Verified`
- On merge, append: `Implemented at <commit-sha> · merged at <ISO timestamp>`

## PR description requirements

- Verbatim test output (count, names, pass/fail)
- `metacron` deploy URL + state for the merge commit
- Verbatim deploy state for `pathfinder` and `unicron-systems` main deploys (multi-Vercel regression check)
- Screenshots: input panel, live execution, result panel with Verify, history grid, mock vs real mode toggle
- Verbatim curl response from each of the four Stream E endpoints exercised on the preview deploy
- Verbatim `unicron.agent_dispatches` row + sample `agent_dispatch_events` rows from a real-mode smoke test
- Coordination note if M2's `Tier2ResolveModal` not yet shipped (placeholder in use)

## On completion

Append to `MEMORY/progress.md` under `## Stream M1 (Metacron) — 2026-05-02`:
- Files created
- Test count delta
- Outstanding TODOs (Tier 2 modal reuse contract with M2, Phase 1F verification write)
- Kanban card link + status post-merge

If anything in this prompt becomes ambiguous mid-run, halt and surface to Kyle in the same thread rather than guessing.

Begin.
