# 99 — Blockers and known issues

Snapshot of what Claude Code (`zedcor-pc-handoff-finish` branch) verified, what it could not perform from a code session, and the known dashboard issues that are documented but not in-scope for submission.

## Prompt SQL contracts — verified clean

All three prompts in `Pathfinder/zedcor-pc/prompts/` were verified against the deployed schema. Cross-checked sources:

| Column / table referenced in prompts | Defined in migration |
|---|---|
| `pathfinder.projects.{lat, lon, project_value, project_stage, posted_date, raw_payload, ingested_at, source, source_id, title, summary, ranked_at}` | `0002_tables.sql` |
| `pathfinder.projects.{verified, verifier_notes, verifier_pass_count}` | `0005_agent_expansion_layer1.sql` |
| `pathfinder.projects.{nearest_zedcor_branch_id, zedcor_distance_miles}` | `0102_zedcor_geomapper.sql` |
| `pathfinder.projects.{country, rejection_reason}` | `0104_demo_polish_geography.sql` |
| `pathfinder.projects.{verifier_failure_reason}` | `0125_verifier_unverified_context.sql` |
| `pathfinder.projects.{phase_confidence, phase_signals, buy_window_open}` | `20260524_zedcor_pc_additive.sql` |
| `pathfinder.projects.organization_id` (NOT NULL) + `agent_log.organization_id` + `agent_runs.organization_id` | `20260511_phase2a_completion_org_id_rls.sql` |
| `pathfinder.hubs`, `pathfinder.source_licenses`, `pathfinder.customer_signals`, `agent_log.runner`, `agent_runs.runner` | `20260524_zedcor_pc_additive.sql` |
| `pathfinder.zedcor_branches`, `pathfinder.zedcor_customer_sites` (with `customer_org_id`, `customer_name_raw`, `customer_name_normalized`, `parent_company_canonical`) | `0100_zedcor_data_foundation.sql` |
| `agent_log` columns `agent_name`, `event_type`, `event_data`, `ts`, `latency_ms`, `model_used` | `0002_tables.sql` |
| `agent_runs` columns `agent_name`, `started_at`, `completed_at`, `records_processed`, `records_new`, `status`, `error_message` | `0002_tables.sql` |
| `agent_name` CHECK widened to include `verifier`, `customer-intel` | `0005_agent_expansion_layer1.sql` (re-widened in `0106_connector_agent_runs.sql`) |

Confirmed Zedcor org UUID: `6cd87740-7c72-4337-ac79-316a54242eef` (per `20260511_phase2a_completion_org_id_rls.sql` STEP 3 backfill).

Confirmed all three prompts:
- Have a preflight block that lists tools, confirms Supabase MCP, queries `pathfinder.organizations WHERE slug='zedcor'`, and (Ingestor + Verifier) the Houston hub.
- Set `runner='pc'` on every `agent_log` and `agent_runs` write.
- Use only legal `agent_name` values (`ingestor`, `verifier`, `customer-intel`).
- Have explicit refusal paths for out-of-scope writes (log `event_type='refusal'`, abort).
- Carry per-source / per-bucket / per-run / wall-clock caps.
- Forbid logging service-role keys in `event_data`.

**No edits to the three prompt files were made.** They were verified as-is.

## Token / cost budgets — intentionally not added to prompts

The original `CLAUDE-CODE-PROMPT.md` step 4 says "Tighten token budgets so each agent run costs under $5 USD on first dry run." Project-level `CLAUDE.md` explicitly forbids "numeric cost caps in prompts" — that's a hard rule. The right interpretation:

- Operational caps (per-source 50, per-bucket 400, per-run 1,200, wall-clock 25 min, per-customer 4,000 tokens average) are **operational**, not cost caps — they stay.
- A literal "$5" or "halt at $X" line would violate the global rule. Not added.

Token spend will be reported in each run's summary (already in all three prompts: `tokens=T · cost=$C.cc`), so Kyle sees actual spend after each dry run and can adjust caps by replying with new numbers before sending `schedule`.

