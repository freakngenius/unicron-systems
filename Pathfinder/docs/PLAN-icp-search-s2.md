# PLAN — ICP Search S2 (Interpreter / Planner)

Branch: `feat/icp-search-s2`
Worktree: `Pathfinder-worktrees/icp-search-s2/`
SPEC: `docs/SPEC-ICP-Search.md` (Kyle's working tree, present locally)

## Scope (S2 only)

Own `lib/agents/search/*` and `lib/geo/radius.ts`. Export the four functions S1's job imports. Unit-tested in isolation with mocked DB and mocked external calls. Do NOT create the API, the job, or any UI.

## Files

Create:
- `lib/agents/search/types.ts`
- `lib/agents/search/interpret.ts` — `interpretIcp(icp_text, deps?)`
- `lib/agents/search/geo.ts` — `resolveGeoRadius(region, radius_mi, deps?)`
- `lib/agents/search/plan.ts` — `planSources({architecture, geo}, deps?)`
- `lib/agents/search/run.ts` — `runSearchPlan(savedSearchId, deps?)`, `runIngestForSearch(savedSearchId, deps?)`
- `lib/agents/search/index.ts` — barrel
- `lib/geo/radius.ts` — `statesWithinRadius`, `bboxFromCenterAndRadius`
- `__tests__/agents/search/interpret.test.ts`
- `__tests__/agents/search/geo.test.ts`
- `__tests__/agents/search/plan.test.ts`
- `__tests__/agents/search/run.test.ts`
- `__tests__/geo/radius.test.ts`

Touch nothing else. No edits to existing `lib/agents/*`, `services/architect/*`, `services/source-onboarder/*`, `lib/llm/*`.

## Contract types (S1, S3, S4 read these via the barrel)

```
SearchArchitecture = {
  vertical: string
  lead_schema: Record<string, LeadFieldDef>
  scoring_signals: { name: string; weight: number; hint?: string }[]
  naics_codes: string[]
  psc_codes: string[]
  keywords: string[]
  business_summary: { lead_type; business_area; problem_solved; what_they_get }
}

GeoExpansion = {
  region: string
  radius_mi: number
  center: { lat: number; lon: number; label: string }
  states: string[]            // 2-letter postal codes
  counties: { state: string; name: string; fips?: string }[]
  metros: string[]            // CBSA names, empty when unknown
  bbox: { north; south; east; west }
}

SourcePlan = {
  tier1: { source_id: string; kind: string; params: Record<string, unknown>; jurisdiction?: string }[]
  tier2: { source_id: string; template: string; needs: string[]; candidate_url?: string }[]
  tier3: { candidate: string; url: string; discovered_by: 'perplexity'; auto_attempt: true; reason?: string }[]
  generated_at: string
}

PhaseKey = 'interpret' | 'geo' | 'sources' | 'wire' | 'scrape' | 'score'
SearchProgress = { phases: { key: PhaseKey; label: string; status: 'pending'|'running'|'done'|'failed'; detail?: string }[] }
SearchStats = { sources_found: number; companies_ingested: number; scored: number; verified: number }
```

## Reuse map (no rebuilds)

- Architect decomposition: `services/architect/sessions/decomposition.ts → runDecomposition`
- Perplexity Sonar: `lib/chat/sonar.ts → completeSonar` (already a `lib/llm/run.ts` wrapper)
- Source Onboarder: `services/source-onboarder/agent.ts → runSourceOnboarder`
- Geocoding: `lib/zedcor/google-geocoder.ts → geocodeLocation`
- State centroids: `lib/zedcor/state-centroids.ts → centroidByCode/centroidByName`
- Haversine: `lib/scoring.ts` (via `lib/agents/geo.ts`)

## Dependency injection

Every function takes an optional `deps` bag (supabase client, runDecomposition, geocodeLocation, completeSonar, runSourceOnboarder, runWire/runScrape/runScore hooks, `now`). Defaults bind to live implementations. Tests pass stubs.

## Tier discipline (planSources)

- Tier 1 is deterministic from `architecture.naics_codes` + `geo.states`:
  - `sam_gov_entity` with `primaryNaics`, `stateOrProvinceCode`
  - `usaspending_recipients` with `recipient_naics`, `place_of_performance_state`
  - `news_rss` keyword+region template (Google News RSS query string)
- Tier 2 is template-driven from `architecture.vertical` + `geo.states`: licensing boards, state portals. Filled from a small in-module catalog; `candidate_url` is null when the catalog has no entry for that state/vertical.
- Tier 3 is Perplexity-discovered. Single Sonar call: "List public web sources publishing information about <buyer/keywords> in <region>. Prefer registries, portals, structured news/RSS. Return as a JSON array of {name, url, why}." Parse leniently; each candidate flagged `auto_attempt: true`. Brittle results never throw — they record a `reason` and the run still completes on Tier 1/2.

## runSearchPlan

Pure plan-only: interpret → geo → sources, writing `architecture` and `source_plan` jsonb columns onto the saved_search row, and emitting phase progress through an injected `onPhase` callback so S1 can persist to `search_runs.progress`. Returns the composed plan for S1 to thread into `runIngestForSearch`.

## runIngestForSearch

Reads the saved_search row, walks the tiers:
- wire: tier1 entries are looked up in `data_sources` (insert if missing with the agreed kind); tier2 entries with `candidate_url` and all tier3 entries are handed to `runSourceOnboarder`. Tier 3 failures are logged and skipped, never thrown.
- scrape: invokes a thin `scrapeForSearch` hook (default impl wraps `lib/ingest` poll-once filtered by `geo.states`). Companies/projects are stamped with `saved_search_id`. The default impl is deliberately conservative — the heavy lifting lives in the existing per-org ingest cron and is exercised once S1's migration adds `projects.saved_search_id`.
- score: invokes `scoreForSearch` hook (default wraps `lib/agents/ranker/genericScorer`). Returns scored + verified counts.

All phase transitions go through the injected `onPhase` callback. Stats accumulate into the returned `SearchStats`.

Never fabricate leads: a thin source plan yields a thin (but real) ingest. The scrape/score hooks return zeroes rather than synthetic rows when no sources produce events.

## Tests

Five test files, vitest. Mocks for `runDecomposition`, `completeSonar`, `geocodeLocation`, `runSourceOnboarder`, the supabase client, and the wire/scrape/score hooks. Coverage:
- interpretIcp: happy path returns SearchArchitecture; rejects <10-char ICP; Architect failure surfaces as thrown error with session id.
- resolveGeoRadius: geocode hit → states list contains center state; geocode miss with parseable region string → fallback via centroidByName; radius 0 → just center state.
- statesWithinRadius / bbox: deterministic table tests.
- planSources: tier1 includes sam_gov_entity per NAICS, jurisdictions per state; tier2 emits licensing-board template per state with `needs`; tier3 parses Sonar JSON array; tier3 parse failure returns `[]` and does not throw.
- runSearchPlan: phase callbacks fire in order interpret→geo→sources; architecture and source_plan are persisted via injected supabase stub.
- runIngestForSearch: wire iterates tier1+tier2+tier3; tier3 onboarder failures continue; scrape and score hooks called with the right shape; stats accumulate.

## Gate

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` — must pass; my diff touches nothing on the org architecture path, so this is a sanity check.

## Out of scope (S1/S3/S4)

- supabase migration adding `saved_searches`, `search_runs`, `projects.saved_search_id`
- API route handlers
- Inngest orchestration job
- UI (new-search form, progress component, search-scoped catalog)

## Open questions (logged, not blocking)

- The shape of `projects.saved_search_id` is owned by S1. My code reads it lazily; the default `scrapeForSearch` stamps it only when the column exists (caught by supabase error). Tests mock the path.
- The CBSA/county dataset is not in-repo. `counties` and `metros` are returned empty for now; the SPEC's "states/counties/metros" reads as a superset and `states[]` alone satisfies the SAM.gov / USAspending filters.
