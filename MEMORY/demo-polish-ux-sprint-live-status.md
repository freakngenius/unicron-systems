# Demo Polish UX Sprint — live status

Append-only operational log. Newest entry on top. Tuesday 2026-05-05 demo deadline.

---

## 2026-05-02 15:42 UTC — Gate 1 implementation green; PR open pending

**Branch:** `demo-polish-ux/gate1-map-filters`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate1-map-filters/`
**Pre-merge tag:** to be pushed at `pre-merge/demo-polish-ux/gate1` → `origin/main` HEAD `793be48` before PR open.

### Scope shipped this gate

- **1C — demo-branch restriction.** `Pathfinder/lib/demo-branches.ts` exports `DEMO_BRANCH_IDS` (`hou-002`, `lax-006`, `nas-007`, `pit-008`) + `pickDemoBranches`. Migration `0109_demo_polish_ux_demo_branches.sql` additively inserts LA / Nashville / Pittsburgh into `pathfinder.branches` (existing 5 rows untouched, `ON CONFLICT DO NOTHING`). Seed JSON `public/seed-data/branches.json` augmented with the same three rows for local dev. Dashboard restricts `initialBranches` via `pickDemoBranches` so the BranchDock + map + cluster all only render the 4 demo cities.
- **1C default + 1D — filter defaults.** `lib/list-filters.ts` `DEFAULT_LIST_FILTER_STATE.range` flipped from `all` → `within`; `minScore` flipped from `0` → `50`. Snapping helper now returns `null` for non-finite input so the parser substitutes the default instead of forcing `0`. Tests updated; new tests cover both defaults + the explicit-widening case (`range=all`, `min_score=0`).
- **1B — right-panel branch filter.** `lib/dashboard-filters.ts` exports `applyBranchFilter(preBranchFiltered, selectedBranchId)`. Dashboard threads `selectedBranchId` into the pipeline so clicking Houston narrows the right rail + cluster markers to Houston-attached leads. "See All" (= `selectedBranchId === null`) restores the pre-branch-filtered set.
- **1E — unified filter pipeline.** Same `lib/dashboard-filters.ts` exports `applyNonBranchFilters` + `groupCountsByBranch`. The BranchDock per-branch counts, the right-rail "X of Y" counter, the ProjectList input set, the map cluster markers, and the warm-intro polylines all read from the single pre-branch / with-branch fork. Per-branch dock counts intentionally do NOT apply branch selection (so selecting Nashville does not zero Houston's count and switching stays possible).
- **1A — popup click behavior.** Verified via code-read: `BranchMarkerGM.onClick → handleSelectBranch → setSelectedBranchId + setFocusKey + setCardHidden(false)` is wired correctly in `dashboard.tsx`. The reason Kyle saw "nothing happens" was the absence of the right-rail filter (1B), now wired. AnchoredBranchCard renders when `!crossPoll && selectedBranch`. Browser confirmation deferred to Vercel preview screenshots in the PR body.

### Verification evidence

```
$ pnpm typecheck (Pathfinder/)        → 0 errors
$ pnpm lint (Pathfinder/)             → ✔ no warnings or errors
$ pnpm test (Pathfinder/)             → 88 files / 863 passed | 24 skipped
$ pnpm vitest run tests/dashboard-filters.test.ts tests/list-filters.test.ts
                                       → 24 passed (2 files)
$ npm run typecheck (repo root)       → 0 errors
$ npm test (repo root)                → 10 passed | 2 failed (pre-existing,
                                         tests/integration/mycelium.test.ts +
                                         tests/unit/env.test.ts both depend on
                                         a .env.local that's not seeded in the
                                         worktree; same failures on
                                         origin/main without this branch's
                                         changes — confirmed via stash + replay.)
```

### Hard-halt items not tripped

- No schema changes beyond additive (only `INSERT … ON CONFLICT DO NOTHING`).
- No auth boundary changes.
- No HubSpot scope expansion (Gate 4 territory; not touched).
- Houston flagship (`hou-002`) preserved — included in `DEMO_BRANCH_IDS`, projects pointing at it stay attached.
- Cross-pollination row count untouched (Gate 2 territory).
- agent_runs writes untouched (no agent code modified).

### Outstanding before PR-merge

1. Apply migration `0109` to live Supabase via `apply_migration` MCP (additive, idempotent — `ON CONFLICT DO NOTHING`).
2. Push pre-merge tag `pre-merge/demo-polish-ux/gate1` → `origin/main` HEAD.
3. Push branch + open PR with before/after screenshots from Vercel preview.
4. Confirm Pathfinder Vercel preview READY.
5. Auto-merge once CI green + multi-Vercel state captured.
6. Auto-revert monitor for 10 min post-merge.

### Open routing question for Kyle (operator-todo)

`pathfinder.projects.nearest_branch_id` for the 200+ projects currently attached to Phoenix / Atlanta / Chicago / Seattle is unchanged. Those projects still appear on the map / right-rail under "See All" (no branch selected) but won't bucket under any of the 4 demo branches in the dock. **GeoMapper backfill to repoint orphan projects to the new lax-006 / nas-007 / pit-008 IDs is deferred** — captured as Gate 1.5 candidate. For the Tuesday demo, this matches the Houston-headline-script narrative ("Houston where federal data is rich; other three thinner").

### Cost

Incidental — no LLM calls executed this gate. Reconnaissance + code edits + local pre-flight only.

---
