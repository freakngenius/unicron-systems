# PLAN — Stream D, Pipeline and Delivery

Branch: `stream-d-pipeline-delivery` (off `origin/main` at `3c2c927` Stream A merge).
Scope: replace two Stream A floor stubs (pipeline-kanban, daily-digest) for Internal (#4) only. Zedcor and Funder unaffected.

## Discovery, verbatim

- Stream A catalog lives at `Pathfinder/lib/catalog/{types,registry,floor-stubs,gating,validation,renderer,index}.ts`. Module ids and slots are fixed by `registry.ts`.
- `pipeline-kanban` is registered at slot `pipeline.board`, hard-gated on `data_signal/pipeline_stages`, fallback `floor`.
- `daily-digest` is registered at slot `delivery.digest`, hard-gated on `data_signal/verified_companies` + `integration/slack`, fallback `hidden`, agent `briefer`.
- Internal's `architecture.modules` block (from `supabase/migrations/20260530_internal_modules_block.sql`) enables both modules with `{ "enabled": true }`.
- Org-context nav helper: `Pathfinder/lib/nav/orgPath.ts` exports `buildOrgPath`, `orgPaths.leadDetail(slug, projectId)`.
- Design primitives: `Pathfinder/lib/design/tokens.ts` (color/space/radius/font/scoreColor) and `Pathfinder/components/design/{Card,ScoreBadge,WhyLine,EmptyState,SectionHeader}`.
- The Internal pipeline route is `Pathfinder/app/[slug]/pipeline/page.tsx` (currently Funder-only; reads `architecture.pipeline.stages` + `raw_payload.funder_pipeline_stage`; no drag/persistence).
- Zedcor pipeline reference: `Pathfinder/components/pipeline/PipelineKanban.tsx` (HTML5 native drag, optimistic update, POSTs to `/pathfinder/api/deals/[id]/stage`). Zedcor route is `Pathfinder/app/pipeline/page.tsx` and reads `deals` via `listDealsWithProjects`.
- Deal model: `deals` table with `pipeline_stage: DealPipelineStage = NEW | CONTACTED | REPLIED | MEETING | PROPOSAL | WON | LOST`. Move endpoint is `POST /pathfinder/api/deals/[id]/stage` body `{ to_stage }` and is idempotent on noop (`lib/deals.ts` `moveDealStage`).
- Internal digest already exists: `Pathfinder/lib/agents/internal/digest.ts` `composeInternalDigest()` plus the cron handler at `Pathfinder/app/api/cron/internal-digest/route.ts`. The cron posts to `INTERNAL_SLACK_WEBHOOK_URL` and seeds deals at `NEW` for newly verified Internal projects.
- `vercel.json` `crons: []` — the existing internal-digest handler is not yet wired to a Vercel cron schedule.
- Internal pipeline stage labels per architecture JSON: `new-outreach-ready` (New / Outreach Ready), `contacted` (Contacted), `in-conversation` (In conversation), `demo-scheduled` (Demo scheduled), `proposal` (Proposal), `won` (Won), `lost` (Lost).

## Internal stage ↔ DealPipelineStage mapping (1:1)

| Internal stage id    | DealPipelineStage | Label                |
|----------------------|-------------------|----------------------|
| new-outreach-ready   | NEW               | New / Outreach Ready |
| contacted            | CONTACTED         | Contacted            |
| in-conversation      | REPLIED           | In conversation      |
| demo-scheduled       | MEETING           | Demo scheduled       |
| proposal             | PROPOSAL          | Proposal             |
| won                  | WON               | Won                  |
| lost                 | LOST              | Lost                 |

This lets pipeline-kanban reuse the existing `deals` table and the existing `POST /api/deals/[id]/stage` endpoint without backend changes. The Internal labels are the only Internal-specific surface; the stored enum is shared.

## Module 1 — pipeline-kanban (slot `pipeline.board`)

### Files

NEW:
- `Pathfinder/lib/catalog/modules/pipeline-kanban/internalStageMap.ts` — `INTERNAL_TO_DEAL`, `DEAL_TO_INTERNAL`, stage-ordering helpers.
- `Pathfinder/lib/catalog/modules/pipeline-kanban/PipelineKanbanModule.tsx` — server entry that hydrates org deals + projects, hands to the client island.
- `Pathfinder/lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland.tsx` — `'use client'`, owns drag-and-drop state, optimistic update, persists via `POST /pathfinder/api/deals/[id]/stage`.
- `Pathfinder/__tests__/catalog/modules/pipeline-kanban.test.tsx` — unit tests.

EDIT:
- `Pathfinder/lib/catalog/floor-stubs.tsx` — replace `FLOOR_STUB_LOADERS['pipeline-kanban']` with a real lazy import of the module entry.
- `Pathfinder/app/[slug]/pipeline/page.tsx` — wire `resolveSlot('pipeline.board', ctx)`. Mode `active` renders the module. Other modes render the existing Funder fallback (byte-identical for slugs without a modules block).
- `MEMORY/spec-references.md` — entries for every new `lib/` file.

### Behavior

- `PipelineKanbanModule` (server):
  - Receives `ModuleComponentProps` `{ org, architecture, config, affordances }`.
  - Reads `architecture.pipeline.stages` and `architecture.pipeline.stage_labels`.
  - Queries `deals` joined with `projects` filtered by `projects.organization_id = org.id`, ordered by `score desc`.
  - Buckets by `DEAL_TO_INTERNAL[deal.pipeline_stage]`, defaulting to `new-outreach-ready` if unmapped.
  - Renders `<PipelineKanbanIsland>` with `org`, `stages`, `stageLabels`, `initialDealsByStage`, `leadDetailHref` factory.
- `PipelineKanbanIsland` (client):
  - Seven columns by stage order. Column header: stage label + count. Empty-state via `EmptyState` primitive.
  - Cards use the `Card` primitive, render `company_name` (from `project.title`), `service_category` (from `raw_payload.internal_enrichment.service_category` or `raw_payload.internal_inferred_service_category`), and `ScoreBadge`. Click navigates via `orgPaths.leadDetail(slug, projectId)`.
  - Drag is native HTML5 (mirrors Zedcor `PipelineKanban.tsx`); on drop, optimistic update, then `POST /pathfinder/api/deals/[id]/stage` with `to_stage = INTERNAL_TO_DEAL[targetInternalStage]`. On non-2xx, revert and surface inline error.
  - Reuses the design primitives so the card matches the ranked-feed visual language; no new color or radius tokens.

### Gating

- The module is registered hard-gated on `data_signal/pipeline_stages`. The default Supabase gate context returns true when any project exists for the org (see `lib/catalog/gating.ts`). Internal has projects, so the gate is met. Funder has projects but no `modules.pipeline-kanban` entry, so the slot stays floor.
- Stream A's renderer falls back to floor mode when the org has no claim, so Funder and Zedcor keep their current rendering.

## Module 2 — daily-digest (slot `delivery.digest`, non-visual)

### Files

NEW:
- `Pathfinder/lib/catalog/modules/daily-digest/DailyDigestModule.tsx` — non-visual component that returns the same invisible marker as the floor stub. Catalog metadata only; the cron is the actual delivery.
- `Pathfinder/lib/catalog/modules/daily-digest/runner.ts` — pure function `runInternalDailyDigest()` that performs the gated digest pipeline (verifies slack + verified_companies, composes via `composeInternalDigest`, posts to Slack via the existing path, seeds deals at new-outreach-ready / NEW). Exported for the cron route and tests.
- `Pathfinder/__tests__/catalog/modules/daily-digest.test.ts` — unit tests for the gate and the loader target.

EDIT:
- `Pathfinder/lib/catalog/floor-stubs.tsx` — replace `FLOOR_STUB_LOADERS['daily-digest']` with the new module's lazy import.
- `Pathfinder/app/api/cron/internal-digest/route.ts` — call `runInternalDailyDigest()` instead of the inline body. Keep the same JSON shape so any existing operator tooling does not break.
- `Pathfinder/vercel.json` — add the digest cron entry with a numeric day-of-week (`"path": "/api/cron/internal-digest", "schedule": "0 14 * * 1,2,3,4,5"` for Mon–Fri 14:00 UTC weekday mornings US Pacific 06:00–07:00).
- `MEMORY/spec-references.md` — entries for new `lib/` files.

### Behavior

The cron handler delegates to `runInternalDailyDigest`. The runner:
1. Loads Internal org by slug.
2. Loads verified projects in the configured window (default 24h).
3. If `verified_companies` empty → returns `{ skipped: 'no_verified_companies' }` and does NOT post. (Hard gate.)
4. If `INTERNAL_SLACK_WEBHOOK_URL` absent → returns `{ skipped: 'no_slack_integration' }` and does NOT post. (Hard gate on `integration/slack`.)
5. Composes the digest with `composeInternalDigest()` (reuse, no rebuild).
6. Posts to Slack via the existing webhook path in the cron route (factored into `runner.ts`).
7. Seeds `deals` at `pipeline_stage='NEW'` (== `new-outreach-ready` per the mapping) for the day's verified projects that don't already have one.

The module itself is `fallback: 'hidden'`; the renderer never tries to render it visually. The cron is the delivery.

## Tests

### Unit

- `pipeline-kanban.test.tsx`:
  - `INTERNAL_TO_DEAL` and `DEAL_TO_INTERNAL` are inverse and cover all seven stages.
  - Island renders seven columns in the right order with stage labels.
  - Drag from one stage to another triggers `fetch('/pathfinder/api/deals/<id>/stage', { method: POST, body: { to_stage } })` with the mapped enum value, optimistically updates the bucket, and reverts on a non-2xx response.
  - Card click invokes the leadDetail href with the org slug intact (via `orgPaths.leadDetail`).
- `daily-digest.test.ts`:
  - `runInternalDailyDigest` returns `{ skipped: 'no_slack_integration' }` when `INTERNAL_SLACK_WEBHOOK_URL` is unset; does not post or insert.
  - Returns `{ skipped: 'no_verified_companies' }` when the verified projects list is empty; does not post or insert.
  - When both gates met, the top-N selection matches `composeInternalDigest` and the loader seeds `deals.pipeline_stage='NEW'` (== new-outreach-ready) only for projects without an existing deal.

### Smoke / render

- The Internal pipeline route mounts at `/pathfinder/internal/pipeline`, renders seven columns named per `stage_labels`, and a card carries an href to `/internal/leads/<id>` (verified via `buildOrgPath`).

### Regression

- The Funder pipeline test asserts that for the `funder` slug (no modules block) the route renders the existing funder pipeline output byte-equivalent to today (compares the rendered tree against the pre-edit baseline — no behavior change for orgs without a `modules.pipeline-kanban` entry).
- Zedcor's `/pipeline` route (`app/pipeline/page.tsx`) is not touched; the existing PipelineKanban regression suite continues to pass.

## Auto-merge gate

ALL must hold before merge:
- `pnpm install --frozen-lockfile` ok.
- `pnpm build`, `pnpm lint`, `pnpm typecheck` green.
- `pnpm test` green (full suite, not just new tests).
- `MEMORY/spec-references.md` updated for every new `lib/` file.
- `vercel.json` cron uses numeric day-of-week.
- Pathfinder Vercel preview builds green.
- No edits to `app/pipeline/page.tsx`, `components/pipeline/PipelineKanban.tsx`, or any other Zedcor-only surface. No backend or schema changes beyond wiring.

## Auto-revert triggers

- Post-merge Pathfinder Vercel deploy failure.
- A drag in Internal's pipeline that does not persist (verified via the smoke test).
- The digest posting for the wrong org (verified via slug guard in `runInternalDailyDigest`).

## Hard-halt

- Destructive-git situation.
- Any backend or schema change required beyond wiring the existing briefer + Slack path.
- An unresolved failing test after honest iteration.

## Order of execution

1. Write `internalStageMap.ts` + the pipeline-kanban module files + island + the floor-stubs wiring.
2. Wire `app/[slug]/pipeline/page.tsx` to use `resolveSlot` and fall back to existing Funder rendering.
3. Write `daily-digest/runner.ts` + module + floor-stubs wiring; refactor cron route to delegate.
4. Update `vercel.json` with the numeric day-of-week cron.
5. Add `MEMORY/spec-references.md` entries.
6. Write unit + smoke + regression tests.
7. Run full verification.
8. Kanban → In Process. Push branch. Open PR with verbatim evidence. Auto-merge when gate passes.
9. On merge, kanban → Deployed with implemented-at / merged-at stamps. Never Verified.
