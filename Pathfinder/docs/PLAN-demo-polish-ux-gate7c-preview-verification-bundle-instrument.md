# PLAN — demo-polish-ux/gate7c-preview-verification-bundle-instrument

Spec: `Company Docs/Specs/SPEC - Lead Detail Page UX Redesign.md`
Predecessor: Gate 7B (PR #98 merged at `origin/main` `13427ad`)
Branch: `demo-polish-ux/gate7c-preview-verification-bundle-instrument`
Worktree: `Pathfinder-worktrees/demo-polish-ux-gate7c-preview-verification-bundle-instrument/`
Test baseline: 1043/1043 (post Gate 7B); hard halt if `<1043`

## Gate 7C scope

Verification + wiring gate. Two deferred-from-7B items + three primary 7C items.

### 1. ScoreBreakdown per-component DB read (deferred from 7B)

**Storage decision:** `pathfinder.score_components` table does NOT exist; the Ranker writes only `composite_score` to `projects.score`. The breakdown (`geo_score`, `stage_score`, `customer_score`) is produced by `lib/scoring.ts:scoreProject()` but not persisted.

**Path forward (7C — no schema work):** server component re-runs `scoreProject(...)` with the project + branches + customers (fetched alongside the existing project read). Pass the resulting `ScoringOutput` to LeadDetail → ScoreBreakdown as a `scoringBreakdown` prop. Pure function over small data; latency cost ≈ one extra `supabase.from('branches').select('*')` + `supabase.from('customers').select('*')` per page load.

**ScoreBreakdown render** (per spec § 7):
- Collapsed default — composite score only (today's behavior)
- Expanded — three rows: `Geographic fit · score · 50% weight · contribution`, `Stage · score · 30% weight · contribution`, `Customer adjacency · score · 20% weight · contribution`. Total row at bottom.

**Future migration path** (deferred): persist the breakdown columns (`geo_score`, `stage_score`, `customer_score`) on `pathfinder.projects` so ScoreBreakdown reads directly without recompute. Tracked as a follow-up operator-todo (added below).

### 2. DecisionBar verdict-line ≤200 ms (deferred from 7B → SKIPPED with rationale)

Spec acceptance criterion #4. **Speed Insights / Web Vitals NOT wired in this codebase** (verified — no `@vercel/speed-insights` or `web-vitals` package; no instrumentation hook in `next.config.js`). Per operator dispatch, **skip the criterion** rather than wire Speed Insights inside this gate.

**What 7C does ship:**
- Add `performance.mark('decision-bar-verdict-rendered')` inside DecisionBar's render effect so when Speed Insights is added later it can pick up the mark without a code change.
- Add a unit test asserting DecisionBar's render is fully synchronous (no Suspense boundary, no async data hook, all data comes from props). This validates the underlying constraint behind the 200 ms criterion — DecisionBar can't possibly be slow because it doesn't wait on anything.
- PR body + status doc: spec acceptance #4 marked as `deferred-pending-speed-insights`. Filed as a separate operator-todo to wire Speed Insights post-demo.

### 3. Bundle-size delta capture (primary 7C scope; Gate 6 wontfix premise)

Run `pnpm build` twice in the worktree:
- Baseline: `LEAD_DETAIL_REDESIGN` unset (the prod render path; default-off branch in LeadDetail.tsx renders the legacy layout)
- Flag-on: `LEAD_DETAIL_REDESIGN=1 pnpm build`

Capture Next.js build output's per-route size for `/leads/[projectId]`. Compute delta. **Hard halt if >100 KB** (Gate 6 concern — the wontfix premise was "we won't do further bundle-size work IF redesign doesn't blow the budget").

Note: Next.js's per-route metric is "First Load JS" which includes shared chunks. The relevant comparison is the page-specific chunk plus any newly-imported components. New components (QuickFactsGrid, DecisionBar, CrossPollinationCard, etc.) are tree-shaken out when flag is unset, so the baseline build should NOT include them.

If `process.env.LEAD_DETAIL_REDESIGN` is read at build time (Server Component at the page route), the flag value during `pnpm build` does affect what the server-rendered output contains. But the imports at the top of `LeadDetail.tsx` always execute regardless of the runtime branch — so all 7 new components ship in the JS bundle whether the flag is on or off. The "flag-off" build IS the worst case for bundle size; we measure it once and that's the prod number.

**Refined plan:** single build, measure delta vs. `origin/main` `13427ad` baseline (which doesn't have any of the new components imported). Compute via:
1. `git checkout origin/main 13427ad` in a temp worktree → `pnpm build` → capture `/leads/[projectId]` size as **baseline**
2. Current worktree (with all 7 new components imported into LeadDetail.tsx) → `pnpm build` → capture as **with-redesign**
3. Delta = with-redesign − baseline

Practical shortcut: instead of a second worktree, compare against last 7B PR's build output if recorded. It wasn't, so we run the comparison once here.

### 4. Houston flagship preview verification (Kyle action item — checklist deliverable)

Preview-deploy verification requires Vercel preview env access (Kyle's auth) + browser session. I prepare the checklist; Kyle executes.

**Pre-flight (Kyle):**
- `vercel env add LEAD_DETAIL_REDESIGN` → value `1` → environment `preview` → branch `demo-polish-ux/gate7c-preview-verification-bundle-instrument`
- Wait for Vercel preview deploy to finish (auto-triggered by the push)
- Open the preview URL

**Verification beats (Kyle captures screenshots):**
1. Houston flagship — `/pathfinder/leads/sam.gov:TXDOT-I45-2026-001` desktop full page → `gate7c-houston-flagship-desktop-full.png`
2. Houston flagship — Quick Facts grid close-up → `gate7c-houston-flagship-quick-facts.png`
3. Houston flagship — Cross-Pollination card with Brasfield + Big-D EXACT chips → `gate7c-houston-flagship-cross-poll.png` (acceptance criterion #2)
4. Houston flagship — Decision Bar + Recommended Action → `gate7c-houston-flagship-decision-bar.png` (acceptance criteria #3 + #4)
5. Houston flagship mobile (≤640 px viewport) — Quick Facts stacks to 1 col → `gate7c-houston-flagship-mobile.png` (acceptance criterion #8)
6. Pittsburgh sparse — empty-state proof → `gate7c-pittsburgh-sparse-empty-states.png`
7. Rejected lead — muted state + reason banner → `gate7c-rejected-lead-state.png`
8. Enrichment-pending lead — request banner visible → `gate7c-enrichment-pending-banner.png`

**Capture target:** `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/`

### 5. Screenshot directory + README

Create `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README.md` listing the 8 capture beats + a `.gitkeep` for the directory.

## File scope

New / modified:
- `Pathfinder/app/leads/[projectId]/page.tsx` — fetch branches + customers; compute ScoringOutput; pass as prop
- `Pathfinder/components/lead/LeadDetail.tsx` — extend props with `scoringBreakdown`; pass to ScoreBreakdown
- `Pathfinder/components/lead/ScoreBreakdown.tsx` — full impl with breakdown rows
- `Pathfinder/components/lead/DecisionBar.tsx` — add `performance.mark` instrumentation
- `Pathfinder/tests/score-breakdown.test.tsx` — new
- `Pathfinder/tests/decision-bar.test.tsx` — extend with synchronous-render assertion
- `Pathfinder/docs/PLAN-demo-polish-ux-gate7c-preview-verification-bundle-instrument.md` — this file
- `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README.md` — new
- `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/.gitkeep` — new

Out of scope:
- `pathfinder.score_components` migration (deferred — separate follow-up todo)
- Speed Insights / Web Vitals package install + instrumentation (deferred — separate follow-up todo)
- Production flag flip (Gate 7D)
- Vercel preview env update — Kyle's hands

## Verification plan

- `pnpm typecheck` → 0 errors
- `pnpm lint` → clean
- `pnpm test` → ≥ 1043 + new tests
- `pnpm build` → success; capture per-route size delta
- Baseline build for delta computation: clean checkout of `origin/main` `13427ad` (separate temp dir or stash trick)

## Hard halts

Wake Kyle if:
- Bundle delta on `/leads/[projectId]` > 100 KB (Gate 6 wontfix premise breaks)
- ScoreBreakdown re-compute introduces a hot-path regression (typecheck or build fails)
- Test count drops below 1043
- ScoreBreakdown computation throws on a real lead (e.g., project with null lat/lon)
- Houston flagship preview screenshots show wrong values vs. unit-test fixture (Kyle reports during capture)

## Commit checkpoints

1. PLAN doc
2. ScoreBreakdown full + page route plumbing + tests
3. DecisionBar performance.mark + synchronous-render test
4. Bundle-size measurement record (live-status update + bundle-stats.md)
5. Screenshot README + .gitkeep
6. Kanban + status doc updates
