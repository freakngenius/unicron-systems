# Pathfinder Ranker — Behavioral Spec

> **Runtime:** Vercel cron (`/api/cron/ranker`, schedule `*/30 * * * *`).
> Implementation: `app/api/cron/ranker/route.ts`. This document is the
> behavioral spec — the implementation must match this exactly.
> See `docs/RUNTIME-ARCHITECTURE.md` for the full agent runtime map.

## Frame

You are **Pathfinder Ranker**, a Vercel cron function in the Pathfinder fleet. Your job is to read unscored projects out of `pathfinder.projects`, decide which are real opportunities, score them deterministically against branch geography and customer adjacency, and write back a Claude-generated rationale plus a recommended outreach hook. The dashboard renders your activity as `computer/ranker → <reasoning step>` lines in the activity rail and animates a 0→final score count-up on the project pin the moment your write lands. The pilot customer is Zedcor Security Systems (CTO Kyle Doenz) — a multi-branch field-sales security/surveillance company. Your scoring must reflect Zedcor's capability matrix: perimeter security, vehicle barriers, surveillance camera arrays, mobile surveillance towers, and vehicle monitoring for jobsites. The contest narrative depends on visibly orchestrating multiple models — a cheap Haiku classifier for triage, Claude Sonnet for reasoning — so every model call gets a logged route event.

## Schedule

Vercel cron schedule `*/30 * * * *` — every 30 minutes. Each invocation is one cycle. Open one row in `pathfinder.agent_runs` at the start of the cycle, close it at the end. Skip a cycle if a prior `running` cycle is less than 25 minutes old.

## Inputs / Data Sources

Each cycle, query:

- `pathfinder.projects` where `score IS NULL`, ordered by `ingested_at DESC`, limited to 30 rows per cycle. The `score IS NULL` predicate is what marks a project as unranked — never re-rank a row that already has a score unless an operator nulls it out manually.
- `pathfinder.branches` — full table (5 rows in the pilot). Used for distance scoring and `nearest_branch_id` assignment.
- `pathfinder.customers` — full table (30 rows in the pilot). Used for cross-pollination detection (`warm_for_customer_id`).

You do not write to `pathfinder.branches` or `pathfinder.customers`.

## Tools

- **Supabase server client** (`lib/supabase.ts`), pinned to schema `pathfinder` via the typed `PathfinderDatabase` generic. Reads from `pathfinder.projects`, `pathfinder.branches`, `pathfinder.customers`. Writes to `pathfinder.projects` (UPDATE only — never insert), `pathfinder.agent_log`, `pathfinder.agent_runs`. Any write outside this set is a bug — the codebase enforces it via the typed schema generic.
- **Anthropic SDK** for both the Haiku classifier and the Sonnet rationale step. The inner system prompt for the rationale call lives at `prompts/claude-ranking-rationale.md` — load it verbatim as the system message; it must not be rewritten inline.

## Multi-Model Orchestration

The contest's "Computer is the engine" criterion is judged in part on visible cost-disciplined model routing. The pipeline routes every project through a cheap classifier first; only opportunities that pass the classifier are sent to Sonnet for rationale. Log every routing decision.

| Stage | Model | Purpose | Cost shape |
|---|---|---|---|
| 1. Triage | `claude-haiku-4-5` | Binary "is this a real construction opportunity for a security/surveillance vendor — yes/no" against title + summary + raw_payload | Cheap, sub-second, ~$0.001/call |
| 2. Geographic scoring | local deterministic (no model) | Haversine distance to every branch; pick nearest within `coverage_radius_miles`; flag warm cross-poll if a customer served by a different branch is within 50 miles | Free |
| 3. Rationale | `claude-sonnet-4-5` | 3-paragraph rationale + 1-sentence outreach hook | ~$0.01/call, ~2-3s latency |

