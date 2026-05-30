# PLAN: Stream F, Dashboard and Search

Branch: `stream-f-dashboard-search`
SPEC: Pathfinder/docs/SPEC-Internal-Rework-V2.md, Stream F section.
Operator: Kyle Kesterson, repo owner. Pre-approved per V2 SPEC SHARED section.
Authority over CLAUDE.md never-self-merge: V2 SPEC SHARED authorizes self-merge of this branch when the AUTO-MERGE GATE passes.

## Goal, one sentence

Rebuild the Internal landing as a feed-first surface driven by one smart search bar (replaces the four dead text inputs from `components/FilterSidebar.tsx`), and add a separate metrics view where every KPI is legible to a salesperson with a plain-language tooltip, including an honest breakdown for Active outbound motion that never shows a bare misleading 0%.

## State of the code at branch tip

Branched from `stream-e-cards-companies` (commit `2927b7d`, Stream E LeadCard fix on top of `8a74833` V2 SPEC commit). Stream E is not yet on origin/main; Kyle authorized starting now, do not redefine E's card.

In-repo Internal dashboard composition lives at `Pathfinder/app/[slug]/InternalDashboard.tsx`. The page router at `Pathfinder/app/[slug]/page.tsx` branches via `Pathfinder/app/[slug]/internalDashboardBranch.ts`: when `architecture.modules` is a non-empty object the page renders `InternalDashboard`; otherwise it renders the legacy floor with `FilterSidebar` (text inputs) and `KPIStrip`.

LIVE state (verified by query against pathfinder.organizations and pathfinder.projects on Supabase ref `anfihcusvekpovcchpoh`):

- `pathfinder.organizations.architecture->'modules'` is NULL for every org (zedcor, funder, internal, realberry-4, realberry-is-a-3-6b). The Stream A migration `Pathfinder/supabase/migrations/20260530_internal_modules_block.sql` was merged but never applied to prod. This is why the live Internal app falls through to the legacy floor render path and shows the four dead text inputs from `FilterSidebar` and the misleading `0%` from the legacy `lib/metrics/kpiQueries.ts active_motion_pct`.
- 229 total Internal companies, 194 scored, 1 verified. sales_motion distribution: 219 unknown, 9 hiring-bd, 1 active-outbound. Average score 28. 0 verified in the last 24h. 2 of 6 sources are `type='registered'` (sam-gov, usaspending).

