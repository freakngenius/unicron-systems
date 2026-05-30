# Stream A, Foundation, PLAN

Branch: `feat/stream-a-foundation`
Worktree: `cloned-repo-worktrees/stream-a-foundation`
Base: `e82b6eb` (Sprint Z16, current `main`).

This is the shared scaffold the three later surface streams (B, C, D) import. Five additive parts. No surface change to Zedcor (#1), Realberry (#2), or Funder (#3). Internal (#4) receives an additive `modules` block in its persisted architecture jsonb.

## Discovered paths (verbatim)

Floor renderer + routing
- `Pathfinder/app/[slug]/page.tsx`, the dashboard. Reads `architecture.ui_plan` and renders KPIStrip + FilterSidebar + FunderChartGrid + LeadCardList. This is the "floor" Stream A preserves.
- `Pathfinder/app/[slug]/layout.tsx`, OrgContext provider + operator session validation. `PUBLIC_SLUGS = {funder, internal, zedcor}` is the public-by-host gate.
- `Pathfinder/app/[slug]/leads/page.tsx`, list view.
- `Pathfinder/app/[slug]/leads/[projectId]/page.tsx`, detail view. Wires `CompanyDetailContents` for `lead_unit.name === 'company'` (Internal), `FunderDetailContents` otherwise.
- `Pathfinder/app/[slug]/pipeline/page.tsx`, pipeline kanban view.
- `Pathfinder/app/[slug]/not-found.tsx`.

Org loading + architecture model
- `Pathfinder/lib/types/architecture.ts`, `OrgArchitecture`, `UIPlan`, vocab, lead_unit, scoring, sources, integrations. Will be extended additively with an optional `modules?: Record<string, OrgModuleEntry>` field.
- `Pathfinder/lib/config/resolveArchitecture.ts`, partial->full merge. Will be extended to pass-through a `modules` block.
- `Pathfinder/lib/config/baseTemplate.ts`, `BASE_ARCHITECTURE` default (volume emphasis, empty layout arrays).
- `Pathfinder/lib/agents/loadOrgArchitecture.ts`, server-side loader for Inngest functions.
- `Pathfinder/Pathfinder-Internal-Architecture.json`, seed JSON for Internal (#4, slug=internal). Read-only reference; the live persisted row in `pathfinder.organizations` is the migration target.

Per-org Inngest dispatch
- `Pathfinder/lib/inngest/client.ts`, `Pathfinder/lib/inngest/events.ts`.
- `Pathfinder/lib/inngest/functions/ingest-all-orgs-cron.ts`, per-org dispatcher.
- `Pathfinder/lib/inngest/functions/org-created.ts`, `ingest-router.ts`, plus per-agent fns. No edits needed for Stream A.

Zedcor quality reference
- `Pathfinder/components/zedcor/ZedcorLeadList.tsx`, palette `#0e1116` / `rgba(91,127,255,0.20)` / `#5B7FFF` / `#FFB454` / `#3DDC97`, mono labels, score pill.
- `Pathfinder/components/zedcor/ScoreDistributionWidget.tsx`, card density, mono uppercase section header pattern.
- `Pathfinder/components/zedcor/ZedcorBranchMap.tsx`, `ZedcorRelationshipContext.tsx`.

Existing "floor" UI primitives (the ones Stream A wraps with shared design primitives)
- `Pathfinder/components/KPIStrip.tsx`, `Chart.tsx`, `LeadCard.tsx`, `FilterSidebar.tsx`, `components/lead/LeadDetailShell.tsx`.

Tests + config
- `Pathfinder/vitest.config.ts`, vitest, node env, `@/` -> Pathfinder root. Test glob: `__tests__/**/*.test.{ts,tsx}` + `lib/**/__tests__/**/*.test.{ts,tsx}`.
- `Pathfinder/__tests__/config/resolveArchitecture.test.ts`, convention reference.

basePath
- `Pathfinder/next.config.js`, `basePath: '/pathfinder'`, `assetPrefix: '/pathfinder'`. Host routing for `internal.unicron.systems -> /pathfinder/internal` lives in workspace-root `middleware.ts`.

## File scope for Stream A

New files
- `Pathfinder/lib/catalog/types.ts`
- `Pathfinder/lib/catalog/registry.ts`
- `Pathfinder/lib/catalog/floor-stubs.tsx`
- `Pathfinder/lib/catalog/validation.ts`
- `Pathfinder/lib/catalog/gating.ts`
- `Pathfinder/lib/catalog/renderer.ts`
- `Pathfinder/lib/catalog/index.ts`
- `Pathfinder/lib/nav/orgPath.ts`
- `Pathfinder/lib/design/tokens.ts`
- `Pathfinder/components/design/Card.tsx`
- `Pathfinder/components/design/ScoreBadge.tsx`
- `Pathfinder/components/design/WhyLine.tsx`
- `Pathfinder/components/design/EmptyState.tsx`
- `Pathfinder/components/design/SectionHeader.tsx`
- `Pathfinder/components/design/index.ts`
- `Pathfinder/app/[slug]/companies/page.tsx` (Phase 0 redirect)
- `Pathfinder/supabase/migrations/20260530_internal_modules_block.sql`
- `Pathfinder/scripts/verify-orgs-byte-unchanged.ts`
- `Pathfinder/__tests__/catalog/validateOrgModules.test.ts`
- `Pathfinder/__tests__/catalog/resolveGate.test.ts`
- `Pathfinder/__tests__/catalog/renderer.test.ts`
- `Pathfinder/__tests__/nav/orgPath.test.ts`
- `Pathfinder/docs/PLAN-stream-a-foundation.md` (this file)

Additive edits (single-line additions only, behavior unchanged)
- `Pathfinder/lib/types/architecture.ts`, add optional `modules?: Record<string, OrgModuleEntry>` to `OrgArchitecture`.
- `Pathfinder/lib/config/resolveArchitecture.ts`, pass-through `p.modules` if present.
- `MEMORY/spec-references.md`, entries for the new `lib/catalog/*`, `lib/nav/orgPath.ts`, `lib/design/tokens.ts` files.

No edits expected
- Zedcor / Funder / Realberry components, routes, or seed JSON.
- `next.config.js`, `vercel.json`, `middleware.ts`.
- Existing Inngest functions.

## Slot grammar

`Slot` union (one-module-one-slot rule enforced by `validateOrgModules`):
- `dashboard.hero`, `dashboard.kpi`, `dashboard.charts`, `dashboard.filters`
- `detail.body`, `detail.outreach`, `detail.relationships`
- `pipeline.board`
- `delivery.digest`

## Dependency grammar

`Dependency = { kind, ref, gate }`
- `kind: 'schema_field'`, resolves against `org.architecture.lead_unit.schema[ref]`.
- `kind: 'integration'`, resolves against `org.architecture.integrations` includes `ref`.
- `kind: 'agent'`, resolves against `org.architecture.agents` includes `ref` (extension; absent today => unmet).
- `kind: 'data_signal'`, async query against pipeline output for non-empty. Resolver delegates to a pluggable `GateContext` so tests can stub.
- `gate: 'hard'`, unmet -> module is refused at validation time / falls back to floor at render time.
- `gate: 'soft'`, unmet -> module renders its `inactive` fallback.

## Module registry, eleven entries

| id | slot | agent | dependencies | fallback |
|---|---|---|---|---|
| ranked-feed | dashboard.hero | none | schema_field/score/hard, data_signal/verified/hard | floor |
| company-detail | detail.body | none | data_signal/enriched_record/hard, data_signal/score_components/hard, data_signal/sources/soft | floor |
| outreach-composer | detail.outreach | outreach-drafter | data_signal/outreach_drafts/soft, integration/resend/hard | inactive |
| hubspot-sync | (action affordance inside detail.outreach) | none | integration/hubspot/hard | floor |
| pipeline-kanban | pipeline.board | none | data_signal/pipeline_stages/hard | floor |
| filter-rail | dashboard.filters | none | schema_field per configured filter/soft | floor |
| warm-intro-panel | detail.relationships | adjacency-mapper | data_signal/adjacency_graph/soft | inactive |
| kpi-strip | dashboard.kpi | none | data_signal per configured metric/soft | inactive |
| analytics-charts | dashboard.charts | none | data_signal/aggregate_queries/soft | inactive |
| daily-digest | delivery.digest | briefer | data_signal/verified_companies/hard, integration/slack/hard | hidden |
| geo-map | detail.body | geo-mapper | data_signal/geocoded_coords/hard | hidden |

## Slot-collision resolution for hubspot-sync

The spec table lists `hubspot-sync` against `detail.outreach`. Under the one-module-one-slot rule that conflicts with `outreach-composer`. Resolution: `hubspot-sync` does NOT register as a slot-claiming module. It registers with `slot: 'detail.outreach'` and `slotMode: 'action-affordance'` (no exclusive slot claim). `validateOrgModules` excludes any module with `slotMode === 'action-affordance'` from the slot-uniqueness check. `outreach-composer`'s contract exposes an action-affordance array its renderer iterates over so HubSpot-sync renders as a button inside the outreach panel. `geo-map` claims `detail.body` only when enabled, which no org does today, so no live collision.

## Renderer slot resolution

```
for each slot in Slot union:
  candidate = modules where definition.slot === slot AND entry.enabled AND slotMode !== 'action-affordance'
  if candidate.length === 0 => render ui_plan floor for this slot
  else:
    pick the single candidate (collision rejected upstream)
    resolve each dependency via resolveGate(dep, org)
    if any hard dep unmet:
      log misconfiguration, render ui_plan floor for this slot
    else if any soft dep unmet:
      render module.inactive fallback
    else:
      render module.active component
```

Action-affordance modules (e.g. hubspot-sync) are collected per-slot and made available to the slot-claiming module's renderer via the slot context.

## Internal (#4) additive `modules` block

Persist into `pathfinder.organizations.architecture.modules` for `slug='internal'` only:

```json
{
  "ranked-feed":        { "enabled": true },
  "company-detail":     { "enabled": true },
  "outreach-composer":  { "enabled": true },
  "hubspot-sync":       { "enabled": true },
  "pipeline-kanban":    { "enabled": true },
  "filter-rail":        { "enabled": true },
  "warm-intro-panel":   { "enabled": true },
  "daily-digest":       { "enabled": true },
  "kpi-strip":          { "enabled": true,  "config": { "metrics": ["verified_count_1d", "active_motion_pct", "avg_score", "sources_live"] } },
  "analytics-charts":   { "enabled": true,  "config": { "emphasis": "secondary" } },
  "geo-map":            { "enabled": false }
}
```

Zedcor (#1), Realberry (#2), Funder (#3) receive no `modules` key in the same migration. A query-based assertion in `scripts/verify-orgs-byte-unchanged.ts` confirms their `architecture` rows are byte-identical before and after the migration applies.

## Phase 0 verification

- Dashboard scroll: page.tsx has `minHeight: '100vh'` with no `overflow: hidden`. Confirm at render and via Playwright probe.
- Companies route loads: add `Pathfinder/app/[slug]/companies/page.tsx` that issues `redirect(buildOrgPath(slug, 'leads'))` so typing `/pathfinder/internal/companies` does not 404. Zedcor / Funder / Realberry visitors who type `/leads` are unaffected; visitors who type `/companies` will now land on the canonical `/leads` for every org via the same shared route.
- Sub-page back-link returns to `/pathfinder/internal`: `LeadDetailShell.tsx` already uses `/${slug}` paths in the breadcrumb. Confirm by reading the rendered breadcrumb. Grep for hardcoded `/pathfinder/leads` paths that leak Zedcor's slug-less pattern; patch any in-scope.
- Tiles open detail view: page.tsx wraps `LeadCardList` in `<Link href="/${slug}/leads/${id}">` already. Pipeline page does the same. Confirm via render snapshot.

## `buildOrgPath` helper

Exported from `Pathfinder/lib/nav/orgPath.ts` for use by every later surface module. Signature:

```
buildOrgPath(slug: string, ...segments: Array<string | { segment: string; raw?: boolean }>): string
```

- Always prefixes `/${slug}`.
- URL-encodes every segment unless `{ raw: true }`.
- Strips leading slashes so callers do not double up.
- Throws on empty slug (caller bug).

Usage: `buildOrgPath('internal', 'leads', projectId)` -> `/internal/leads/<encoded id>`. Surface streams import this and never construct `/${slug}/...` manually.

## Design primitives (PART 5)

Calibrated to Zedcor: `BG #0e1116`, `BORDER rgba(91,127,255,0.20)`, `TEXT #e6e9ef`, `TEXT_MUTED #9aa3b2`, `ACCENT #5B7FFF`, score-high `#FFB454`, score-mid `#3DDC97`, mono `var(--font-jetbrains-mono)`.

- `lib/design/tokens.ts`, TS const objects: `color`, `space`, `radius`, `font`, `fontSize`, `letterSpacing`. No CSS, no Tailwind tokens added; the codebase uses inline styles today.
- `components/design/Card.tsx`, `<Card>` shell. Variants: `default`, `subtle`. Accepts `as` polymorphism for `<Link>` children when surface streams want clickable cards.
- `components/design/ScoreBadge.tsx`, `<ScoreBadge score={n | null} />`. Threshold-tinted (`>=80` HI, `>=60` GREEN, else MUTED), monospace.
- `components/design/WhyLine.tsx`, `<WhyLine>{text}</WhyLine>`. One-line muted explainer with a leading bullet glyph.
- `components/design/EmptyState.tsx`, `<EmptyState title icon? body? action?>`. Designed empty state, not dashed-border placeholder.
- `components/design/SectionHeader.tsx`, `<SectionHeader eyebrow? title trailing?>`. Mono uppercase eyebrow + title + optional trailing slot.
- `components/design/index.ts`, re-exports.

## Tests

- `__tests__/catalog/validateOrgModules.test.ts`
  - rejects unknown module id
  - rejects two enabled modules claiming the same slot (excludes action-affordance modules from the check, asserts hubspot-sync alongside outreach-composer is allowed)
  - rejects pinned version not present in registry
  - rejects config that fails the module configSchema
  - rejects hard-gate unmet at config time (when a synchronous gate is unmet, e.g. integration missing)
  - accepts Internal's modules block as a fixture against the Internal architecture
- `__tests__/catalog/resolveGate.test.ts`
  - schema_field met / unmet (`score` present vs absent in `lead_unit.schema`)
  - integration met / unmet (`hubspot` present vs absent in `integrations`)
  - agent met / unmet (delegated to context; stubbed)
  - data_signal met / unmet (delegated to context; stubbed)
- `__tests__/catalog/renderer.test.ts`
  - every slot falls back to the floor when no module is enabled
  - active stub renders when all hard+soft gates met
  - inactive renders when a soft gate is unmet
  - floor renders when a hard gate is unmet (no crash; misconfiguration logged)
  - action-affordance module renders inside the slot-claiming module's affordance slot
- `__tests__/nav/orgPath.test.ts`
  - encodes segments
  - leaves `raw: true` segments alone
  - strips leading slashes
  - throws on empty slug
- `scripts/verify-orgs-byte-unchanged.ts` (run during CI verification)
  - asserts `architecture` jsonb for `slug in ('zedcor','realberry','funder')` matches its pre-migration snapshot, byte-for-byte.

## Verification gates

Local (`pnpm` from inside `Pathfinder/`):
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Workspace policy (CLAUDE.md, MEMORY/spec-references.md):
- Add `MEMORY/spec-references.md` entries for every new `lib/` file.
- No em-dashes or en-dashes in code, comments, commits, or PR text.
- No time estimates or numeric cost caps.

Multi-Vercel:
- Pathfinder Vercel preview must build green for this branch.
- `unicron-platform` Vercel project is independent. This PR makes no edits inside `unicron-platform/`, so its preview should be a no-op or untouched. Confirm in PR body.

Auto-merge gate, per dispatch prompt and project CLAUDE.md
- All boolean gates above green.
- Three non-Internal org rows byte-unchanged.
- **PR is opened, not merged in-session.** Project CLAUDE.md is explicit: "Never merge your own PR. Open the PR, hand off, wait." The dispatch prompt's "auto-merge to main" language is interpreted as "auto-merge criteria all green, then human merges." Human merges from the auto-merge-criteria-green PR.

Auto-revert triggers (post-merge, by operator):
- Pathfinder Vercel deploy fails -> revert merge, move card to Bug Fixes.
- Any of Zedcor / Realberry / Funder renders differently than before -> revert merge, move card to Bug Fixes with evidence.

Hard-halt: destructive-git situation, schema change beyond the additive migration, or an unresolved failing test after honest iteration.

## Kanban

- Start: card "Stream A: catalog foundation + shared scaffold" created in `In Process`. URL captured in session.
- End-of-PR-open: card stays in `In Process` until human-triggered merge. Once merged, card moves to `Deployed` with "Implemented at <commit-sha> · merged at <ISO timestamp>" appended to content. `Verified` is human-only and is never touched by this session.