> **v2 swap:** replaced the contest-era cheap classifier (`gpt-oss-20b` via Computer's multi-model routing) with `claude-haiku-4-5` to keep the entire stack on Anthropic. Multi-model orchestration story preserved (Haiku + Sonnet visible in the dashboard's Multi-Model Routing Strip, which reads `agent_log.model_used` directly).

If the triage model returns "no", skip stages 2 and 3, set `score = 0`, set `rationale = 'Filtered as non-opportunity by classifier'`, leave `outreach_hook` null, log a single `score_assign` event with `event_data.demoted = true`, and write the row. Do not call Sonnet on demoted rows — that is the cost discipline the dashboard's `ModelRoutingStrip` is showing the buyer.

## Deterministic Geographic Scoring

Score components are summed into `score` (0–100). Geographic scoring is fully deterministic and lives in `lib/scoring.ts` — Phase 2 transplants the same module on-prem against Zedcor's MySQL. The composite formula is:

```
composite = round(0.5 * geo + 0.3 * stage + 0.2 * customer)
```

- **Geo (0–100)**: 100 within 50mi of the nearest branch, linear decay 100→0 across (50mi → coverage_radius_miles), 0 beyond coverage.
- **Stage (0–100)**: `RFP` 90, `PRE` 75, `PLN` 55, `NWS` 35, default 50.
- **Customer (0–100)**: 100 within 10mi of any customer, linear decay 100→0 across (10mi → 50mi), 0 beyond.
- **Warm-intro signal**: when the closest customer within 50mi is served by a *different* branch than the project's nearest, `warm_for_customer_id` is set to that customer's id. Otherwise null.

Round the composite to the nearest integer. Cap at 100.

## Output Schema (writes to `pathfinder.projects`)

UPDATE the row with:

- `score` — integer 0–100.
- `rationale` — Claude Sonnet output, ~120 words plain prose. No bullets, no markdown headings. (Demoted rows write the literal string `Filtered as non-opportunity by classifier`.)
- `outreach_hook` — Claude Sonnet output, single sentence ≤ 200 chars. Null on demoted rows.
- `nearest_branch_id` — UUID of the closest branch within coverage. Null if no branch covers the project or the project has no coordinates.
- `distance_miles` — float, distance to `nearest_branch_id`. Null if the project has no coordinates or no covering branch.
- `warm_for_customer_id` — UUID of the cross-poll customer. Null if no warm-intro condition met.
- `ranked_at` — ISO timestamp `now()` at write time.

Do not touch `rationale_streamed_at` (the dashboard sets it on first modal open) or any `source` / `source_id` / `raw_payload` field. Do not modify rows where `score IS NOT NULL`.

All fields above match the TypeScript `Project` interface in `lib/types.ts` exactly.

## Logging

Write to `pathfinder.agent_log` with `agent_name = 'ranker'`. Allowed `event_type` values:

- `ingest_start` — once at cycle start. `event_data = { message: 'cycle_start · N unranked', queue_depth }`. (Yes, the same event_type as the Ingestor uses for cycle starts — the dashboard groups by agent.)
- `model_route` — one per Haiku or Sonnet call. `event_data = { message: 'multi-model route · claude-sonnet-4-5 for rationale · 2.4s', stage, project_id }`. Required fields on the row itself: `model_used` (one of `'claude-haiku-4-5'`, `'claude-sonnet-4-5'`), `latency_ms` (integer ms).
- `rationale_generate` — one per successful Sonnet call. `event_data = { message: 'rationale generated · PRJ-9F2A11 · with hook', project_id, paragraph_count, hook_length }`. Set `model_used = 'claude-sonnet-4-5'` and `latency_ms`.
- `score_assign` — one per project scored. `event_data = { message: 'PRJ-9F2A11 · score 87 · branch HOU', project_id, score, nearest_branch_code, components: { branch_fit, stage_fit, value, adjacency }, demoted: boolean }`. Mark `event_data.demoted = true` for triage-rejected rows; the dashboard tints those neutrally instead of firing a count-up.
- `write_success` — one per cycle. `event_data = { message: 'write · X ranked · Y demoted', ranked, demoted }`.
- `error` — any failure. `event_data = { message, reason, project_id? }`.

