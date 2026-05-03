# PLAN — demo-polish-ux/gate7-lead-detail-redesign

Spec: `Company Docs/Specs/SPEC - Lead Detail Page UX Redesign.md`
Companion: `Company Docs/Specs/SPEC - Lead Detail Enrichment.md` (Gate 3 contract)
Branch: `demo-polish-ux/gate7-lead-detail-redesign`
Worktree: `Pathfinder-worktrees/demo-polish-ux-gate7-lead-detail-redesign/`
Base: `origin/main` `2be40e4`
Test baseline: 949/949 (post Gate 4 + 5; spec's 902 was stale)

## Gate 7A scope (this PR)

Scaffolding + full QuickFactsGrid implementation. Other 6 sections stubbed for 7B/7C.

**Reasoning** (operator confirmed): QuickFactsGrid is the visual centerpiece (replaces existing 4-col strip; 9 cells; touches all 18 enrichment columns). Validates end-to-end data wiring before scaling. One section live early de-risks the architecture before 7B/7C/7D.

## File scope

New files:
- `Pathfinder/components/lead/QuickFactsGrid.tsx` — full impl
- `Pathfinder/components/lead/DecisionBar.tsx` — stub
- `Pathfinder/components/lead/CrossPollinationCard.tsx` — stub (re-renders existing `ZedcorRelationshipContext` for now; lift in 7B)
- `Pathfinder/components/lead/RecommendedAction.tsx` — stub
- `Pathfinder/components/lead/ProjectStory.tsx` — stub
- `Pathfinder/components/lead/ScoreBreakdown.tsx` — stub
- `Pathfinder/components/lead/SourceCitations.tsx` — stub
- `Pathfinder/lib/leads/parse-rationale.ts` — stub w/ monolithic-fallback default
- `Pathfinder/supabase/migrations/0111_lead_detail_redesign.sql` — additive: `enrichment_citations jsonb` on `pathfinder.projects`. (`pathfinder.deals.pipeline_stage` already exists from migration 0050; verified.)
- `Pathfinder/tests/quick-facts-grid.test.tsx` — empty / populated / per-cell empty-state cases
- `Pathfinder/tests/parse-rationale.test.ts` — fallback + future extraction shape

Modified:
- `Pathfinder/components/lead/LeadDetail.tsx` — flag-gated branch; existing layout default (additive, no removal of existing components)
- `Pathfinder/lib/types.ts` — extend `Project` with `enrichment_citations` field

Out of scope (7B/7C):
- Lifting `ZedcorRelationshipContext` content into `CrossPollinationCard`
- Full `parse-rationale` extraction logic (action / fit / timing / contact)
- DecisionBar verdict-line generation
- Header status pill / posted-date reformat (already done in Gate 3D for posted-date)
- Source citations rendering (waits for enricher to write)

## Migration analysis

`pathfinder.deals.pipeline_stage` — exists since migration 0050 (verified via `grep`). No-op.
`pathfinder.enrichment_citations` — does not exist. Add as `jsonb` column on `pathfinder.projects` (per spec — "or jsonb on projects if not already present"). Shape:

```ts
type EnrichmentCitation = {
  url: string;
  fact_supported: string;
  confidence: number; // 0-1
};
```

Idempotent: `add column if not exists`. Reversible by `alter table pathfinder.projects drop column enrichment_citations`.

## LEAD_DETAIL_REDESIGN flag

Read at server-component boundary. `LeadDetail.tsx` is `'use client'` so the page route (`app/pathfinder/leads/[id]/page.tsx`) reads `process.env.LEAD_DETAIL_REDESIGN === '1'` server-side and passes as a `redesignEnabled` prop. Default false. When true, render new component composition. When false, existing layout untouched.

This pattern matches existing flag usage in the codebase (`HUBSPOT_RECON_APPLY` in Gate 4B-3).

## Verification plan

- `pnpm typecheck` → 0 errors
- `pnpm lint` → clean
- `pnpm test` → ≥ 949 + new tests, no regressions
- Build: not run at this gate; Vercel preview will build on push
- Visual: deferred to 7C preview-deploy verification (no preview in this commit)

## Hard halts (per dispatch prompt)

Wake Kyle if:
- Houston flagship Quick Facts cells render wrong values vs. current production
- Cross-Pollination loses any of the 12 matches surfaced in Gate 2 (no risk in 7A — CrossPollinationCard re-renders existing component)
- Bundle adds >100KB to main (measured at 7C)
- parse-rationale returns wrong action for TxDOT flagship (deferred to 7B; 7A stub has fallback only)
- Existing 949 tests fail
- New components introduce >5% LCP regression (deferred to 7C)

## Commit checkpoints

1. PLAN doc + types.ts extension + migration 0111
2. parse-rationale.ts stub + 6 component stubs (skeleton only)
3. QuickFactsGrid.tsx full + tests
4. LeadDetail.tsx flag wire + page route plumbing
5. (Combined commits at logical breakpoints; final push opens PR)

## What this gate explicitly does NOT do

- No old-component archival (waits 7 days post-prod-flip per spec)
- No preview-deploy verification (Gate 7C)
- No production flag flip (Gate 7D)
- No Cross-Pollination card lift (Gate 7B; placeholder re-uses existing component to preserve the 12 matches)
- No Rationale-generation rewrite (parse-only; 7B does the parsing logic)
