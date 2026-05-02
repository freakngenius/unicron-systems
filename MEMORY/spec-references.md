# Spec References

The anti-drift map. For non-trivial source files, this records:
- Which spec section the file implements
- When it was last verified
- Whether the implementation has drifted

Note: this file lives untracked in the workspace MEMORY/ dir. Earlier-session content (G0/G1/G2/Phase 2 Streams A–E) was cleared before 2026-05-01 17:00 UTC; it survives in git history at PR #37 and earlier squash-merges if recovery is needed. From 2026-05-01 forward this file rebuilds incrementally as files are touched/verified.

---

## Stream D — Architect Agent

**State:** PR #37 squash-merged at `68f7bd7` on main (2026-05-01). Verified post-merge 2026-05-01 17:50 UTC.

### Migrations

#### Pathfinder/supabase/migrations/0070_architect_sessions.sql
**Implements:** SPEC - Architect Agent.md §3, §6, §7 + SPEC - Backend Architecture.md §3.
**Last verified against spec:** 2026-05-01.
**Drift:** **minor, justified.** `vertical_id` + `customer_org_id` ship as `text`, not `uuid` FK to `vertical_configurations` / `users` (neither table exists in Pathfinder schema per D3 in decisions.md). Defaults to `'pathfinder-default'` for single-vertical Phase 2.
**Live state:** applied 2026-05-01. Confirmed via Supabase MCP `execute_sql`: `architect_sessions` has 15 columns matching types.ts; `architect_proposals` has 14 columns matching types.ts. RLS enabled on both. 0 rows.

### Runtime + tools

#### Pathfinder/services/architect/runtime/agent-loop.ts
**Implements:** SPEC - Architect Agent.md §2 (agent runtime, tool-use, system prompt, persisted session state).
**Last verified against spec:** 2026-05-01.
**Drift:** **major, justified, documented in decisions.md.** Hand-rolled Anthropic Messages API tool-use loop instead of `@anthropic-ai/claude-agent-sdk` — the SDK package spawns Claude Code as a subprocess (`pathToClaudeCodeExecutable`), incompatible with Vercel serverless. Same multi-turn tool-use semantics via `client.messages.create({ tools })`.

#### Pathfinder/services/architect/{prompts,tools,sessions}/*
**Implements:** SPEC - Architect Agent.md §3 (decomposition, 8 tools), §4 (tuning, 7 tools), §5 (discovery, 6 tools).
**Last verified against spec:** 2026-05-01.
**Drift:** **minor, additive.**
- `finalizeProposal` / `finalizeTuningRun` / `finalizeDiscoveryRun` tools added to terminate sessions with structured input (drift-free vs text-JSON parsing).
- WORKFLOW glue blocks appended to verbatim system prompts to tie them to the actual tool names.
- Tuning's `runShadowTest` is a **model-introspective estimator** (`method='model_introspective_estimate'`), not a real per-sample re-run — documented in decisions.md as Phase 2.5 deferral.

