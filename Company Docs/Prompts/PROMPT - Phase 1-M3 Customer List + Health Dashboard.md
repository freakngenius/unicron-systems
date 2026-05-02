# PROMPT — Phase 1 / Stream M3: Customer List + Per-Customer Health Dashboard

Paste-ready Claude Code launch prompt. Generated 2026-05-02 post-Phase-0.5 close-out (PR #75 merged at `4f5c3d6`). Boilerplate-baked version. Orthogonal to the agent modals (M1, M2, M4, M5) — this is a multi-tenant view, not an agent. Parallel-safe with all four agent-modal streams.

## Goal

Add the operator surfaces required before Pathfinder onboards customer #2: a multi-tenant customer list + a per-customer health dashboard showing lead volume, scoring distribution, outreach delivery rate, and recent agent errors. Pairs the two Metacron-Kanban cards "Customer list view (multi-tenant operator)" + "Per-customer health dashboard" into one sprint.

## Authoritative spec

No spec section directly — `00 - METACRON CONTEXT.md` §4 lists this as a Not-Yet-Started priority. Treat as multi-tenant operator view; no agent registry registration.

## Read first (in order)

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md`
2. `Company Docs/Context/00 - METACRON CONTEXT.md`
3. `MEMORY/audit-unicron-platform.md`
4. `Pathfinder/supabase/migrations/` (read-only — find org / agent_log / outreach / lead tables)
5. `unicron-platform/src/lib/supabase.ts`
6. `unicron-platform/src/views/` (existing view conventions)

## Phase 0.5 baseline

- main HEAD: `4f5c3d6`
- Agent console foundation shipped — does NOT directly affect M3 (no agent registry registration here)
- Routing: tab-state. M3 adds a `Customers` tab and `Customer detail` sub-view via component state
- `unicron.agent_dispatches` table exists in production Supabase

## Hard constraints

```
## Hard constraints

**File system:**
- DO NOT delete files. Never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or any operation that wipes uncommitted work.
- If a file appears stale or duplicate, MOVE it to `_archive/<descriptive-name>` rather than delete.
- Build artifacts exempt; source-of-truth content NEVER deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files.
- COMMIT before any branch switch, pull, or stash.
- Use `git mv` for renames.
- `git stash --include-untracked` if state needs setting aside.
- Never `git clean`, `git checkout -- <untracked-path>`, `git reset --hard <ref>`.

**Folder structure:**
- New artifacts to `Company Docs/`, `Brand/`, `Customers/` per layout.
- No new top-level folders without coordination.
- No files at workspace root.
- Do not touch `_demo-snapshot-*/` or `Snapshots/*/`.

**Cross-app boundaries:**
- Metacron chat owns: `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- READ pathfinder.* schema; do NOT WRITE to it. Any pathfinder schema gap surfaces as `MEMORY/operator-todos/`.

**Kanban hygiene:**
- Start: → "In Process". End: → "Deployed" / "Review" / "Bug Fixes" / "Not Yet Started". Never "Verified".
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` on merge.

**Auto-merge criteria:**
1. CI green
2. Local: `npm ci && npm run typecheck && npm test` from unicron-platform/
3. PR mergeable
4. Verbatim evidence in PR body
5. Stream-specific smoke
6. Additive migrations only
7. Multi-Vercel state captured

**Auto-revert triggers:**
- Vercel deploy ERROR on metacron for merge commit
- Smoke test fails post-deploy
- Previously-200 routes 5xx
- `pathfinder.llm_calls` writes zero in 15 min
- Cost spike >3x baseline

**Auto-revert procedure:**
git checkout main && git pull origin main
git revert <merge-sha> --no-edit
git push origin main

**Hard halts:**
1. Production-data destruction
2. Auth boundary changes
3. Customer-facing commitment
4. 3 consecutive auto-reverts
5. Untraceable Vercel error
6. Schema collision
7. Token leak indicator

**No numeric estimates.** Tight tone, verbatim PR evidence.
```

## Data sources

Reads from `pathfinder.*` schema (Supabase Realtime + RPC). Likely tables (verify schema before query):
- `pathfinder.organizations` (or whatever org list lives in — may be hardcoded constant `'zedcor'` for Phase 2; if no table exists, render single-row "Zedcor" view + scaffold for future)
- `pathfinder.agent_log` (run history, errors)
- `pathfinder.leads` (volume + score distribution)
- `pathfinder.outreach_drafts` and `pathfinder.outreach_sends` (delivery rate)
- `pathfinder.lead_actions` (engagement signals)

If multi-org table absent: render Zedcor as single row + add `MEMORY/operator-todos/2026-05-XX-pathfinder-needs-org-table.md` with the request, do not block on it. Continue building.

## In-scope files

- `unicron-platform/src/views/CustomersView.tsx` (new) — customer grid
- `unicron-platform/src/views/CustomerDetailView.tsx` (new) — per-customer health dashboard
- `unicron-platform/src/lib/customersClient.ts` (new) — supabase queries for org list + per-org rollups
- `unicron-platform/src/lib/contracts/customers.ts` (new) — types
- `unicron-platform/src/components/HealthMetricCard.tsx` (new) — reusable metric tile
- `unicron-platform/src/components/MiniSparkline.tsx` (new) — lightweight inline trend visual (canvas, no chart lib)
- `unicron-platform/src/data/mocks.ts` (additive — `customersMock`)
- `unicron-platform/src/components/Topbar.tsx` (or equivalent — add `Customers` tab; surgical addition)
- `unicron-platform/src/App.tsx` (extend — wire the Customers tab to render the view; tab-state pattern matching Phase 0.5 Agents tab)
- `unicron-platform/__tests__/customers/*.test.ts` (new — client mocks + view render)

## Out of scope

- `pathfinder.*` migrations (file operator-todo if missing data; do not author)
- Agent registry (`agentRegistry.ts`, agent modals — those are M1/M2/M4/M5)
- RBAC enforcement (Phase 2 single-org doesn't need it; user-management RBAC is a separate kanban card)
- Audit log for view-access (separate kanban card)

## UX requirements

1. **Customer list (CustomersView)**: grid cards per org. Each card shows: org name, status badge (active/onboarding/paused), 7d lead volume, 7d outreach sent, 7d errors. Click → CustomerDetailView.
2. **Customer detail (CustomerDetailView)**: top row of 4 metric tiles (lead volume 7d/30d, score-≥80 rate, outreach delivery rate, error rate). Below: 30d sparkline of lead volume; 30d sparkline of error rate; recent 10 agent_log entries (compact). Right rail: source list (active sources for that org). Top-right: "Open Pathfinder for {org}" link to `unicron.systems/pathfinder/?org={slug}` (read-only handoff to customer app).
3. **Empty state** (single-org Phase 2): show Zedcor as the only card with caption "Multi-tenant view scaffolded; second customer coming after pilot."
4. **Mock mode**: full demoable UI when `VITE_PATHFINDER_DB_ENABLED=false` reading from `customersMock`.
5. **Loading + error states**: skeleton tiles, retry button on error.

## Sprint-specific auto-merge criteria

- Customer list + detail render in mock mode
- Real-mode renders against actual `pathfinder.*` data (Zedcor) — at minimum lead-volume rollup query succeeds
- `metacron` Vercel preview deploy state=READY
- No regression in `pathfinder` or `unicron-systems` main deploys
- Existing views (Visualizer, Activity Feed, Architect Inbox, Add Source / Source Onboarder Modal if M2 merged, Settings, Coverage if M1 merged) render unchanged

## Sprint-specific hard halts

- pathfinder.* RLS denies anon SELECT on critical tables (need service-role; surface env config request)
- Org table doesn't exist AND `unicron.organizations` proxy table doesn't exist either (surface, do not write a migration without Kyle's approval)
- Any pathfinder schema query attempt that mutates (must be SELECT-only — fail closed)

## Multi-Vercel verification rule

`metacron`, `unicron-systems`, `pathfinder` — all main deploys state=READY post-merge. Auto-revert on any regression.

## Kanban hygiene

TWO cards on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`):
- **"Customer list view (multi-tenant operator)"**
- **"Per-customer health dashboard"**

- At run start: move BOTH to `In Process`
- At run end: move BOTH to `Deployed` / `Review` / `Bug Fixes` per outcome
- NEVER `Verified`
- On merge, append to BOTH cards: `Implemented at <commit-sha> · merged at <ISO timestamp>`

## PR description requirements

- Verbatim test output
- `metacron` deploy URL + state
- Multi-Vercel state (all three projects)
- Screenshots: customer list + detail in mock mode
- Screenshots: customer list + detail against real Supabase data (Zedcor)
- Verbatim sample query output for one rollup (lead volume 7d) proving RLS + query shape
- Any `MEMORY/operator-todos/` files created for missing pathfinder schema

## On completion

Append to `MEMORY/progress.md` under `## Stream M3 (Metacron) — 2026-05-02`:
- Files created
- Test count delta
- Schema gaps surfaced (org table, etc.)
- Open question about operator RBAC (separate card)
- Kanban movements

Halt and surface only on hard halts or completion.

Begin.
