# Stream B Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four floor-stub modules `ranked-feed`, `filter-rail`, `kpi-strip`, `analytics-charts` in `lib/catalog/floor-stubs.tsx` with production components, and wire the catalog renderer into `app/[slug]/page.tsx` so the Internal org (#4, slug `internal`) renders the new dashboard at `/pathfinder/internal` while Zedcor, Realberry, and Funder render byte-identical to today.

**Architecture:** Internal-only via the modules-block check. `app/[slug]/page.tsx` reads `architecture.modules`. When the block is present and non-empty (currently only Internal per the Stream A migration), the page resolves slots through `lib/catalog/renderer.resolveAllSlots` and renders the active module per slot. When the block is absent (Zedcor, Realberry, Funder), the page falls through to the existing KPIStrip + FilterSidebar + FunderChartGrid + FunderLeadLinks rendering verbatim. The four new modules are server components that fetch their own data from `pathfinder.organizations` / `pathfinder.projects` scoped by `organization_id` and dispatch any client interactivity to small client-component leaves (filter selects, chart hover).

**Tech Stack:** Next.js 14 server components, React 19, TypeScript, Supabase admin client (server-side only), shared design primitives from `lib/design/tokens.ts` and `components/design/*`, Stream A catalog contract from `lib/catalog/*`, Vitest for unit tests, Playwright already configured for E2E.

---

## Scope Check

This plan covers Stream B only (the four dashboard modules + the slug-route integration). It does NOT touch:
- The detail route (`app/[slug]/leads/[projectId]/page.tsx`) ,  that is Stream C.
- The pipeline route (`app/[slug]/pipeline/page.tsx`) ,  that is Stream D.
- The daily-digest cron ,  that is Stream D.
- The Stream A catalog contract, registry, gating, validation, renderer ,  those are read-only here.
- The Internal architecture migration `20260530_internal_modules_block.sql` ,  already merged with Stream A.

Out-of-scope changes that surface as needed during implementation: STOP and surface to operator, do not silently expand the diff.

---

## File Structure

