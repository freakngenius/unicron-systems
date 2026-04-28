# Pathfinder — Architecture

**Status:** Stream 5 v1 · **Date:** 2026-04-27
**Owners:** Stream 1 (DB) · Stream 2 (Prompts) · Stream 3 (Map) · Stream 4 (Liveness) · Stream 5 (Scoring + Backfill + this doc)

This is the half-page reference for how Pathfinder's pieces fit together, why `lib/scoring.ts` is jealously guarded as pure, and how the demo data lands in Supabase before Computer comes online.

---

## 1. System overview

Three Perplexity Computer agents are the engine. They run on schedules, write to Supabase via the Supabase MCP, and never call our Next.js app. The dashboard reads what Computer wrote.

```
                        ┌──────────────────────────────────────────────────┐
                        │              Perplexity Computer fleet            │
                        │  (system prompts in `prompts/computer-*.md`)      │
                        │                                                  │
                        │  • Pathfinder Ingestor   (every 6h)              │
                        │      USAspending · SAM.gov · Google News ·       │
                        │      Harris County permits → entity-correlate →  │
                        │      pathfinder.projects (insert)                │
                        │                                                  │
                        │  • Pathfinder Ranker     (every 30m / on insert) │
                        │      reads unranked projects → cheap classifier  │
                        │      → Claude Sonnet rationale via lib/claude.ts │
                        │      → score via lib/scoring.ts (cloud copy) →   │
                        │      pathfinder.projects (update)                │
                        │                                                  │
                        │  • Pathfinder Adjacent   (weekly)                │
                        │      researches Zedcor-shaped orgs →             │
                        │      pathfinder.adjacent_targets (insert)        │
                        │                                                  │
                        │  every meaningful action → pathfinder.agent_log  │
                        └──────────────────────┬───────────────────────────┘
                                               │  Supabase MCP
                                               │  (write scope: pathfinder schema only)
                                               ▼
                ┌────────────────────────────────────────────────────────────┐
                │           Supabase — pathfinder.* schema only              │
                │   branches · customers · projects · agent_log ·            │
                │   agent_runs · adjacent_targets                            │
                │   realtime publication on `projects`, `agent_log`          │
                └──────────┬─────────────────────────────────┬───────────────┘
                           │ realtime + REST                 │ realtime + REST
                           ▼                                 ▼
              ┌─────────────────────┐            ┌─────────────────────────┐
              │ Next.js dashboard    │            │ /api/rationale/[id]     │
              │ (Stream 3 + 4)       │            │ SSE — streams Claude    │
              │ map · branch dock ·  │◀──────────▶│ rationale (Stream 4)    │
              │ project list ·       │            │ uses lib/claude.ts +    │
              │ activity rail        │            │ lib/anthropic.ts        │
              └──────────────────────┘            └──────────┬──────────────┘
                                                             │
                                                             ▼
                                                      ┌──────────────┐
                                                      │ Anthropic API │
                                                      └──────────────┘
```

`lib/scoring.ts` runs **inside** the Ranker (Computer-side) for production scoring, and is also embedded in `scripts/backfill.ts` so demo data uses the same arithmetic.

---

## 2. Schema isolation — `pathfinder.*` not `public.*`

The Unicron Systems Supabase project (`anfihcusvekpovcchpoh`) hosts several products. `public` is in active use by other Unicron projects and must not be touched. Stream 1's migration `0001_create_schema.sql` creates a dedicated `pathfinder` schema; every subsequent migration and every query qualifies tables as `pathfinder.<name>`. The Supabase clients in `lib/supabase.ts` pin `db.schema = 'pathfinder'` so unqualified table names resolve correctly. The Computer MCP write credentials are scoped to the `pathfinder` schema only — RLS in `0004_rls.sql` is the second gate.

---

## 3. Phase-2 transplant — the pure-function gate

Phase 2 of this product is an on-prem deployment at Zedcor: a Docker container running Llama-3.1-8B (entity matching) + `lib/scoring.ts` (deterministic geo/stage/customer score) against Zedcor's MySQL. The cloud half (this build) keeps the public-data ingestion, the Anthropic rationale generation, and the dashboard.

For that transplant to be a copy-paste rather than a rewrite, **`lib/scoring.ts` must remain free of any cloud or Node-only dependency**. No `fetch`, no Supabase, no Anthropic SDK, no `next/*`, no `node:*`, no `fs`, no `crypto`. The only allowed import is `@/lib/types`, which is type-only and erased at compile time.

