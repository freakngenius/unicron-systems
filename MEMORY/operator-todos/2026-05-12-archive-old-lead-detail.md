# Gate 7E — Archive old ProjectFactsCard + sidebar code

**Filed:** 2026-05-02
**Scheduled for:** 2026-05-12 (7 days post-Gate-7D production flag flip — assumes 7D completes by 2026-05-05)
**Status:** Queued — blocked on 7D + 7-day clean production window
**Parent:** `2026-05-02-pathfinder-gate7-lead-detail-redesign.md`

## Scope

Per spec sequencing § "After 7 days of clean production":

- Move `Pathfinder/components/lead/ProjectFactsCard.tsx` to `Pathfinder/components/lead/_archive/ProjectFactsCard.tsx`
- Remove the `ProjectFactsCard` import + `Sidebar` block from `LeadDetail.tsx` (the `else` branch of `redesignEnabled`)
- Remove the `LEAD_DETAIL_REDESIGN` flag (always-on path; the prop becomes vestigial)
- Remove `redesignEnabled` from the page route and the `LeadDetail` props
- Move associated tests for ProjectFactsCard (none exist as of 2026-05-02 — confirmed via `find tests -name "*facts*"`)

**Never delete.** Archive only. Spec rule.

## Definition of done

- PR opened against main with the archive + flag removal
- Bundle-size delta in PR body (expect: -X KB removal of old ProjectFactsCard)
- All tests still pass (expect ≥983 baseline at the point this gate runs)

## Pre-condition (do NOT skip)

Verify 7 consecutive clean days in production before opening this PR. Check:

- Vercel error logs for `/pathfinder/leads/[projectId]` route — zero React errors
- Sentry / monitoring for the same route — no regressions
- `architect_inbox` for any parse-rationale fallback warnings exceeding the rate observed in the first day of 7D

If any of those tripped during the 7-day window, halt this gate and re-scope with Kyle.
