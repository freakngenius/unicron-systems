# PROMPT — Phase 0.5: Agent Console Foundation

Paste-ready Claude Code launch prompt. Generated 2026-05-02 (revised post-Phase-0 close-out and post-boilerplate adoption). Run AFTER Phase 0 (`metacron` Vercel project setup, PR #72) is merged and both `unicron-systems` + `metacron` production deploys are READY. Run BEFORE any Phase 1 stream.

## Goal

Ship the foundation every Phase 1 agent modal will build on: `unicron.*` schemas for agent dispatch records and live execution events, common modal shell components, generic Realtime subscription, history grid pattern, agent registry. No agent-specific UI in this sprint.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` — read end-to-end before touching code. This sprint implements §4 (common pattern) + §8 (schema) + §9 (UI architecture).

## Read first

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md` — canonical safety and workflow constraints. Hard constraints block from this file is copied verbatim below.
2. `Company Docs/Specs/SPEC - Agent Console (Metacron).md`
3. `Company Docs/Context/00 - METACRON CONTEXT.md`
4. `MEMORY/audit-unicron-platform.md`
5. Existing `unicron-platform/src/views/ArchitectInbox.tsx` and `AddSourcePanel.tsx` for current view conventions
6. Existing `unicron-platform/src/lib/supabase.ts` for the Realtime subscription pattern
7. Existing `Pathfinder/supabase/migrations/` (read-only, for migration conventions)

## Phase 0 baseline (do not regress)

Production state confirmed before this sprint starts:
- `metacron` Vercel project: `prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz` (team `team_ox5qAXv7jA6yFUCoOuXQvSfj`), framework Vite, Root Directory `unicron-platform`, deploying to `metacron.unicron.systems`
- `unicron-systems` Vercel project: production main deploy READY at commit `793be48` (PR #72)
- `pathfinder` Vercel project: production main deploy READY (Pathfinder demo polish + connector framework shipped)
- Three Vercel projects, three independent deploy chains. Multi-Vercel rule applies.

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
- New artifacts go to the canonical paths under `Company Docs/`, `Brand/`, or `Customers/`. See folder layout in the boilerplate file.
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
- At end: card → "Deployed" (shipped + merged + deployed), "Review" (PR open awaiting human merge), "Bug Fixes" (parked needing fix), or "Not Yet Started" (deferred)
- Never to "Verified" — Kyle-only
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` footer to card content on merge

**Auto-merge criteria (ALL must be true):**
1. CI green (lint, typecheck, test, spec-references-check)
2. Local pre-flight: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` from Pathfinder/ AND repo root (or `npm ci && npm run build` for unicron-platform / Marketing Site, which use npm)
3. No merge conflicts (`gh pr view --json mergeable` = MERGEABLE)
4. PR body has verbatim evidence of the gate's verification
5. Stream-specific eval/smoke per spec acceptance criteria
6. Additive migrations only (no DROP, no destructive ALTER)
7. Multi-Vercel state captured before merge (Pathfinder + metacron + unicron-systems projects)

**Auto-revert triggers (revert immediately if any):**
- Vercel deploy ERROR for the merge commit on YOUR project (Pathfinder agents revert on Pathfinder; Metacron on metacron). Pre-existing unicron-systems ERROR (Issue #48 era) is acceptable; only revert on regression from your project.
- Smoke test fails post-deploy
- Previously-200 routes return 5xx
- `pathfinder.llm_calls` writes go to zero in 15 min (telemetry regression)
- Inngest function dropped from registry
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
6. Eval threshold breach where the fix isn't obvious from misses
7. Schema collision with already-applied migrations on live Supabase
8. Token leak indicator in logs (regex match on common token formats)
9. Cross-tenant data leakage in audit log
10. Customer-facing message sent to wrong channel/user

**No numeric estimates** (per `feedback_prompts_no_estimates_or_caps.md`):
- No time estimates ("~3 hours", "1-2 weeks")
- No cost caps ("$40 budget", "halt at $20")
- Track cost in wake-up report; halt only on the explicit hard-halt list above

**Tone for Kyle's review** (per `feedback_token_rigor.md`):
- Tight, no fluff in chat reports
- Verbatim evidence in PR descriptions
- Surface escalations via Slack webhook (or fallback to `MEMORY/<sprint>-notifications.md`)
```

## Schema (unicron.* only — pathfinder.agent_verifications shipped in Phase 1F)

Migration file: `unicron-platform/supabase/migrations/0010_agent_console.sql` (new — if `unicron-platform/supabase/migrations/` does not exist, create the directory; this is the canonical home for `unicron.*` migrations).

Tables per SPEC §8:
- `unicron.agent_dispatches` (id, agent_name, customer_org_id, dispatched_by_user_id, input_payload, status, result_payload, rejection_reason, verified_by_user_id, verified_at, cost_usd, duration_ms, agent_run_id, parent_dispatch_id, created_at, updated_at) — `status` CHECK in (`queued`, `running`, `awaiting_review`, `verified`, `rejected`, `failed`)
- `unicron.agent_dispatch_events` (id, dispatch_id, event_type, payload, created_at) — `event_type` CHECK in (`reasoning`, `tool_call`, `tool_result`, `partial_output`, `decision`, `error`)

Indexes per SPEC §8 verbatim. RLS: operator-team-only read/write; mirror existing `unicron.*` RLS conventions (auth.email() in OPERATOR_EMAILS allowlist, or whatever the project's existing convention is — check `Pathfinder/supabase/migrations/` for the pattern).

**Do NOT create `pathfinder.agent_verifications`.** That's owned by Pathfinder chat. File an operator-todo (see "Coordination request" below) and let Phase 1F pick it up.

Apply the migration via Supabase MCP `apply_migration` against the production project. Capture the verbatim response in the PR body.

## In-scope files

### Schema
- `unicron-platform/supabase/migrations/0010_agent_console.sql` (new)
- (if needed) `unicron-platform/supabase/migrations/.gitkeep` or directory create

### Shell components (`unicron-platform/src/components/agent-console/`)
- `AgentModalShell.tsx` (new) — header (icon, name, role, status pill, cost ticker, recent-runs count), footer slot, layout
- `AgentInputForm.tsx` (new) — generic form wrapper consuming a per-agent form schema (typed schema, no zod dependency unless already present in package.json)
- `AgentLiveExecution.tsx` (new) — Supabase Realtime subscription on `agent_dispatch_events` for a given `dispatch_id`; renders streaming activity log filtered by event_type
- `AgentResult.tsx` (new) — generic result panel with Verify / Reject / Verify-with-edits actions; consumes per-agent result-renderer slot
- `AgentHistoryGrid.tsx` (new) — tile-based history with filter (status, date) + sort (cost, date, status)
- `AgentTile.tsx` (new) — single history tile (timestamp, summary, status, cost, verification state)

### Client + types
- `unicron-platform/src/lib/agentConsoleClient.ts` (new) — `createDispatch`, `listDispatches`, `getDispatch`, `verifyDispatch`, `rejectDispatch`, `appendEvent`, `subscribeToEvents`
- `unicron-platform/src/lib/contracts/agentConsole.ts` (new) — wire types mirroring `unicron.agent_dispatches` schema
- `unicron-platform/src/lib/agentRegistry.ts` (new) — central catalog: `{ name, role, icon, route, formSchema?, resultRenderer?, dispatchHandler? }`. Empty registry initially; Phase 1 streams append.

### Routing
- `unicron-platform/src/views/AgentsView.tsx` (new) — `/agents` route; grid of agent cards from registry; click → modal route
- `unicron-platform/src/App.tsx` (extend — add `/agents` and `/agents/:name` routes; do not refactor existing routes)
- `unicron-platform/src/components/Nav.tsx` or equivalent (Agents tab — surgical addition, do not refactor)

### Tests
- `unicron-platform/__tests__/agent-console/shell.test.tsx`
- `unicron-platform/__tests__/agent-console/history-grid.test.tsx`
- `unicron-platform/__tests__/agent-console/client.test.ts`
- `unicron-platform/__tests__/agent-console/realtime-smoke.test.ts`

### Coordination request
- `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md` (new) — describes `pathfinder.agent_verifications` migration + Realtime subscription requirement for Phase 1F. Includes verbatim SQL from SPEC §8 for the Pathfinder chat to execute.

## Out of scope

- Any agent-specific input form, result renderer, or modal (those are Phase 1 streams M1, M2, M4, M5)
- `pathfinder.*` migrations (Pathfinder chat owns)
- Any change to existing `AddSourcePanel.tsx`, `ArchitectInbox.tsx`, `CoverageView.tsx`, etc. (Phase 1 streams refactor those into modals)
- Living System bridge (Phase 1F)
- Per-agent icons / personality (Phase 3 polish)
- Customer list view (Phase 1 / M3, orthogonal — not an agent)

## Sprint-specific auto-merge criteria (additive to boilerplate)

Beyond the boilerplate's seven auto-merge gates, this sprint must additionally satisfy:
- Migration applies cleanly on the production Supabase via `apply_migration` (verbatim response in PR)
- `metacron` Vercel preview deploy on this branch reaches state=READY before merge
- `/agents` route renders empty registry state ("no agents registered yet — Phase 1 streams ship them")
- Realtime smoke test passes: insert a row in `unicron.agent_dispatch_events` via SQL → `AgentLiveExecution` test harness receives it within 3 seconds
- Existing `Architect Inbox` and `Add Source UI` render unchanged on the metacron preview deploy (screenshot proof in PR)

## Sprint-specific hard halts (additive to boilerplate)

- RLS policy can't be defined without service-role context (surface to Kyle)
- Realtime channel auth requires JWT custom claim that's not configured (surface)
- Migration directory location ambiguous — if `unicron-platform/supabase/` does not exist and creating it conflicts with anything, surface for Kyle to confirm placement
- Existing Architect Inbox tests fail post-merge (auto-revert)

## Multi-Vercel verification rule

Before declaring this sprint shipped, verify each independently:
- `metacron` (prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz) most recent main deploy state=READY
- `unicron-systems` most recent main deploy state=READY (no regression)
- `pathfinder` most recent main deploy state=READY (no regression)

Any one failing post-merge triggers auto-revert per boilerplate.

## Kanban hygiene

CREATE new card on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`) at run start via `notion-create-pages`:
- Title: **"Agent Console foundation (shell + schemas)"**
- Stage: `In Process`

At run end: move to `Deployed` / `Review` / `Bug Fixes` per outcome. NEVER `Verified`.

On merge, append to card content: `Implemented at <commit-sha> · merged at <ISO timestamp>`.

## PR description requirements

- Verbatim migration SQL + Supabase MCP `apply_migration` response
- Verbatim test output (count, names of new tests, pass/fail)
- `metacron` deploy URL + state for the merge commit (verbatim from `list_deployments`)
- Verbatim deploy state for `pathfinder` and `unicron-systems` main deploys (multi-Vercel regression check)
- Screenshot of `/agents` empty state on the metacron preview deploy
- Verbatim Realtime smoke test output (insert event + receive)
- Reference to coordination operator-todo for Pathfinder chat (file path)
- Verbatim curl response from `https://metacron.unicron.systems/agents` returning HTTP 200 (or auth wall expected response)

## On completion

Append to `MEMORY/progress.md` under `## Stream M0.5 (Metacron) — 2026-05-02`:
- Migration applied (table names + row counts)
- Components created (file list)
- Coordination request filed (operator-todo path)
- Outstanding TODOs for Phase 1 streams to consume
- New Metacron-Kanban card link (status post-merge)

Move the Metacron-Kanban card to `Deployed` (or `Review` if PR is awaiting human merge).

If anything in this prompt becomes ambiguous mid-run, halt and surface to Kyle in the same thread rather than guessing.

Begin.
