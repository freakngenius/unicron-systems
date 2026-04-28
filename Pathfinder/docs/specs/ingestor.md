# Pathfinder Ingestor — Behavioral Spec

> **Runtime:** Vercel cron (`/api/cron/ingestor`, schedule `0 */6 * * *`).
> Implementation: `app/api/cron/ingestor/route.ts` + `lib/ingestor.ts`.
> This document is the behavioral spec — the implementation must match it exactly.
> See `docs/RUNTIME-ARCHITECTURE.md` for the full agent runtime map.

## Frame

You are **Pathfinder Ingestor**, a Vercel cron function in the Pathfinder fleet. Your job is to pull pre-budget construction + security awards from public data sources every six hours, normalize them into the `pathfinder.projects` shape, dedupe against existing rows, and insert the new ones. The Ranker picks them up on its next cycle.

**Scope for this iteration: USAspending and SAM.gov only.** Google News (RSS) and the Harris County permits portal (browser automation) are deferred — see "Deferred sources" at the bottom of this spec and the runtime-architecture doc for the rationale.

## Schedule

Vercel cron schedule `0 */6 * * *` — every six hours (00:00, 06:00, 12:00, 18:00 UTC). Each invocation is one cycle. Open one row in `pathfinder.agent_runs` at the start of the cycle, close it at the end. Skip a cycle if a prior `running` cycle started less than 90 minutes ago; treat any `running` row older than 120 minutes as a stuck-run timeout (mark `failed`, then proceed).

## Inputs / Data Sources

1. **USAspending API** (`https://api.usaspending.gov/api/v2/search/spending_by_award/`). Public, no auth. POST JSON body. Filters:
   - `award_type_codes ∈ {A, B, C, D}` — procurement contracts
   - `time_period.start_date` to `end_date` covering the last 14 days
   - `naics_codes.require ⊇ {23, 5413}` — construction + architectural/engineering
   - `limit = 100` per cycle, sorted by `Period of Performance Start Date desc`

2. **SAM.gov Opportunities API** (`https://api.sam.gov/opportunities/v2/search`). Requires `SAM_GOV_API_KEY` env var. GET with query params:
   - `postedFrom` / `postedTo` covering the last 14 days (MM/dd/yyyy format)
   - `ncode = 236220,541330` — representative 6-digit NAICS for construction + engineering services
   - `limit = 100` per cycle

You also read `pathfinder.projects` for dedup. You do not read `pathfinder.branches` or `pathfinder.customers` (geocoding is deferred — see below).

## Tools

- **Supabase server client** (`lib/supabase.ts → supabaseAdmin()`), service-role for writes. Reads from `pathfinder.projects` (dedup). Writes to `pathfinder.projects`, `pathfinder.agent_log`, `pathfinder.agent_runs`. Schema-pinned via the typed `PathfinderDatabase` generic.
- **Native `fetch`** for the two public APIs. No external SDKs.
- **No LLM, no browser automation, no MCP** in this iteration. Pure data orchestration.

## Output Schema (writes to `pathfinder.projects`)

INSERT a row per new opportunity with these fields populated:

- `id` — text PK, formatted as `${source}:${source_id}` (matches the existing seed/backfill convention).
- `source` — one of `'usaspending' | 'sam.gov'` (this iteration). Other sources land later.
- `source_id` — upstream's stable ID (`generated_internal_id` for USAspending, `noticeId` for SAM.gov).
- `title` — short human-readable string, ≤ 120 chars. Composed from agency + recipient + truncated description for USAspending; SAM provides a usable `title` directly.
- `summary` — first ~320 chars of upstream `Description`. Null when source omits one.
- `project_value` — USD numeric. Null if the source does not declare a value.
- `project_stage` — classified into the canonical taxonomy (`docs/PLAN-AGENTS.md` + `lib/stages.ts`):
  - USAspending awards → `'awarded'`
  - SAM.gov by `type` field: `Award*` → `'awarded'`; `Presolicitation` / `Sources Sought` → `'pre-budget'`; everything else → `'solicitation'`
- `posted_date` — ISO date of the upstream record. USAspending uses `Period of Performance Start Date`; SAM uses `postedDate`.
- `raw_payload` — JSONB. Store the full upstream record verbatim.

Leave the following fields **null** on insert. They are owned by the Ranker:
- `rationale`, `rationale_streamed_at`, `score`, `nearest_branch_id`, `distance_miles`, `outreach_hook`, `warm_for_customer_id`, `ranked_at`.

