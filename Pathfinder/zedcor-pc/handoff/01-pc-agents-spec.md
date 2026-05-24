# 01 — Perplexity Computer agents spec

Three PC agents must be running on schedule, writing into Supabase, and visible in the dashboard activity rail.

## Architecture

```
PERPLEXITY COMPUTER SPACE: "Zedcor · Pathfinder Engine"
├── Chat 1: ingestor (PC variant)        — daily 06:00 UTC
├── Chat 2: verifier (PC variant)        — daily 10:00 UTC
└── Chat 3: customer-intel (PC variant)  — daily 11:00 UTC
        │
        ▼ Supabase MCP (per-thread enable; project anfihcusvekpovcchpoh)
PATHFINDER SCHEMA
├── pathfinder.projects               (Ingestor INSERTs; Verifier UPDATEs phase)
├── pathfinder.agent_log              (all three log events; runner='pc')
├── pathfinder.agent_runs             (all three open/close runs; runner='pc')
├── pathfinder.customer_signals       (Customer Intel INSERTs)
├── pathfinder.zedcor_customer_sites  (Customer Intel reads)
├── pathfinder.data_sources           (Ingestor reads filtered by license_status)
└── pathfinder.source_licenses        (Ingestor reads to filter sources)
```

## Source prompt files (review and polish, do not rewrite from scratch)

- `Pathfinder/zedcor-pc/prompts/01-ingestor-pc.md`
- `Pathfinder/zedcor-pc/prompts/02-verifier-pc.md`
- `Pathfinder/zedcor-pc/prompts/03-customer-intel-pc.md`

These prompts have been drafted. Your job is to:

1. Verify each prompt's SQL contracts match the deployed schema (read the migration + `lib/types.ts`)
2. Tighten any preflight / refusal language that might cause Perplexity Computer to over-block
3. Ensure each prompt explicitly asks the agent to confirm it has Supabase MCP enabled before doing any work
4. Reduce token budgets if needed — submission is days away, we cannot blow through credits

## What each agent must produce

### Agent 1 — `ingestor` (PC variant)

Reads `pathfinder.data_sources` filtered by `metadata->>'source_slug'` joined to `pathfinder.source_licenses` where `license_status='commercial_ok'`. For each source, browses or hits API, parses opportunities, dedups against `pathfinder.projects` by `(source, source_id)`, inserts new rows with `runner='pc'`. Updates `data_sources.last_polled_at` and `last_event_at`.

**Required write fields on `pathfinder.projects`:** `id` (text, generated), `source` (text), `source_id` (text), `organization_id` (UUID of Zedcor org), `title`, `summary`, `lat`, `lon`, `project_value`, `project_stage` (nullable — Verifier writes phase), `posted_date`, `raw_payload`, `ingested_at`, `country`.

**Per-source cap:** 50. **Per-run cap:** 1,200. **Run-level wall-clock cap:** 25 minutes.

**Success metric:** at least 1 source returns ≥1 new row on the first dry run.

### Agent 2 — `verifier` (PC variant)

Reads `pathfinder.projects WHERE organization_id=<zedcor> AND ingested_at > now() - interval '48 hours' AND (verified IS NULL OR phase_confidence IS NULL)`. Performs 4 deterministic checks (source plausibility, geography sanity, asset class in scope, currency/freshness) + phase inference using the signal weights in `02-verifier-pc.md`. Writes `verified`, `verifier_notes`, `project_stage`, `phase_confidence`, `phase_signals`, `buy_window_open`.

Coexistence with cron Verifier: if `verified IS NOT NULL` already, do NOT touch `verified` / `verifier_notes` / `verifier_failure_reason` — only update phase fields.

**Success metric:** at least 5 rows have `buy_window_open=true` after first scheduled run.

### Agent 3 — `customer-intel` (PC variant)

Reads `pathfinder.zedcor_customer_sites` (1,825 rows exist). Processes up to 50 per run, rotating by `updated_at ASC NULLS FIRST`. For each customer, scans public sources (Google News, LinkedIn jobs, SEC EDGAR if `public_ticker` present) for press / M&A / hiring / expansion / incident / filing signals in the last 7 days. Writes one row per signal to `pathfinder.customer_signals` with `inferred_opportunity` (1–2 sentences), `opportunity_window`, `source_url`, `confidence`.

**Per-customer token cap:** 4,000 average. **Per-run cap:** 50 customers.

**Success metric:** at least 3 customer signals written on first dry run.

## Order of operations Claude Code follows

1. Open each prompt file. Read end to end. Compare every SQL statement against deployed schema.
2. Fix any column-name mismatches (`lon` vs `lng`, `project_value` vs `estimated_value_usd`, etc. — production uses the former in each pair).
3. Confirm each prompt has the preflight block: list tools → confirm Supabase MCP → `SELECT id FROM pathfinder.organizations WHERE slug='zedcor'` → `SELECT count(*) FROM pathfinder.hubs WHERE hub_slug='houston' AND organization_id=<org>;`
4. Confirm each prompt instructs the agent to set `runner='pc'` on every `agent_log` and `agent_runs` row.
5. Save fixes back to the same files.
6. Generate a short Kyle-facing handoff in `Pathfinder/zedcor-pc/handoff/04-paste-into-perplexity.md` listing the exact 7 steps to paste the prompts into Perplexity Spaces (Title/Description/Instructions for the Space, then 3 chats with model assignments).

## Models per chat

- Chat 1 (Ingestor): GPT-5.5 — fast, cheap, browser-heavy
- Chat 2 (Verifier): Opus 4.7 — judgment-heavy phase inference
- Chat 3 (Customer Intel): Opus 4.7 — synthesis-heavy

## Schedule timing (matters for the submission video)

- 06:00 UTC ingest → 10:00 UTC verify → 11:00 UTC customer intel
- Kyle's Houston time = UTC - 5 (CDT) or - 6 (CST). All runs land before 7am his time so morning open shows fresh feed.
- For the demo video: trigger one manual run end-to-end the morning of the video shoot so timestamps are tight.

## Hard rules each agent must honor (already in prompts; verify)

- Use existing `agent_name` CHECK values only (`ingestor`, `verifier`, `customer-intel` — NOT `pc-*`)
- `runner='pc'` on every write
- Refuse out-of-scope writes; log `event_type='refusal'` and abort
- Never fabricate rows to hit a count floor — `source_empty` is legitimate
- Conservative inference — better NULL than wrong on phase/confidence
- No service-role creds in any event_data
