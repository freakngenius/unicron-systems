# PLAN — ICP Saved Search S1 Foundation

Branch: `feat/icp-search-s1` · worktree: `Pathfinder-worktrees/icp-search-s1/`
SPEC: `Pathfinder/docs/SPEC-ICP-Search.md` (S1 slice)
All paths below are relative to `Pathfinder/` inside the worktree.

## Scope (S1 only)

Owned paths (additive, Internal-scoped via slug='internal' lookup):
- `supabase/migrations/20260530_icp_search_foundation.sql` (already applied to prod ref anfihcusvekpovcchpoh)
- `app/api/searches/route.ts` POST (create + start) + GET (list)
- `app/api/searches/[id]/route.ts` GET (saved_search + latest_run)
- `app/api/searches/[id]/leads/route.ts` GET (Project[] scoped by saved_search_id)
- `lib/inngest/functions/search-orchestrator.ts` six-phase Inngest job
- `lib/inngest/functions/index.ts` (append export)
- `app/api/inngest/route.ts` (append register)
- `lib/inngest/events.ts` (append `pathfinder/search.run.requested` event type)
- `lib/types.ts` (append SavedSearch, SearchRun, SavedSearchSourcePlan, SearchRunProgress types)
- `lib/agents/search/index.ts` STUB so S1 typechecks and runs end-to-end before S2 lands (S2 replaces exports)
- Tests: `app/api/searches/__tests__/*`, `lib/inngest/functions/__tests__/search-orchestrator.test.ts`

Excluded (other streams own):
- Real implementations inside `lib/agents/search/*` (S2)
- `components/search/SearchProgress.tsx` (S4)
- `app/[slug]` search UI (S3)

## Contract

Tables (live):
- `pathfinder.saved_searches(id, organization_id, name, icp_text, region, radius_mi, status, architecture jsonb, source_plan jsonb, created_at, updated_at)`
- `pathfinder.search_runs(id, saved_search_id, status, phase, progress jsonb, stats jsonb, started_at, finished_at, created_at)`
- `pathfinder.projects.saved_search_id uuid` (nullable, indexed)

API:
- `POST /api/searches {name, icp_text, region, radius_mi}` => 201 `{id}`. Inserts saved_search, inserts initial search_run with phase keys [interpret, geo, sources, wire, scrape, score] each pending, then `inngest.send({name:'pathfinder/search.run.requested', data:{search_run_id}})`.
- `GET /api/searches/:id` => `{saved_search, latest_run:{status, phase, progress, stats}}`.
- `GET /api/searches/:id/leads` => `Project[]` filtered by `saved_search_id=:id`.
- `GET /api/searches` => `SavedSearch[]` for the Internal org, newest first.

`source_plan` jsonb shape: `{tier1:[{source_id, params}], tier2:[{source_id, template, needs}], tier3:[{candidate, url, discovered_by:"perplexity", auto_attempt:true}]}`.
`progress` jsonb shape: `{phases:[{key, label, status:"pending"|"running"|"done"|"failed", detail}]}`. Keys ordered `interpret, geo, sources, wire, scrape, score`.
`stats` jsonb shape: `{sources_found, companies_ingested, scored, verified}`.

## Internal-only scope

Routes resolve the Internal organization via `pathfinder.organizations` where `slug='internal'`. 404 if the row is missing. saved_searches.organization_id is forced to that id on POST. GET handlers filter on that id.

## Orchestrator (Inngest)

Event: `pathfinder/search.run.requested {search_run_id}`. Six phases, each in a `step.run` block. Each step:
1. Marks the phase running, writes `search_runs.progress`.
2. Calls the S2 seam (`@/lib/agents/search`) wrapped in try/catch.
3. On success marks phase done with detail summary, updates `stats` partials.
4. On failure marks phase failed, sets `search_runs.status='failed'`, sets `saved_searches.status='failed'`, sets `finished_at`, returns.

Phase mapping:
- `interpret` => `interpretIcp(savedSearch)` => writes `architecture` to saved_searches.
- `geo` => `resolveGeoRadius({region, radius_mi})` => merges geo into architecture.
- `sources` => `planSources(architecture)` => writes `source_plan`, `stats.sources_found`.
- `wire` => `wireSources(source_plan, {savedSearchId})` => returns adapter-ready list; tier3 failures downgrade individual entries inside source_plan without failing the phase.
- `scrape` => `runIngestForSearch({savedSearchId})` => runs the existing ingest pipeline tagging new project rows with saved_search_id; returns `{companies_ingested}`.
- `score` => `scoreSearch({savedSearchId})` => existing ranker pipeline scoped to those projects; returns `{scored, verified}`.

On final success: `status='complete'`, `finished_at=now()`, `saved_searches.status='complete'`.

## Stub for S2 seam

`lib/agents/search/index.ts` exports four stubs that return shape-correct empties:
```ts
export async function interpretIcp(_: SavedSearch): Promise<Architecture> { return {}; }
export async function resolveGeoRadius(_: GeoArgs): Promise<GeoResult> { return {states:[], counties:[], metros:[]}; }
export async function planSources(_: Architecture): Promise<SourcePlan> { return {tier1:[], tier2:[], tier3:[]}; }
export async function runIngestForSearch(_: {savedSearchId: string}): Promise<{companies_ingested:number}> { return {companies_ingested:0}; }
export async function scoreSearch(_: {savedSearchId: string}): Promise<{scored:number, verified:number}> { return {scored:0, verified:0}; }
```
This file is owned by S2 (S2 replaces all bodies); S1 ships the stub so the orchestrator typechecks and runs end-to-end as soon as S1 lands. The stub is clearly labeled `// STUB — replaced by S2 lib/agents/search/*`.

Decision rationale: SPEC says "do not create lib/agents/search," but also says "for any gap or unbuilt seam, mock/stub to the CONTRACT and proceed; never wait for S2." A typecheck failure on `import('@/lib/agents/search')` would block S1 from landing. The stub is the smallest possible thing that satisfies both rules.

## Tests (vitest)

- API routes: vi.mock supabaseAdmin to return canned rows + capture inserts; assert response shape + insert payload + inngest.send call.
- Orchestrator: vi.mock `@/lib/agents/search` to return canned shapes per phase; vi.mock supabaseAdmin update/from chains; assert progress writes per phase in order and final stats + status transitions.

## Verify-orgs guarantee

Migration creates two new tables and adds one nullable column. Zero UPDATE/DELETE on existing rows. `scripts/verify-orgs-byte-unchanged.ts` continues to pass because it only inspects `pathfinder.organizations.architecture` for slug='internal' modules block and the absence of `modules` on the three non-Internal orgs neither of which this migration touches.

## Gate

1. Migration confirmed live on prod (done: `to_regclass('pathfinder.saved_searches')=pathfinder.saved_searches`, `projects.saved_search_id` uuid nullable).
2. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green from `Pathfinder/`.
3. `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` passes.
4. PR opened, Vercel Pathfinder build green.
5. Endpoints smoke-tested against `pathfinder-ashy.vercel.app` (or `internal.unicron.systems` if DNS is live) where SSO permits.
6. Rebase on origin/main, self-merge per Kyle's standing authorization on this branch.
7. Move kanban card `ICP Search S1` to Deployed (never Verified).
