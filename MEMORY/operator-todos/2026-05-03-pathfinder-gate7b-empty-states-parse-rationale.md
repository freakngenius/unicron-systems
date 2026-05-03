# Gate 7B — Empty-states + parse-rationale full + DecisionBar + CrossPoll lift

**Filed:** 2026-05-02
**Status:** Queued — blocked on PR #96 merge
**Parent:** `2026-05-02-pathfinder-gate7-lead-detail-redesign.md`
**Spec:** `Company Docs/Specs/SPEC - Lead Detail Page UX Redesign.md`

## Scope

Replace 7A stubs with full implementations:

- `parse-rationale.ts` — extract action sentence, buying contact, timing pressure, fit-with-product-mix, market-signal-strength, geographic-fit. Falls back to monolithic on parse failure with a console warning logged to `pathfinder.architect_inbox` for post-demo tuning.
- `RecommendedAction.tsx` — render extracted action + buying contact + timing pressure when `parsed.fallback === false`
- `ProjectStory.tsx` — structured render of fit / market / geography (replaces monolithic fallback when parse succeeds)
- `DecisionBar.tsx` — verdict-line generation per spec § 2 (Strong fit / Speculative / Pre-bid window closing). Stage-aware CTA (`Open in Outreach` default; `Schedule site survey` when permit + start_date_estimated within 30 days; `Wait for award notice` for sam.gov pre-award). Send-via-Gmail / Send-via-Outlook secondary actions.
- `CrossPollinationCard.tsx` — full lift from `ZedcorRelationshipContext`; per-match outreach-hook insertion into the EmailComposer draft via "Open in Outreach with this hook" link.
- `ScoreBreakdown.tsx` — per-component breakdown read from `pathfinder.score_components` (or wherever the Ranker writes); collapsible rows with rationale-per-component.

## Hard halt — additional 7B halts

- parse-rationale returns wrong action for TxDOT flagship (canonical test case — must match spec criterion #3 expected text)
- Cross-pollination match count regression vs. PR #96 baseline
- DecisionBar verdict-line render time exceeds 200 ms (acceptance criterion #4)