Two gates enforce this:

1. **Authoring time — ESLint.** `.eslintrc.json` declares an override on `lib/scoring.ts` with `no-restricted-imports` listing every forbidden pattern (`@supabase/*`, `@anthropic-ai/*`, `next`, `node:*`, `@/lib/supabase`, `@/lib/claude`, `@/lib/anthropic`, `@/lib/realtime`, and the relative-path equivalents).
2. **CI / pre-merge — runtime test.** `tests/scoring-purity.test.ts` reads `lib/scoring.ts` as a string, regex-matches every `import` statement, and fails if any spec matches the deny list. The same test asserts the only allowed import is `@/lib/types`.

Both gates exist on purpose. The lint rule catches the offence at the moment someone tries to write the import; the test catches it if the lint rule is bypassed (`// eslint-disable`, missing local config, etc.).

The `lib/claude.ts` helper for rationale generation is the cloud-side counterpart — it imports the Anthropic SDK via Stream 4's `lib/anthropic.ts`. That file is **explicitly cloud-only** and never crosses the line into `lib/scoring.ts`.

---

## 4. Liveness pattern — module-level state + subscriber sets

Stream 4's `lib/realtime.ts` is the bridge between Supabase realtime and the React tree. Pattern:

- Module-level singletons hold the most recent snapshot of `agent_log`, `agent_runs`, agent latency rollups, and project deltas.
- Each singleton exposes `subscribe(fn)` / `unsubscribe(fn)` returning an unsubscribe handle. React hooks (`useAgentStatus`, `useActivityTail`, `useProjectInserts`, etc.) call these in `useEffect` cleanup.
- The Supabase realtime channel is opened once, at module load. On insert/update events the singleton mutates its snapshot and broadcasts to every subscriber.
- Polling fallback (every 60s) runs alongside realtime in case the WebSocket drops — the snapshot reconciliation is idempotent.

Single source of truth = Supabase. No prop-drilling realtime through 12 components, no React Context wrapper around the whole app.

---

## 5. Demo data path — three deterministic stages

```
scripts/seed.ts        →  pathfinder.branches      (5 rows · 5 Zedcor-mirror branches)
                          pathfinder.customers     (30 rows · plausible per-branch customers)
                          [reads public/seed-data/branches.json + customers.json]

scripts/backfill.ts    →  pathfinder.projects      (~30 rows · synthetic, scored via lib/scoring.ts)
                          pathfinder.agent_log     (~60 rows · ~20 per agent, varied event_types)
                          pathfinder.agent_runs    (3 rows · one closed run per agent)
                          [idempotent via upsert on (source, source_id)]

Computer Ingestor      →  pathfinder.projects      (real public-data records, every 6h)
Computer Ranker        →  pathfinder.projects      (rationale + score, every 30m)
Computer Adjacent      →  pathfinder.adjacent_targets (research output, weekly)
                          pathfinder.agent_log     (continuous)
                          pathfinder.agent_runs    (continuous)
```

Stage 1 (`seed.ts`) is run once on a fresh Supabase project. Stage 2 (`backfill.ts`) is run before each demo to guarantee the dashboard has visible data and a believable history. Stage 3 (Computer agents) runs continuously after the prompts in `prompts/computer-*.md` are dropped into Perplexity Spaces.

The backfill's score, nearest_branch_id, distance_miles, and warm_for_customer_id are all computed by `lib/scoring.ts` — the demo numbers and the production numbers come out of the same kernel. If a reviewer asks "how is ranking decided," the answer is the same on day 1 and day 90.

---

## File map (Stream 5 deliverables)

| Path | Role |
|---|---|
| `lib/scoring.ts` | Pure-function scoring kernel · Phase-2 transplant target |
| `lib/claude.ts` | Cloud-side rationale helper (uses Stream 4's `lib/anthropic.ts`) |
| `tests/scoring.test.ts` | Vitest tests — distance, branch matching, score components, edge cases |
| `tests/scoring-purity.test.ts` | Runtime guard — fails CI if `lib/scoring.ts` imports anything forbidden |
| `vitest.config.ts` | Minimal Vitest config — resolves `@/*` alias, node env |
| `.eslintrc.json` | Authoring-time gate — `no-restricted-imports` override on `lib/scoring.ts` |
| `scripts/backfill.ts` | Synthetic-projects writer · 30 projects + 60 agent_log + 3 agent_runs |
| `docs/ARCHITECTURE.md` | This document |
