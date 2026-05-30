# PLAN: Stream G, Internal pipeline + Notion two-way sync

Branch: `stream-g-pipeline-notion`
Worktree: `/private/tmp/stream-g-pipeline-notion`
Base: `origin/main` @ `aa9794a` (Sprint Z17.1)

## Diagnosis (verified against prod, Supabase ref `anfihcusvekpovcchpoh`)

The launch prompt assumes the kanban needs new draggable code and a new colored-dot palette. Direct prod queries show otherwise:

1. `pathfinder.organizations` row for `internal` has `architecture.modules` = NULL. Migration `supabase/migrations/20260530_internal_modules_block.sql` was committed in Stream A but never applied to prod.
2. As a result, the slot resolver `resolveSlot('pipeline.board')` in `app/[slug]/pipeline/page.tsx` returns `mode != 'active'` for Internal, and the static Funder fallback (same file, lines 144 onward) renders instead of `PipelineKanbanModule`.
3. The funder fallback hardcodes `STAGE_COLORS.contacted = '#22c55e'` (the green dot). Internal's seven stage ids (`new-outreach-ready`, `contacted`, `in-conversation`, `demo-scheduled`, `proposal`, `won`, `lost`) override the fallback's six default funder stages because `architecture.pipeline.stages` is read first. Only `contacted` matches a funder key with a defined color; the other six fall through to the gray default. That is the "stray green on Contacted" symptom.
4. The fallback buckets by `payload.funder_pipeline_stage`. No Internal project has that key, so every project lands in `stages[0] = new-outreach-ready`. That is the "all 229 sit in New / Outreach Ready" symptom.
5. Internal has 229 `projects` rows but only 1 `deals` row. Even after the migration applies and the catalog module mounts, the module reads from `deals JOIN projects` and would render a near-empty board.

The draggable kanban code already exists end-to-end in `lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland.tsx`, the persistence endpoint at `app/api/deals/[id]/stage/route.ts`, the stage map in `internalStageMap.ts`, and the page wiring at `app/[slug]/pipeline/page.tsx` lines 59 to 142. The unit test at `__tests__/catalog/modules/pipeline-kanban.test.tsx` verifies the full drag-persist-revert flow.

## Scope

Stream G delivers:

A. Apply the Stream A modules-block migration to prod so the catalog module mounts for Internal. (Live-only.)
B. Seed `pathfinder.deals` so the 229 Internal projects each have a corresponding deal row at `pipeline_stage = 'NEW'`, additively (no existing deal is overwritten). New idempotent script: `scripts/seed-internal-deals.ts`. Applied to prod after merge.
C. Notion two-way sync, new dedicated database. New files:
   - `lib/notion/internal-pipeline-writer.ts`: create the Notion DB, render a deal as a Notion page, update an existing page's Stage property.
   - `lib/notion/internal-pipeline-mapping.ts`: a `pathfinder.notion_pipeline_pages` table mapping `deal_id` to `notion_page_id`, populated on seed and on first sync.
   - `app/api/notion/internal-pipeline/webhook/route.ts`: receives Notion automation webhooks ("when Stage changes, POST here") and writes the matching deal's `pipeline_stage` through the existing `moveDealStage` helper. HMAC-verified with a shared secret env var.
   - `scripts/seed-internal-pipeline-notion.ts`: one-shot creator. Reads the parent Notion page id from env, calls `notion.databases.create`, writes the new db id back to a configured location, then seeds 229 cards by iterating the deals table.
   - Wire the existing `moveDealStage` post-update path to call `internal-pipeline-writer.updateStageProperty(dealId, toStage)` so app drags propagate to Notion.
D. Additive migration `supabase/migrations/20260530_internal_pipeline_notion_mapping.sql`: new table `pathfinder.notion_pipeline_pages` (id, deal_id, notion_page_id, last_synced_at, synced_from). Indexes on `deal_id` and `notion_page_id`.
E. Test additions:
   - `__tests__/notion/internal-pipeline-writer.test.ts`: property mapping (Company/Score/Service category/Stage/HQ/Source/Detail link), database-create payload shape, update-stage idempotent on same-to-same.
   - `__tests__/api/notion-webhook.test.ts`: signature failure rejects with 401; valid payload moves deal and is idempotent.
F. Operations applied to prod environment (no code, after merge):
   - Apply Stream A migration (Stream G actually applies it).
   - Apply Stream G migration.
   - Run `scripts/seed-internal-deals.ts` against prod.
   - Run `scripts/seed-internal-pipeline-notion.ts` to create the Notion DB and seed 229 cards.
   - `vercel env add NOTION_DB_INTERNAL_PIPELINE production` with the new db id.
   - `vercel env add NOTION_WEBHOOK_SECRET production` with a generated secret.
   - Register the Notion automation that POSTs to the webhook on Stage edits.

The launch prompt presumes the "stage column" needs discovery or addition. There is no missing column. `pathfinder.deals.pipeline_stage` is the column; it is already populated. No Supabase schema change for stage storage. The migration in D only adds the new mapping table for Notion.

