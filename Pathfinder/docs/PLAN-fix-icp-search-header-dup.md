# PLAN: fix-icp-search-header-dup

Branch: `fix/icp-search-header-dup` (off `origin/main` @ d0c0237)
SPEC: `Pathfinder/docs/SPEC-Fix-Search-Header-Dup.md`
Scope: Pathfinder Internal only. Additive. Zedcor/Realberry/Funder byte-identical.

## Bug
The search detail view renders the search title, ICP sentence, and
`region · radius` twice. `SearchDetailView.tsx` lines 93-124 paint the
identity in the page header. `SearchProgress.tsx` lines 212-247 paint the
same identity again inside the progress card.

## Fix
Make the progress card's header optional and default it OFF. The page
header keeps owning identity; the card becomes only the phase timeline,
stat tiles, and limited-sources note.

- `components/search/SearchProgress.tsx`
  - Add `showHeader?: boolean` to `SearchProgressProps`, JSDoc note.
  - Default `showHeader = false` in the destructured props signature.
  - Gate the existing `<header>...</header>` block (lines 212-247) behind
    `{showHeader && (...)}` so the default render emits only the timeline
    + stats + advisory.

- `app/[slug]/searches/[id]/SearchDetailView.tsx`
  - No change. It already mounts `<SearchProgress />` without `showHeader`
    so the new default suppresses the duplicate header automatically.

## Tests (`tests/search-progress.test.tsx`)
- Extend the existing "renders all six phases in canonical order" test
  with an assertion that `screen.queryByTestId('search-progress-name')`
  is null by default (header absent).
- Add a new test: `renders the optional identity header when showHeader`,
  rendering `<SearchProgress ... showHeader />` and asserting
  `search-progress-name` is present with the saved-search name.
- Other tests stay unchanged.

## Out of scope
No edits to the SearchDetailView page header, the stats tiles, the phase
timeline, the limited-sources note, or the CatalogSurfaceLinks. No
changes to NewSearchForm, SavedSearchesList, or any non-Internal org
file.

## Gate
- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (vitest)
- `pnpm build`
- `pnpm tsx scripts/verify-orgs-byte-unchanged.ts`
- Push, open PR, CI + Vercel pathfinder green, then merge.

## Live-verify
On `internal.unicron.systems` (or `unicron.systems/pathfinder/internal`)
open a saved search and confirm the title, ICP, and region appear once,
with the progress card showing only the timeline, stats, and note.

## Kanban
On merge: create / append a `Fix ICP Search header duplication` card in
Deployed with `Implemented at <sha> · merged at <ISO>`. Never Verified.
