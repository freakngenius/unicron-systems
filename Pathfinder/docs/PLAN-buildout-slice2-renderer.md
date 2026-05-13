# PLAN — Build-Out Pass Slice 2: Pathfinder renderer reads ui_plan

Spec: `Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md`. Slice 1 (PR #384, merged at `436d734`) shipped the `UIPlan` type + base-template default + resolver merge. This slice wires `/[slug]` to honor `org.architecture.ui_plan` so DoD smoke step 8 can flip from BLOCKED to PASS.

## Scope (Pathfinder/ only)

1. `Pathfinder/components/KPIStrip.tsx` — NEW. Renders `data-kpi-strip` container with one `data-kpi-card` per `ui_plan.kpis` entry. Props: `kpis: UIPlan['kpis']`. Uses a stub `kpiQueryByMetricId` map (`Pathfinder/lib/metrics/kpiQueries.ts`) that returns `null` for unmapped IDs — value renders as `—`. Optional `target` and `unit` rendered when present.
2. `Pathfinder/components/FilterSidebar.tsx` — NEW. Renders one labeled control per `ui_plan.filters`. Default value populated from `filter.default` when present. Pure client-side state; not wired to leads list (out of scope here).
3. `Pathfinder/components/LeadCard.tsx` — NEW (current `/[slug]/page.tsx` does not have a lead card — Phase 2D LeadCard lives elsewhere; this is a minimal renderer scoped to ui_plan). Honors `lead_card_layout.primary_fields` (prominent), `secondary_fields` (expandable details), and `score_position`. Container emits `data-lead-card`.
4. `Pathfinder/components/ChartPlaceholder.tsx` — NEW. Renders `<div data-chart data-chart-id={metric_id} data-chart-type={type}>` placeholder per `ui_plan.charts` entry. No actual chart library.
5. `Pathfinder/app/[slug]/page.tsx` — extend. Read `architecture` via `resolveArchitecture(org.architecture)`, then render KPIStrip → FilterSidebar + Charts + LeadCards. Keep existing nav and JSON debug panel as a `<details>` collapsed block (so the legacy debug stays accessible but doesn't dominate). Replaces stub leads with a small server-side query of `pathfinder.projects` filtered by `org_id` (limit 5) — graceful empty state when none.
6. `Pathfinder/lib/metrics/kpiQueries.ts` — NEW. `kpiQueryByMetricId: Record<string, KpiQueryFn>` initially empty. `getKpiValue(metric_id)` returns `null` for any unmapped id with a TODO comment. Stubbed so Slice 3+ can swap real queries in without touching the component.

## Test plan (TDD — failing tests first)

`Pathfinder/__tests__/components/`:
- `KPIStrip.test.tsx`: renders one `data-kpi-card` per kpis entry; shows label; shows `—` for unmapped metric_id; renders unit/target when present; container has `data-kpi-strip`.
- `FilterSidebar.test.tsx`: renders one control per filters entry; uses `filter.default` as initial value when present.
- `ChartPlaceholder.test.tsx`: renders `data-chart` with correct `data-chart-type` and `data-chart-id`; renders one per charts entry inside a wrapper.
- `LeadCard.test.tsx`: renders primary fields prominent, secondary fields in expandable details; container has `data-lead-card`; respects `score_position`.

## DoD smoke step 8 expected delta

Before: `step 8` BLOCKED with `hasKpiStrip:false, hasLeadCard:false, hasChart:false`.
After: with a real org persisted and the route reachable, step 8 returns PASS (or at minimum BLOCKED with `hasKpiStrip:true, hasLeadCard:true, hasChart:true` — markers now present even on empty data). The kpis/leads/charts arrays will still be empty for an org with no architecture, but the wrapper markers render unconditionally so the smoke harness sees them.

## Out of scope

- Headless verification Inngest function (Slice 3).
- Iterate-to-green loop (Slice 4).
- `build_out_complete` flip (Slice 5).
- Recharts/D3 wiring inside ChartPlaceholder.
- Real metric query functions (returning `—` is acceptable).
- Filter sidebar applying filters to actual leads list.

## Verification (run inside worktree)

```
cd Pathfinder && pnpm typecheck && pnpm lint && pnpm test
```

Auto-merge gates: PR checks all SUCCESS + 4 Vercel previews SUCCESS. Codex SKIP (usage limit) noted in PR body.