**New files (created by this plan):**
- `Pathfinder/lib/catalog/modules/ranked-feed/RankedFeed.tsx` ,  server component, ranked company feed.
- `Pathfinder/lib/catalog/modules/ranked-feed/data.ts` ,  Supabase query for scored companies.
- `Pathfinder/lib/catalog/modules/ranked-feed/labels.ts` ,  schema-key to display-label map (single source of truth for Stream B).
- `Pathfinder/lib/catalog/modules/filter-rail/FilterRail.tsx` ,  server component shell + client select leaves.
- `Pathfinder/lib/catalog/modules/filter-rail/FilterRailClient.tsx` ,  `'use client'`, holds URL-state for selected filters, posts to `?service_category=...&sales_motion=...&federal_registration=...&source=...` so the ranked-feed re-fetches.
- `Pathfinder/lib/catalog/modules/filter-rail/applyFilters.ts` ,  pure helper, narrows a row set by the four filters; tested in isolation.
- `Pathfinder/lib/catalog/modules/kpi-strip/KpiStrip.tsx` ,  server component, fetches each configured metric.
- `Pathfinder/lib/catalog/modules/kpi-strip/metrics.ts` ,  metric_id → async resolver map. Returns `null` when a metric cannot resolve. NULL drops the KPI.
- `Pathfinder/lib/catalog/modules/analytics-charts/AnalyticsCharts.tsx` ,  server component, two charts.
- `Pathfinder/lib/catalog/modules/analytics-charts/charts.ts` ,  pure data shapers (bar + line series builders).
- `Pathfinder/lib/catalog/modules/analytics-charts/ChartsClient.tsx` ,  `'use client'`, renders SVG bar and line charts inline (no chart library to keep bundle small; aligns with Zedcor's inline-style aesthetic).
- `Pathfinder/lib/catalog/modules/loaders.ts` ,  central place to bind the four module ids to their real components, replacing the floor stubs for Internal.
- `Pathfinder/lib/catalog/internal-modules.ts` ,  Internal-only resolved-architecture helper (org id, lead_unit.schema lookup, etc.).

**Modified files:**
- `Pathfinder/lib/catalog/floor-stubs.tsx` ,  REPLACE the four entries in `FLOOR_STUB_LOADERS` for `ranked-feed`, `filter-rail`, `kpi-strip`, `analytics-charts` with the real-component loaders from `lib/catalog/modules/loaders.ts`. Stubs for the other seven module ids stay (other streams replace them).
- `Pathfinder/app/[slug]/page.tsx` ,  add a branch: if `architecture.modules` is a non-empty record, render via `<InternalDashboard ...>` (a thin wrapper that resolves slots and composes the layout); else render the existing layout unchanged.
- `Pathfinder/app/[slug]/InternalDashboard.tsx` ,  NEW, the Internal-specific composition: kpi-strip top (slim), filter-rail + ranked-feed grid (hero is the feed), analytics-charts secondary below.
- `Pathfinder/MEMORY/spec-references.md` ,  add entries for each new `lib/` file (per CI rule).

**Test files (created by this plan):**
- `Pathfinder/__tests__/catalog/modules/ranked-feed/data.test.ts`
- `Pathfinder/__tests__/catalog/modules/ranked-feed/RankedFeed.render.test.tsx`
- `Pathfinder/__tests__/catalog/modules/filter-rail/applyFilters.test.ts`
- `Pathfinder/__tests__/catalog/modules/filter-rail/FilterRail.render.test.tsx`
- `Pathfinder/__tests__/catalog/modules/kpi-strip/metrics.test.ts`
- `Pathfinder/__tests__/catalog/modules/kpi-strip/KpiStrip.render.test.tsx`
- `Pathfinder/__tests__/catalog/modules/analytics-charts/charts.test.ts`
- `Pathfinder/__tests__/catalog/modules/analytics-charts/AnalyticsCharts.render.test.tsx`
- `Pathfinder/__tests__/app/internal-dashboard.regression.test.tsx` ,  proves Zedcor/Realberry/Funder render output unchanged (snapshot).

---

## KPI Metric Reconciliation (CRITICAL)

This section is canonical for what each metric in `architecture.modules.kpi-strip.config.metrics` resolves to. Stream B implements `kpi-strip/metrics.ts` against this table; any metric that cannot resolve returns `null` and is DROPPED from the strip ,  never rendered as `0`.

| metric_id            | Resolution                                                                                                                          | If unresolvable                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `verified_count_1d`  | `count(projects where organization_id = internal_id and verified = true and updated_at >= now() - interval '1 day')`                | Drop (no Internal company has been verified in the last 24h, this is a real zero, render 0 ,  see below) |
| `active_motion_pct`  | `round(100 * count(projects where organization_id = internal_id and sales_motion in ('outbound', 'active_outbound')) / count(projects where organization_id = internal_id))` | Drop if denominator = 0 OR if `sales_motion` column does not exist on Internal lead schema OR if the enum has no value matching outbound semantics. This is the metric currently rendering the false `0%` red flag |
| `avg_score`          | `round(avg(projects.score) where organization_id = internal_id and score is not null)`                                              | Drop if no scored rows                       |
| `sources_live`       | `count(distinct projects.source) where organization_id = internal_id and source is not null and updated_at >= now() - interval '7 days')` | Drop if zero (treat as "no live sources") |

**Special-case "real zero" vs "unresolvable":**
- `verified_count_1d` = `0` is a meaningful real value (no verifications in 24h). It should render as `0`, not drop.
- `active_motion_pct` = `0` is the misleading case described in the prompt. The fix: if the underlying `sales_motion` column does not exist on Internal's `lead_unit.schema`, or if the enum has no member matching outbound semantics, the metric is DROPPED (returns `null` from the resolver). Otherwise a literal `0%` is real and renders as `0%`.

**Resolution rule (code-level):**
```ts
type Metric = { id: string; label: string; value: number | null; suffix?: string };
// metrics.ts returns Metric[]; the KpiStrip renderer filters to value !== null.
```

A separate `discovery_check.ts` runs at startup to confirm each metric_id from the Internal config resolves to a registered resolver; an unknown metric_id logs a structured warning (caught by `lib/catalog/renderer` via the existing `log` channel) and is dropped.

---

## Slot-collision and renderer contract notes

- The Stream A renderer (`lib/catalog/renderer.ts`) handles slot resolution. Stream B only swaps the lazy component loaders; the registry rows for `ranked-feed`, `filter-rail`, `kpi-strip`, `analytics-charts` stay byte-identical.
- All four Stream B slots are `claim` mode (not `action-affordance`).
- The `kpi-strip` registry row already declares `__configured_metrics__` as a sentinel data_signal soft dep. Stream B's `metrics.ts` must register a `hasDataSignal` implementation for each metric_id so the gate evaluates correctly. The Stream A `makeSupabaseGateContext` map currently lacks entries for `verified_count_1d`, `active_motion_pct`, `avg_score`, `sources_live` ,  Stream B EXTENDS this map (additive, no existing entry changed).

---

## Chunk 1: Foundation (labels, internal-modules helper, loaders shim)

### Task 1.1: Build the schema-key → display-label map

**Files:**
- Create: `Pathfinder/lib/catalog/modules/ranked-feed/labels.ts`
- Test: `Pathfinder/__tests__/catalog/modules/ranked-feed/labels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/catalog/modules/ranked-feed/labels.test.ts
import { describe, it, expect } from 'vitest';
import { displayLabel, INTERNAL_LABELS } from '@/lib/catalog/modules/ranked-feed/labels';

describe('Internal display labels', () => {
  it('maps every spec field to its human label', () => {
    expect(displayLabel('company_name')).toBe('Company');
    expect(displayLabel('service_category')).toBe('Service category');
    expect(displayLabel('sales_motion')).toBe('Sales motion');
    expect(displayLabel('footprint')).toBe('Operating footprint');
    expect(displayLabel('hq_location')).toBe('Headquarters');
    expect(displayLabel('licensure')).toBe('Contractor licensure');
    expect(displayLabel('federal_registration')).toBe('Federal registration');
    expect(displayLabel('association_memberships')).toBe('Trade associations');
    expect(displayLabel('company_size')).toBe('Size');
    expect(displayLabel('warm_intro')).toBe('Warm intro');
    expect(displayLabel('first_step')).toBe('Recommended first step');
    expect(displayLabel('score')).toBe('Score');
    expect(displayLabel('source')).toBe('Source');
  });
  it('falls back to humanizing unknown keys (never renders the raw key)', () => {
    expect(displayLabel('unknown_field')).toBe('Unknown field');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `pnpm vitest run __tests__/catalog/modules/ranked-feed/labels.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/catalog/modules/ranked-feed/labels.ts
export const INTERNAL_LABELS: Record<string, string> = {
  company_name: 'Company',
  service_category: 'Service category',
  sales_motion: 'Sales motion',
  footprint: 'Operating footprint',
  hq_location: 'Headquarters',
  licensure: 'Contractor licensure',
  federal_registration: 'Federal registration',
  association_memberships: 'Trade associations',
  company_size: 'Size',
  warm_intro: 'Warm intro',
  first_step: 'Recommended first step',
  score: 'Score',
  source: 'Source',
};
export function displayLabel(key: string): string {
  if (INTERNAL_LABELS[key]) return INTERNAL_LABELS[key];
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
```

- [ ] **Step 4: Run test (PASS)**

- [ ] **Step 5: Commit**

```bash
git add Pathfinder/lib/catalog/modules/ranked-feed/labels.ts Pathfinder/__tests__/catalog/modules/ranked-feed/labels.test.ts
git commit -m "feat(stream-b): add display-label map for Internal schema (no raw keys)"
```

---

## Chunk 2: Module 1 ,  ranked-feed (hero)

### Task 2.1: Data fetcher returns scored companies in score-desc order

**Files:**
- Create: `Pathfinder/lib/catalog/modules/ranked-feed/data.ts`
- Test: `Pathfinder/__tests__/catalog/modules/ranked-feed/data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// fetchRankedCompanies(orgId, supabase) -> CompanyRow[] ordered by score desc
import { describe, it, expect, vi } from 'vitest';
import { fetchRankedCompanies } from '@/lib/catalog/modules/ranked-feed/data';

describe('fetchRankedCompanies', () => {
  it('orders by score desc and filters to the org', async () => {
    const rows = [
      { id: 'a', score: 90, organization_id: 'org-1' },
      { id: 'b', score: 70, organization_id: 'org-1' },
      { id: 'c', score: 95, organization_id: 'org-1' },
    ];
    const supabase = makeStubSupabase(rows);
    const out = await fetchRankedCompanies('org-1', supabase, { limit: 50, filters: {} });
    expect(out.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('drops rows with null score (unranked) and never renders them as 0', async () => {
    const supabase = makeStubSupabase([
      { id: 'a', score: 80 },
      { id: 'b', score: null },
    ]);
    const out = await fetchRankedCompanies('org-1', supabase, { limit: 50, filters: {} });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run (FAIL)**, **Step 3: Implement**, **Step 4: Run (PASS)**, **Step 5: Commit**

(Implementation: query `projects` with `.eq('organization_id', orgId).not('score', 'is', null).order('score', { ascending: false }).limit(50)`. Apply `filters` from filter-rail via `applyFilters`.)

### Task 2.2: Card row renders display_labels, not keys

**Files:**
- Create: `Pathfinder/lib/catalog/modules/ranked-feed/RankedFeed.tsx`
- Test: `Pathfinder/__tests__/catalog/modules/ranked-feed/RankedFeed.render.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// Assert: rendered HTML contains 'Service category', 'Operating footprint',
// 'Sales motion', not 'service_category' or 'footprint' or 'sales_motion'.
// Assert: score badge is in the top-right of each card.
// Assert: each card is an <a href> built via buildOrgPath('internal','companies',row.id).
```

- [ ] **Step 2 through 5: TDD cycle**

(Implementation: server component, takes rows + slug, composes design `<Card>` + `<ScoreBadge>` + a one-line `<p>` from the rationale field. The wrapping `<a>` uses `orgPaths.leadDetail(slug, row.id)`. NOTE: detail route still belongs to Stream C ,  Stream B only LINKS, does not build.)

### Task 2.3: Empty state when no scored rows

- [ ] Test: empty rows array renders `<EmptyState title="No ranked companies yet" .../>` not a broken card stack.

### Task 2.4: Card click navigates with org slug intact

- [ ] Test: render with `slug='internal'`, assert all `<a>` hrefs start with `/internal/companies/`. Even if `companies` route is Stream C, the LINK is correct now.

### Task 2.5: Wire RankedFeed into floor-stub loader

- [ ] Edit `lib/catalog/floor-stubs.tsx`: replace `'ranked-feed'` loader with `() => import('./modules/ranked-feed/RankedFeed').then(m => ({ default: m.default }))`.

- [ ] Commit.

---

## Chunk 3: Module 2 ,  filter-rail

### Task 3.1: applyFilters pure helper

**Files:**
- Create: `Pathfinder/lib/catalog/modules/filter-rail/applyFilters.ts`
- Test: `Pathfinder/__tests__/catalog/modules/filter-rail/applyFilters.test.ts`

- [ ] Test: `applyFilters(rows, { service_category: 'security' })` narrows; missing filter is a no-op; multiple filters AND together.

### Task 3.2: Soft-gate drops a filter whose backing schema field is absent

**Files:**
- Create: `Pathfinder/lib/catalog/modules/filter-rail/FilterRail.tsx`
- Test: `Pathfinder/__tests__/catalog/modules/filter-rail/FilterRail.render.test.tsx`

- [ ] Test: when `architecture.lead_unit.schema` has only `service_category` and `source` keys, rendered filters are `[Service category, Source]` only ,  no `Sales motion`, no `Federal registration`. The dropped filters do NOT render as disabled controls; they are absent from the DOM. Assert: `queryByText('Sales motion')` is null.

### Task 3.3: Filter changes update the feed

- [ ] Use URL search params (`?service_category=...`). The Internal dashboard page reads these and threads them into `fetchRankedCompanies({ filters })`. Test: changing a select updates `location.search`; the server re-renders with the narrowed feed.

### Task 3.4: Wire FilterRail into floor-stub loader

- [ ] Edit `lib/catalog/floor-stubs.tsx`, commit.

---

## Chunk 4: Module 3 ,  kpi-strip (slim, secondary)

### Task 4.1: metrics resolver returns null for unresolvable

**Files:**
- Create: `Pathfinder/lib/catalog/modules/kpi-strip/metrics.ts`
- Test: `Pathfinder/__tests__/catalog/modules/kpi-strip/metrics.test.ts`

- [ ] Test: `resolveMetric('active_motion_pct', { sales_motion_in_schema: false })` returns `null`. Asserts no zero leaks through.
- [ ] Test: `resolveMetric('avg_score', { rows: [{score: 70}, {score: 80}] })` returns `75`.
- [ ] Test: `resolveMetric('verified_count_1d', { rows: [] })` returns `0` (real zero, NOT null ,  verification count of zero is meaningful).
- [ ] Test: unknown metric_id returns `null` and logs a structured warning.

### Task 4.2: KpiStrip renderer drops null metrics

**Files:**
- Create: `Pathfinder/lib/catalog/modules/kpi-strip/KpiStrip.tsx`
- Test: `Pathfinder/__tests__/catalog/modules/kpi-strip/KpiStrip.render.test.tsx`

- [ ] Test: pass `[{id:'a', value: 5, label:'A'}, {id:'b', value: null, label:'B'}]` → DOM contains "A" with "5" and does NOT contain "B" and does NOT contain any rendering of "0%" or "0" for B.
- [ ] Visual: slim, secondary. NOT the hero. One-line strip above or below filters per the InternalDashboard composition.

### Task 4.3: Wire KpiStrip into floor-stub loader

- [ ] Edit `lib/catalog/floor-stubs.tsx`, commit.

---

## Chunk 5: Module 4 ,  analytics-charts (secondary)

### Task 5.1: chart data shapers (pure)

**Files:**
- Create: `Pathfinder/lib/catalog/modules/analytics-charts/charts.ts`
- Test: `Pathfinder/__tests__/catalog/modules/analytics-charts/charts.test.ts`

- [ ] Test: `byServiceCategory(rows)` returns `[{label, count}]` sorted by count desc; empty rows return `[]`.
- [ ] Test: `verifiedOverTime(rows, days=14)` returns `[{date, count}]` with 14 entries (including zero-count days).

### Task 5.2: AnalyticsCharts renders or shows EmptyState

**Files:**
- Create: `Pathfinder/lib/catalog/modules/analytics-charts/AnalyticsCharts.tsx`, `ChartsClient.tsx`
- Test: `Pathfinder/__tests__/catalog/modules/analytics-charts/AnalyticsCharts.render.test.tsx`

- [ ] Test: empty bar series renders `<EmptyState ...>` not an empty SVG.
- [ ] Test: bar chart uses `displayLabel` for category names.
- [ ] Test: line chart x-axis labels are dates, not raw timestamps.

### Task 5.3: Wire AnalyticsCharts into floor-stub loader

- [ ] Edit `lib/catalog/floor-stubs.tsx`, commit.

---

## Chunk 6: Internal dashboard integration

### Task 6.1: Extract the existing layout into a sibling component (no behavior change)

**Files:**
- Modify: `Pathfinder/app/[slug]/page.tsx`
- Create: `Pathfinder/app/[slug]/LegacyOrgDashboard.tsx`

- [ ] Move the current rendering block (from `<header>` to the closing `</div>`) into `LegacyOrgDashboard.tsx`. `app/[slug]/page.tsx` continues to call this for every org. Run regression snapshot test for Zedcor ,  must be byte-identical.

### Task 6.2: Add modules-block branch + InternalDashboard

**Files:**
- Modify: `Pathfinder/app/[slug]/page.tsx`
- Create: `Pathfinder/app/[slug]/InternalDashboard.tsx`
- Test: `Pathfinder/__tests__/app/internal-dashboard.regression.test.tsx`

- [ ] Add: `const modules = (architecture as any).modules; if (modules && Object.keys(modules).length > 0) return <InternalDashboard ... />; return <LegacyOrgDashboard ... />;`
- [ ] `InternalDashboard.tsx`: header + slim KpiStrip + grid of FilterRail (left) and RankedFeed (right, hero) + AnalyticsCharts (full-width, secondary, below).
- [ ] Composition uses `resolveAllSlots` from `lib/catalog/renderer` so the same logic decides active/inactive/floor per slot.
- [ ] Test: snapshot Zedcor (`/zedcor`) output byte-identical to legacy. Snapshot Internal (`/internal`) shows the new layout with RankedFeed as the hero.

### Task 6.3: Page scrolls; no fixed-height container clips content

- [ ] Test: assert page wrapper has `min-height: 100vh` and uses `overflow: visible` (or omits `overflow`).

### Task 6.4: Commit + push checkpoint

- [ ] Commit + `git push -u origin feat/stream-b-dashboard`. Verify Vercel preview kicks off.

---

## Chunk 7: Verification + PR

### Task 7.1: pnpm install, lint, typecheck, test, build

```bash
cd Pathfinder
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] All green. Capture verbatim stdout/stderr for the PR.
- [ ] Add MEMORY/spec-references.md entries for every new `lib/` file.

### Task 7.2: Pathfinder Vercel preview builds green

- [ ] Read preview URL from the PR's Vercel check. Visit `/pathfinder/internal` and confirm: hero is the ranked feed; no slot renders raw schema keys or blanks; KPI strip has no false-zero `Active outbound motion 0%`; page scrolls; clicking a card navigates to `/pathfinder/internal/companies/<id>` (404 is expected here since Stream C builds the detail page ,  that is fine; the link itself must be correct).
- [ ] Visit `/pathfinder/zedcor` and confirm visually byte-identical to today (compared against `_demo-snapshot-2026-04-30` if needed).

### Task 7.3: Open the PR

- [ ] Title: `Stream B ,  Dashboard surface for Internal (ranked-feed, filter-rail, kpi-strip, analytics-charts)`.
- [ ] Body (paste-ready template at the end of this plan).

### Task 7.4: STOP ,  do not self-merge

Per `Pathfinder/CLAUDE.md` ("Never merge your own PR. Open the PR, hand off, wait."), Stream B does NOT auto-merge. The dispatch prompt's "auto-merge gate" is in tension with this; the safe resolution is to verify the gate ALL hold and then hand off to Kyle for the merge. The plan stops here pending Kyle's merge.

### Task 7.5: Post-merge ,  move kanban cards

- [ ] After Kyle merges, append `Implemented at <commit-sha> · merged at <ISO-UTC>` to each of the four Notion cards and move to Deployed. NEVER Verified.

---

## Regression evidence requirements (PR body)

- `git log origin/main..feat/stream-b-dashboard --stat` showing only the declared file set was touched.
- `pnpm test` verbatim output, all green.
- `pnpm typecheck` verbatim output, no errors.
- Screenshot of `/pathfinder/internal` Vercel preview showing the hero is the ranked feed with real values.
- Screenshot of `/pathfinder/zedcor` Vercel preview showing it is byte-identical to today.
- KPI metric resolution table copied from this plan with the actual value each metric resolved to at preview time (e.g., `verified_count_1d: 0 (real zero), active_motion_pct: DROPPED (sales_motion column absent or no outbound enum value), avg_score: 47, sources_live: 3`).
- Confirmation that the slot-collision resolution from Stream A (`hubspot-sync` as action-affordance, not a second `detail.outreach` claim) was preserved ,  Stream B did not touch it, but we re-state it for completeness.

---

## Hard-halt triggers (per dispatch prompt)

- Any destructive-git situation.
- Any backend or schema change (this stream is forbidden from touching `pathfinder.*` migrations).
- Any unresolved failing test after honest iteration.

In all halt cases: leave cards In Process, post a Bug Fixes summary to this branch with what was tried and what failed.

---

## PR body template

```
## Stream B ,  Dashboard surface for Internal

Replaces four floor stubs (`ranked-feed`, `filter-rail`, `kpi-strip`, `analytics-charts`) with production components. Internal-only: orgs without an `architecture.modules` block render byte-identical to today.

### Files touched
- (paste from `git diff --stat origin/main`)

### KPI metric reconciliation
| metric_id | resolution | preview value |
| --- | --- | --- |
| verified_count_1d | count(verified=true AND updated_at >= now()-1d) | <fill> |
| active_motion_pct | round(100 * outbound_count / total_count) | <fill OR "DROPPED ,  reason"> |
| avg_score | round(avg(score) where score not null) | <fill> |
| sources_live | count(distinct source where updated_at >= now()-7d) | <fill> |

### Slot-collision note
hubspot-sync stays as `slotMode: 'action-affordance'` inside outreach-composer's slot. Stream B did not touch this; restated for reviewer convenience.

### Regression
- Zedcor `/pathfinder/zedcor` byte-identical to today (snapshot test green; screenshot attached).
- Realberry, Funder render unchanged (snapshot tests green).

### Test output
(paste verbatim)

### Auto-merge gate
Per Pathfinder/CLAUDE.md ("Never merge your own PR"), this PR awaits human merge by Kyle. All boolean checks (build, lint, typecheck, tests, Vercel preview) are green.
```

---

## Open questions for Kyle (before implementation)

1. **`sales_motion` column existence.** Stream B's metric resolver for `active_motion_pct` needs to know whether `sales_motion` is a real column on the `pathfinder.projects` table (the company unit for Internal). If not, the metric must be DROPPED. Can you confirm the column / enum exists, or is this exactly the "broken extractor" the spec calls out and we should DROP the KPI in Internal's config?

2. **Detail route href.** Stream B links cards to `/<slug>/companies/<id>` per the Internal-as-companies framing in the spec, but the existing route is `/<slug>/leads/<id>`. Stream C owns the detail route; should the Stream B link target be `/<slug>/leads/<id>` (matching existing) or `/<slug>/companies/<id>` (matching the spec's "company unit" framing, requiring Stream C to add the route)? I propose `/leads/<id>` to match the existing route and avoid creating a 404 surface; Stream C can rename later.

3. **Self-merge resolution.** The dispatch prompt declares an auto-merge gate; `Pathfinder/CLAUDE.md` forbids self-merge. The plan honors CLAUDE.md and hands off to you for the merge. Confirm this is the intended interpretation.

4. **Notion card creation.** I don't see existing cards for ranked-feed/filter-rail/kpi-strip/analytics-charts in my context. Do they already exist in the Pathfinder Features Kanban under "Stream B"? If not, do you want me to create them, or are they tracked elsewhere?
