# SPEC — Pathfinder Build-Out Pass (Architecture-Driven UI Generation)

The final phase after Architect blueprint → operating agent fleet → real data flowing. The system designs the customer's tailored Pathfinder UI based on the architecture JSON and the current Pathfinder design system, codes it, tests it, iterates until passing. Result: a fully customized Pathfinder at the customer's unique URL.

## What ships

1. **UI Plan generation in Architect output.** Architect's blueprint includes a new `ui_plan` section describing how the customer's Pathfinder should be laid out: which lead schema fields to surface as primary, which charts to emphasize, which filters to expose, which KPIs to highlight, how the pipeline kanban should organize.

2. **Pathfinder schema-driven renderer (extend Phase 2D).** The customer-specific Pathfinder route at `/[slug]` reads `org.architecture.ui_plan` and renders:
   - Lead card layout per `ui_plan.lead_card_layout` (which fields prominent, which collapsed)
   - Top KPI strip per `ui_plan.kpis` (which metrics, target values, units)
   - Charts per `ui_plan.charts` (time-series, breakdowns, with chart type per chart)
   - Pipeline kanban stages per `architecture.pipeline.stages` (already shipped in 2D)
   - Filter sidebar per `ui_plan.filters` (which fields filterable, default selections)
   - Empty state copy per `architecture.vocabulary` (already shipped)
   - Branding per `architecture.branding` (already shipped)

3. **Build-out verification agent.** After org persistence + first ingestion + UI rendering, a verification agent runs:
   - Headless browser visit to `/[slug]` route
   - Screenshot capture
   - Assert all sections render (no blank panels, no error states)
   - Assert real data visible (at least N leads per `architecture.scoring.thresholds`)
   - Assert vocabulary substitution correct (no fallback to base template strings)
   - Assert no console errors
   - Return verdict: pass / fail-with-reason
   - On fail: surface diagnostic to operator + file Bug Fix card

4. **Iterate-to-green loop.** If verification fails, the build-out pass enters a fix loop:
   - Identify failure category (data, layout, vocab, error)
   - Apply targeted fix (rerun ingestion, adjust ui_plan, regenerate component, etc.)
   - Re-verify
   - Loop until pass or max 5 attempts; on max, escalate to operator

5. **Final output: ready-to-view tailored Pathfinder.** Status flips `build_out_complete` once verification passes. Operator deep-link from Metacron Customers tab opens the tailored Pathfinder at customer's unique URL with real per-org data.

## Architecture JSON extension

```typescript
export interface OrgArchitecture {
  // ... existing fields
  ui_plan: UIPlan;
}

export interface UIPlan {
  lead_card_layout: {
    primary_fields: string[];      // 3-5 fields displayed prominently
    secondary_fields: string[];    // additional fields in expandable section
    score_position: 'top-right' | 'top-left' | 'bottom';
  };
  kpis: Array<{
    label: string;                 // "Leads this week"
    metric_id: string;             // maps to a query function
    unit?: string;                 // "%", "$", null
    target?: number;
    invert?: boolean;              // lower is better
  }>;
  charts: Array<{
    title: string;
    type: 'line' | 'bar' | 'pie' | 'area';
    metric_id: string;
    grouping?: string;             // "day", "week", "source", "asset_class"
  }>;
  filters: Array<{
    field: string;                 // lead schema field name
    label: string;
    default?: any;
  }>;
  dashboard_emphasis: 'volume' | 'quality' | 'velocity' | 'coverage';
}
```

## Architect prompt extension

Append to Architect's system prompt after business_summary generation:

```
After business_summary, generate a ui_plan object describing how the customer's dashboard should be laid out. Choose 3-5 most-meaningful lead fields for prominent display based on the customer's vertical. Select KPIs that matter for their business model (deal volume for acquirers, conversion rate for sales orgs, coverage for fleet/asset orgs). Pick chart types that match the data shape. Default dashboard_emphasis based on the customer's stated priority: 'volume' for high-throughput orgs, 'quality' for high-stakes deal orgs, 'velocity' for fast-cycle orgs, 'coverage' for geographic expansion orgs.
```

## Pathfinder renderer changes

`Pathfinder/app/[slug]/page.tsx`:
- Read `org.architecture.ui_plan`
- Pass to dashboard layout components
- Each component renders per its plan section

`Pathfinder/components/KPIStrip.tsx` (new):
- Accepts `architecture.ui_plan.kpis`
- Renders each as a card with label, current value (from real query), target indicator
- Uses Atrium v3 design tokens

`Pathfinder/components/Chart.tsx` (extend):
- Accepts chart config from `ui_plan.charts`
- Queries metric_id against real per-org data
- Renders per chart.type

`Pathfinder/components/LeadCard.tsx` (extend):
- Already schema-driven from Phase 2D
- Honor `ui_plan.lead_card_layout` for which fields go where

`Pathfinder/components/FilterSidebar.tsx` (extend):
- Honor `ui_plan.filters` for which controls to expose

## Build-out verification

Inngest function `verify_build_out`:
```typescript
export const verifyBuildOut = inngest.createFunction(
  { id: 'verify-build-out' },
  { event: 'org.ready_to_view' },
  async ({ event, step }) => {
    const { organization_id } = event.data;
    const org = await step.run('fetch', async () => fetchOrg(organization_id));
    
    // Headless browser check
    const result = await step.run('headless-check', async () => {
      const browser = await playwright.chromium.launch();
      const page = await browser.newPage();
      await page.goto(`${PATHFINDER_URL}/${org.slug}`, { auth: operatorSession });
      
      const checks = await page.evaluate(() => ({
        kpiStripRendered: !!document.querySelector('[data-kpi-strip]'),
        leadCardsCount: document.querySelectorAll('[data-lead-card]').length,
        chartsRendered: document.querySelectorAll('[data-chart]').length,
        noErrors: !document.querySelector('[data-error]'),
        consoleErrors: window.__capturedConsoleErrors || []
      }));
      
      const screenshot = await page.screenshot({ fullPage: true });
      await browser.close();
      return { checks, screenshot };
    });
    
    if (result.checks.leadCardsCount < 3 || !result.checks.noErrors || result.checks.consoleErrors.length > 0) {
      await step.run('mark-fail', async () => 
        supabase.schema('pathfinder').from('organizations')
          .update({ status: 'build_out_failed', build_out_diagnostic: result.checks }).eq('id', organization_id)
      );
      return;
    }
    
    await step.run('mark-complete', async () => 
      supabase.schema('pathfinder').from('organizations')
        .update({ status: 'build_out_complete' }).eq('id', organization_id)
    );
  }
);
```

## Acceptance criteria

- Architect output includes `ui_plan` for every new org
- `/[slug]` renders per `ui_plan` — KPIs, charts, lead cards, filters all customer-specific
- Verification agent runs after ready_to_view; status flips build_out_complete on pass
- Build-out fails surface diagnostic + operator action button "Re-architect" (regenerate plan)
- TestCorp synthetic test passes: Architect → ui_plan generated → org persisted → ingestion runs → leads land → /testcorp renders custom UI → verification passes → operator sees real tailored Pathfinder

## Dependencies

- Phase 2A Foundation (live)
- Phase 2C Per-Org Agent Dispatch
- Phase 2D Real Per-Org Dashboard Data
- Phase 2E Onboarding-to-Live state machine
- Architect Business Summary panel (live)

## Out of scope

- True code generation (writing new React component files per customer) — Phase 4
- Custom CSS/HTML per customer beyond token + layout variables
- Customer-self-served UI editing

End.