#### Pathfinder/services/architect/tools/feedback-store.ts
**Implements:** SPEC - Architect Agent.md §4 — feedback adapter.
**Last verified against spec:** 2026-05-01.
**Drift:** **minor.** Reads from `lead_actions` (live), `slack_messages.resolved_action` (live), and `outreach_edits` (Stream B B2 contract — table doesn't exist live yet). Verified 2026-05-01: querying missing `outreach_edits` returns Postgres `42P01`; the supabase wrapper's `if (!error && data)` + try-catch makes this non-fatal. Tuning sessions fall back to lead_actions + slack_messages alone.

### API endpoints (Pathfinder/app/api/architect/)

| Route | Spec | Status |
|---|---|---|
| `POST /decompose` | §3 | shipped, bearer auth via `ARCHITECT_API_TOKEN`, 300s maxDuration |
| `POST /tune` | §4 manual trigger | shipped, 1800s maxDuration |
| `POST /discover` | §5 manual + adjacency-callable | shipped, 900s maxDuration |
| Approve / dismiss endpoints | §7 (Architect Inbox UI) | **not yet shipped** — Stream C writes `architect_proposals.status` via supabase; documented in `MEMORY/audit-unicron-platform.md` |

### Inngest registration

| Function ID | Cron | Status |
|---|---|---|
| `pathfinder-architect-tuning-weekly` | `TZ=UTC 0 2 * * 0` (Sun 02:00 UTC) | registered |
| `pathfinder-architect-discovery-weekly` | `TZ=UTC 0 4 * * 0` (Sun 04:00 UTC) | registered |

Verified 2026-05-01 17:49 UTC: 10 unique IDs across the function set; only the two Stream D crons are time-triggered; 2-hour offset; no collisions.

### Tests + eval

#### Pathfinder/__tests__/architect/*.test.ts (mocked)
**Implements:** Disciplines §Layer 1 — unit tests with mocked Anthropic + SessionStore + FeedbackStore + SignalStore.
**Verified:** 2026-05-01 — 73 architect tests pass / 0 fail / 100% pass rate. Full Pathfinder suite: 451 / 0 / 23 (passed/failed/skipped).
- `agent-loop.test.ts` — 9 tests (loop semantics, cost cap, timeout, finalize)
- `decomposition-tools.test.ts` — 23 tests (catalog grounding, schema validation, structural rubric)
- `decomposition-session.test.ts` — 4 tests (orchestrator + session row create/update)
- `tuning-tools.test.ts` — 12 tests (clustering, draft revision, shadow-test gates)
- `tuning-session.test.ts` — 4 tests (multi-proposal capture + gate enforcement)
- `discovery-tools.test.ts` — 9 tests (jurisdiction-mining + portal lookup + impact estimator)
- `discovery-session.test.ts` — 5 tests (dedupe + 5-cap + gate enforcement)
- `eval-score.test.ts` — 7 tests (rubric scoring on synthetic proposals)

#### Pathfinder/services/architect/eval/*.jsonl (real-LLM fixtures)
**Implements:** SPEC - Architect Agent.md §3 (30 cases), §4 (20 cases), §5 (20 cases) eval coverage.
**Last verified against spec:** 2026-05-01.
**Mocked rubric baseline:** N/A — `eval-score.test.ts` validates the scoring code on synthetic proposals (7/7 pass), not on the 70 fixtures.
**Real-LLM pass-rate baseline:** pending. Scheduled remote agent `trig_015ZCGczmMBPHAmSzF5mGXmR` runs 2026-05-08 14:00 UTC against `--slice 5` decomposition + `--slice 3` tuning + `--slice 3` discovery (cost-bounded to $10).

### Cost discipline

Stream D total cost-to-date: **$0** of $25 cap. All tests use mocked Anthropic clients; no real-LLM calls fired by Stream D code in this session or prior.

The 2026-05-08 smoke is the first real-LLM exercise; expected cost $1.50–$5 across the three slices.

---

## Demo Polish Sprint — Stream P2 (lead-list sort + filter UI)

**State:** merged (PR #57, sha `5fc47d6`).

#### Pathfinder/lib/list-filters.ts
**Implements:** SPEC - Demo Polish & Geography Filters.md § 3.2 + § 3.3 — URL-persisted filter/sort state for `components/ProjectList.tsx`.
**Last verified against spec:** 2026-05-02.
**Drift:** none. Defaults match § 3.2 (sort=score, dir=desc, range=all, min_score=0). Score floor steps (0..90 by 10) match § 3.2.
**Tests:** `Pathfinder/tests/list-filters.test.ts` covers parse / serialize round-trip, default elision, snap-to-step clamping, and the canonical `?sort=score&dir=desc&range=within&min_score=80` example.
**TODO:** the WITHIN / OUTSIDE threshold currently reads from a local 250mi constant (`DEFAULT_MAX_SUPPORTED_DISTANCE_MILES` in `ProjectList.tsx`). Switch to `pathfinder.org_geo_config.max_supported_distance_miles` once Stream P1 lands the table (spec § 2.3).

---

## Demo Polish Sprint — Stream P1 (Geography filtering)

**State:** PR pending. Backfill ran 2026-05-02 against live Supabase; cost $0.12 of $4 cap.

### Migration

#### Pathfinder/supabase/migrations/0104_demo_polish_geography.sql
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.3 (additive schema for geography filtering).
**Last verified against spec:** 2026-05-02.
**Drift:** none. Adds `country`, `rejection_reason`, `rejected_at`, `geo_unknown`, `geo_inference_confidence` columns on `pathfinder.projects` plus `pathfinder.org_geo_config` table (defaults: 250mi, USA/CAN). Idempotent.
**Live state:** applied via Supabase MCP `apply_migration` 2026-05-02 06:23 UTC. Confirmed: 5 new columns present; `org_geo_config` seeded with `org_id='zedcor'`.

### Lib

#### Pathfinder/lib/zedcor/country-detect.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.2 Layer A (ingest country filter).
**Last verified against spec:** 2026-05-02.
**Drift:** none. Detects country from sam.gov / USAspending / Harris-seed / news shapes; returns canonical ISO-3 codes (USA, CAN, ROU, ...). Includes a keyword scan for free-form news bodies.

#### Pathfinder/lib/zedcor/city-centroids.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.2 Layer B (coordinate enforcement city-centroid lookup).
**Last verified against spec:** 2026-05-02.
**Drift:** none. ~95 city centroids for US + Canadian MSAs the demo touches; falls back to state centroid (lib/zedcor/state-centroids.ts) when no city match.

#### Pathfinder/lib/geography/coord-extractor.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.2 Layer B (Haiku coord-inference fallback).
**Last verified against spec:** 2026-05-02.
**Drift:** none. Calls `claude-haiku-4-5` via the wrapped `anthropic()` client (so llm_calls cost telemetry captures every invocation). 12s per-call timeout, ~200 max tokens. Returns `{city, state, country, confidence}` and the caller (backfill or future ingest enhancement) gates on confidence ≥ 0.7.

#### Pathfinder/lib/ingestor.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.2 Layer A — ingest-time country filter.
**Last verified against spec:** 2026-05-02.
**Drift:** none. New `applyCountryFilter()` runs after fetch + before dedup, populating `country` and stamping `rejection_reason='out_of_country'` when the detected country isn't on `org_geo_config.allowed_countries`. Out-of-country rows still insert (rejected pile counts them) but are pre-scored to 0 so the ranker queue ignores them. Inngest `raw_event.created` is filtered to only emit for passing rows.

#### Pathfinder/lib/types.ts
**Implements:** Type bag mirror for migration 0104.
**Last verified against spec:** 2026-05-02.
**Drift:** none. Adds optional `country`, `rejection_reason`, `rejected_at`, `geo_unknown`, `geo_inference_confidence` columns to `Project` plus a new `OrgGeoConfig` interface and `org_geo_config` table entry in `PathfinderDatabase`.

### Cron handler

#### Pathfinder/app/api/cron/ranker/route.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.2 Layer C — distance gating, plus Layer B `geo_unknown` score cap.
**Last verified against spec:** 2026-05-02.
**Drift:** none. Loads `org_geo_config.max_supported_distance_miles` once per cycle (250mi for Zedcor). After scoring, writes `rejection_reason='no_branch_coverage'` + `rejected_at` when `zedcor_distance_miles > threshold`. Sets `geo_unknown=true` and caps score at 50 when project has null lat/lon.

### Backfill script + page

#### Pathfinder/scripts/backfill-geography.ts
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.5 — one-shot idempotent backfill.
**Last verified against spec:** 2026-05-02. Ran end-to-end: 431 projects scanned, 409 country-stamped, 14 out_of_country, 27 no_branch_coverage, 17 geo_unknown (down from 136), 110 coords from Haiku + 10 from state centroids, $0.12 cost.
**Drift:** none. Cost-capped at $4 with a per-iteration `pathfinder.llm_calls` poll; aborts early if exceeded. Idempotent — re-runs do not re-stamp `rejected_at`.

#### Pathfinder/app/rejected/page.tsx
**Implements:** `SPEC - Demo Polish & Geography Filters.md` §2.5 — surface new rejection_reason buckets in the existing rejected pile UI.
**Last verified against spec:** 2026-05-02.
**Drift:** none. `categorize()` consults the explicit `rejection_reason` column first (new buckets `out-of-country`, `no-branch-coverage`); falls back to text-based bucketing for legacy rows. Query unions verified-low-score rows with explicit-rejection rows.

### Cost discipline

Stream P1 total cost-to-date: **$0.12** of $8 cap. All cost on Haiku coord-extraction during the backfill. Tests use the standard Anthropic mock — no live calls in CI.

---

## Demo Polish Sprint — Stream P3 (header + cross-pollination outreach)

**State:** PR #58 open against `main` (2026-05-02).

#### Pathfinder/lib/outreach.ts
**Implements:** SPEC - Demo Polish & Geography Filters.md §5.3 (Outreach Drafter cross-pollination context) and the pre-existing P0-02 Outreach Drafter contract (Pathfinder-Feature-Specs.md "P0 Feature 2 — Outreach Drafter"; agent-specs/03-computer-outreach.md).
**Last verified against spec:** 2026-05-02.
**Drift:** **none.** Additive change: new `CrossPollinationContext` type + optional `crossPollination` field on `DraftOutreachArgs`. When populated the prompt builder emits a RELATIONSHIP CONTEXT block that instructs the model to open with the relationship reference. Cold-lead path unchanged. Verified live by `scripts/regen-cross-poll-outreach.ts` against 3 exact-match leads — drafts open with "Zedcor has been supporting [customer] through our [branch] branch…" as required.

#### Pathfinder/lib/chat/outreach-drafter.ts
**Implements:** SPEC - Demo Polish & Geography Filters.md §5.3 (chat-side parallel for `/api/chat` outreach drafting; Sonar-driven path).
**Last verified against spec:** 2026-05-02.
**Drift:** **none.** Mirrors the cron-side context block. Hallucination-guard allowed-name set extended to include the matched customer canonical and primary-branch name so the engine-confirmed names pass without false positives.

---

## Z-F finish — pipeline volume

#### Pathfinder/lib/org-config-client.ts
**Implements:** Z-F finish — closes the P2 follow-up TODO. Browser hook that reads `pathfinder.org_geo_config` via `/api/org-config`, falling back to spec defaults (250mi, USA + CAN) on error. Replaces the hardcoded 250mi constant in `components/ProjectList.tsx` so the lead-list distance threshold tracks the table.
**Last verified against spec:** 2026-05-02.
**Drift:** **none.**

#### Pathfinder/scripts/reclassify-demoted.ts
**Implements:** Z-F finish — re-runs the loosened Haiku triage classifier against the existing pile of 239 projects demoted with `rationale='Filtered as non-opportunity by classifier'` and `rejection_reason IS NULL`. For projects that flip to "yes" under the new prompt, resets `score=NULL + rationale=NULL + ranked_at=NULL` so the next ranker cron cycle re-scores via Sonnet. Cost-capped at $5 against `pathfinder.llm_calls.cost_usd`.
**Last verified against spec:** 2026-05-02. Idempotent — only touches `score=0 AND rationale ilike '%non-opportunity%' AND rejection_reason IS NULL`.
**Drift:** **none.**

---

## Connector Sprint Phase 1 — C-1A Foundation

**State:** PR #62 (`connectors/c1a-framework`) — schema + token storage + OAuth handlers + dispatcher + webhook normalizer + token-refresh cron.

#### Pathfinder/supabase/migrations/0105_connector_framework.sql
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.1 (schema), § 5.1 (per-org isolation), § 5.2 (token storage), § 5.3 (OAuth state validation).
**Last verified against spec:** 2026-05-02. Tables: `connectors`, `connector_tokens`, `connector_routing_rules`, `connector_audit_log`. RLS enabled with org-scoped policies; service-role write only. `pgcrypto` extension required for envelope encryption.
**Drift:** **minor, additive.** SECURITY DEFINER plpgsql wrappers `pathfinder.encrypt_connector_token` / `decrypt_connector_token` mediate `pgp_sym_encrypt` / `pgp_sym_decrypt` so token plaintext never sits in app memory longer than the round-trip.

#### Pathfinder/supabase/migrations/0106_connector_agent_runs.sql
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.5. Widens `pathfinder.agent_runs.agent_name` check constraint to admit `connector-refresh` so the nightly token-refresh cron can write its run row.

#### Pathfinder/lib/connectors/types.ts
**Implements:** Type contracts shared across `lib/connectors/*` and the connector API routes.

#### Pathfinder/lib/connectors/providers.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 5.4. Per-provider scope-to-feature mapping (`slack`, `teams`, `hubspot`), auth/token endpoint URLs, signing-secret env vars.

#### Pathfinder/lib/connectors/oauth-state.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 5.3 (OAuth state validation). HMAC-SHA256 signed state tokens with 10-min expiry + 16-byte hex nonce + connector-type scoping. Reject paths: malformed, bad-signature, expired, replayed, type-mismatch — all five exercised in `tests/connectors/oauth-state.test.ts`.

#### Pathfinder/lib/connectors/tokens.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 5.2. `storeToken` / `getToken` / `rotateToken` round-trip via the SQL helpers from migration 0105 — token plaintext never sits in app memory beyond the immediate call. `CONNECTOR_TOKEN_KEY` env var required.

#### Pathfinder/lib/connectors/audit.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.6 (audit-log writes from the dispatcher). One row per dispatched event with denormalized `customer_org_id` for cross-tenant query guards.

#### Pathfinder/lib/connectors/dispatcher.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.6. `dispatchEvent(orgId, eventType, payload)` reads active routing rules joined to connectors, applies per-rule filter, calls `sendToConnector` with type-switched implementation. Fail-open semantics — a connector failure NEVER propagates to the calling agent. Per-org isolation enforced via `connectors!inner.customer_org_id=orgId` in the Supabase query.

#### Pathfinder/lib/agent-runs.ts (modified)
**Drift note:** `AgentName` union widened to include `'connector-refresh'`. Tracks the new nightly cron's runs alongside the existing ranker / verifier / outreach / etc.

#### Pathfinder/app/api/connectors/[type]/auth/route.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.2 (OAuth flow, step 1). `GET /api/connectors/{type}/auth?org_id={org}` redirects to the provider auth URL with a signed state token.

#### Pathfinder/app/api/connectors/[type]/callback/route.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.2 (OAuth flow, steps 2–8). Validates state, exchanges code for token via provider's token endpoint, stores via `lib/connectors/tokens.ts`, sets connector status='connected', redirects to `/pathfinder/settings/connectors?connected={type}`. Phase 1 ships the slack-specific exchange via C-1B; teams + hubspot return 501 until Phases 2 + 3.

#### Pathfinder/app/api/connectors/[type]/webhook/route.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.7. Inbound webhook normalizer. Validates provider signature, normalizes to `InboundEvent`, writes audit log row with `direction='inbound'`. Downstream routing to chat agent / sync engine ships in C-1B (slack) and Phase 3 (hubspot).

#### Pathfinder/app/api/cron/connector-token-refresh/route.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 3.5. Nightly cron that refreshes any token with `expires_at < now() + interval '24 hours'` via the provider's refresh endpoint. Writes agent_runs telemetry via the existing `openAgentRun` / `closeAgentRun` helpers. Schedule appended to `Pathfinder/vercel.json`.

---

## Connector Sprint Phase 1 — C-1B Slack OAuth + slash + Block Kit + reaction feedback

**State:** PR #63 (`connectors/c1b-slack`) — rebased onto `2e2e5b2` (C-1A merged) at orchestrator-resolved sha. Slack-specific layer + slack OAuth-callback implementation + lead_feedback table for reaction → ranker pipeline.

#### Pathfinder/supabase/migrations/0107_lead_feedback.sql
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 4.1 (reaction-feedback capture). `lead_feedback` table with RLS + partial unique index `(connector_id, project_id, user_external_id, message_ts) WHERE thumb IS NOT NULL` so duplicate reaction events idempotently no-op.

#### Pathfinder/lib/connectors/state.ts
**Implements:** SPEC § 5.3 (OAuth state validation). Slack-specific `buildState` / `verifyState` pair distinct from C-1A's `oauth-state.ts`. **Drift note:** the two-state-helper situation is intentional during Phase 1 — C-1B's slack callback uses `verifyState`; future connectors (Teams Phase 2, HubSpot Phase 3) will consume C-1A's `validateState` from `oauth-state.ts`. Consolidation is a Phase 4 cleanup task.

#### Pathfinder/lib/connectors/registry.ts
**Implements:** SPEC § 3.1 (connectors-row lifecycle helpers). `upsertConnector(args)` and `markConnectorError(connectorId, message)` wrap the table-level writes the slack callback does on install + failure paths.

#### Pathfinder/lib/connectors/feedback.ts
**Implements:** SPEC § 4.1 reaction-feedback writes + `/pathfinder feedback` slash command. `recordReactionFeedback` and `recordCommandFeedback` insert into `lead_feedback` with proper de-dupe semantics.

#### Pathfinder/lib/connectors/slack/signature.ts
**Implements:** SPEC § 4.1 + § 5 security boundary. `verifySlackSignature(req)` performs Slack's HMAC-SHA256 signing-secret + timestamp-window validation. Default-deny when `SLACK_SIGNING_SECRET` is unset.

#### Pathfinder/lib/connectors/slack/oauth.ts
**Implements:** SPEC § 3.2 + § 4.1. Slack-specific `buildAuthorizeUrl`, `callbackUrl`, `exchangeCode`. Layers on top of the canonical `getProvider('slack')` from C-1A (scope-list + authorize URL stay single-sourced).

#### Pathfinder/lib/connectors/slack/formatters.ts
**Implements:** SPEC § 4.1 Block Kit message shapes. `formatLead`, `formatRejection`, `formatFeedbackPrompt` produce JSON shaped for Slack `chat.postMessage`.

#### Pathfinder/lib/connectors/slack/commands.ts
**Implements:** SPEC § 4.1. Pure parser for `/pathfinder` slash command text (`leads`, `rejected`, `feedback`, `help`).

#### Pathfinder/lib/connectors/slack/chat-bridge.ts
**Implements:** SPEC § 4.1. Routes inbound `app_mention` and `message.im` events to the existing chat handler. v1 ships an acknowledge-only bridge; full LLM bridging deferred.

#### Pathfinder/lib/connectors/providers.ts (modified)
**Drift note:** Added `reactions:read` scope to the slack provider entry so PR #63's slack-oauth test (and the dispatch-prompt acceptance criterion) passes. C-1A's original list was missing it.

#### Pathfinder/middleware.ts (modified)
**Drift note:** Exempts `/api/connectors/slack/{callback,commands,events}` from basic-auth (they need to be reachable by Slack's servers). The `/auth` start route remains gated so only operators can initiate the install.

#### Pathfinder/app/api/connectors/slack/{auth,callback,commands,events}/route.ts (4 new routes)
**Implements:** SPEC § 4.1. Slack-specific auth start + OAuth callback + slash command dispatch + events handler (mention + DM + reaction). All consume C-1A's `lib/connectors/{tokens,audit,dispatcher}` core.
