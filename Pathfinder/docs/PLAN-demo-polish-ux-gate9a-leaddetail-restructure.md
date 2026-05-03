# PLAN — Gate 9A: LeadDetail v2 restructure + full-screen modal shell

Branch: `demo-polish-ux/gate9a-leaddetail-restructure`
Worktree: `Pathfinder-worktrees/gate9a-leaddetail-restructure/`
Base: `origin/main` (`5f97aa8`)

Spec: `Company Docs/Specs/SPEC - Lead Detail Page v2.md`
Dispatch: Gate 9 prompt — sub-gate 9A

## Goal

Reorder existing components in `LeadDetail.tsx` to v2 spec section order, add per-section uppercase-mono headings, and wrap the page in a full-screen modal shell at 75% width with a blurred backdrop, 10px rounded corners, scrollable content, Close button, Esc-to-close, and arrow-key lead cycling.

Pure restructure + composition — no new business logic. 9B polishes copy. 9C/9D refactor Outreach.

## v2 section order

1. Header — keep existing `<header>` block (title + score + source + distance + warm-intro chip)
2. Quick metrics strip — 4 cells (VALUE / STAGE / DISTANCE / POSTED). Ported from `ProjectModal`'s metrics row.
3. Rationale — cyan-tinted card with long-form rationale + CACHED indicator. Ported from `ProjectModal`'s Rationale Section.
4. PROJECT FACTS — wrap `QuickFactsGrid` with section heading
5. CONTACTS — wrap `ContactsCard` with section heading
6. RELATIONSHIP CONTEXT — wrap `CrossPollinationCard` with new section heading (renamed from "Cross-Pollination")
7. OUTREACH — wrap `EmailComposer` + `RecentSendsBlock` with section heading (placeholder; 9C refactors)
8. VERIFIER — new section ported from `ProjectModal`'s Verifier Section
9. SOURCE RECORD — wrap `RawPayloadFacts` with section heading (full rename to `SourceRecord` happens in 9B)

### Dropped from v1 redesign

`DecisionBar`, `RecommendedAction`, `ProjectStory`, `ScoreBreakdown`, `SourceCitations` — per spec § "What's removed from v1 redesign". Files left in tree (deletion deferred to post-demo Gate 9.5 to keep diff scoped) but not rendered in the v2 redesigned body.

## Modal shell (operator addendum to spec)

Wrapper: new `components/lead/LeadDetailModal.tsx`.

- 75% viewport width × 90vh (max 1400px wide), centered
- 10px rounded corners
- Backdrop: `rgba(10,10,10,0.55)` + `backdrop-filter: blur(8px)`
- Inner content scrollable (`overflow-y: auto`), backdrop and shell are not
- Close button top-right (✕), `Esc` key also closes
- Close action navigates back to `/pathfinder` (dashboard)
- Arrow Right / Down → next lead, Arrow Left / Up → previous lead. Cycles within the top-N ranked project IDs fetched server-side (ordered `score desc nulls last, posted_date desc`). End-wrap returns to the start. No-op when only one lead in the set.
- Body remains scroll-locked while modal open (`overflow: hidden` on document.body)
- Dashboard renders behind via the page route — Next.js parallel routes are not in scope; the modal renders against a backdrop-filtered solid placeholder so the lead route is still deep-linkable

## File scope (Gate 9A)

NEW:
- `Pathfinder/components/lead/QuickMetricsStrip.tsx`
- `Pathfinder/components/lead/RationaleCard.tsx`
- `Pathfinder/components/lead/VerifierSection.tsx`
- `Pathfinder/components/lead/LeadDetailModal.tsx`
- `Pathfinder/docs/PLAN-demo-polish-ux-gate9a-leaddetail-restructure.md` (this file)

MODIFIED:
- `Pathfinder/components/lead/LeadDetail.tsx` — v2 section order in `RedesignedBody`
- `Pathfinder/app/leads/[projectId]/page.tsx` — fetch neighbor IDs + wrap in `LeadDetailModal`

TESTS NEW:
- `Pathfinder/tests/lead-detail-v2-section-order.test.tsx` — verifies all 9 sections render in v2 order
- `Pathfinder/tests/lead-detail-modal.test.tsx` — Esc closes, arrow keys navigate

TESTS UPDATED:
- `Pathfinder/tests/lead-detail-empty-states.test.tsx` — keep coverage; rejected/empty rendering still works
- `Pathfinder/tests/lead-detail-redesign-stubs.test.tsx` — adjust to v2 section presence

## Out of scope (deferred to 9B–9E)

- Source Record component rename (file rename) — 9B
- Per-source Contacts empty-state copy — 9B
- Outreach drafter LLM endpoint — 9C
- Connected-account Send routing — 9D
- Settings page for OAuth connections — post-demo Gate 9.5
- Dashboard-blurred backdrop snapshot — out (modal renders against neutral backdrop)
- LEAD_DETAIL_REDESIGN flag retirement — still on, gates v2 vs legacy

## Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — clean
- `pnpm test` — ≥ 1128 baseline; new tests added without regression
- Houston (TxDOT) + Hines VA + Whiteriver render the 9-section layout (manual screenshot pass deferred to Gate 9E)

## Hard halts (Gate-9-wide; 9A-relevant subset)

- Existing tests regress below 1128
- LeadDetail page returns 5xx on any project ID
- Outreach editor crashes when no contacts present
- Houston flagship loses any of the 9 sections post-merge