`lat` / `lon` are also left null in this iteration — geocoding deferred. The Verifier handles null-coordinate projects via its 2-of-4 exception (`docs/specs/verifier.md`).

`ingested_at` defaults to `now()` in the schema; do not set it explicitly.

## Logging (`pathfinder.agent_log`)

Write rows with `agent_name = 'ingestor'` and `event_type` in this closed set:

- `ingest_start` — once at cycle start. `event_data = { message: 'cycle_start · sources=2', cycle_id }`.
- `source_fetch` — one per source per cycle. `event_data = { message: 'fetched usaspending api · 6 federal awards', source, record_count }`. Set `latency_ms` to the fetch duration.
- `write_success` — one per insert batch. `event_data = { message: 'write · 14 inserted · 3 deduped', inserted, deduped }`.
- `error` — any failure. `event_data = { message, reason, source? }`. Reasons: `source_fetch_failed`, `supabase_write_failed`, `overlapping_cycle`, `unexpected_error`.

The dashboard renders these as `computer/ingestor → <message>` lines. Don't invent other event types — the activity-rail filters and the `ModelRoutingStrip` aggregates depend on the closed set across all agents.

## Cycle Bookkeeping (`pathfinder.agent_runs`)

Open at start: `{ agent_name: 'ingestor', status: 'running', records_processed: 0, records_new: 0 }`. `records_processed` = total records fetched across both sources. `records_new` = projects actually inserted (post-dedup).

Close at end: `{ status, records_processed, records_new, completed_at, error_message }`. Status is `'success'` if at least one source produced new rows; `'failed'` if every source erred and zero rows were inserted.

## Error Handling

- **Source fetch failure** — log `error` with `reason: 'source_fetch_failed'`, continue with the other source, don't fail the whole cycle. The Verifier + dashboard still get value from the working source.
- **`SAM_GOV_API_KEY` missing** — same as a fetch failure; log + continue with USAspending only.
- **Supabase insert failure** — log `error` with `reason: 'supabase_write_failed'`, mark the cycle `failed`, exit. Records remain in upstream APIs and will be picked up on the next 6h cycle.
- **Overlap protection** — refuse to start a new cycle if a prior `running` row exists under 90 minutes old. Log `error` with `reason: 'overlapping_cycle'`, return without writing.
- **Stuck run** — `running` row older than 120 minutes is timed out: mark `failed` with `error_message: 'cycle_timeout_detected_by_next_run'`, then start the new cycle.

## Stop Conditions

- Function `maxDuration` is 60s. With two HTTP fetches + a single batch insert, typical cycle latency is 5-20s, well inside budget. If both sources return 100 records each (max), the dedup query + batch insert add maybe 2-3s.
- Unauthorized (`CRON_SECRET` mismatch) → 401 immediately. Vercel cron sends the right Bearer header; only manual triggers might miss.

## Operating Principles

- **Two layers of dedup.** Upstream record IDs are stable (USAspending `generated_internal_id`, SAM `noticeId`). Build the canonical PK as `${source}:${source_id}` and dedup against existing project IDs in one query before inserting. No fuzzy entity correlation across sources in this iteration.
- **Don't enrich what isn't there.** If the upstream record has no value, store NULL. The Ranker reads NULL gracefully; the Verifier's customer-ref check ignores nulls. Inflating an unknown is worse than admitting it.
- **Keep `raw_payload` complete.** The dashboard's `ProjectModal` shows the raw payload behind a `<details>` disclosure. Operators rely on it for spot-checks. Don't strip fields to save bytes.

## Deferred sources

Two sources from the original spec ship in a follow-up iteration:

1. **Google News (RSS).** Pending decision on news-source provider — RSS scraping has reliability issues and competing options (NewsData.io, GDELT, custom Newscatcher) want consideration before code lands.
2. **Harris County permits portal (browser automation).** Pending Perplexity contest support response — the original plan was to run the browser-automation step inside a Perplexity Computer Space. If that path stays open, the connector will live there rather than as a Vercel cron function (Vercel doesn't ship a headless browser by default).

Both are non-blocking for the contest demo: USAspending + SAM.gov produce 50-200 fresh opportunities per 14-day window in Zedcor's NAICS bands, which is more than enough volume for the Ranker to operate on.

When either lands, append the connector to `lib/ingestor.ts` (one new `fetchXyzRecent()` per source), extend `IngestorSource`, and add the cycle wiring in `runIngestorCycle()`. The schema, logging, and dedup don't change.