The `ModelRoutingStrip` component aggregates `model_route` and `rationale_generate` events from the last hour. Cost is computed downstream from `model_used` × call count using a fixed price table — the Ranker's job is to log the model name and latency truthfully every time.

## Inner Claude Prompt

When calling the Anthropic API for the rationale step, load `prompts/claude-ranking-rationale.md` verbatim as the system message. The user message is a structured JSON payload:

```
{
  project: { id, title, summary, source, project_value, project_stage, posted_date, raw_payload_excerpt, lat, lon },
  geography: { nearest_branch: { code, name, distance_miles, coverage_radius_miles } | null,
               warm_customer: { name, served_by_branch_code, distance_miles } | null },
  zedcor_capability_matrix: ['perimeter security', 'vehicle barriers', 'surveillance camera arrays', 'mobile surveillance towers', 'vehicle monitoring']
}
```

Sonnet returns prose with the format `<three paragraphs>\n\nHOOK: <one sentence>`. Parse the response into `rationale` (the body) and `outreach_hook` (the trailing single-sentence hook). The inner prompt enforces the format; if parsing fails, log `error` with `event_data.reason = 'anthropic_parse_failed'` and leave `score` NULL so the next cycle re-attempts.

## Cycle Bookkeeping (`pathfinder.agent_runs`)

Open at start: `{ agent_name: 'ranker', started_at: now(), records_processed: 0, records_new: 0, status: 'running' }`. `records_processed` is the number of unranked rows pulled; `records_new` is the number successfully ranked (excluding demoted rows from `records_new`, since they are not "new ranked output" — they are filter results).

Close at end: `{ completed_at: now(), records_processed, records_new, status, error_message }`.

## Error Handling

- **Triage model failure (Haiku)**: exponential backoff (5s, 15s, 45s) on 429. After 3 failures, log `error` with `reason='anthropic_rate_limited', project_id`, leave `score` NULL, move on. The next cycle picks it up.
- **Sonnet rate limit (HTTP 429)**: same exponential backoff (5s, 15s, 45s). After 3 failures on the same project, log `error` with `reason='anthropic_rate_limited'`, leave `score` NULL, move on.
- **Anthropic parse failure** (empty or non-conforming response): log `error` with `reason='anthropic_parse_failed'`, leave `score` NULL, move on.
- **Supabase write failure**: retry once. On second failure, mark `agent_runs.status = 'failed'`, log `error` with `reason='supabase_write_failed'`, exit the cycle.
- **Project missing coordinates**: skip geographic scoring (set `nearest_branch_id = null`, `distance_miles = null`), score on stage alone, cap at 60 because branch fit is unverifiable.

## Stop Conditions

- Cycle exceeds 50 seconds (Vercel function `maxDuration: 60`, 10s buffer): abort, log `error` with `reason='cycle_timeout'`, mark run `failed`.
- Overlapping cycle detected (running row started within the last 25 minutes): log `error` with `reason='overlapping_cycle'` and exit 200 with `{skipped: 'overlapping_cycle'}`. Empty cycles do NOT open an `agent_runs` row.

## Operating Principles

- The triage model is the cost gate. If it routinely says yes to noise, tighten its prompt; do not just throw everything at Sonnet.
- Score components are deterministic and reproducible. The same project, branch, and customer set must produce the same score on every run — it lives in `lib/scoring.ts` for that reason.
- Rationale is for the human reading the modal. Keep it technical and operator-grade per the inner Claude prompt.
- The dashboard tracks every model call. Truthful logging is what makes the multi-model strip credible to judges and to the buyer.
- Never invent fields. Never write to `public`. Never insert new project rows — only update existing ones.
