# Lead Detail Page UX Redesign — Gate 7 (PROMOTED to active sprint)

**Filed:** 2026-05-02
**Promoted:** 2026-05-02 — operator override of post-demo deferral. Land before Tuesday 2026-05-05 demo.
**Status:** In Process — 7A merged at `55dc863`; 7B merged at `13427ad`; 7C in review (PR #99)
**Spec:** `Company Docs/Specs/SPEC - Lead Detail Page UX Redesign.md`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate7-lead-detail-redesign/`
**PLAN:** `Pathfinder/docs/PLAN-demo-polish-ux-gate7-lead-detail-redesign.md`

## Sub-gate kanban

- `7A` — Component scaffolding (flag-gated) + QuickFactsGrid full → **MERGED** at `55dc863` (PR #96) — `2026-05-02-pathfinder-gate7a-pr-96.md`
- `7B` — Empty-states + parse-rationale full + DecisionBar verdict + CrossPollinationCard lift → **MERGED** at `13427ad` (PR #98) — `2026-05-03-pathfinder-gate7b-empty-states-parse-rationale.md`
- `7C` — ScoreBreakdown DB read + verdict performance.mark + bundle delta + preview screenshot checklist → **In Review** (PR #99) — `2026-05-04-pathfinder-gate7c-wiring-preview-verification.md`
- `7D` — Production flag flip + screenshots → queued — `2026-05-05-pathfinder-gate7d-production-flag-flip.md`
- `7E` (post-7-day-stable) — Archive old `ProjectFactsCard` + sidebar code → queued for 2026-05-12 — `2026-05-12-archive-old-lead-detail.md`

## Hard halt — wake Kyle if any of

- Houston flagship Quick Facts cells render wrong values vs. current production
- Cross-Pollination loses any of the 12 matches surfaced in Gate 2
- Acceptance criteria 1–6 from the spec fail in preview
- Bundle adds >100 KB to main (regression on Gate 6 concern)
- parse-rationale returns wrong action for the TxDOT flagship (canonical test case)
- New components introduce >5% LCP regression on lead detail page
- Any existing test fails (1054/1054 baseline post Gate 7C; was 1043 post-7B; was 983 post-7A; was 949 baseline)

## Follow-up todos filed during 7C

- `2026-05-03-pathfinder-persist-score-components.md` — migrate `geo_score`/`stage_score`/`customer_score` columns onto `pathfinder.projects`
- `2026-05-03-pathfinder-wire-speed-insights.md` — install `@vercel/speed-insights` to satisfy spec acceptance criterion #4

## Acceptance for closing this todo

- All 4 sub-gate PRs (7A, 7B, 7C, 7D) merged to main
- `LEAD_DETAIL_REDESIGN=1` live in production for 7+ clean days
- 7E archive PR merged
- Bundle-size delta documented in each PR (7C: +6.3 KB ✅)
- All 6 spec acceptance criteria green in production (#4 follows after Speed Insights wire)
