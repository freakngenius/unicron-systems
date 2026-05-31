# PLAN: Fix ICP Search orchestrator stall (stuck at interpret)

Branch: `fix-icp-search-orchestrator-stall`
SPEC: `docs/SPEC-Fix-Search-Orchestrator-Stall.md`

## Diagnosis (verbatim from prod)

Supabase ref `anfihcusvekpovcchpoh`, table `pathfinder.search_runs` (queried 2026-05-31):

Four runs, all Internal org slug=`internal`, all stuck:

```
id                                    status   phase     started_at                       finished_at
6f00e8ce-1f72-4f39-a680-0cf0360184c4  running  interpret 2026-05-31 08:03:45.876+00       null
64481dcb-4057-4272-8213-1be428b35842  running  interpret 2026-05-31 07:24:57.75+00        null
d3280626-5cbb-4736-a4c0-d42f4e2a7cd2  running  interpret 2026-05-31 06:40:16.88+00        null
733439ee-4fe5-4f98-b596-a366e4cae4a1  running  interpret 2026-05-31 06:24:37.001+00       null
```

`pathfinder.saved_searches` for each: `architecture = {}` (column default), `source_plan = {"tier1":[],"tier2":[],"tier3":[]}` (default), `status = 'running'`, `updated_at = started_at + ~1.5s`.

Interpretation:

1. Inngest function IS invoked (`mark-running` step ran: `started_at` set, `saved_searches.status='running'` written).
2. `runSearchPlan`'s first `emitPhase('interpret','running')` ran (`search_runs.progress.phases[0].status='running'` persisted).
3. `interpretIcp` never returned: `persistArchitecture` never executed (architecture still default `{}`).
4. Function-level catch never ran (`finished_at` never set).

Root cause is the boundary mismatch:

- `app/api/inngest/route.ts` sets `maxDuration = 60` (Vercel serverless cap per invocation).
- `services/architect/types.ts` sets `SESSION_TIMEOUT_MS.decomposition = 3 * 60_000` (180s).
- The orchestrator wraps `interpret + geo + sources` inside a single `step.run('run-search-plan')`. When the Architect agent loop runs longer than 60s, Vercel kills the invocation. Inngest cloud's step-retry semantics never bubble a JS throw into the function continuation's `try/catch`, so `mark-failed` never executes. Result: status='running' forever.
- Additionally, no LLM call (`runDecomposition` agent loop, `deriveNaicsAndKeywords`) has an `AbortController` timeout. A hung upstream LLM request is indistinguishable from "still working" until Vercel kills the process.

## Fix

Scope is Internal-only (the orchestrator is shared infra but only the Internal Org currently dispatches `pathfinder/search.run.requested`; Zedcor/Realberry/Funder paths are untouched). All changes are additive.

### Code changes

1. **`app/api/inngest/route.ts`** — bump `maxDuration` from 60 to 300 (Vercel Pro cap). Each Inngest step runs as a separate serverless invocation; we need headroom for the Architect agent loop.

2. **`lib/inngest/functions/search-orchestrator.ts`** — refactor to drive phases directly. Each phase runs in its own `step.run('phase-<key>', ...)`. Inside each step:
   - emit `running`
   - call the phase helper (`interpretIcp`, `resolveGeoRadius`, `planSources`, etc.)
   - persist results
   - emit `done`
   - on throw inside the step: write phase=failed + run.status=failed + finished_at, then re-throw as `NonRetriableError` so Inngest stops retrying and the function ends cleanly.
   - outer try/catch wraps the phase sequence so any escaped throw still runs `mark-failed`.

3. **`lib/agents/search/interpret.ts`** — add a hard `AbortController` timeout around the NAICS LLM call (60s default, env-overridable). The Architect call itself already honors `SESSION_TIMEOUT_MS.decomposition` (3min); we surface that via the step boundary above and add a belt-and-suspenders `Promise.race` with an explicit `PF_SEARCH_INTERPRET_TIMEOUT_MS` (default 180_000) so the step can never outlive the Vercel cap.

4. **`lib/agents/search/run.ts`** — stop swallowing onPhase write errors silently. Keep best-effort semantics (don't abort the run on a single failed write), but log via `console.error` so the failure is visible in Vercel runtime logs.

5. **`MEMORY/spec-references.md`** — add entries for the changed `lib/` paths per repo CI rule.

### Data changes (prod Supabase ref `anfihcusvekpovcchpoh`)

Mark the four existing stuck runs failed so the UI stops showing them as eternally running. Internal org only. Idempotent — only update rows that currently match the stuck pattern.

```sql
UPDATE pathfinder.search_runs
SET status='failed',
    phase='interpret',
    finished_at=now(),
    progress=jsonb_set(
      progress,
      '{phases,0}',
      jsonb_build_object(
        'key','interpret',
        'label','Interpret ICP',
        'status','failed',
        'detail','marked-failed: orchestrator stall pre-fix (single step.run + LLM timeout). PR fix-icp-search-orchestrator-stall.'
      )
    )
WHERE status='running'
  AND phase='interpret'
  AND finished_at IS NULL
  AND started_at < now() - interval '15 minutes'
  AND saved_search_id IN (
    SELECT s.id FROM pathfinder.saved_searches s
    JOIN pathfinder.organizations o ON o.id = s.organization_id
    WHERE o.slug = 'internal'
  );
```

Confirm with `SELECT id, status, phase, finished_at FROM pathfinder.search_runs WHERE status='failed' ORDER BY finished_at DESC LIMIT 10;`.

### Verification gates

- `pnpm install --frozen-lockfile` (from repo root)
- `pnpm build` (Pathfinder)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (unit + integration)
- `tsx scripts/verify-orgs-byte-unchanged.ts` (Zedcor/Realberry/Funder byte-identical)
- CI green on push
- Pathfinder Vercel deploy green
- Live-verify on `internal.unicron.systems`: submit the Atlanta janitorial search, confirm it advances past interpret or fails visibly with reason.

### Kanban (post-merge)

Move "Fix ICP Search orchestrator stall" to Deployed (never Verified). Append:
```
Implemented at <sha> · merged at <ISO>
files: app/api/inngest/route.ts, lib/inngest/functions/search-orchestrator.ts, lib/agents/search/interpret.ts, lib/agents/search/run.ts, MEMORY/spec-references.md
gates: build/lint/typecheck/test green; verify-orgs byte-identical; Vercel deploys green
live: <run id> advanced past interpret OR failed visibly with <reason>
```
