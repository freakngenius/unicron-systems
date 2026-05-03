# Gate 7C — Wiring + flag-on preview verification

**Filed:** 2026-05-02
**Promoted:** 2026-05-03 — operator dispatched right after 7B merge
**Status:** In Review — PR #99 open at https://github.com/freakngenius/unicron-systems/pull/99 (code) → Kyle action: env flip + screenshot capture pending
**Branch:** `demo-polish-ux/gate7c-preview-verification-bundle-instrument`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate7c-preview-verification-bundle-instrument/`
**Parent:** `2026-05-02-pathfinder-gate7-lead-detail-redesign.md`

## What 7C shipped (PR #99 — code path)

- `lib/scoring.ts` re-used by page route — server-side recompute of per-component breakdown via `scoreProject(project, branches, customers)`. Tree-shaken when `redesignEnabled === false`.
- `app/leads/[projectId]/page.tsx` — fetches branches + customers in existing parallel Promise.all, computes ScoringOutput, passes as `scoringBreakdown` prop.
- `components/lead/LeadDetail.tsx` — accepts `scoringBreakdown` prop, threads through RedesignedBody → ScoreBreakdown.
- `components/lead/ScoreBreakdown.tsx` — full impl. Collapsed default; expand reveals 3 component rows (geo / stage / customer) + total + per-component rationale toggles. "Breakdown unavailable" fallback when no breakdown computable.
- `components/lead/DecisionBar.tsx` — `performance.mark('decision-bar-verdict-rendered')` instrumentation (idempotent). Future Speed Insights install can pick it up.
- 1 new test file (+11 tests; baseline 1043 → 1054).
- `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README-gate7c-preview.md` — capture checklist for Kyle.

## Verification (code path — automated)

```
pnpm typecheck → 0 errors
pnpm lint      → no warnings or errors
pnpm test      → 1054 passed | 24 skipped
pnpm build     → success; /leads/[projectId] 13.4 kB per-route + 105 kB First Load
```

## Bundle-size delta (Gate 6 wontfix premise — primary 7C deliverable)

```
pre-7A baseline (origin/main 2be40e4):
  /leads/[projectId]   7.11 kB per-route   98.7 kB First Load

post-7C (this branch):
  /leads/[projectId]  13.4 kB per-route    105 kB First Load

Delta: +6.3 kB  (94% under 100 KB hard halt threshold) ✅
```

## Out of scope (deferred to follow-up todos)

- ScoreBreakdown DB read via persisted columns (today: re-runs scoreProject every page load). Operator-todo: `2026-05-03-pathfinder-persist-score-components.md`
- Speed Insights / Web Vitals install + acceptance criterion #4 measurement. Operator-todo: `2026-05-03-pathfinder-wire-speed-insights.md`

## Kyle action items (preview-deploy verification)

Per `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README-gate7c-preview.md`:

1. Merge PR #99 (auto-merge per gate authorization)
2. `vercel env add LEAD_DETAIL_REDESIGN preview` value `1` scoped to either:
   - `demo-polish-ux/gate7c-preview-verification-bundle-instrument` if branch retained, OR
   - `main` if branch deleted post-merge
3. Wait for preview deploy
4. Capture 8 screenshots per checklist
5. Update this todo: In Review → Done with link to screenshot commit
6. Dispatch Gate 7D (production flag flip)

## Hard halts not tripped (code path — preview verification still pending)

- ✅ Bundle delta +6.3 KB (well under 100 KB)
- ✅ Test count 1054 (above 1043 floor)
- ✅ ScoreBreakdown recompute doesn't throw (try/catch with null fallback)
- ✅ Schema unchanged
- ✅ Flag still default off
- ⏸ Houston flagship preview screenshots — Kyle action pending
- ⏸ Mobile viewport stack proof — Kyle action pending
- ⏸ Acceptance criteria 1–8 visual verification — Kyle action pending

## Definition of done

- PR #99 merged to main
- 8 preview-deploy screenshots captured + committed
- This todo updated to Done with screenshot commit link
- Gate 7D dispatched