## Dashboard issues (from `02-data-flow-spec.md`) — status

| Issue | In scope for submission? | Status |
|---|---|---|
| Map renders as black void | Optional (video can avoid the map) | **Kyle-side action**: see `04-paste-into-perplexity.md` Part A.1 — Google Cloud Console HTTP-referrer fix. Claude Code cannot do this. |
| Counters all 0 (`New 24h`, `Tracked`, `Ranked`, `Errors`) | Not required (agent log ticker is the headline) | Diagnostic path is in `02-data-flow-spec.md` — `components/TopBar.tsx` LiveStat → likely missing realtime subscription or org-scope mismatch. Not fixed in this branch; the spec explicitly says "NOT a blocker for the submission." |
| Chat panel doesn't open | Not required | Diagnostic path in `02-data-flow-spec.md` — `components/chat/ChatPanel.tsx` → probably missing `PERPLEXITY_API_KEY` env on `pathfinder-ashy`. If unfixable in <30 min, the spec recommends guarding the button on the `zedcor.unicron.systems` host. Not fixed in this branch. |
| Cross-pollination overlay empty | Not required | Depends on `pathfinder.lead_cross_pollination` having rows — a separate cron writes those. Will populate after PC ingest fills enough projects for the cron to match against. |
| Project modal doesn't expand to fullscreen | Not required | Listed in `00-START-HERE.md`. Not investigated. |
| Branch dock duplicates (e.g. "Alabama" / `ALABAMA-AL` + `ALABAMA`) | Not required (video can crop) | Mentioned in `00-START-HERE.md` as seed-transform artifact. Seeds already loaded; cleaning duplicates would require a one-off SQL UPDATE to merge IDs. Out of scope for this PR. |
| Default `Score ≥ 30` filter hides most data | Not required | Mentioned in `00-START-HERE.md`. Out of scope for this PR. |
| Too many cities, only Houston region matters | Not required | Mentioned in `00-START-HERE.md`. Out of scope for this PR. |

The branch this PR is built on (`zedcor-pc-handoff`) already includes some `dashboard.tsx`, `demo-branches.ts`, `next.config.js`, and `middleware.ts` changes. Those carry through this PR unchanged.

## What this PR adds

Three files in `Pathfinder/zedcor-pc/`:

- `runbook/RUNBOOK.md` — the original execute runbook (referenced by `00-START-HERE.md` and the CLAUDE-CODE-PROMPT but not previously committed; restored from `~/Downloads/RUNBOOK.md`).
- `handoff/04-paste-into-perplexity.md` — Kyle copy-paste runbook for standing up the three chats.
- `handoff/99-blockers.md` — this file.

## What this PR does NOT do

- Does not modify the existing PC prompt files (verified clean).
- Does not modify deployed schema (additive migration already in place).
- Does not load any more seed data.
- Does not investigate or fix the four non-headline dashboard issues (counters / chat / modal / cross-poll).
- Does not run any SQL against Supabase. The verification was source-code-only against committed migrations.
- Does not start the PC agents (Kyle does that in Perplexity — see `handoff/04-paste-into-perplexity.md`).

## Open questions deferred to Kyle (not blockers, but worth a glance before merge)

1. The Verifier prompt's signal-pattern table contains `mobilization_late_actionable` referenced in the `buy_window_open` rule but **not defined in the signal patterns table**. Either drop it from the rule, or add a row to the patterns table that produces that signal. Filed for Kyle Doenz's v1.0→v1.1 phase-mapper call (see Verifier prompt "KYLE DOENZ OPEN QUESTIONS" section).
2. The Ingestor's `bucket` field comes from `data_sources.metadata->'config'->>'bucket'`. The seed file `01_zedcor_pc_seed.sql` presumably populates this — worth a sanity probe before the first scheduled cycle: `SELECT (metadata->'config'->>'bucket')::int AS bucket, count(*) FROM pathfinder.data_sources WHERE organization_id = '6cd87740-7c72-4337-ac79-316a54242eef' GROUP BY bucket;` should return ~4 buckets.
