# PLAN: fix-icp-search-basepath-404

Branch: `fix/icp-search-basepath-404` (off `origin/main` @ 36c0f3e)
SPEC: `Pathfinder/docs/SPEC-Fix-Search-BasePath.md`
Scope: Pathfinder Internal only. Additive. Zedcor/Realberry/Funder byte-identical.

## Bug
Next.js does not auto-apply `basePath` to raw `fetch()` URLs. The client at
`Pathfinder/lib/searches/api.ts` builds URLs via `joinUrl(opts.baseUrl, '/api/searches'...)`.
With no `baseUrl` (the client default), the call lands on `/api/searches`, which
on the deployed app under basePath `/pathfinder` hits the site root and 404s.
`components/search/SearchProgress.tsx` already uses
`/pathfinder/api/searches/:id` and works.

## Fix
1. `lib/searches/api.ts` — when no `baseUrl` override is provided, prefix the
   path with the configured basePath. Resolution order:
   `process.env.NEXT_PUBLIC_BASE_PATH` → fallback `/pathfinder` (one-line
   comment explaining the fallback).
   - `createSearch` POST → `/pathfinder/api/searches`
   - `listSearches` GET → `/pathfinder/api/searches`
   - `getSearch` GET → `/pathfinder/api/searches/:id`
   - `getSearchLeads` GET → `/pathfinder/api/searches/:id/leads`
   - Server callers passing an absolute `baseUrl` keep working unchanged
     (override wins; basePath is not double-applied).

2. Tests
   - New `Pathfinder/__tests__/lib/searches/api.test.ts` — asserts the
     `/pathfinder` prefix on all four calls and that the `baseUrl` override
     still wins.
   - Update existing `tests/icp-search-s3/new-search-form.test.tsx` and
     `tests/icp-search-s3/saved-searches-list.test.tsx` so the URL assertions
     expect `/pathfinder/api/searches` instead of `/api/searches`.
   - `tests/icp-search-s3/search-detail-view.test.tsx` matches by `endsWith('/leads')`
     so it is unaffected.

## Out of scope
No edits to `app/api/searches/*` handlers, `SearchProgress.tsx`, `NewSearchForm.tsx`,
`SavedSearchesList.tsx`, `SearchDetailView.tsx`, or any non-Internal org files.

## Gate
- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (vitest)
- `pnpm build` (Pathfinder)
- `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` (if present)
- Push, open PR, wait for CI + Vercel pathfinder green, then merge.

## Live-verify
On `internal.unicron.systems` (or unicron.systems/pathfinder/internal if SSO
blocks direct), submit a search and confirm:
- POST returns 200/2xx (no 404),
- saved-searches list loads,
- SearchProgress polls through phases.
If Vercel SSO blocks autonomous verification, hand off as operator-side check
on the kanban card.

## Kanban
On merge: append `Implemented at <sha> · merged at <ISO>` to the
`Fix ICP Search basePath 404` card and move it to Deployed. Never Verified.
