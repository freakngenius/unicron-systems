# PLAN: ICP Saved Search S3 (Internal front-page UI)

Branch: feat/icp-search-s3-front. SPEC: docs/SPEC-ICP-Search.md. Slice owner: S3.

## Scope I own
- Internal-only, additive. Zedcor / Realberry / Funder must stay byte-identical (architecture.modules gate).
- New "New Search" form on the Internal front page: ICP text, region, radius (mi), optional fit notes.
- Saved-searches list on the Internal front page: cards from GET /api/searches.
- New per-search results route: app/[slug]/searches/[id]/page.tsx that mounts SearchProgress (S4 seam) and lists scoped leads from GET /api/searches/:id/leads.
- Catalog-surface scoping: when a `?saved_search_id=` query param is present on the Internal leads list, scope the query by that ID.
- Shared lead card reuse: CompanyLeadCard (Internal shape) for results.

## Files I will add or modify
Additions:
- components/search/NewSearchForm.tsx — client component, POST /api/searches, navigates to /[slug]/searches/[id]
- components/search/SavedSearchesList.tsx — server component, GET /api/searches, renders list
- components/search/SearchProgressMount.tsx — server wrapper that mounts the S4 SearchProgress component (with a tiny in-tree fallback if S4 has not landed yet — the live import is guarded). Tests mock this.
- components/search/SearchProgress.tsx — minimal fallback stub used until S4 lands; S4 owns the real implementation. Marked TODO so S4 may overwrite freely.
- lib/searches/api.ts — typed HTTP client wrapping POST /api/searches, GET /api/searches, GET /api/searches/:id, GET /api/searches/:id/leads.
- lib/searches/types.ts — shared TS types matching the contract.
- app/[slug]/searches/[id]/page.tsx — per-search results surface; mounts progress + scoped leads grid.
- tests/icp-search-s3/new-search-form.test.tsx — vitest jsdom, mocks fetch + next/navigation.
- tests/icp-search-s3/saved-searches-list.test.tsx — vitest jsdom, mocks fetch.
- tests/icp-search-s3/search-detail-page.test.tsx — renders detail page with mocked SearchProgress + mocked HTTP, asserts leads grid.
- docs/PLAN-icp-search-s3-front.md — this file.

Modifications (additive only):
- app/[slug]/InternalDashboard.tsx — append a "New Search" panel and "Recent searches" panel below the existing hero. Internal-only path already; no Zedcor / Realberry / Funder impact.
- app/[slug]/leads/page.tsx — read `saved_search_id` from searchParams and, if present + Internal shape, add `.eq('saved_search_id', id)` to the projects query. Funder branch untouched.

## Contract (S1 owns; S3 calls over HTTP, mocks in tests)
- POST /api/searches { name, icp_text, region, radius_mi, fit_notes? } -> { id }
- GET /api/searches -> { searches: Array<{ id, name, icp_text, region, radius_mi, status, created_at }> }
- GET /api/searches/:id -> { saved_search, latest_run: { status, phase, progress, stats } }
- GET /api/searches/:id/leads -> { leads: Project[] } (scored projects where saved_search_id = id)

S4 seam: import SearchProgress from '@/components/search/SearchProgress'. If S4 has not landed, components/search/SearchProgress.tsx in this branch is a minimal stub that renders a "Live progress will appear shortly" placeholder polling shell. Tests mock the entire module via vi.mock.

## Test plan
- vitest with jsdom env on three new tests; mock global fetch, mock next/navigation.useRouter, mock '@/components/search/SearchProgress'.
- Form submission asserts POST body shape and router.push to `/internal/searches/<id>`.
- Saved searches list asserts row rendering for multiple statuses.
- Detail page asserts mocked progress renders + leads grid renders cards.

## Gates I will run before merge
1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` (requires env; run if envs available, otherwise note skip in PR)
6. `git rebase origin/main`

## Live verify (post-merge)
On internal.unicron.systems: submit ICP "Houston construction GCs needing mobile surveillance", region "Houston, TX", radius 50. Confirm: search row appears, progress phases tick, scored leads render as clickable cards.

## Honesty
- I will not fabricate leads. If the API returns few leads, the detail page shows a "limited sources for this profile" note.
- No em-dashes / en-dashes anywhere.
- No time or cost estimates.
- Internal slug only. Additive.
