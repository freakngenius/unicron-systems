# Wire Vercel Speed Insights for verdict-line ≤200ms acceptance

**Filed:** 2026-05-03
**Status:** Queued — follow-up from Gate 7C
**Origin:** Gate 7C deferred SPEC acceptance criterion #4 ("Decision Bar verdict line renders within 200 ms of page load") because Speed Insights / Web Vitals isn't wired in this codebase.

## Scope

1. `pnpm add @vercel/speed-insights`
2. Mount `<SpeedInsights />` in `Pathfinder/app/layout.tsx` (or the closest applicable root layout — Pathfinder is mounted at unicron.systems/pathfinder via a parent rewrite).
3. Wire a custom Web Vitals handler that captures `performance.getEntriesByName('decision-bar-verdict-rendered')` against navigation start. The mark name is exported from `components/lead/DecisionBar.tsx` as `VERDICT_RENDERED_MARK`.
4. Capture telemetry to a route or to the Speed Insights dashboard. Verify on a sample of production lead detail page loads that mark-time relative to nav-start ≤ 200 ms.

## Why deferred from 7C

- Codebase has no existing Web Vitals plumbing — installing + wiring would have expanded 7C scope significantly.
- The underlying constraint behind acceptance #4 (DecisionBar renders fully synchronously, no async data hooks) is asserted in 7C unit tests.
- Risk that the criterion is not met is low: DecisionBar takes only a Project prop (server-fetched once) and `matches` (also server-fetched once). No client fetches block the render.

## Acceptance for closing

- `@vercel/speed-insights` installed + mounted
- VERDICT_RENDERED_MARK captured into Speed Insights or equivalent
- Production sample ≥ 100 page loads shows p95 mark-time ≤ 200 ms
- Spec acceptance criterion #4 marked `passed` in PROJECT.md / spec sequence doc
