# PLAN — ICP Saved Search, S4 (Live progress view)

Branch: `feat/icp-search-s4-progress`
Spec: `Pathfinder/docs/SPEC-ICP-Search.md` § Stream slices · S4
Parallel siblings (do not touch): S1 (foundation/API/job), S2 (intelligence/lib/agents/search), S3 (front-page form + list)

## Scope (this branch only)
- `Pathfinder/components/search/SearchProgress.tsx` (new)
- `Pathfinder/components/search/index.ts` (new, barrel)
- `Pathfinder/tests/search-progress.test.tsx` (new)
- `Pathfinder/docs/PLAN-icp-search-s4-progress.md` (this file)

Nothing else moves. No migration, no API route, no Inngest job, no planner. S3 will mount `SearchProgress`; S1 owns the GET endpoint we poll over HTTP.

## Contract consumed
`GET /api/searches/:id` returns

```
{
  saved_search: { id, name, icp_text, region, radius_mi, status, ... },
  latest_run:   { status, phase, progress, stats }
}
```

`progress.phases[]` is ordered `interpret, geo, sources, wire, scrape, score`; each item is `{ key, label, status: pending|running|done|failed, detail }`. `stats` is `{ sources_found, companies_ingested, scored, verified }`.

S4 is defensive: any missing field renders a neutral placeholder so a half-populated row from S1 never crashes the view. We never invent fields, we just render what arrives.

## Component shape
`SearchProgress({ searchId, pollMs = 2000, onComplete?, fetcher? })`

- Polls `GET /pathfinder/api/searches/:id` (basePath-aware, see `next.config.js`) on an interval; clears on unmount and when `latest_run.status` is `complete` or `failed`.
- Renders:
  - header: search name + ICP + region/radius
  - phase timeline: six rows in canonical order, with status pill (PENDING/RUNNING/DONE/FAILED) and the per-phase `detail` line
  - stats grid: sources found / companies ingested / scored / verified
  - "limited sources for this profile" advisory when the source plan is thin (zero or one tier-1+tier-2 sources) or when any phase has failed
  - done state with a "view results" link to `/{slug}/searches/{searchId}/leads` once the run is `complete`
- `fetcher` prop lets tests inject a mock; default `fetch` calls the real endpoint.

## Tests (vitest + @testing-library/react, jsdom)
- renders all six phases in canonical order with correct labels
- renders stats values when present, `—` placeholder when missing
- shows the "limited sources" advisory when `source_plan` is thin OR any phase failed
- renders the failed-phase row with FAILED status
- renders the done state with a results link when `latest_run.status === complete`
- polls again after the configured interval and re-renders with new data
- stops polling once status is terminal

## Isolation guarantees
- The component imports nothing from S1/S2/S3 files. It only depends on its own types and `fetch`.
- The contract is duplicated as a local TypeScript type (additive, internal to the file) so this branch builds and tests with no shared type-file edits.

## Gate
1. `pnpm install --frozen-lockfile` in the worktree's `Pathfinder/`
2. `pnpm typecheck` green
3. `pnpm lint` green
4. `pnpm test` green (new test file passes; no regression in existing files)
5. `pnpm build` green
6. `npx tsx scripts/verify-orgs-byte-unchanged.ts` passes (additive change, Zedcor/Realberry/Funder bytes unchanged)
7. Push branch, open PR with verbatim gate output, wait for green CI, self-merge (Kyle pre-authorized THIS branch), append a `---`-separated update section to the kanban card "ICP Search S4" with `Implemented at <sha> · merged at <ISO>` and move it to Deployed.

## Out of scope
- No edits to `lib/types.ts`, `vercel.json`, or any shared file.
- No `app/` route changes; the S3 mount point is S3's job.
- No DB work, no migration, no `app/api/searches/*`.
- No Verified promotion.