The "fix the stage dot" item is resolved by step A. Once the catalog module mounts, the `STAGE_ACCENT` palette in `PipelineKanbanIsland.tsx` lines 50 to 58 takes over. No dot code edit is needed in this stream. If, after live verification, two adjacent columns both render `color.accent` (currently `new-outreach-ready` and `contacted` share `color.accent`), I will add a single-column accent tweak in this PR.

## Scope discipline

Touched paths (file scope of this stream):
- `lib/notion/internal-pipeline-writer.ts` (new)
- `lib/notion/internal-pipeline-mapping.ts` (new)
- `app/api/notion/internal-pipeline/webhook/route.ts` (new)
- `app/api/deals/[id]/stage/route.ts` (additive: enqueue Notion update)
- `lib/deals.ts` (additive: optional post-update hook)
- `scripts/seed-internal-deals.ts` (new)
- `scripts/seed-internal-pipeline-notion.ts` (new)
- `supabase/migrations/20260530_internal_pipeline_notion_mapping.sql` (new)
- `lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland.tsx` (only if step A live-verification shows the dual-accent issue; otherwise untouched)
- `__tests__/notion/internal-pipeline-writer.test.ts` (new)
- `__tests__/api/notion-webhook.test.ts` (new)
- `MEMORY/spec-references.md` (additive entries)
- `docs/PLAN-stream-g.md` (this file)
- `.env.example` (additive: `NOTION_DB_INTERNAL_PIPELINE`, `NOTION_WEBHOOK_SECRET`, `NOTION_PARENT_PAGE_INTERNAL_PIPELINE`)

Not touched: any Zedcor / Realberry / Funder component, the static funder fallback path (it remains for orgs without modules block), the existing `lib/kanban-writer.ts` and `lib/notion/zedcor-writer.ts`, the dev-kanban env names `NOTION_DB_INTERNAL_KANBAN`, `NOTION_DB_METACRON_KANBAN`, `NOTION_DB_PATHFINDER_KANBAN`.

## Non-negotiable gates

- Run `scripts/verify-orgs-byte-unchanged.ts` before merge. After step A is applied, this passes; before, it fails as expected.
- Run `pnpm lint && pnpm typecheck && pnpm test`.
- No em-dashes or en-dashes anywhere.
- No new cron is introduced. (Notion automation runs in Notion, not Vercel cron.)
- Force-with-lease only on `stream-g-pipeline-notion`. Never on main.
- The Verified column is not touched.

## Blocking unknowns surfaced for operator

These items I cannot resolve from the repo and need explicit values before the Notion build can ship to prod:

1. **Notion parent page id**: Notion integrations cannot create a database at workspace root; they need a parent page id where the integration has explicit "Can edit" access. What page should "Internal Pipeline" live under in the customer-facing Notion workspace?
2. **Notion integration token**: Confirm `NOTION_API_KEY` already in Vercel has access to that parent page, or whether a new integration is required. (CLAUDE.md names three dev kanbans the integration touches; those are explicitly out of scope per the prompt.)
3. **Notion automation webhook**: Notion automations on Stage change need a single URL. The webhook receiver path is `/pathfinder/api/notion/internal-pipeline/webhook`. The shared secret needs to be set and the automation needs to be configured by an operator with edit access to the new database. I will generate the secret value and surface it once the DB is created.

If 1 and 2 are unavailable, steps C/D/E ship as code with green tests, but the live-verify step for Notion will hard-halt and the card will move to Bug Fixes pending the parent page id.

## Sequence

1. Plan written (this file). Commit on the branch.
2. Branch from origin/main. (Done; worktree is at `/private/tmp/stream-g-pipeline-notion`.)
3. Apply Stream A migration to prod Supabase. Verify with the post-migration query.
4. Verify on internal.unicron.systems that the catalog kanban now renders (instead of the static funder fallback).
5. Write seed-internal-deals.ts, run against prod, verify 229 deals exist.
6. Verify drag-and-drop on internal.unicron.systems persists across a refresh.
7. Add the Notion mapping migration (additive table).
8. Build the Notion writer + mapping + webhook receiver + tests.
9. Wire moveDealStage to call the writer additively.
10. Build the create-and-seed script.
11. Operator supplies parent page id; run the create-and-seed script.
12. Set Vercel env vars (`NOTION_DB_INTERNAL_PIPELINE`, `NOTION_WEBHOOK_SECRET`).
13. Configure the Notion automation. Verify a Notion stage edit moves the card on the app, and an app drag moves the Notion stage.
14. Run verify-orgs-byte-unchanged.ts, lint, typecheck, test, build.
15. PR + self-merge per the AUTO-MERGE GATE.
16. Kanban card "Stream G: pipeline + Notion sync" to Deployed (never Verified).

## Rollback

- Per-step revert plan in the PR body.
- Mapping migration is additive (CREATE TABLE IF NOT EXISTS); revert is `DROP TABLE pathfinder.notion_pipeline_pages` plus removing the env vars.
- The Stream A migration is also additive (jsonb_set on one row). If a revert is needed: `UPDATE pathfinder.organizations SET architecture = architecture - 'modules' WHERE slug='internal'`.
- The Notion DB created in step 11 stays in Notion across a code revert; it is data, not deploy state.
