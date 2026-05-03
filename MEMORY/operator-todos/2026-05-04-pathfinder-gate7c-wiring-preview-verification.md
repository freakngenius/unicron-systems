# Gate 7C — Wiring + flag-on preview verification

**Filed:** 2026-05-02
**Status:** Queued — blocked on Gate 7B merge
**Parent:** `2026-05-02-pathfinder-gate7-lead-detail-redesign.md`

## Scope

- Add `LEAD_DETAIL_REDESIGN=1` to Vercel **preview** env on the gate7 branch
- Open Houston flagship at `/pathfinder/leads/sam.gov:TXDOT-I45-2026-001` in preview deploy
- Capture screenshots into `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/` (filename: `gate7c-houston-flagship-{quick-facts,cross-poll,recommended-action,decision-bar}.png`)
- Capture Pittsburgh-sparse fixture screenshot for empty-state proof
- Mobile-viewport screenshot (≤640 px) — confirms Quick Facts stacks to 1 col without horizontal scroll (acceptance #8)
- Bundle-size measurement via `pnpm build` before/after; record delta in `MEMORY/demo-polish-ux-sprint-live-status.md`. Hard halt if >100 KB
- LCP measurement via Vercel Speed Insights on lead detail page; record before/after. Hard halt if >5% regression
- Verify spec acceptance criteria 1–8 visually

## Hard halt

- Any spec acceptance criterion 1–8 fails in preview
- Bundle delta >100 KB
- LCP regression >5%
- TxDOT flagship Quick Facts cells show different values vs. PR #96 unit-test fixture
