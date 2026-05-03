# 2026-05-02 — Stream E Coverage Expansion HTTP routes never shipped

Discovered during Phase 1 / Stream M1 (Coverage Expansion Modal) build. The M1 prompt — and `MEMORY/audit-unicron-platform.md` lines 131–138 — both assert that Stream E PR #36 shipped these endpoints:

- `POST /api/coverage/goals`
- `GET /api/coverage/goals`
- `GET /api/coverage/goals/[id]`
- `POST /api/coverage/goals/[id]/run`

Reality (verified via `find Pathfinder/app/api/coverage` and a repo-wide `grep -r "coverage/goals"`): **none of these route files exist on any branch**. PR #36 (`50fc5ca`) shipped only:

- `Pathfinder/services/coverage-expansion/{agent.ts,types.ts,tools/{estimate,discover-candidates}.ts}`
- `Pathfinder/lib/inngest/functions/coverage-expansion.ts` — Inngest event-driven dispatch (`pathfinder/coverage.estimate.requested`, `pathfinder/coverage.run.requested`)
- `Pathfinder/supabase/migrations/0081_coverage_expansion.sql` — `pathfinder.coverage_goals` + `pathfinder.coverage_goal_candidates`
- `Pathfinder/scripts/dispatch-coverage-estimate.ts` — internal dispatch script
- `Pathfinder/eval/coverage-expansion/cases.json` — 5 hand-graded eval goals

The agent is reachable today only via direct Inngest event publish (or the dispatch script). There is no HTTP frontdoor.

## Impact on M1

Real-mode dispatch from the Coverage Expansion Modal would 404 on every call. M1 is shipping mock-mode-complete (per the M1 prompt's `VITE_COVERAGE_API_ENABLED=false` path) with the real-mode client scaffolded against the prompt's documented contract shapes. The toggle defaults to `false` in production env.

## Impact on M2

Stream M2 (Tier 2 ticket resolution) is similarly affected — its prompt likely assumes the same coverage endpoints exist (the architect inbox `/api/architect/inbox` IS shipped from PR #36 and is unaffected). Need to verify M2's exact wire requirements, but the coverage-side gap is the same.

## What needs to happen (Pathfinder territory — out of scope for any Metacron stream)

Pathfinder chat needs to add four Next.js route handlers wrapping the existing services + Inngest event publishers. Suggested shapes (matching M1's scaffolded client):

- `POST /api/coverage/goals` — insert `pathfinder.coverage_goals` row (`status='draft'`), publish `pathfinder/coverage.estimate.requested` with the new goal_id, return `{ goal_id, status: 'estimating' }`.
- `GET /api/coverage/goals` — list rows from `pathfinder.coverage_goals` ordered by `created_at desc`, support `?vertical_id=` and `?status=` filters.
- `GET /api/coverage/goals/[id]` — fetch goal + join `pathfinder.coverage_goal_candidates` rows.
- `POST /api/coverage/goals/[id]/run` — verify `status='estimating'` finished and `estimate` is non-null, publish `pathfinder/coverage.run.requested`, set `status='running'` + `started_at=now()`, return `{ ok, run_event_id }`.

Adapter shape and Inngest events already exist; the work is purely route handler + auth (basic-auth via `lib/basic-auth.ts` per existing convention, see `Pathfinder/app/api/sources/onboard/route.ts`).

## Acceptance for closing this todo

- All four routes return 200/2xx on a happy path.
- M1's Coverage Expansion Modal real-mode toggle (`VITE_COVERAGE_API_ENABLED=true`) drives one dispatch end-to-end against the live routes on the metacron Vercel preview deploy.
- `MEMORY/audit-unicron-platform.md` "Stream C ↔ Stream E Coverage Expansion contract" section updated to reflect actual ship state.
