# Demo Polish UX Sprint — live status

Append-only operational log. Newest entry on top. Tuesday 2026-05-05 demo deadline.

---

## 2026-05-02 21:00 UTC — Gate 1 merged + Vercel deploy green

PR #74 squash-merged at `c463899`. Migration `0109` applied (no-op against live — ON CONFLICT DO NOTHING; live `pathfinder.branches` already at 8 rows). Post-merge CI all green; Vercel deploy on main READY. Auto-revert monitor `bt92yv035` exited cleanly.

---

## 2026-05-02 21:20 UTC — Gate 2 implementation green; PR open pending

**Branch:** `demo-polish-ux/gate2-crosspoll`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate2-crosspoll/`
**Pre-merge tag:** `pre-merge/demo-polish-ux/gate2` → `origin/main` HEAD `c463899` (post-Gate-1 squash) — to be pushed before PR open.

### Architecture decision

Per Kyle: **Option 2** (Path B) — dashboard reads `pathfinder.lead_cross_pollination` directly instead of denormalizing into the multi-tenant `pathfinder.customers` table.

The two cross-pollination data layers stay separate:
- **Multi-tenant `customers` (30 rows)** — facility relationships (universities, hospitals, transit agencies). Drives `projects.warm_for_customer_id` via `scoreProject`. Untouched by this gate.
- **Zedcor `lead_cross_pollination` (12 rows)** — contractor warm-intro signals (Brasfield & Gorrie, Big-D, etc., matched against the 1855 `zedcor_customer_sites`). Now drives the dashboard's cross-pollination filter + warm-intro overlay (Path B).

Conflating risked nudging `scoreProject`'s adjacency math (it reads `customers`); separation keeps each layer's semantics clean and mirrors what the lead detail page (`ZedcorRelationshipContext`) already does.

### Scope shipped this gate

- **`lib/cross-poll-fetch.ts`** (new) — server-side fetcher: pulls `lead_cross_pollination` rows + joins each `customer_canonical` against `zedcor_customer_sites` (active sites preferred; updated_at as tiebreak) for a representative customer lat/lon. `indexMatchesByLead` collapses multi-match leads to the highest-confidence match.
- **`app/page.tsx`** — fourth parallel fetch alongside branches/customers/projects; passes `initialCrossPollMatches` down to `<Dashboard />`.
- **`lib/types.ts`** — new `CrossPollMatch` interface.
- **`lib/dashboard-filters.ts`** — `applyNonBranchFilters` accepts optional `crossPollLeadIds`. In cross-poll mode the filter narrows to that set, **bypasses minScore + range**, and still respects the source filter. Legacy `warm_for_customer_id` fallback retained for SSR / non-Zedcor callers.
- **`components/dashboard.tsx`** — builds `xpollByLeadId` Map, threads `xpollLeadIds` into the filter pipeline, rewrites `warmLines` to read from match's `customer_lat/lon` instead of multi-tenant `customers`. Customer pins placed at matched site coords (deduped by canonical name). Polylines pass `tier: match.match_layer` for differentiated styling.
- **`components/map/WarmIntroLines.tsx`** — per-line tier prop. Exact = solid magenta full-opacity stroke. Fuzzy = dashed reduced-opacity (prior styling).
- **`components/MapLegend.tsx`** — adds two line-tier rows when crossPoll mode is active: "Exact match" + "Fuzzy match".

### Demo signature beats — verified against live data

3 exact-match cross-poll rows in production (`pathfinder.lead_cross_pollination`):
- Brasfield & Gorrie LLC GSA award (`47PE…0004`) — canon=brasfield gorrie, exact, 1.00, primary_branch=Jacksonville, score=15
- BIG-D CONSTRUCTION CORP GSA award (`47PJ…0045`) — canon=big-d construction, exact, 1.00, primary_branch=Phoenix, score=15
- Brasfield & Gorrie LLC GSA award (`47PF…0017`) — canon=brasfield gorrie, exact, 1.00, primary_branch=Jacksonville, score=62

All 3 demo signature exact matches present. Intentional minScore-bypass behavior so they surface despite scores well below the default 50 floor. Total: 3 exact + 9 fuzzy = 12 leads in cross-poll filter view (matches Kyle's PR-body assertion threshold).

### Verification evidence

```
$ pnpm typecheck (Pathfinder/)        → 0 errors
$ pnpm lint (Pathfinder/)             → ✔ no warnings or errors
$ pnpm test (Pathfinder/)             → 89 files / 870 passed | 24 skipped
$ pnpm vitest run tests/dashboard-filters.test.ts tests/list-filters.test.ts \
                  tests/cross-poll-fetch.test.ts
                                       → 31 passed (3 files)
$ npm run typecheck (repo root)       → 0 errors
```

### Hard-halt items not tripped

- No schema changes — purely a fetch + UI wiring change against existing tables.
- No auth boundary changes.
- No HubSpot scope expansion.
- No `scoreProject` / ranker changes (intentional — Path B avoids contaminating the customers table that scoring depends on).
- Houston flagship (TxDOT I-45) is unaffected — its regular-view rendering doesn't depend on cross-poll. Cross-poll filter view doesn't include it (no match exists for that lead).
- agent_runs writes untouched.

### Outstanding before PR-merge

1. Push pre-merge tag `pre-merge/demo-polish-ux/gate2` → `origin/main` (`c463899`).
2. Push branch + open PR with the two PR-body assertions Kyle named (Brasfield & Gorrie + Big-D visible; Cross-Pollination filter shows ≥ 12 leads).
3. CI green; auto-merge.
4. Auto-revert monitor for 10 min post-merge.

### Cost

Incidental — no LLM calls executed this gate. Server-side Supabase fetches + UI work only.

---

## 2026-05-02 15:42 UTC — Gate 1 implementation green; PR open pending

**Branch:** `demo-polish-ux/gate1-map-filters`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate1-map-filters/`
**Pre-merge tag:** to be pushed at `pre-merge/demo-polish-ux/gate1` → `origin/main` HEAD `793be48` before PR open.

### Scope shipped this gate

- **1C — demo-branch restriction.** `Pathfinder/lib/demo-branches.ts` exports `DEMO_BRANCH_IDS` (`hou-002`, `lax-008`, `nsh-006`, `pit-007`) + `pickDemoBranches`. **Pre-flight discovery:** the LA / Nashville / Pittsburgh rows already exist in production under different IDs than the demo prompt's example (`lax-006` / `nas-007` / `pit-008`); aligning `DEMO_BRANCH_IDS` to the live IDs because the GeoMapper backfill has already run against them (pit-007=27 leads, lax-008=7, nsh-006=6 attached). Migration `0109_demo_polish_ux_demo_branches.sql` is therefore a documenting / idempotent migration (`ON CONFLICT DO NOTHING`) — no-op against the live DB, but it brings a fresh tenant clone or dev reset up to the same row set. Seed JSON `public/seed-data/branches.json` augmented with the live IDs for local dev. Dashboard restricts `initialBranches` via `pickDemoBranches` so the BranchDock + map + cluster all only render the 4 demo cities.
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