Stream B (already merged to main via #511) ships the catalog modules and `KpiStrip` with the metric-resolver dropping behaviors, but those code paths are dormant until the modules block exists on the Internal row. Stream F MUST apply that migration to prod as part of LIVE-VERIFY.

## File scope

Add or modify these files only. Anything outside is out of scope; halt and report if a change is needed.

NEW
- `Pathfinder/lib/catalog/modules/smart-search/SmartSearch.tsx` (client component, one input + four inline dropdown refinements)
- `Pathfinder/lib/catalog/modules/smart-search/applySearch.ts` (pure narrowing helper for the typed `q` string; cooperates with `applyFilters.ts`)
- `Pathfinder/lib/catalog/modules/metrics-view/MetricsView.tsx` (server component, KPI cards with tooltips)
- `Pathfinder/lib/catalog/modules/metrics-view/metrics.ts` (rich resolvers returning `{ value, subText?, tooltip, suffix? }`)
- `Pathfinder/lib/catalog/modules/metrics-view/labels.ts` (plain-language label and tooltip text, one place)
- `Pathfinder/__tests__/catalog/modules/smart-search/SmartSearch.render.test.tsx`
- `Pathfinder/__tests__/catalog/modules/smart-search/applySearch.test.ts`
- `Pathfinder/__tests__/catalog/modules/metrics-view/MetricsView.render.test.tsx`
- `Pathfinder/__tests__/catalog/modules/metrics-view/metrics.test.ts`
- `Pathfinder/docs/PLAN-stream-f-dashboard-search.md` (this file)

MODIFY (additive, Internal-only paths)
- `Pathfinder/app/[slug]/InternalDashboard.tsx`: switch hero layout to `SmartSearch + RankedFeed` (drop the FilterRail sidebar). Add a tab switcher (`?view=feed` default, `?view=metrics`); on `feed`, render search + ranked feed; on `metrics`, render `MetricsView`. The existing `AnalyticsChartsView` moves to the metrics tab. The legacy `KpiStrip` component is no longer mounted from this file but the component itself is left untouched.
- `Pathfinder/lib/catalog/modules/filter-rail/applyFilters.ts`: add optional `q?: string` field to `InternalFilters` and a pure text-match that runs alongside the existing field filters. Existing field-filter behavior is unchanged when `q` is absent.

UNCHANGED (must not regress)
- `Pathfinder/components/FilterSidebar.tsx`, `Pathfinder/components/KPIStrip.tsx`, `Pathfinder/components/LeadCard.tsx` (Stream E owns LeadCard, others still consumed by Zedcor/Funder floor path).
- `Pathfinder/lib/catalog/modules/kpi-strip/*` (untouched; remains the dormant strip from Stream B).
- `Pathfinder/lib/catalog/modules/filter-rail/FilterRail.tsx` (untouched; no longer mounted by `InternalDashboard.tsx`, but kept in the registry).
- `Pathfinder/lib/metrics/kpiQueries.ts` (legacy floor KPI queries used by Zedcor/Funder; untouched).
- All `Pathfinder/app/[slug]/leads`, `Pathfinder/app/[slug]/pipeline`, `Pathfinder/app/[slug]/companies` routes (Stream E and Stream G own these).

PROD APPLY
- Apply `Pathfinder/supabase/migrations/20260530_internal_modules_block.sql` to prod (Supabase ref `anfihcusvekpovcchpoh`) so the Internal row carries the `modules` block. Confirm by query that `internal` has `modules` non-null and `zedcor / funder / realberry-*` rows still have `modules` NULL.

## Module-by-module outline

### 1. `applySearch.ts`

Pure function `applySearchQuery(rows, q, opts)` that:

- Lower-cases and trims the typed string. Empty -> no narrowing.
- Splits the query into tokens on whitespace. A row is kept when EVERY token matches at least one of:
  - `row.title` or `row.company_name` (case-insensitive substring),
  - `row.raw_payload.internal_enrichment.service_category` (slug AND humanized),
  - `row.raw_payload.internal_enrichment.sales_motion` (slug AND humanized),
  - `row.raw_payload.internal_enrichment.hq_location` substring (handles "Texas" or "TX"),
  - numeric `row.score` string contains (so typing "55" matches score 55, "5" matches 50-59 etc).
- Two-letter all-caps tokens additionally match state abbreviations parsed from hq_location.

### 2. `SmartSearch.tsx`

Client component. Reads `?q=` and the four optional field params (`service_category`, `sales_motion`, `federal_registration`, `source`) from URL. Renders:

- One large input, placeholder "Search by company, category, state, or score". Debounced (200ms) updates `?q=` via `router.replace`.
- A row of four small dropdowns beside (or below on narrow): the same Internal field filters from `FilterRail.optionsFor`, presented inline as refinements. Selecting a dropdown writes the URL param identically to today.
- A "Clear" link visible when any of q + the four fields are non-empty.

A11y: input has a visible label; dropdowns have labels above. Keyboard focus order: input then dropdowns left to right.

### 3. `InternalDashboard.tsx`

- Read `view` from `searchParams` in the page; default `feed`.
- Header and nav unchanged.
- Tab strip below the nav: `Feed` and `Metrics`, linked to `?view=feed` / `?view=metrics` preserving other params.
- `feed` view: `<SmartSearch ... />` then `<RankedFeed rows={...} />` (full-width, no sidebar).
- `metrics` view: `<MetricsView org architecture admin />` over the existing `AnalyticsChartsView` (now mounted only on the metrics tab).

### 4. `MetricsView.tsx`

Server component. Resolves the four metric tiles in parallel via the new resolver set. Renders a 2-column responsive grid of `Card`s. Each card:

- A title (the plain-language label).
- An info icon with a `title` attribute carrying the tooltip text. Also a small text under the value when a breakdown exists.
- A large numeric value with suffix (`%` or `/100` or none).
- For Active outbound motion: an honest subtext "Confirmed active: N of M; K Unknown" when most rows are unknown; never a bare `0%` reading as broken.

### 5. `metrics.ts` (new, under metrics-view)

Resolver returns a rich shape per metric:
```
type MetricTile = {
  id: string;
  label: string;
  value: number | null;
  suffix?: string;
  subText?: string;
  tooltip: string;
  drop?: boolean;
}
```

Implementations:

- `verified_count_1d`: COUNT of projects where org and verified and ranked_at >= now()-1d. Real zero renders as `0`. Tooltip: "How many companies the system confirmed today as good-fit leads (passed the verification threshold)."
- `active_outbound_motion_honest`:
  - Pull every project for the org (limit 10000) returning only `raw_payload->internal_enrichment->sales_motion`.
  - Bucket: `confirmedActive` = rows where sales_motion in {`active-outbound`, `hiring-bd`}. `unknown` = rows where sales_motion is missing or equal to `unknown`. `other` = rows in the schema enum but neither active nor unknown (e.g. `inbound-only`).
  - When `unknown` is at least 25 percent of total OR `confirmedActive` is 0, render the breakdown subtext. Otherwise render the percent.
  - Drop only when total = 0 (no rows).
  - Tooltip: "Share of companies with evidence of an active sales team or outbound hiring. 'Unknown' means enrichment has not yet confirmed motion, not that no motion exists."
- `avg_score_out_of_100`: ROUND(AVG(score)) over scored rows. suffix `/100`. Drop when no scored rows. Tooltip: "Average lead score across companies with a score, on a 0 to 100 scale."
- `sources_live`: count of `architecture.sources` with `type='registered'`. subText lists their humanized ids. Tooltip: "How many data sources are currently feeding leads, out of those registered."

### 6. `applyFilters.ts` (modify, additive)

Add optional `q?: string` on `InternalFilters`. After existing field-filter pass, if `q` is non-empty pipe rows through `applySearchQuery`. Default `q=undefined` preserves byte-for-byte today's narrowing behavior.

### 7. Migration apply

Run the migration on prod via `mcp__claude_ai_Supabase__apply_migration` with the canonical name `20260530_internal_modules_block`. Confirm by query that:
- `internal` has the expected `modules` block.
- `zedcor`, `funder`, `realberry-4`, `realberry-is-a-3-6b` still have `modules` NULL.

## Test plan

Add new
- `applySearch.test.ts`: empty query passes through; substring match on title; state match by name ("Texas") and abbreviation ("TX"); enum slug match ("active-outbound") and humanized match ("Active outbound"); numeric score match; multi-token AND.
- `SmartSearch.render.test.tsx`: renders one input plus four dropdowns; typing updates URL `?q=`; clear link clears all.
- `MetricsView.render.test.tsx`: renders four cards; each has a tooltip attribute; active_outbound_motion renders breakdown subtext when unknown > 25 percent of total; never renders a bare "0%"; metric whose resolver returns null is absent.
- `metrics.test.ts`: each resolver against fixture rows produces the expected shape; active_outbound resolver against 1 active + 219 unknown returns subText shaped like "Confirmed active: 1 of 220; 219 Unknown".

Preserve
- Existing `applyFilters.test.ts` continues to pass (q is optional).
- Existing `FilterRail` / `KpiStrip` / `RankedFeed` tests untouched.
- `verify-orgs-byte-unchanged.ts` passes after the migration is applied.

## Gate evidence checklist

- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test (full suite)
- pnpm build
- pnpm tsx scripts/verify-orgs-byte-unchanged.ts (after migration apply)
- Live SQL confirmation of internal modules block, plus zedcor/funder/realberry rows unchanged.
- Live confirmation on internal.unicron.systems after the Vercel deploy: feed view shows search bar + dropdowns + cards, metrics view shows the four KPIs with tooltips and the honest active-motion breakdown.

## Risks and mitigations

- Risk: migration apply changes other orgs. Mitigation: WHERE clause restricts to `slug='internal'`; verify-orgs script asserts unchanged after.
- Risk: the search debounce causes a re-render storm. Mitigation: keep debounce at 200ms, URL update via `router.replace` (no history entry).
- Risk: tooltip rendering with `title` attribute is browser-dependent. Mitigation: title attribute is the floor; cards include a small visible info glyph and a fallback text line for the salesperson.
- Risk: when modules block is applied to prod, Stream B's already-merged dashboard (with FilterRail) appears momentarily before Stream F deploy completes. Mitigation: apply migration AFTER Stream F merges to main so the prod code matches the data path.

## Notes for reviewer / future self

- The legacy floor `KPIStrip` and `FilterSidebar` are not in scope. Removing them would change Zedcor and Funder rendering. They stay.
- The legacy `lib/metrics/kpiQueries.ts active_motion_pct` is also not in scope; it powers the floor path for Zedcor/Funder, never reads on Internal once the modules block lands.
- If Stream E's PR (`stream-e-cards-companies`) merges to main first via PR #N, this branch will fast-forward cleanly because it was branched from Stream E's tip.
