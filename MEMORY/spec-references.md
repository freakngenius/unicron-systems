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
**Last verified against spec:** 2026-05-02 (Demo Polish UX § Gate 1C/1D update).
**Drift:** **minor, justified.** Defaults widened from spec § 3.2 baseline (sort=score, dir=desc, range=all, min_score=0) to (sort=score, dir=desc, range=within, min_score=50) so the dashboard's first paint already shows the demo-narrative view. Both fields stay freely selectable; `range=all` and `min_score=0` continue to round-trip cleanly through the URL. `snapScoreFloor` returns `null` on non-finite input so the parser substitutes the new default rather than forcing 0.
**Tests:** `Pathfinder/tests/list-filters.test.ts` covers parse / serialize round-trip, default elision, snap-to-step clamping, the canonical `?sort=score&dir=desc&range=within&min_score=80` example, and explicit-widening (`range=all`, `min_score=0`).
**TODO:** WITHIN / OUTSIDE threshold reads `pathfinder.org_geo_config.max_supported_distance_miles` via `useOrgGeoConfig` (Stream P1 landed). The local `DEFAULT_MAX_SUPPORTED_DISTANCE_MILES = 250` is the SSR fallback only.

---

## Demo Polish UX Sprint — Gate 1 (map + filter UX core)

**State:** PR #74 open. Implements Gate 1A/1B/1C/1D/1E from the autonomous-mode demo polish sprint prompt.

#### Pathfinder/lib/dashboard-filters.ts
**Implements:** Demo Polish UX Sprint Gate 1E + Gate 2 — single source of truth for the dashboard filter pipeline. Gate 1E shipped the fan-out structure (preBranchFiltered → groupCountsByBranch + applyBranchFilter → withBranchFiltered); Gate 2 added the optional `crossPollLeadIds` input so cross-poll mode reads from `pathfinder.lead_cross_pollination` (Path B) instead of the multi-tenant `warm_for_customer_id` lookup, and bypasses the minScore + range filters in cross-poll mode so the demo's signature warm-intro beats (Brasfield & Gorrie, Big-D — production scores 15–62) survive the default `minScore=50` floor.
**Last verified against spec:** 2026-05-02 (Gate 2).
**Drift:** none. Per-branch dock counts intentionally do NOT apply the branch-selection narrowing so users can switch branches without zeroing the others. Source filter still applies in cross-poll mode (operator narrowing within the warm-intro view).
**Tests:** `Pathfinder/tests/dashboard-filters.test.ts` (13 cases — 10 from Gate 1E + 3 from Gate 2) covers each filter axis individually, the branch-narrow path, the legacy `warm_for_customer_id` fallback, the new `crossPollLeadIds` filter, the minScore/range bypass in cross-poll mode, and source-filter persistence in cross-poll mode.

#### Pathfinder/lib/demo-branches.ts
**Implements:** Demo Polish UX Sprint Gate 1C — restricts the dashboard's branch surface to the four Tuesday demo branches (Houston / LA / Nashville / Pittsburgh).
**Last verified against spec:** 2026-05-02 (sprint launch).
**Drift:** none. `DEMO_BRANCH_IDS` matches the live `pathfinder.branches` rows on Supabase project `anfihcusvekpovcchpoh` (`hou-002` from the original 5-row seed; `lax-008` / `nsh-006` / `pit-007` added by an earlier session that already ran a GeoMapper backfill against them — verified 2026-05-02 via `execute_sql`: pit-007=27 leads, hou-002=21, lax-008=7, nsh-006=6). `pickDemoBranches` preserves narrative order regardless of the server-fetch order.
**Tests:** none yet — the helper is a pure two-line filter and is exercised end-to-end via the Dashboard's `pickDemoBranches(initialBranchesRaw)` call. If the helper grows beyond filter+order, add `Pathfinder/tests/demo-branches.test.ts`.

---

## Demo Polish UX Sprint — Gate 2 (cross-pollination warm-intro propagation)

**State:** PR pending. Implements Gate 2 from the autonomous-mode demo polish sprint prompt — bridges `pathfinder.lead_cross_pollination` (12 production rows) into the dashboard's cross-pollination filter + warm-intro overlay so the Tuesday demo's signature warm-intro beats (Brasfield & Gorrie, Big-D Construction) actually surface in the UI.

#### Pathfinder/lib/cross-poll-fetch.ts
**Implements:** Demo Polish UX Sprint Gate 2 — server-side fetch of `pathfinder.lead_cross_pollination` joined with `pathfinder.zedcor_customer_sites` for representative customer lat/lon. Path B in the gate-2 plan: dashboard reads cross-pollination directly instead of denormalizing into `pathfinder.customers` (which would have polluted the 30-row facility-customer table that `scoreProject` also reads from).
**Last verified against spec:** 2026-05-02.
**Drift:** none. `fetchCrossPollMatches` returns one match per `lead_cross_pollination` row decorated with the most-recently-active customer site's lat/lon (active sites preferred over inactive; updated_at as tiebreak). `indexMatchesByLead` collapses multi-match leads to the highest-confidence (exact > fuzzy).
**Tests:** `Pathfinder/tests/cross-poll-fetch.test.ts` covers `indexMatchesByLead`'s confidence-precedence and per-lead independence. The Supabase fetch path is exercised end-to-end by `app/page.tsx` against the live database.

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

#### Pathfinder/lib/zedcor/google-geocoder.ts
**Implements:** Z-F finish Option B — replaces state-centroid as the primary coord-resolution path for SAM.gov records carrying `placeOfPerformance.city.name + state.code`. Hits Google Maps Geocoding API (reuses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional `GOOGLE_GEOCODING_API_KEY` override). In-memory cache per-Lambda invocation. Confidence derived from Google's `location_type`. Falls back to state-centroid silently when the API key is missing, the network errors, or Google returns no result.
**Last verified against spec:** 2026-05-02. Wired into `lib/ingestor.ts` SAM.gov record builder; USAspending stays on state-centroid (only has FIPS city codes, not city names).
**Drift:** **none.**

#### Pathfinder/lib/ingestor.ts
**Implements:** Z-F finish Option B — `USASPENDING_LOOKBACK_DAYS` and `SAMGOV_LOOKBACK_DAYS` widened from 14 to 30 to lift per-target-branch lead volume in Nashville/Pittsburgh/LA. SAM.gov record builder now calls `geocodeLocation` first and falls back to `extractStateFromPayload` only when Google returns no hit.
**Last verified against spec:** 2026-05-02.
**Drift:** **none.** Pre-existing P1 country-filter / RLS / dedupe logic unchanged.

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

---

## Connector Sprint Phase 1 — C-1C Settings UI replacement + routing rules editor

**State:** PR #64 (`connectors/c1c-ui`) — rebased onto `e827601` (C-1B merged) at orchestrator-resolved sha. Replaces the Phase 0 stub with real OAuth-backed tiles + routing rules editor + disconnect flow. Operator-gated.

#### Pathfinder/lib/connectors/auth.ts
**Implements:** SPEC § 5.1 (per-org isolation enforcement). `isOperatorRequest(req)` checks the OPERATOR_EMAILS allowlist; `resolveOrgId(req)` extracts the customer org id from the request context (v1 hardcoded to `'zedcor'` until multi-tenant ships).

#### Pathfinder/lib/connectors/queries.ts
**Implements:** Server-side reader helpers for the Settings page + routing-rules API. `listConnectorsForOrg`, `getConnectorById`, `listRulesForConnector`, recent-activity counters. All filter by org_id at the SQL level.

#### Pathfinder/lib/connectors/events.ts
**Implements:** Static enum of event types the routing-rules editor offers (`high_priority_lead`, `daily_brief`, `cost_alert`, etc.). Populated as more event types ship; the dispatcher reads its filter from this enum.

#### Pathfinder/lib/connectors/rules-validate.ts
**Implements:** Pre-write validation of routing rules. Channel-id whitelist (no SSRF), filter_json shape check (stored as jsonb so no SQL injection), quiet-hours window sanity check.

#### Pathfinder/app/api/connectors/list/route.ts
**Implements:** SPEC § 3.3 — read-only listing of connectors for the Settings page. Returns connector rows + recent-activity counts.

#### Pathfinder/app/api/connectors/[connectorId]/rules/route.ts
**Implements:** SPEC § 3.6 — POST creates a routing rule, GET lists rules for a connector. Operator-gated via `isOperatorRequest`.

#### Pathfinder/app/api/connectors/[connectorId]/rules/[ruleId]/route.ts
**Implements:** PATCH updates a rule, DELETE soft-deletes (`is_active=false`). Operator-gated.

#### Pathfinder/app/api/connectors/[connectorId]/rules/[ruleId]/test/route.ts
**Implements:** Synthetic-event firing path. Calls `dispatchEvent` with a constructed payload to let operators verify routing without waiting for real events.

#### Pathfinder/app/api/connectors/[connectorId]/disconnect/route.ts
**Implements:** SPEC § 5.5 — disconnect / revoke. Calls Slack's `auth.revoke` best-effort, then soft-deletes connector_tokens (revoked_at = now()) and sets connector status='revoked'. Audit log captures provider-call outcome regardless of local soft-delete.

#### Pathfinder/components/settings/connectors/ConnectorsView.tsx (replaces Phase 0 stub)
**Implements:** SPEC § 3.3 — connector tile grid with real connector_rows-driven state. Click handlers route to OAuth start (Connect), routing rules modal (Configure), or disconnect-confirm modal.

#### Pathfinder/components/settings/connectors/RoutingRulesModal.tsx
**Implements:** SPEC § 3.6 — modal with event-type picker, channel input (text for v1; autocomplete from C-1B's channels:read endpoint when available), filter_json textarea, quiet-hours weekday/weekend + time range, "Test rule" button.

#### Pathfinder/components/settings/connectors/DisconnectConfirm.tsx
**Implements:** SPEC § 5.5 — disconnect confirmation modal with explicit copy ("This will revoke Pathfinder's access… Connected reps will stop receiving alerts. You can reconnect anytime.").

#### Pathfinder/app/settings/connectors/page.tsx (modified)
**Drift note:** Phase 0 hardcoded `buildTiles()` replaced with a server-side query of `pathfinder.connectors` rows for the current org. Slack tile now reflects the real connector row's status (when present) rather than just the webhook-env-presence stub from Phase 0.

---

## Connector Sprint Phase 2 — C-2B per-customer Slack/Teams manifest generation

**State:** PR (`connectors/c2b-manifests`) — built straight off main HEAD `1cd250a` per dispatch prompt. Adds operator-gated manifest endpoint + Settings UI affordance. No runtime / token / OAuth changes; orthogonal to C-2A which adds the Teams runtime layer.

#### Pathfinder/lib/connectors/manifests/slack.ts
**Implements:** SPEC § 3.4 (Multi-tenant manifest generation) — Slack arm. Generates a per-org Slack app manifest in YAML (the format Slack accepts at `https://api.slack.com/apps?new_app=1&manifest_yaml=...`). `display_information.name`, `bot_user.display_name`, `oauth_config.redirect_urls`, `event_subscriptions.request_url`, and `slash_commands.url` are customized per org + per Pathfinder origin. Bot scopes are sourced from `lib/connectors/providers.ts` so OAuth start and manifest stay in lockstep. Org-id is whitelisted to `[a-z0-9_-]{1,64}` and base URL must be https (localhost exempted for dev).

#### Pathfinder/lib/connectors/manifests/teams.ts
**Implements:** SPEC § 2.2 Step E + § 3.4 — Teams arm. Generates a `.zip` package containing `manifest.json` (Teams app schema 1.16+), `color.png` (192×192 solid color), and `outline.png` (32×32 solid color). PNG icons are byte-perfect placeholders constructed locally from `node:zlib` deflate; brand assets get swapped in post-pilot. Manifest `id` is a deterministic v4-shaped UUID derived from `orgId` so re-downloads are idempotent. Bot id reads from caller (route handler threads `process.env.TEAMS_BOT_ID`); falls back to `REPLACE_BEFORE_INSTALL` so missing env is a visible defect rather than a silent bad-manifest.

#### Pathfinder/app/api/connectors/[type]/manifest/route.ts
**Implements:** SPEC § 3.4 + § 5.1 (per-org isolation). `GET ?org_id={org}` returns the generated manifest as a download. Operator-gated via `lib/connectors/auth.ts:isOperatorRequest` — non-operators get 403. `slack` returns `application/x-yaml`; `teams` returns `application/zip` (Buffer wrapped through `Blob` for NextResponse BodyInit compatibility); `hubspot` returns 404 with `manifest_not_supported` since HubSpot uses the standard OAuth marketplace. Origin is computed from `x-forwarded-{host,proto}` so manifest URLs match the public host (`www.unicron.systems/pathfinder`) rather than the underlying Vercel deploy domain. `runtime = 'nodejs'` because JSZip + node:zlib are unavailable on edge.

#### Pathfinder/components/settings/connectors/ConnectorTile.tsx (modified)
**Drift note:** Added optional `tertiaryAction` prop — `{ label, onClick, testId? }` — that renders a full-width secondary CTA below the primary footer. Reused for the C-2B "Generate manifest for IT" affordance without changing the existing two-button (primary / Disconnect) layout for connected tiles.

#### Pathfinder/components/settings/connectors/ConnectorsView.tsx (modified)
**Implements:** SPEC § 3.4 customer-facing affordance. Renders the "Generate manifest for IT" button on disconnected/error/expired Slack + Teams tiles only (HubSpot uses the public OAuth marketplace; no manifest needed; no button rendered). Click triggers a `fetch(... )` to `/api/connectors/{type}/manifest?org_id={org}` with the `x-operator-email` header from `localStorage`, then streams the response through `URL.createObjectURL` for a browser download. Failure surfaces a `window.alert` with the response status; full error UI deferred until customer-facing operators ship.

#### Pathfinder/package.json (modified)
**Drift note:** Added `jszip` (3.10.x) for Teams `.zip` packaging and `js-yaml` (4.1.x, +`@types/js-yaml`) for Slack manifest YAML serialization. Both are small, widely-used libs (combined transitive footprint ~50KB minified) — Vercel function bundle stays well under the 50MB Lambda limit per dispatch halt criteria.

---

## Connector Sprint Phase 4 — C-4A Customer onboarding wizard

**State:** PR pending (`connectors/c4a-onboarding`). UI-only. New `/onboarding/connectors` route + onboarding components + quick-pick rule catalog. No backend mutations — the wizard delegates connect/skip outcomes to the existing `/api/connectors/{type}/auth` endpoints (C-1B for slack; C-2A/C-3A for teams/hubspot when they ship). Routing rule writes deferred to Settings → Connectors (C-1C's `RoutingRulesModal`).

#### Pathfinder/lib/connectors/onboarding-rules.ts
**Implements:** SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3 — quick-pick step. Static catalog of 2-3 default rules per chat connector (`slack`, `teams`); HubSpot returns `[]` because its push is automatic per § 4.3 / C-3B.
**Last verified against spec:** 2026-05-02.
**Drift:** **none.** `getQuickPickRules('slack')` returns the verified-leads / daily-brief / cost-alerts trio called out in the dispatch prompt. Teams mirrors with team-id placeholders (`19:...@thread.tacv2`) instead of `#channel`.
**Tests:** `Pathfinder/tests/onboarding-connectors/quick-pick-rules.test.ts` — 6 tests covering Slack defaults, Teams parity, HubSpot empty, id uniqueness, event-type shape.

#### Pathfinder/components/onboarding/StepIndicator.tsx
**Implements:** SPEC § 7.3 — six-step progress pill row. Active = filled ink pill; complete = green; pending = hairline outline. Clickable for already-visited steps.

#### Pathfinder/components/onboarding/WelcomeStep.tsx
**Implements:** SPEC § 7.3 step 1 — value prop, "what gets connected" cards, ~3-min time estimate.

#### Pathfinder/components/onboarding/ConnectStep.tsx
**Implements:** SPEC § 7.3 steps 2-4 — reusable per-connector step. Connect button is a real `<a href={authStartHref}>` so the OAuth start round-trip preserves the org_id query param. Renders a "Coming soon" graceful-degrade block when the OAuth route hasn't shipped yet (Teams pre-C-2A, HubSpot pre-C-3A); the wizard's server component decides via env-var presence (`TEAMS_APP_ID`, `HUBSPOT_CLIENT_ID`).

#### Pathfinder/components/onboarding/QuickPickRulesStep.tsx
**Implements:** SPEC § 7.3 step 5 — checkbox list of default rules per connected chat connector. Inline channel field (text input, free-form for v1) — same approach as `RoutingRulesModal` per the C-1C drift note (autocomplete is best-effort and not on the wizard's critical path). Empty state when no chat connectors are connected.

#### Pathfinder/components/onboarding/Done.tsx
**Implements:** SPEC § 7.3 step 6 — confirmation summary. Shows connected/skipped/coming-soon counts, the per-connector status, the routing rules the user enabled, and a primary CTA back to `/pathfinder/settings/connectors`.

#### Pathfinder/components/onboarding/Wizard.tsx
**Implements:** SPEC § 7.3 step orchestration. Client component owning step state (`useState`), URL fragment sync (`#step-N`, 1-indexed), skip-state localStorage persistence (`pathfinder.onboarding.skipped` — JSON array of connector ids; no PII). Listens for `hashchange` so back/forward browser nav drives the wizard.

#### Pathfinder/app/onboarding/connectors/page.tsx
**Implements:** SPEC § 7.3 server component shell. Reads `pathfinder.connectors` for the current org via `lib/connectors/queries.listConnectors`; tokens never cross the server→client boundary (only `state` + display copy). `comingSoon` flags resolve at runtime from env-var presence, so a Teams/HubSpot OAuth route merging upstream automatically lights up the live Connect button without a wizard code change.

#### Pathfinder/tests/onboarding-connectors/wizard-state.test.tsx
**Implements:** SPEC § 7.3 acceptance — 13 tests. Step navigation (welcome → ... → done), Connect-href shape, Coming-soon graceful-degrade, skip-state localStorage round-trip + rehydrate, malformed-localStorage tolerance, URL-fragment sync, hashchange handling, quick-pick visibility per connector state, done-summary CTA target.

---

## Connector Sprint Phase 3 — C-3A HubSpot OAuth + bulk sync foundation

**State:** branch `connectors/c3a-hubspot-oauth`, based at `1cd250a` (Phase 1 complete). Mirrors the C-1A Slack OAuth pattern for HubSpot. C-3A scope: OAuth + bulk read sync only. Real-time webhooks ship in C-3B; stage→pipeline mapping ships in C-3C.

### Migration

#### Pathfinder/supabase/migrations/0108_hubspot_sync_state.sql
**Implements:** SPEC - Connectors §4.3 — HubSpot bidirectional sync (read-only side).
**Tables:** `pathfinder.hubspot_deals_raw`, `hubspot_contacts_raw`, `hubspot_engagements_raw` (composite PK on `(connector_id, hs_object_id)`); `hubspot_sync_state` (one row per HubSpot connector). All RLS-enabled with read-by-org-match and service-role-only writes. Additive — no existing tables touched. Applied via Supabase MCP 2026-05-01.

### OAuth + token exchange

#### Pathfinder/lib/connectors/hubspot/oauth.ts
**Implements:** SPEC §5.3 (OAuth state) + §5.4 (scope minimization) for HubSpot. Exports `buildAuthorizeUrl(state)`, `exchangeCode(code)`, `refreshToken(refresh)`, `callbackUrl()`. Uses `getProvider('hubspot')` from `lib/connectors/providers.ts` so scopes stay single-sourced. Best-effort introspection of hub_id + hub_domain via `/oauth/v1/access-tokens/{token}`. Tokens are NEVER logged — error messages only carry HTTP status + truncated body. Refresh path uses `grant_type=refresh_token`.

#### Pathfinder/lib/connectors/providers.ts (modified)
**Drift:** flipped `hubspot.exchangeImplemented` from `false` to `true`. Scopes unchanged (already minimized to deal/contact read+write + schemas.deals.read).

#### Pathfinder/app/api/connectors/[type]/callback/route.ts (modified)
**Drift:** previously Slack-only happy path; the HubSpot branch returned 501. Refactored the exchange step into a per-provider switch with a unified `ProviderExchangeResult` so storeToken + connector-update logic stays provider-agnostic. HubSpot branch maps `hub_id` → `account_external_id` and `hub_domain` → `account_name`. Computes absolute `expires_at` from `expires_in` seconds.

### Bulk sync

#### Pathfinder/lib/connectors/hubspot/bulk-sync.ts
**Implements:** SPEC §4.3 read-only ingest. `previewSync(connectorId)` calls `/crm/v3/objects/{deals,contacts,engagements}/search` with `limit=1` to read `total` (no writes). `runBulkSync(connectorId, opts)` paginates via `paging.next.after`, batch-upserts into `hubspot_*_raw` with ON CONFLICT `(connector_id, hs_object_id) DO UPDATE`, updates `hubspot_sync_state` after each phase, audits per batch via `recordAudit({direction: 'inbound', event_type: 'sync.bulk_batch'})`. Soft rate-limit via 100ms minimum interval; single-retry on 429 honoring `Retry-After`. Engagements gated on `opts.includeEngagements`.

#### Pathfinder/app/api/connectors/instances/[connectorId]/hubspot/sync/route.ts
**Implements:** Operator-gated endpoint. POST kicks off `runBulkSync` synchronously (`maxDuration=300`); GET returns the `hubspot_sync_state` row. Cross-checks `connector.customer_org_id === resolveOrgId(req)` before any work. Rejects when connector is not HubSpot or status != 'connected'.

---

## Stream C-2A — Microsoft Teams OAuth + Bot Framework + Adaptive Cards

**State:** PR open on branch `connectors/c2a-teams` (2026-05-02). Operator-side env vars not yet set; see `MEMORY/operator-todos/2026-05-02-c2a-teams-operator-setup.md`.

### Library files

#### Pathfinder/lib/connectors/teams/oauth.ts
**Implements:** SPEC § 2.2 Step F (env var contract) + § 4.2 (Teams OAuth). `exchangeCode` swaps the Microsoft auth code for access + refresh tokens via `/{tenant}/oauth2/v2.0/token`. `refreshToken` reuses the same endpoint with `grant_type=refresh_token`. `acquireBotAppToken` uses `client_credentials` against `botframework.com` for proactive bot posts.
**Last verified against spec:** 2026-05-02.
**Drift:** **none.** Env var names match SPEC § 2.2 Step F verbatim (`TEAMS_APP_ID`, `TEAMS_TENANT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_BOT_ID`, `TEAMS_BOT_PASSWORD`).

#### Pathfinder/lib/connectors/teams/adaptive-cards.ts
**Implements:** SPEC § 4.2 Adaptive Card 1.5 outbound formatter. `formatLead`, `formatRejection`, `formatFeedbackPrompt`, `formatHelp`, `formatPlainText` mirror the Slack Block Kit functions in `lib/connectors/slack/formatters.ts`. `toAttachment` wraps for Bot Framework + asserts <28KB size limit.
**Last verified against spec:** 2026-05-02.
**Drift:** **minor, justified.** Lead card has 5 actions vs Slack's 3 (View / Outreach / Dismiss + thumb-up + thumb-down) because Teams reactions aren't first-class so feedback is captured via card actions per SPEC § 8 open-question 1.

#### Pathfinder/lib/connectors/teams/commands.ts
**Implements:** SPEC § 4.2 inbound `@-mention` parser. Mirrors `lib/connectors/slack/commands.ts` byte-for-byte on the verb logic; only difference is `stripMention` handles `<at>...</at>` Bot Framework markup + flat `@BotName` mobile fallback.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/connectors/teams/signature.ts
**Implements:** SPEC § 5.1 + § 5.3 — Bot Framework JWT verification on the messaging endpoint. Fetches Microsoft's JWKS from `https://login.botframework.com/v1/.well-known/openidconfiguration`, RS256-verifies, validates iss=`https://api.botframework.com`, aud=`TEAMS_BOT_ID`, exp/nbf with ±5 min skew. Test bypass `TEAMS_DISABLE_JWT_VERIFY=1` is hard-disabled when `NODE_ENV=production`.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/connectors/teams/sender.ts
**Implements:** SPEC § 3.6 outbound dispatcher's Teams branch. `postActivity` POSTs to `{serviceUrl}/v3/conversations/{id}/activities` with a Bot Framework app token. Includes a test-override seam (`__setSenderOverrideForTests`) so unit tests can stub transport without monkey-patching fetch globally.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/connectors/teams/conversations.ts
**Implements:** SPEC § 4.2 "Bot must be added to a team or channel before it can post there" — captures Bot Framework conversation references on `conversationUpdate` events. Storage on `connectors.metadata.teams.conversations` (FIFO-capped at 200 entries). Migration 0109 (`teams_conversations` table) reserved but not used in C-2A.
**Last verified against spec:** 2026-05-02.
**Drift:** **minor, deliberate.** Stored on jsonb metadata instead of a dedicated table; spec doesn't prescribe one. If a customer outgrows 200 conversations we'll move to a table.

#### Pathfinder/lib/connectors/teams/chat-bridge.ts
**Implements:** SPEC § 4.2 "DMs work identically" — adapter from inbound chat text → reply string. Mirrors `lib/connectors/slack/chat-bridge.ts`. Same C-1G placeholder reply pending the Sonar streaming bridge.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/connectors/feedback.ts (modified)
**Implements:** added `recordTeamsCardFeedback` writing to `pathfinder.lead_feedback` with `source='teams_card'` (the value already permitted by migration 0107's check constraint). Idempotent on Postgres 23505 dup-key.

#### Pathfinder/lib/connectors/dispatcher.ts (modified)
**Implements:** SPEC § 3.6 — replaced the `case 'teams'` `NotImplementedError` with a real send path using `sender.postActivityWithOverride` + `buildTeamsCard`. New `buildTeamsCard(eventType, payload)` helper renders lead-, rejection-, and plaintext-shaped events to Adaptive Cards.

#### Pathfinder/lib/connectors/providers.ts (modified)
**Implements:** flipped `teams.exchangeImplemented = true`; `buildAuthorizeUrl` now substitutes `TEAMS_TENANT_ID` (or `common`) into the Microsoft authority path so single-tenant deployments lock signins to a specific tenant.

### Routes

#### Pathfinder/app/api/connectors/[type]/callback/route.ts (modified)
**Implements:** added `teams` branch to the per-provider exchange switch. Normalizes the Teams exchange result into the same `SlackExchangeResult` shape so downstream `storeToken` + `markConnectorConnected` calls remain provider-agnostic.

#### Pathfinder/app/api/connectors/teams/webhook/route.ts (new)
**Implements:** SPEC § 4.2 inbound webhook. JWT-verified. Handles four Activity types:
- `conversationUpdate` (membersAdded with bot) → upsert conversation reference
- `message` with `conversationType=personal` → DM handler (chat-bridge)
- `message` channel/group → @-mention handler (parses command, replies with cards)
- `invoke` / `messageBack` → Adaptive Card Action.Submit handler (writes `lead_feedback` for thumb actions, dismisses, queues outreach)

### Tests (C-3A HubSpot)

| File | Tests | Covers |
|---|---|---|
| `tests/connectors/hubspot-oauth.test.ts` | 13 | buildAuthorizeUrl host/scope/redirect/state; exchangeCode body shape, error mapping, expires_in; refreshToken grant_type; introspection failure tolerance |
| `tests/connectors/hubspot-bulk-sync.test.ts` | 10 | previewSync read-only behavior; pagination via `after`; ON CONFLICT upsert correctness on re-run; sync_state running flags + final counts; maxObjects truncation; 429 retry; error path writes last_error |

23 new tests; full suite remains 782/782 green; lint clean; build clean.

### Tests (C-2A Teams)

| File | Tests | Covers |
|------|-------|--------|
| tests/connectors/teams-commands.test.ts | 18 | parser verbs, mention stripping, thumb synonyms |
| tests/connectors/teams-adaptive-cards.test.ts | 10 | card shape, action ids, truncation, attachment wrap, 28KB guard |
| tests/connectors/teams-oauth.test.ts | 11 | exchangeCode happy + error, refresh, bot app token, id_token tid extraction |
| tests/connectors/teams-signature.test.ts | 11 | RS256 happy path, every JWT failure mode, prod escape-hatch hard-off |

Total new: 50 tests. All green; full Pathfinder suite remains 809 passing.

---

## Demo Polish UX Sprint — Gate 3 (lead detail enrichment)

**State:** PRs #78 (Gate 3A schema+spec) and #81 (Gate 3B+3C backfill+enrichment) merged to main during the post-demo-queue Wednesday recovery sweep. Verified post-merge against the live `pathfinder.projects` corpus (481 rows).

### Services + scripts

#### Pathfinder/services/enricher/lead-detail.ts
**Implements:** `Company Docs/Specs/SPEC - Lead Detail Enrichment.md` § "Enrichment pass (Gate 3C)" — single Sonar + single Anthropic Sonnet 4.6 call per lead, strict JSON-only schemas, sanitizers reject malformed dates / out-of-range lot sizes / non-6-digit NAICS / unknown owner_type.
**Last verified against spec:** 2026-05-02 (live run on top-50 leads at $0.1506 total).
**Drift:** none.

#### Pathfinder/services/enricher/prompts.ts
**Implements:** `SPEC - Lead Detail Enrichment.md` Sonar + Anthropic system prompts. Anti-hallucination guardrails (null over guess; empty arrays preferred over fabrication).
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/services/enricher/types.ts
**Implements:** `SPEC - Lead Detail Enrichment.md` `EnricherInput` / `SonarEnrichmentResult` / `AnthropicEnrichmentResult` / `EnricherUpdate` / `EnricherRunResult` / `EnricherBatchSummary` shapes.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/scripts/backfill-lead-detail-fields.ts
**Implements:** `SPEC - Lead Detail Enrichment.md` § "Backfill order (Gate 3B)". One-shot, idempotent. Per-source extractors (sam.gov / usaspending / harris / news no-op).
**Last verified against spec:** 2026-05-02 (executed against all 481 projects).
**Drift:** none.

#### Pathfinder/scripts/run-lead-detail-enrichment.ts
**Implements:** Top-50 batch runner for the enrichment service. Honours `ENRICHMENT_LIMIT` / `ENRICHMENT_COST_HALT` / `ENRICHMENT_DRY_RUN` / `ENRICHMENT_PROJECT_IDS` env knobs.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/lead-detail-enricher.test.ts` | 24 | sanitizeSonar (owner_type whitelist, ISO date truncation, lot_size_acres bounds, key_subs cap+drop), sanitizeAnthropic (NAICS 6-digit guard), applySonar/applyAnthropic (null-only fill, empty key_subs distinct from never-tried), needsSonar/needsAnthropic skip gates, JSON parse tolerance (code fences, prose-wrapped, malformed). |

### Gate 3D — UI helpers

#### Pathfinder/lib/posted-date.ts
**Implements:** `Company Docs/Specs/SPEC - Lead Detail Enrichment.md` § "Posted date reformat" — relative top-line + MM-DD-YY subtitle helper consumed by ProjectModal.tsx.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

| File | Tests | Covers |
|---|---|---|
| `tests/posted-date.test.ts` | 8 | Today / 1-day-ago / N-days-ago / future "in N days", MM-DD-YY zero-pad, ISO datetime truncation, null + malformed input. |

---

## Demo Polish UX Sprint — Gate 4A (connection-status probes)

**State:** PR #85 merged to main during the post-demo-queue Wednesday recovery sweep.

#### Pathfinder/lib/probes.ts
**Implements:** `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md` § "Settings — connection status probes." Slack webhook POST-empty-`{}` taxonomy + Resend `GET /domains` taxonomy. Anti-deliver guard: empty payload returns Slack's `no_text` error without delivering a message.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/probe-cache.ts
**Implements:** Shared 5-minute module-scoped TTL cache for the `/api/probes/*` route handlers. Per-Lambda; warm instances hold up to TTL_MS staleness.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/probes.test.ts` | 16 | Slack response taxonomy (no_text / invalid_payload / no_service / channel_not_found / non-Slack-host / network error / env unset), Resend status codes (200 + N domains / 200 + empty list = degraded / 401 / network error / env unset), cache round-trip + expiry + per-key clear. |

---

## Demo Polish UX Sprint — Gate 4B-1 (HubSpot webhooks + outbound)

**State:** PR #86 merged to main during the post-demo-queue Wednesday recovery sweep.

#### Pathfinder/lib/connectors/hubspot/inbound.ts
**Implements:** `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md` § 6 "HubSpot inbound." Strict v3 event-array parser with shape validation. Family grouping (deal/contact/engagement/unknown). PII guard: payload_summary excludes propertyValue.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

#### Pathfinder/lib/connectors/hubspot/outbound.ts
**Implements:** `pushDealStageChange()` outbound helper. Resolves active connector + decrypts token via `getToken()`, PATCHes HubSpot deal, audit-logs every attempt with the token redacted to `first4****last4`. `redact()` exported for re-use.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/hubspot-inbound.test.ts` | 12 | parseHubspotWebhook (valid array, malformed, missing fields, propertyName/Value pass-through), groupHubspotEvents (deal/contact/engagement/unknown routing), summariseEvent (with/without propertyName), redact (null/short/long inputs). |

---

## Demo Polish UX Sprint — Gate 4B-2 (HubSpot mapping UI)

**State:** PR #88 merged to main during the post-demo-queue Wednesday recovery sweep.

#### Pathfinder/lib/connectors/hubspot/mapping.ts
**Implements:** `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md` § 5 "Field + stage mapping config." `HubspotMappingConfig` shape, `DEFAULT_HUBSPOT_MAPPING` defaults mirroring lib/hubspot/deal-mapper.ts, tolerant `parseMapping()` (drops malformed rows + falls back), `validateMappingInput()` (human-readable errors). Per-row conflict policy: last_write_wins / pathfinder_locked / hubspot_locked.
**Last verified against spec:** 2026-05-02.
**Drift:** none.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/hubspot-mapping.test.ts` | 9 | parseMapping (default fallback, round-trip, malformed-row drop, unknown-policy fallback, unknown-stage drop), validateMappingInput (missing arrays, per-row malformations, valid input). |

---

## Demo Polish UX Sprint — Gate 4B-3 (HubSpot nightly reconciliation)

**State:** PR #90 merged to main during the post-demo-queue Wednesday recovery sweep.

#### Pathfinder/lib/connectors/hubspot/recon.ts
**Implements:** Pure `reconcileDeals()` engine with cross-type tolerance (HubSpot stringifies amount). `escalationToInboxRow()` shapes the architect_inbox payload for unresolvable conflicts.

#### Pathfinder/services/connectors/hubspot-recon.ts
**Implements:** I/O wrapper `runHubspotRecon()` — connectors + tokens + mapping → HubSpot deals search → recon engine → escalations to `pathfinder.architect_inbox` with `category='hubspot-sync-conflict'`. Apply mode gated behind `HUBSPOT_RECON_APPLY=1`.

#### Pathfinder/lib/inngest/functions/hubspot-recon-cron.ts
**Implements:** Inngest cron `TZ=UTC 0 3 * * *` wrapping `runHubspotRecon`.

#### Pathfinder/lib/inngest/functions/index.ts
**Implements:** Barrel export for the Inngest serve() handler. Gate 4B-3 adds `hubspotReconCron` alongside existing entries.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/hubspot-recon.test.ts` | 10 | reconcileDeals (matched, all 3 policies — last_write_wins newer-wins + tied-escalates, pathfinder_locked, hubspot_locked), HubSpot-only / Pathfinder-only deals (skipped, outbound territory), null/null match, null/value conflict, numeric/string cross-coerce, escalationToInboxRow shape. |

---

## Demo Polish UX Sprint — Gate 11E (tower estimation enrichment)

**State:** PR #117 pending merge.

#### Pathfinder/services/tower-estimator/agent.ts
**Implements:** Gate 11 dispatch § 11E — single Sonnet 4.6 call per project producing `{ count: number | string, rationale: string }`. System prompt encodes the heuristic stack (1 tower per ~500 ft of perimeter / ~5 acres of open lot; linear-infrastructure 1 per 1500 ft + 1-2 per yard; multi-site 1-2 per site; round up; range when uncertain; value-tier fallback). Pure prompt builder + tolerant JSON parser exported for unit testing. Wraps the instrumented `anthropic()` client so calls land in `pathfinder.llm_calls` as `agent_name=tower_estimator`.
**Last verified against spec:** 2026-05-03.
**Drift:** none — feature was newly specced in the Gate 11 dispatch.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/tower-estimator.test.ts` | 13 | Prompt builder (title/value/NAICS/lot/location/sites/perimeter embedding, summary fallback, null omission), JSON parser happy paths (integer + numeric-string + range + range-with-whitespace + ```json fence + trailing prose + fractional rounding), failure modes (non-JSON, empty rationale, missing/negative count, malformed string). |

---

## Gate 10C — HubSpot Bridge (push endpoint + lead detail section)

**State:** PR #123 — Lead detail HubSpot section + push endpoint + field mapper.

### Files

#### Pathfinder/components/lead/HubspotSection.tsx
**Implements:** SPEC - HubSpot Bridge.md §"Lead detail — HubSpot section".
**Last verified against spec:** 2026-05-03.

#### Pathfinder/app/api/leads/[projectId]/hubspot/push/route.ts
**Implements:** SPEC - HubSpot Bridge.md §"API endpoints" — push endpoint.
**Last verified against spec:** 2026-05-03.

#### Pathfinder/lib/hubspot/field-mapper.ts + stage-map.ts + client.ts
**Implements:** SPEC - HubSpot Bridge.md §"Field mapping" + §"API endpoints".
**Last verified against spec:** 2026-05-03.

#### Pathfinder/supabase/migrations/0116_lead_hubspot_deals.sql
**Implements:** SPEC - HubSpot Bridge.md §"Schema" — lead_hubspot_deals + lead_hubspot_contacts.
**Last verified against spec:** 2026-05-03.

---

## Gate 14A — Microsoft Teams user-level connector (PR #145)

**State:** PR #145 open. Schema + connection routes + Settings tile only — Send-as-user (14B), inbound replies (14C), per-user channel posting (14D), Adaptive Cards for leads (14E) deferred.

Operator setup: `MEMORY/operator-todos/2026-05-03-teams-user-setup.md` — Microsoft Entra app registration + Vercel env vars (`TEAMS_USER_CLIENT_ID`, `TEAMS_USER_CLIENT_SECRET`, `TEAMS_USER_TENANT_AUTHORITY`, `MULTI_TENANT_TEAMS_ENABLED`). Live status: `MEMORY/gate14-teams-live-status.md`.

### Library files

#### Pathfinder/lib/connectors/teams/user-oauth.ts
**Implements:** Gate 14A dispatch §"Auth + data model" — multi-tenant Microsoft Entra v2.0 OAuth for the user-level Teams connector. Distinct from the existing `lib/connectors/teams/oauth.ts` (org-level Bot Framework path). Exports `buildAuthorizeUrl(state)`, `exchangeCode(code)`, `refreshToken(refresh)`, `decodeIdToken(idToken)`, `callbackUrl()`, `TEAMS_USER_SCOPES`. Reads `TEAMS_USER_CLIENT_ID` / `TEAMS_USER_CLIENT_SECRET` / `TEAMS_USER_TENANT_AUTHORITY` (defaults to `https://login.microsoftonline.com/common`). Scopes: `User.Read offline_access ChannelMessage.Send Chat.ReadWrite`. Tokens never logged — error messages carry only HTTP status + Microsoft's `error_description`.
**Last verified against spec:** 2026-05-03.
**Drift:** none — env var names match the dispatch verbatim.

#### Pathfinder/lib/connectors/user-connection.ts (modified)
**Drift:** **additive.** Widens `UserConnectionProvider` to include `'teams'`; adds `tenant_id` field on `UserConnection`. New helpers: `getActiveTeamsConnection`, `getTeamsConnectionTokens`, `upsertTeamsConnection` (soft-revokes prior active row scoped on `(user_id, provider='teams', tenant_id, status='active')` then inserts encrypted), `markTeamsConnectionRevoked`, `revokeTeamsTokenAtProvider` (best-effort `POST /me/revokeSignInSessions`). Multi-tenant invariant preserved: every Teams query filters by `(user_id, provider='teams', status='active')` with optional `tenant_id` scoping. Tokens encrypted via existing pgcrypto helpers (`CONNECTOR_TOKEN_KEY`).
**Last verified against spec:** 2026-05-03.

### Schema

#### Pathfinder/supabase/migrations/0123_user_connections_teams.sql
**Implements:** Gate 14A dispatch §"Auth + data model" — additive + idempotent. Widens `user_connections.provider` CHECK to include `'teams'` (drops any narrower variant via pg_constraint walk). Adds nullable `tenant_id text` column + `(user_id, provider, tenant_id) WHERE tenant_id IS NOT NULL` partial index for multi-tenant routing. NO DROP, no destructive ALTER on data. Re-runnable.
**Last verified against spec:** 2026-05-03.
**Drift:** none.

### API routes

| Route | Spec | Notes |
|---|---|---|
| `app/api/connectors/teams/install/route.ts` | Gate 14A — POST+GET → 302 to Microsoft consent | Mirrors `hubspot/install`. Operator-gated. Issues signed state with `connector_type: 'teams'` + `user_id`. |
| `app/api/connectors/teams/callback/route.ts` | Gate 14A — exchange + encrypted upsert | Static path shadows generic `[type]/callback` for `teams`. Forks on `state.user_id`: present → user-level path; absent → 400 `org_level_unsupported_here` with pointer for when org-level Teams (PR #66/#69) ships. |
| `app/api/connectors/teams/disconnect/route.ts` | Gate 14A — revoke + flip local | Best-effort `https://graph.microsoft.com/v1.0/me/revokeSignInSessions` then mark local `status='revoked'`. Idempotent. |
| `app/api/connectors/teams/status/route.ts` | Gate 14A — per-user tile state | Mirrors `hubspot/status`. Surfaces `expired` when access token's `expires_at` is in the past. |

### UI

#### Pathfinder/components/settings/connectors/TeamsUserTile.tsx
**Implements:** Gate 14A dispatch §"Sub-gates → Gate 14A → New code → TeamsUserTile". Mirrors `HubspotUserTile` byte-for-byte on the state machine (disconnected / connected / expired / error), localStorage-driven operator email resolution, server-state hydration via `/api/connectors/teams/status`. Brand colors `#4B53BC` primary / `#7B83EB` accent / `#c42424` revoke.
**Last verified against spec:** 2026-05-03.

#### Pathfinder/app/settings/connectors/page.tsx (modified)
**Drift:** **additive, gated.** When `process.env.MULTI_TENANT_TEAMS_ENABLED === '1'`, slots `<TeamsUserTile />` via `tileOverrides.teams`. When unset (default), the legacy "Coming in Phase 2" stub modal renders unchanged — so the diff is safe to merge before Microsoft Entra app registration completes.

### Tests

| File | Tests | Covers |
|---|---|---|
| `tests/connectors/teams-user-connection.test.ts` | 9 | Multi-tenant isolation (user A's row never returned for user B), encrypt round-trip via stubbed pgcrypto RPCs, upsert revokes prior active row + inserts fresh row scoped on `(user_id, provider='teams', tenant_id, status='active')`, `markTeamsConnectionRevoked` with/without tenantId, `revokeTeamsTokenAtProvider` returns false on transport error / true on 2xx Microsoft Graph response. |

---

## Demo Polish UX Sprint — Gate 19 (stage filter dropdown)

**State:** PR open. Implements the Gate 19 dispatch (right-rail multi-check stage filter with bid-window divider).

#### Pathfinder/lib/leads/stage-normalize.ts
**Implements:** Demo Polish UX Sprint Gate 19 — canonical 6-stage taxonomy used by the new right-rail stage filter dropdown.
**Last verified against spec:** 2026-05-04 (Gate 19 dispatch).
**Drift:** **intentional fork from `lib/stages.ts`.** The legacy file (5 codes: NWS / PLN / PRE / RFP / AWARDED) is the lead-detail label renderer and treats `solicitation` as a fallthrough. Gate 19 needs a 6-bucket view that (a) folds `solicitation` + `RFP` into a single `rfp_open` slug and (b) splits `pre-budget` (74 rows) from `PRE` (`pre_bid`, 6 rows) so the dropdown checkbox set matches the live data. `BID_WINDOW_DIVIDER_INDEX` marks where the post-award subcontract band starts so the popover renders the divider + italic note in the right place.
**Tests:** `Pathfinder/tests/stage-normalize.test.ts` covers all 7 historical DB values, the case-/whitespace-insensitive normalizer, the null/empty/unknown fallbacks, and the canonical earliest→latest order. `Pathfinder/tests/dashboard-filters.test.ts` adds Gate 19 cases for the filter intersection (default null = pass-through, narrowed selection drops null-stage projects, Houston flagship `solicitation` survives the default `rfp_open` selection, and stage ∩ within-range Houston-only).

---

## Architect Business Summary Panel

**State:** PR #165 open. Implements `Company Docs/Specs/SPEC - Architect Business Summary Panel.md` — three-question framing rendered above the Architect decomposition stream in Metacron Onboarding, edits flow into the architecture JSON persisted on the customer org.

#### Pathfinder/services/architect/types.ts
**Implements:** SPEC §"Phase A — Architect agent". Adds the `BusinessSummary` type (lead type & business area / problem we solve / what they get) and lifts it to a required field on `DecompositionProposal` and `DecompositionArchitecture`.
**Last verified against spec:** 2026-05-04.
**Drift:** none.

#### Pathfinder/services/architect/prompts/decomposition.ts
**Implements:** SPEC §"Phase A — Architect agent → System prompt extension". Extends the decomposition system prompt verbatim from the spec with the four-field business-summary instruction; bumps the prompt version to `2026-05-04-v2` so Architect proposals record which prompt revision generated them (graceful v1 fallback for older proposals).
**Last verified against spec:** 2026-05-04.
**Drift:** none.

#### Pathfinder/services/architect/tools/decomposition.ts
**Implements:** SPEC §"Phase A — Architect agent → Tool schema". `finalizeProposal` tool `input_schema.required` now includes `business_summary` so the model cannot finalize without producing the three-question framing; the panel is guaranteed populated downstream.
**Last verified against spec:** 2026-05-04.
**Drift:** none.
**Tests:** `Pathfinder/__tests__/architect/decomposition-session.test.ts` confirms `business_summary` is emitted on the output JSON and persisted into `architect_proposals.details`. `Pathfinder/__tests__/architect/eval-score.test.ts` updated for the new required field.

---

## Architect output quality fixes — PR #174

**State:** PR #174 open. Fixes cross-vertical noise in `data_sources_rejected` and cleans the customer name title in the decomposition system prompt.

#### Pathfinder/services/architect/prompts/decomposition.ts
**Implements:** SPEC §"Phase A — Architect agent → System prompt extension". Bumped to `2026-05-04-v3`; appended REJECTED SOURCES DISCIPLINE block instructing the model to only include in-vertical rejected sources and omit cross-industry non-candidates entirely.
**Last verified against spec:** 2026-05-09.
**Drift:** additive only — v3 extends v2 prompt without removing any existing instruction.

#### Pathfinder/services/architect/sessions/decomposition.ts
**Implements:** SPEC §"Phase A — Architect agent → Decomposition runtime". Adds `filterRejectedSources(rejected, proposed)` post-processing step — derives relevant industries from proposed sources via `SOURCE_CATALOG`, keeps only rejected entries whose catalog industries overlap, drops catalog-unknown entries (hallucinated or out-of-catalog types). Applied unconditionally after agent finalization so the prompt instruction and runtime filter are defense-in-depth.
**Last verified against spec:** 2026-05-09.
**Drift:** none — pure additive filter, no removal of existing session logic.


---

## Phase 2A — Multi-tenant slug routing & operator auth — PR #238

**State:** PR #238 open. Adds slug routing (`/[slug]`), operator-only Supabase magic-link auth, Metacron deep-link, and Pathfinder client-side org context.

#### Pathfinder/lib/org-context.tsx
**Implements:** SPEC - Phase 2A Multi-tenant Routing & Auth.md §3 (per-org React context for slug-routed pages). Provides `<OrgProvider>` + `useOrg()` so any descendant component reads the current `Organization` row resolved from `[slug]/layout.tsx`. Magic-link callback writes a session cookie; layout reads `pathfinder.organizations` by slug; provider exposes `org` + `loading`.
**Last verified against spec:** 2026-05-10.
**Drift:** none. Provider mirrors the patterns already used in Atrium contexts on the unicron-platform side.


---

## Phase 2C — Per-Org Agent Dispatch (slice 1)

**State:** PR open. Foundation slice: typed architecture, base template, resolver, server-side loader, and per-org Inngest dispatch cron. No agent behavior changes yet — Zedcor's existing kernel keeps running unchanged.

#### Pathfinder/lib/types/architecture.ts
**Implements:** SPEC - Phase 2B Tenant Config Layer.md §"Architecture JSON types". Defines `OrgArchitecture` and supporting interfaces (`LeadUnitConfig`, `PipelineConfig`, `ScoringConfig`, `GeographyConfig`, `SourceRef`, `OutreachConfig`, `BrandingConfig`, `BusinessSummary`).
**Last verified against spec:** 2026-05-10.
**Drift:** none.

#### Pathfinder/lib/config/baseTemplate.ts
**Implements:** SPEC - Phase 2B Tenant Config Layer.md §"BASE_ARCHITECTURE". Safe-default Pathfinder shape; orgs with `architecture: {}` resolve to this template.
**Last verified against spec:** 2026-05-10.
**Drift:** none.

#### Pathfinder/lib/config/resolveArchitecture.ts
**Implements:** SPEC - Phase 2B Tenant Config Layer.md §"Merge resolver". Shallow-per-key merge with deep-clone of base to prevent mutation; arrays (sources, compliance, integrations) replaced wholesale; nested objects (lead_unit.schema, pipeline.stage_labels, scoring.weights/thresholds, vocabulary, branding) merged field-by-field.
**Last verified against spec:** 2026-05-10.
**Drift:** none.
**Tests:** `Pathfinder/__tests__/config/resolveArchitecture.test.ts` — 14 cases covering null/undefined/empty input, partial merges per top-level key, no-mutation invariant.

#### Pathfinder/lib/agents/loadOrgArchitecture.ts
**Implements:** SPEC - Phase 2C Dynamic Agent Dispatch.md §"Per-org dispatch" (server-side architecture loader). Reads `pathfinder.organizations.{id,name,slug,architecture}` via `supabaseAdmin()`, returns the resolved `OrgArchitecture`. Throws on missing org or supabase error. Test seam `__setSupabaseClientForTests` mirrors `lib/supabase.ts` pattern.
**Last verified against spec:** 2026-05-10.
**Drift:** none.
**Tests:** `Pathfinder/__tests__/agents/loadOrgArchitecture.test.ts` — 4 cases covering merged-architecture happy path, empty-architecture base fallback, OrgNotFoundError, supabase error surfacing.

#### Pathfinder/lib/inngest/events.ts
**Implements:** SPEC - Phase 2C Dynamic Agent Dispatch.md §"Per-org dispatch" (event contract). Adds `pathfinder/org.ingest_requested` event carrying `{organization_id, slug, trigger, requested_at}`. Slice 1 emits; subscribers wire in slice 2.
**Last verified against spec:** 2026-05-10.
**Drift:** none — contract-only addition; existing event entries untouched.

#### Pathfinder/lib/inngest/functions/ingest-all-orgs-cron.ts
**Implements:** SPEC - Phase 2C Dynamic Agent Dispatch.md §"Per-org dispatch" (Inngest cron). Lists orgs from `pathfinder.organizations` and emits one `pathfinder/org.ingest_requested` event per org. Runs every 4 hours UTC. Slice 1 has no consumers — events are no-ops in production until slice 2 lands the ranker dispatcher.
**Last verified against spec:** 2026-05-10.
**Drift:** **minor, justified.** Spec sketches `WHERE status='active'` filter; the `status` column doesn't exist on `pathfinder.organizations` yet (Phase 2E adds the state machine). Slice 1 lists all orgs; downstream `loadOrgArchitecture` fails closed if an org is somehow malformed. Switch to `status='active'` ships with Phase 2E.

#### Pathfinder/lib/inngest/functions/index.ts
**Implements:** SPEC - Backend Architecture.md §4 (Inngest function registry). Appends `ingestAllOrgsCron` to the barrel export.
**Last verified against spec:** 2026-05-10.
**Drift:** none — pure append.

#### Pathfinder/lib/agents/ranker/genericScorer.ts
**Implements:** SPEC - Phase 2C Dynamic Agent Dispatch.md §"Ranker". Computes 0–100 composite from `architecture.scoring.weights` via 5 feature extractors (`geography_match`, `asset_class_match`, `trigger_strength`, plus `basis_fit`/`unit_count_fit` stubs). Defensively skips unknown weight keys since `resolveArchitecture` replaces `scoring.weights` wholesale (codex review finding). Used by the org-aware dispatcher in `app/api/cron/ranker/route.ts` for non-Zedcor projects.
**Last verified against spec:** 2026-05-11.
**Drift:** **minor, justified.** Plan §"Generic scoring approach" lists 5 feature extractors; slice 2 ships 3 real (`geography_match`, `asset_class_match`, `trigger_strength`) + 2 stubs at 0 (`basis_fit`, `unit_count_fit`) because Realberry has 0 projects to validate per-vertical extractors against. Real implementations land in a follow-up when production data is available.

#### Pathfinder/app/api/cron/ranker/route.ts (slice 2 dispatch)
**Implements:** SPEC - Phase 2C Dynamic Agent Dispatch.md §"Ranker" — org-aware dispatch added at cycle start (Zedcor slug lookup) + per-project loop top (route by project.organization_id). Zedcor projects continue through the existing kernel verbatim; non-Zedcor route to `scoreGenericProject`. Generic path writes a deterministic rationale documenting per-feature components.
**Last verified against spec:** 2026-05-11.
**Drift:** Sonnet-driven org-flavored rationale + outreach_hook (per `architecture.outreach` / `architecture.branding`) deferred to a follow-up slice. Slice 2's deterministic rationale is acceptable because production has 0 non-Zedcor projects today (Realberry persisted but no ingestion yet).

#### Pathfinder/lib/inngest/functions/org-created.ts
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Flow" — handles `pathfinder/org.created` (emitted by POST /api/organizations after Architect Approve & Deploy) and flips `pathfinder.organizations.status` from `setting_up` to `first_run`. Idempotency guard skips the flip if status has already advanced.
**Last verified against spec:** 2026-05-11.
**Drift:** **scope deviation, documented.** The SPEC §"On-demand first run (Inngest)" envisioned this handler also iterating `architecture.sources` and invoking per-source adapter functions. That depends on Phase 2C slice 6 (source adapter registry) which hasn't shipped. Until then, the cron-based ranker/ingest pipeline (org-aware since Phase 2C slice 2) picks up the new org on its next cycle.

#### Pathfinder/lib/inngest/functions/check-ready-to-view-cron.ts
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Threshold check". Periodic cron (every 5 min UTC) walks orgs in `first_run`/`ranking` state, counts verified leads, and transitions to `ready_to_view` (≥3 verified) or `awaiting_threshold` (<3 verified). Emits `pathfinder/org.ranking_complete` per transition for observability sinks.
**Last verified against spec:** 2026-05-11.
**Drift:** **minor, justified.** SPEC sketches `checkReadyToViewFunction` as event-triggered by `org.ranking-complete`. Slice 2 uses cron-driven polling instead because the ranker is a Vercel cron that doesn't emit per-org completion hooks; cron-driven polling keeps the state machine ticking without an additional event hook. Status semantics + threshold values match the spec exactly.

#### Pathfinder/lib/inngest/events.ts (slice 2 additions)
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Flow" event contracts — adds `pathfinder/org.created` (POST → orgCreated handler) and `pathfinder/org.ranking_complete` (threshold cron → observability sinks).
**Last verified against spec:** 2026-05-11.
**Drift:** none — append-only additions.

#### Pathfinder/app/api/organizations/route.ts (slice 2 emit)
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Flow" first step — POST /api/organizations now emits `pathfinder/org.created` after successful insert. Best-effort: a transient Inngest failure does not roll back the persisted row; the threshold cron reconciles state within 5 min.
**Last verified against spec:** 2026-05-11.
**Drift:** none.

#### Pathfinder/lib/agents/operator-viewed.ts
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Flow" final step — `status=operator_viewed (set on first /[slug]/ render)`. Pure helper that flips `pathfinder.organizations.status` from `ready_to_view` to `operator_viewed`. Conditional UPDATE includes the previous-status guard in the WHERE clause so a concurrent threshold-cron transition doesn't race. Best-effort: returns reason rather than throwing.
**Last verified against spec:** 2026-05-11.
**Drift:** none — matches SPEC §"Flow" exactly.

#### Pathfinder/app/[slug]/page.tsx (slice 4 hook)
**Implements:** SPEC - Phase 2E Onboarding Completion Loop.md §"Flow" — adds `flipToOperatorViewed` call after org fetch, before render. Side-effect only; rendering unaffected by transition success/failure (the threshold cron + future renders reconcile any missed flip).
**Last verified against spec:** 2026-05-11.
**Drift:** none.


---

## Pathfinder Build-Out Pass — Slice 1: Architect emits ui_plan

**State:** PR open. Opens the schema gate so Architect's `finalizeProposal` output carries a `ui_plan` object alongside `business_summary` and the decomposition. Renderer wiring, headless verification, iterate-to-green loop, and `build_out_complete` status flips ship in later slices.

#### Pathfinder/lib/types/architecture.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Architecture JSON extension". Adds the `UIPlan` interface verbatim (lead_card_layout, kpis, charts, filters, dashboard_emphasis) and an optional `ui_plan?: UIPlan` field on `OrgArchitecture`. Optional so orgs persisted before the v4 Architect prompt resolve cleanly through the base default.
**Last verified against spec:** 2026-05-13.
**Drift:** none.

#### Pathfinder/lib/config/baseTemplate.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Architecture JSON extension". `BASE_ARCHITECTURE.ui_plan` carries a safe default — empty `primary_fields`/`secondary_fields`, `score_position: 'top-right'`, empty kpis/charts/filters arrays, `dashboard_emphasis: 'volume'` — so the schema-driven renderer in Slice 2 never receives an undefined plan.
**Last verified against spec:** 2026-05-13.
**Drift:** none.

#### Pathfinder/lib/config/resolveArchitecture.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Architecture JSON extension". `resolveArchitecture` shallow-merges per-org `ui_plan` overrides on top of the base default (lead_card_layout merged field-by-field; kpis/charts/filters replaced wholesale when the partial provides them — same semantics as sources/compliance).
**Last verified against spec:** 2026-05-13.
**Drift:** none.

#### Pathfinder/services/architect/prompts/decomposition.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Architect prompt extension". Appended a `UI PLAN GENERATION` block after the rejected-sources discipline; instructs the Architect to emit a `ui_plan` object describing lead_card_layout, KPIs, charts, filters, and `dashboard_emphasis` (volume / quality / velocity / coverage) tuned to the customer's stated priority. Bumped `DECOMPOSITION_PROMPT_VERSION` to `2026-05-13-v4` so proposals record which prompt revision generated them; v3 fallback for older proposals.
**Last verified against spec:** 2026-05-13.
**Drift:** additive only — v4 extends v3 without removing any existing instruction.
**Tests:** `Pathfinder/__tests__/architect/decomposition-prompt-shape.test.ts` asserts the prompt contains `ui_plan` + `dashboard_emphasis` + at least one of the four emphasis values, and that the version is pinned to `2026-05-13-v4`. `Pathfinder/__tests__/config/resolveArchitecture.test.ts` extends the resolver suite with a `ui_plan (Build-Out Pass Slice 1)` describe — covers the base default and the shallow-merge behaviour.

## Pathfinder Build-Out Pass — Slice 2: Pathfinder renderer reads ui_plan

**State:** PR open. Wires `/[slug]` to honor `org.architecture.ui_plan` so DoD smoke step 8 (`scripts/dod-smoke.ts`) can flip BLOCKED → PASS. Headless verification agent (Slice 3), iterate-to-green loop (Slice 4), and `build_out_complete` status flip (Slice 5) remain out of scope here.

#### Pathfinder/lib/metrics/kpiQueries.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Pathfinder renderer changes" — KPI value resolution. Slice 2 ships the registry stub only: `kpiQueryByMetricId: Record<string, KpiQueryFn>` initially empty so every metric_id resolves to `null` (em-dash placeholder in the KPI card). Real query functions (`leads_weekly`, `conversion_rate`, etc.) land in Slice 3+ alongside the headless verification agent.
**Last verified against spec:** 2026-05-13.
**Drift:** none — stub layer matches the spec's "current value (from real query)" deferred to a later slice.
**Tests:** exercised indirectly via `Pathfinder/__tests__/components/KPIStrip.test.tsx` which asserts the em-dash fallback for unmapped metric_ids.

---

## Pathfinder Build-Out Pass — Slices 3+5: verification + status flip

**State:** PR open on `buildout-slice3-verification`. Adds the verification side of the Build-Out Pass: a new `pathfinder/org.ready_to_view` event fired by `check-ready-to-view-cron` and a new `verifyBuildOut` Inngest function that HTTP-fetches `${PATHFINDER_BASE_URL}/pathfinder/${slug}`, parses the returned HTML via regex, and flips `pathfinder.organizations.status` to either `build_out_complete` (pass) or `build_out_failed` with a `build_out_diagnostic` jsonb (fail). Single-attempt only; the iterate-to-green retry loop and real Playwright headless screenshotting are deferred to follow-up cards.

#### Pathfinder/supabase/migrations/20260513_phase2e_buildout_status.sql
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §3 + §5. Extends `pathfinder.organizations.status` CHECK constraint to add `build_out_complete` + `build_out_failed`; adds `build_out_diagnostic jsonb null` column. Pure additive; existing rows unaffected.
**Last verified against spec:** 2026-05-13.
**Drift:** none. Applied via Supabase MCP `apply_migration` on project `anfihcusvekpovcchpoh` (unicron-systems).

#### Pathfinder/lib/inngest/events.ts
**Implements:** Build-Out Pass §3 event surface. Adds `pathfinder/org.ready_to_view` event type (organization_id, slug, verified_count, transitioned_at). Existing `pathfinder/org.ranking_complete` retained for observability sinks.
**Last verified against spec:** 2026-05-13.
**Drift:** none.

#### Pathfinder/lib/inngest/functions/check-ready-to-view-cron.ts
**Implements:** Phase 2E threshold check + Build-Out Pass §3 hand-off. On a `ready_to_view` transition, additionally sends `pathfinder/org.ready_to_view` so `verifyBuildOut` can pick it up. `awaiting_threshold` transitions are unchanged.
**Last verified against spec:** 2026-05-13.
**Drift:** none (additive).

#### Pathfinder/lib/inngest/functions/verify-build-out.ts
**Implements:** Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §"Build-out verification" + §5. Subscribes to `pathfinder/org.ready_to_view`, HTTP-fetches the customer's `/pathfinder/${slug}` route, parses the HTML via regex against `data-kpi-strip`, `data-lead-card` (>=3 OR `data-empty-state`), `data-chart`, and `data-error`. On pass: status → `build_out_complete`, `build_out_diagnostic = null`. On fail: status → `build_out_failed`, `build_out_diagnostic = { reason, html_snippet?, http_status? }`. **Drift:** **major, justified.** No Playwright; regex over HTML is the demo-day form factor and the iterate-to-green loop is deferred (TODO comment at top of file).
**Last verified against spec:** 2026-05-13.
**Tests:** `Pathfinder/__tests__/inngest/verifyBuildOut.test.ts` — six cases covering pass, empty-state pass, too_few_lead_cards fail, http_401 fail, http_5xx fail, and missing-org throw (Inngest retry surface).

#### Pathfinder/app/api/inngest/route.ts
**Implements:** Inngest serve registration of `verifyBuildOut`. Additive only — existing function list intact.
**Last verified against spec:** 2026-05-13.
**Drift:** none.

---

## v8 Landing Page (unicron.systems root)

**State:** PR #439 open on `feat/landing-v8-redesign`. Replaces the "Under Construction" splash with the Claude Design v8 hero (left-side frosted glass pane + canvas organism + 5-field demo modal). The signup pipeline shifts from `{name, email}` to `{companyName, role, firstName, lastName, email}`, capturing all five fields in both Supabase (`public.email_signups`, dedupe by email) and Notion (new "Landing Page Sign Ups" DB `08e5bc8cd90c487cbca0d450f3a32773`, replacing the old "Inbound Email Signups - v1" DB `4695026f01aa435da3a225325d620369` via the `NOTION_DATABASE_ID` env var on the unicron-systems Vercel project).

#### supabase/migrations/20260517120000_email_signups_capture_fields.sql
**Implements:** v8 landing five-field capture. Adds `first_name`, `last_name`, `role`, `company` (all `text`, nullable) to `public.email_signups`; drops the NOT NULL constraint on the legacy `name` column. Preserves the email UNIQUE constraint as the dedupe gate. Existing 18 rows unaffected.
**Last verified against spec:** 2026-05-17. Applied via Supabase MCP `apply_migration` on project `anfihcusvekpovcchpoh` and confirmed via `information_schema.columns`: `name` is now nullable; four new nullable text columns present.
**Drift:** none.

#### lib/db.types.ts
**Implements:** Generated Supabase type-table contract for the `email_signups` row/insert/update shapes. Updated to match the post-migration schema — `name` is now `string | null`, and `first_name`, `last_name`, `role`, `company` are added as `string | null` on Row/Insert/Update. All other tables in the file are unchanged.
**Last verified against spec:** 2026-05-17.
**Drift:** none (mirror of live schema).

#### app/api/signup/route.ts
**Implements:** v8 landing capture endpoint. Accepts `{companyName, role, firstName, lastName, email}` (all required, email regex-validated), inserts to Supabase `email_signups` with the four new columns (and legacy `name` left NULL), then best-effort mirrors to Notion with property names matching the new DB schema (`Company Name` title, `Role` rich_text, `First Name` rich_text, `Last Name` rich_text, `Email Address` email). On unique-email collision returns 409; on validation failure returns 400; on Supabase failure returns 500 with a generic message (internals not leaked). Notion mirror failures are logged but do not fail the request — Supabase is the durable record.
**Last verified against spec:** 2026-05-17. Local smoke via `next start` + curl: empty body → 400, bad email → 400, invalid JSON → 400, valid payload with fake Supabase env → 500 generic.
**Drift:** none.

---

## Funder Onboarding — PR #448 (Pathfinder organization #3)

**State:** PR #448 open on `funder-onboarding`, head `1cb9435`. Autonomous build covering Stages 1-10 of `Pathfinder/Pathfinder-Funder-Build-Spec.md`. Pre-merge regression PASS on local build/typecheck/test 2026-05-21; do-not-touch Zedcor paths (`lib/scoring.ts`, `lib/zedcor/**`, `app/zedcor/**`) untouched. Spec doc: `Pathfinder/Pathfinder-Funder-Build-Spec.md`. Plan: `Pathfinder/docs/PLAN-funder-onboarding.md`. Report: `Pathfinder/docs/REPORT-funder-onboarding.md`.

### Stage 3 — Source adapters (new id-keyed registry)

#### Pathfinder/lib/adapters/sources/types.ts
**Implements:** Build-Spec §4 Stage 3 — `SourceAdapter` contract (id, fetch, normalize, emit) for the new id-keyed registry consumed by the per-org ingest subscriber. Parallel to the kind-keyed `lib/adapters/types.ts` (Socrata/REST/RSS/etc.) which continues to serve Source Onboarder's code-gen flow; both registries coexist additively.
**Last verified against spec:** 2026-05-21.
**Drift:** **minor, additive.** Second registry instead of folding into the kind-keyed one — documented in file header. Justified because Funder adapters are hand-written per-source modules (heterogeneous endpoints, source-specific normalize logic).

#### Pathfinder/lib/adapters/sources/index.ts
**Implements:** Build-Spec §4 Stage 3 — id-keyed `SOURCE_ADAPTERS` registry. Dispatch surface consumed by `lib/inngest/functions/ingest-org-requested.ts`. Coexists with the kind-keyed `ADAPTERS` registry in `lib/adapters/index.ts`.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/propublica-nonprofit-explorer.ts
**Implements:** Build-Spec §4 Stage 3 — priority 1 source. Endpoint `https://projects.propublica.org/nonprofits/api/v2/search.json`, no auth, page-paginated (first page per cycle; incremental discovery via `posted_date` ordering).
**Last verified against spec:** 2026-05-21.
**Drift:** none. Live ingest verification deferred to post-merge follow-up (one of the 7 adapters flagged 404/500 in the live test; see follow-up branch `funder-followups`).

#### Pathfinder/lib/adapters/sources/irs-exempt-org-filings.ts
**Implements:** Build-Spec §4 Stage 3 — priority 2 source. IRS Business Master File (BMF) monthly per-state CSV bulk pulls (no realtime JSON API), canonical determination-letter dataset.
**Last verified against spec:** 2026-05-21.
**Drift:** **minor, justified.** Bulk CSV instead of JSON-per-record because IRS publishes only the bulk feed. Live ingest verification deferred to `funder-followups`.

#### Pathfinder/lib/adapters/sources/ea-forum-rss.ts
**Implements:** Build-Spec §4 Stage 3 — priority 3 source. EA Forum frontpage Atom feed at `https://forum.effectivealtruism.org/feed.xml?view=community-top`, throttled at ~60 req/min by upstream.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/philanthropy-trade-press-rss.ts
**Implements:** Build-Spec §4 Stage 3 — priority 4 source. RSS aggregator across Chronicle of Philanthropy, Inside Philanthropy, Philanthropy News Digest (operator-extensible feed list). One event per entry.
**Last verified against spec:** 2026-05-21.
**Drift:** none in code; Chronicle feed flagged 404 in live test, slated for adapter-config fix in `funder-followups`.

#### Pathfinder/lib/adapters/sources/accelerator-cohort-pages.ts
**Implements:** Build-Spec §4 Stage 3 — priority 5 source. Per-accelerator HTML scraping (YC, ARC Prize, Astera, Schmidt Futures). Ships as `tier-2-human-assist` per Build-Spec §4 Stage 3 guidance for unstable scraping sources.
**Last verified against spec:** 2026-05-21.
**Drift:** **major, justified.** Tier-2 fallback registration instead of automated extraction — Build-Spec explicitly authorizes this for unstable HTML sources.

#### Pathfinder/lib/adapters/sources/business-license-issuances.ts
**Implements:** Build-Spec §4 Stage 3 — priority 6 source. Aggregates over operator-configured list of city/state open-data portals (mostly Socrata-backed business-license issuance datasets, no national feed).
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/funder-990-filings.ts
**Implements:** Build-Spec §4 Stage 3 — priority 5 source per Build-Spec §2 resolved default 6 (treated as enrichment context, not a timely trigger; 990 data runs 12-18 months behind live grant flow).
**Last verified against spec:** 2026-05-21.
**Drift:** none.

### Stage 3 — Inngest subscriber

#### Pathfinder/lib/inngest/functions/ingest-org-requested.ts
**Implements:** Build-Spec §4 Stage 3 — `pathfinder/org.ingest_requested` subscriber. Runs the org's configured source adapters from the id-keyed `SOURCE_ADAPTERS` registry per dispatch from `ingestAllOrgsCron` (every 4h). Org-scoped writes to `pathfinder.projects`, dedupe vs existing rows, one `agent_runs` row per cycle.
**Last verified against spec:** 2026-05-21.
**Drift:** **minor, additive.** New subscriber instead of folding Funder sources into Zedcor-shaped `lib/ingestor.ts` `runIngestorCycle()` — documented in file header. Justified to preserve Zedcor regression gate.

### Stage 4 — Qualifier + Enrichment

#### Pathfinder/lib/agents/funder/qualifier.ts
**Implements:** Build-Spec §4 Stage 4 — per-org L3 qualifier gating raw source events to genuine fundable-org signals. Two-mode: heuristic prefilter + Haiku classifier. Funder-shaped, parallel to Zedcor's inline classifier in `app/api/cron/ranker/route.ts` (Zedcor path untouched).
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/lib/agents/funder/enricher.ts
**Implements:** Build-Spec §4 Stage 4 — Funder-shaped enricher emitting org canonical name, legal form (501c3 / PBC / LLC-mission-lock / fiscally-sponsored), founder list, raise stage. Parallel to platform `lib/agents/enricher.ts` (which is Zedcor-shaped buyer-org context).
**Last verified against spec:** 2026-05-21.
**Drift:** none in code. **Not yet wired into the pipeline as of PR #448** — exists + unit-tested; wiring is a follow-up on `funder-followups`.

#### Pathfinder/lib/agents/funder/adjacency.ts
**Implements:** Build-Spec §4 Stage 4 — founder talent-graph adjacency mapper. Parallel to platform `lib/agents/adjacency.ts` (Zedcor cross-pollination model). For each candidate org: prior affiliations of founders, peer organizations sharing founders/board members, accelerator-cohort siblings.
**Last verified against spec:** 2026-05-21.
**Drift:** none in code. **Not yet wired into the pipeline as of PR #448** — exists + unit-tested; wiring is a follow-up on `funder-followups`.

#### Pathfinder/lib/agents/funder/geo.ts
**Implements:** Build-Spec §4 Stage 4 — deterministic hub assignment over the architecture's `lead_unit.schema.geo_hub` enum (sf-bay, nyc, dc-metro, boston, london, remote, other). No branches, no coverage radius, no haversine — fundamentally different from Zedcor's geo model.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

### Stage 5 — Ranker

#### Pathfinder/lib/agents/ranker/genericRationale.ts
**Implements:** Build-Spec §4 Stage 5 — closes the non-Zedcor Sonnet-rationale gap. Pre-PR #448, non-Zedcor projects routed by `app/api/cron/ranker/route.ts:768-845` received a hand-built debug string ("Scored by <display_name> weights ... no extractable features") instead of the Sonnet rationale + first-step prose Zedcor got. This module produces real rationale + first-step recommendation for Funder and also for Realberry (the other persisted non-Zedcor org).
**Last verified against spec:** 2026-05-21.
**Drift:** **expected.** Realberry rationales now change from debug string → real Sonnet prose — acknowledged in Build-Spec §4 Stage 5 acceptance ("Existing-customer regression gate passes (Zedcor and Realberry scores unchanged)" — scores unchanged, rationales improved).

### Stage 6 — Verifier

#### Pathfinder/lib/agents/verifier/funderChecks.ts
**Implements:** Build-Spec §4 Stage 6 — Funder-shaped verifier checks: org exists in public record, founder bios corroborate, org is not already widely funded. Thresholds read from `architecture.scoring.thresholds`. Parallel to the platform verifier in `app/api/cron/verifier/route.ts` (5 Zedcor-shaped checks; branch-attribution + score-recompute produce false failures on Funder projects).
**Last verified against spec:** 2026-05-21.
**Drift:** none.

### Stage 7 — Weekly Deal Memo

#### Pathfinder/lib/agents/funder/dealMemo.ts
**Implements:** Build-Spec §4 Stage 7 — Weekly Deal Memo composer. One-page email + downloadable PDF, opportunities grouped by `thesis_area`, each with 3-sentence org snapshot, founder bio (when available), thesis-fit rationale (ranker Sonnet output), first-step recommendation (`outreach_hook`). Resend delivery.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

### Stage 8 — Outreach + integrations

#### Pathfinder/lib/agents/funder/outreachChannels.ts
**Implements:** Build-Spec §4 Stage 8 — channel dispatch (cold email via Resend, one-line Slack alert, pre-filled HubSpot record fields) with env-gated graceful degradation. Returns `{ ok: false, reason: 'no_credentials' }` when env missing, mirroring the Perplexity-key pattern. Operators see drafts in DB / dashboard regardless of auto-post.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/lib/agents/funder/outreachDrafter.ts
**Implements:** Build-Spec §4 Stage 8 — produces three artifacts per verified opportunity: cold email body (Sonnet, voice from `architecture.outreach`), deterministic Slack one-liner, deterministic HubSpot field mapping. Biosecurity-flagged opportunities (`compliance_flag === 'biosecurity-review'`) receive no auto-draft (resolved default 2).
**Last verified against spec:** 2026-05-21.
**Drift:** none.

### Cross-cutting

#### Pathfinder/lib/lead-actions.ts
**Implements:** SPEC - Pathfinder Hubspot Sync — canonical accept-flow library (`acceptLead`, `pushDealForLeadAction`, `applyHubspotStageEvent`, `recordLocalAction`). Modified in PR #448 to make HubSpot-deal push tolerate Funder-shaped projects (org-scoped pipeline + stage lookup) without changing the Zedcor path. Stable public interface kept per `docs/LEAD-ACTIONS-API.md` for P0-04 Slack-bot + P0-01 chat-panel consumers.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

---

## Funder Onboarding — Post-merge follow-ups (PR #449)

**State:** PR #449 open on `funder-followups`, head `8a366d3`. Branched off `origin/main` post-merge of PR #448 (squash `a12b7cb`). Addresses §4 follow-up items 1 (adapter endpoints) and 5 (enricher + adjacency invocation) from `Pathfinder/docs/REPORT-funder-onboarding.md`. Plus host routing carried over from a parallel-session commit (`6471244`).

The 4 adapter files modified in this PR (`propublica-nonprofit-explorer.ts`, `irs-exempt-org-filings.ts`, `philanthropy-trade-press-rss.ts`, `funder-990-filings.ts`) already have entries in the "Funder Onboarding — PR #448" section above. The fixes update the spec-mapping notes for live-verified endpoint paths; drift is documented in REPORT-funder-onboarding.md §7.1.

### Pipeline wiring

#### Pathfinder/lib/inngest/events.ts
**Implements:** Build-Spec §4 Stage 4 — post-qualifier event surface. Adds `pathfinder/project.qualified` (distinct from the existing `pathfinder/signal.qualified` which fires after RANKING). The new event fires after the qualifier gate during ingest, BEFORE ranking, carrying `{ project_id, organization_id, organization_slug, source, qualified_at }`. Subscribed by `funderEnrichAdjacency`; other subscribers may join without contract churn.
**Last verified against spec:** 2026-05-22.
**Drift:** none.

#### Pathfinder/lib/inngest/functions/ingest-org-requested.ts
**Implements:** Build-Spec §4 Stage 3 + Stage 4 — post-insert `pathfinder/project.qualified` emit (PR #449 addition). After fresh rows persist, the subscriber fans out one event per project so the Funder enricher + adjacency-mapper can run before the next ranker cycle. Emit is best-effort: a failed send writes to the per-source result's `error_message` but does not flip the row to failed (the row is already persisted; the next ranker cycle still picks it up, just without enrichment).
**Last verified against spec:** 2026-05-22.
**Drift:** none (additive to PR #448 shape).

#### Pathfinder/lib/inngest/functions/funder-enrich-adjacency.ts
**Implements:** Build-Spec §4 Stage 4 + REPORT-funder-onboarding.md §4 follow-up #5 — `pathfinder/project.qualified` follow-on handler that runs the Funder enricher + adjacency-mapper BEFORE the next ranker cycle picks up the row. Slug-gated to `'funder'` so other orgs may share the event surface without enabling the Funder-shaped enricher. Idempotency gate on `raw_payload.funder_enrichment.enriched_at`. Graceful-empty on LLM-gateway failure so a missing env never blocks a row. Persists results into `projects.raw_payload` under `funder_enrichment` + `funder_adjacency` keys (no schema migration; the ranker, verifier, and deal memo already read from raw_payload for Funder-shaped signals).
**Last verified against spec:** 2026-05-22. Live driven 2026-05-22 on Funder org `a91e88ef-be63-43d0-84f1-cc2fadf01467`: 6/6 enrich + 6/6 adjacency succeeded against Perplexity Sonar for top-ranked Funder projects, total cost ~$0.006.
**Drift:** none.

#### Pathfinder/lib/inngest/functions/index.ts
**Implements:** Barrel export for the Inngest function set. Adds `funderEnrichAdjacency` (PR #449). Existing entries unchanged.
**Last verified against spec:** 2026-05-22.
**Drift:** none.

---

## Internal Onboarding, Stage 2 (Pathfinder organization #4)

**State:** Branch `internal-org-record` off `internal-onboarding` at `5147493`. Stage 2 of the autonomous Internal build per `Pathfinder/docs/PLAN-internal-onboarding.md`. Persists "Unicron Internal" row via `POST /api/organizations` and adds the round-trip architecture fixture test. Spec: `Pathfinder/Pathfinder-Internal-Blueprint.md` Section 9. No `lib/` files touched; only `scripts/` and `__tests__/` additions.

### Stage 2, Org record persistence

#### Pathfinder/scripts/seed-internal-org.ts
**Implements:** Blueprint Section 9, Stage 2, plus PLAN Stage 2. Idempotent loader that POSTs the Internal architecture JSON to `/api/organizations` (or direct supabaseAdmin insert as fallback). Mirrors `scripts/seed-funder-org.ts` structure. Two modes (`--via-api`, default supabase); `--dry-run` short-circuit; slug-based idempotency. Default `PATHFINDER_BASE_URL` is `http://localhost:3000/pathfinder` (basePath per next.config.js).
**Last verified against spec:** 2026-05-21. Live POSTed against local dev (`localhost:3300/pathfinder/api/organizations`) and returned 201 with row id `2ff1197b-36f8-4210-aa11-65cf025ad83b`.
**Drift:** none.

#### Pathfinder/__tests__/fixtures/internal-architecture.json
**Implements:** Blueprint Section 9, Stage 2. Verbatim copy of `Pathfinder/Pathfinder-Internal-Architecture.json` for fixture-based unit testing. Mirrors `__tests__/fixtures/funder-architecture.json` precedent.
**Last verified against spec:** 2026-05-21.
**Drift:** none.

#### Pathfinder/__tests__/agents/loadOrgArchitecture-internal.test.ts
**Implements:** Blueprint Section 9, Stage 2. Round-trip the Internal architecture JSON through `resolveArchitecture` and assert Internal-shaped values survive merge with `BASE_ARCHITECTURE`. 13 assertions cover vertical, lead unit, pipeline stages, scoring weights (6 keys summing to 1.0), thresholds (verified=0.65), sources (6 refs: 2 registered plus 4 pending), outreach, vocabulary, branding (`display_name = "Unicron Internal"`), ui_plan, business_summary, and base-fallback non-regression.
**Last verified against spec:** 2026-05-21. 13/13 pass against `pnpm exec vitest run __tests__/agents/loadOrgArchitecture-internal.test.ts`.
**Drift:** none.

---

## Internal Onboarding, Stage 3 (Vanity domain + host routing + auth)

**State:** Branch `internal-host-routing` off `internal-onboarding` at `4b769ee`. Stage 3 of the autonomous Internal build per `Pathfinder/docs/PLAN-internal-onboarding.md`. Mirrors the Funder host-rewrite pattern (commit `b00f11f`) for `internal.unicron.systems` and re-uses the existing operator-allowlist gate at `Pathfinder/app/[slug]/layout.tsx`. No new auth fork; existing slug-generic gate already covers `/internal`.

### Stage 3, Host routing + operator gate confirmation

#### middleware.ts (workspace root, parent unicron-systems project)
**Implements:** PLAN Stage 3 acceptance criterion 1 — `internal.unicron.systems` resolves to `/pathfinder/internal`. Strictly additive INTERNAL_HOST branch alongside the existing FUNDER_HOST branch. Bare host `/` rewrites to `${PATHFINDER_ORIGIN}/pathfinder/internal`; deep paths rewrite to `${PATHFINDER_ORIGIN}/pathfinder<path>`; existing `/pathfinder/*` paths pass through unchanged. Preserves query strings end-to-end. Mirrors the Funder branch shape exactly so the routing-precedent invariant from commit `b00f11f` (#460) holds for both hosts.
**Last verified against spec:** 2026-05-22. 9/9 unit tests pass at `tests/unit/middleware.test.ts` (3 Funder regression + 6 Internal). Funder branch byte-identical pre/post; verified by reading the diff and by the 4 Funder regression cases (bare `/`, deep `/leads`, pass-through `/pathfinder/funder`, query-string preservation).
**Drift:** none.

#### Pathfinder/next.config.js
**Implements:** PLAN Stage 3 — add `internal.unicron.systems` to `experimental.serverActions.allowedOrigins` so server actions issued from the Internal host do not trip the SSRF guard. Mirrors the Funder entry. Strictly additive (one host added to the list).
**Last verified against spec:** 2026-05-22. `pnpm build` green; middleware bundle size 25.3 kB; no other changes.
**Drift:** none.

#### tests/unit/middleware.test.ts (workspace root)
**Implements:** PLAN Stage 3 — guardrail tests asserting middleware host-rewrite shape for both Funder (regression) and Internal (this Stage). Reads `x-middleware-rewrite` off the `NextResponse.rewrite()` result. 9 assertions: 4 Funder regression (bare /, deep /leads, /pathfinder/funder pass-through, query-string preservation), 6 Internal (bare /, /settings, deep /leads/abc-123, /pathfinder/internal/leads pass-through, query-string preservation on deep paths, plus the bare-host case verifying `/pathfinder/internal` target).
**Last verified against spec:** 2026-05-22. 9/9 pass via `npx vitest run tests/unit/middleware.test.ts`.
**Drift:** none.

#### Pathfinder/__tests__/api/internal-operator-gate.test.ts
**Implements:** PLAN Stage 3 acceptance criterion 2 — operators in `operator_allowlist` see the dashboard; non-operators bounce to `/login?error=unauthorized`. Guardrail test: reads `Pathfinder/app/[slug]/layout.tsx` and asserts (a) no per-slug fork (no `slug === '...'` or `switch (slug)` branches), (b) every request checks `operator_allowlist`, (c) Supabase session is required before the allowlist check. If a future PR adds a per-slug fork, this test fails and the author must justify.
**Last verified against spec:** 2026-05-22. 3/3 pass. Local dev verification (Pathfinder dev on `:3000`): unauthenticated `GET /pathfinder/internal` with basic-auth creds returns HTTP 307 to `/pathfinder/login`, confirming the layout's redirect path fires for the `internal` slug exactly as it does for the `funder` slug.
**Drift:** none.

#### Pathfinder/__tests__/metrics/internal-kpiQueries.test.ts
**Implements:** PLAN Stage 3 — graceful degradation contract. Internal's `ui_plan.kpis` references 6 metric_ids: `verified_count_1d`, `active_motion_pct`, `avg_score`, `sources_live`, `count_by_category`, `verified_count`. Only `avg_score` and `sources_live` are mapped today (Funder Stage 9). The other 4 are unmapped; `getKpiValue` returns null for unmapped ids. The renderer (`Pathfinder/app/[slug]/page.tsx:73`) accepts null and never 503s. Stage 10 ships the missing four implementations. This test asserts the contract: every Internal metric_id either resolves or returns null; unmapped ones are null; shared ones (avg_score, sources_live) remain wired.
**Last verified against spec:** 2026-05-22. 3/3 pass.
**Drift:** none.

### Env var enumeration (operator-render path for `/internal`)

REQUIRED (route 500s without these):
- `NEXT_PUBLIC_SUPABASE_URL` — `Pathfinder/app/[slug]/layout.tsx:39`, `lib/supabase.ts:24,58`. Used by both anon (auth.getUser) and admin (org + allowlist queries).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `Pathfinder/app/[slug]/layout.tsx:40`, `lib/supabase.ts:25`. Anon client for auth.getUser; layout explicitly redirects to `/login?error=misconfigured` when missing, NOT 500 — but downstream supabaseAdmin still throws if URL is missing.
- `SUPABASE_SERVICE_ROLE_KEY` — `lib/supabase.ts:59`. Service-role for org + allowlist lookups; throws on missing.
- `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` — `Pathfinder/middleware.ts:78-79`. Pathfinder middleware basic-auth gate; in production, missing values return 503 ("Auth not configured"). Outside Stage 3's scope but documented since Internal requests transit this gate.

OPTIONAL (route degrades gracefully when absent):
- KPI metric implementations for `verified_count_1d`, `active_motion_pct`, `count_by_category`, `verified_count` — `getKpiValue` returns null; `KPIStrip` renders em-dash placeholders. No 503. Covered by `__tests__/metrics/internal-kpiQueries.test.ts`.
- `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN`, `HELICONE_API_KEY`, `AXIOM_TOKEN/DATASET`, `INNGEST_EVENT_KEY/SIGNING_KEY` — none touched at render time for `/[slug]/page.tsx`. They are consumed by the agent pipeline / cron / inngest paths, not the dashboard render. Absence does not 503 the dashboard.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — used by leads detail / map components, not the `/[slug]` landing render. Absence yields a missing map widget elsewhere, not a 503.

---

## Internal Onboarding, Stage 4 (Source adapters)

**State:** Branch `internal-source-adapters` off `internal-onboarding` at `3d5011e`. Six SourceAdapter modules for Internal (Pathfinder org #4), all additive in the source-id-keyed `SOURCE_ADAPTERS` registry Funder introduced. Two priority-1 adapters (sam-gov, usaspending) and one priority-2 adapter (construction-sales-job-postings) hit real endpoints; three priority-3/4 adapters (sos-business-registrations, state-contractor-licenses, trade-association-directories) ship as blocked-on-credentials scaffolds with the required env vars named in stderr at startup. The per-slug ingest dispatch and a qualifier scaffold land here as Stage 4 prerequisites; Stage 5 expands the qualifier.

### Stage 4, Source adapters

#### Pathfinder/lib/adapters/sources/index.ts
**Implements:** PLAN Stage 4. Additively registers six Internal adapters in `SOURCE_ADAPTERS` alongside existing Zedcor/Funder entries. No re-key, no rewire.
**Last verified against spec:** 2026-05-22. Funder regression suite (10 tests at `__tests__/adapters/sources-funder.test.ts`) passes unchanged.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/_internal-shared.ts
**Implements:** PLAN Stage 4. Internal-only shared helpers: NAICS construction-set predicate (236/237/238/532412), source-event normalization (`buildSourceEvent`), `blockedOnCredentials` returner that logs the missing env var name to stderr per the runner rule "Never fake data. Never silently skip."
**Last verified against spec:** 2026-05-22. Used by all six Internal adapters; 13 unit tests at `__tests__/adapters/sources-internal.test.ts` cover the gate and normalization paths.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/sam-gov-entity.ts
**Implements:** Blueprint Section 8 + PLAN Stage 4. SAM Entity Management registration API, filtered to construction NAICS 236/237/238/532412. Auth via `SAM_GOV_API_KEY`. Returns `[]` with `blocked-on-credentials` log when key absent; the runner explicitly authorizes empty-return-with-log over silent-skip.
**Last verified against spec:** 2026-05-22. Adapter unit test covers blocked-on-credentials path and fixture-based parse.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/usaspending-recipients.ts
**Implements:** Blueprint Section 8 + PLAN Stage 4. USASpending recipient/awardee search filtered to construction NAICS. No auth key; the endpoint is fully open.
**Last verified against spec:** 2026-05-22. Fixture-based parse test passes.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/construction-sales-job-postings.ts
**Implements:** Blueprint Section 8 priority 2 + PLAN Stage 4. Keyless job-board RSS aggregator targeting construction-vertical companies hiring sales/BD roles. Paid Indeed/LinkedIn upgrade deferred per blueprint Section 10 decision 2.
**Last verified against spec:** 2026-05-22. Unit test covers RSS parse + role-filter heuristic.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/sos-business-registrations.ts
**Implements:** Blueprint Section 8 + PLAN Stage 4. Scaffold returning `[]` with `blocked-on-credentials` log naming `SOCRATA_APP_TOKEN`. Activates per-state Socrata querying when the token is present.
**Last verified against spec:** 2026-05-22. Blocked-on-credentials assertion in adapter test.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/state-contractor-licenses.ts
**Implements:** Blueprint Section 8 + PLAN Stage 4. Scaffold returning `[]` when no state portals configured. Logs the env-var names that would unblock each state (`CSLB_BULK_URL` / `TDLR_API_TOKEN` / `FL_DBPR_API_TOKEN`).
**Last verified against spec:** 2026-05-22. Blocked-on-credentials assertion in adapter test.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/trade-association-directories.ts
**Implements:** Blueprint Section 8 + PLAN Stage 4. Scaffold for AGC/ABC/NECA/AED member directories. Returns `[]` with `blocked-on-credentials` log naming `AGC_DIRECTORY_TOKEN` / `ABC_DIRECTORY_TOKEN` / `NECA_DIRECTORY_TOKEN` / `AED_DIRECTORY_TOKEN`.
**Last verified against spec:** 2026-05-22. Blocked-on-credentials assertion in adapter test.
**Drift:** none.

#### Pathfinder/lib/inngest/functions/ingest-org-requested.ts
**Implements:** PLAN Stage 4. Additive `'internal'` entry in `SUBSCRIBER_OPT_IN_SLUGS` (line ~57), additive per-slug qualifier dispatch routing Internal events to `qualifyForInternal`. Funder branch byte-identical pre/post; Zedcor remains on the legacy ingestor. Also fixes a latent bug: passes `organization_id` on the `agent_runs` insert, which previously relied on a permissive RLS to drop the row when the NOT NULL constraint failed (silently empty telemetry for Funder too).
**Last verified against spec:** 2026-05-22. Compile + lint clean; Funder regression test passes unchanged.
**Drift:** none.

#### Pathfinder/lib/agents/internal/qualifier.ts
**Implements:** PLAN Stage 4 prerequisite (Stage 5 will expand). Trusts construction-NAICS + sales-motion filtering already performed at the adapter layer; passes events through unless explicit reject signals fire. Deeper qualifier logic lands in Stage 5.
**Last verified against spec:** 2026-05-22. Compile + lint clean; tested via integration with the per-slug dispatch.
**Drift:** Stage 5 will expand. Current Stage 4 acceptance is "qualifier scaffold exists and the inngest dispatch routes through it"; expansion is in scope for Stage 5.

#### Pathfinder/scripts/run-internal-ingest-locally.ts
**Implements:** PLAN Stage 4. Manual ingest trigger that invokes the inngest dispatch for Internal org id `2ff1197b-36f8-4210-aa11-65cf025ad83b` without waiting on a cron tick. Used for local verification.
**Last verified against spec:** 2026-05-22. Compile + lint clean. Live ingest verification deferred to Stage 11 end-to-end run; the runner allows deferral when local dev cannot reach Inngest cloud.
**Drift:** none.


---

## Internal onboarding Stages 5-10 (2026-05-22)

#### Pathfinder/lib/agents/internal/qualifier.ts
**Implements:** Blueprint §6 + PLAN Stage 5. Expanded with ambiguous-allow path (unknown source + construction keyword passes to verifier) and association_hint propagation from the trade-association adapter payload.
**Last verified against spec:** 2026-05-22. 11 unit tests pass.
**Drift:** none.

#### Pathfinder/lib/agents/internal/enricher.ts
**Implements:** Blueprint §7 + PLAN Stage 5. Sonar-driven enricher returning STRICT JSON: website, linkedin, employee_count, service_category (architecture enum-clamped), sales_motion, contacts[], associations[], brief. Same lib/llm/run substrate as Zedcor and Funder enrichers; pre-existing enrichers untouched.
**Last verified against spec:** 2026-05-22. Parser-level tests pass; live Sonar integration covered by the Stage 5 inngest follow-on.
**Drift:** none.

#### Pathfinder/lib/agents/internal/geo.ts
**Implements:** Blueprint §7 + PLAN Stage 5. Pure heuristic mapping to {hq_state, operating_states[]}. No branches, no haversine. Payload-first with title/summary text scanning as fallback.
**Last verified against spec:** 2026-05-22. 7 unit tests pass.
**Drift:** none.

#### Pathfinder/lib/agents/internal/adjacency.ts
**Implements:** Blueprint §10 decision 5 + PLAN Stage 5. Code-complete adjacency-mapper that is inert when UNICRON_INTERNAL_ADJACENCY_SEED_PATH is unset. Seed shape (unicron_customers, crm_contacts, trade_associations) documented inline.
**Last verified against spec:** 2026-05-22. 4 unit tests pass including the inert-assertion when no seed is present.
**Drift:** none. The Stage 5 acceptance was "code-complete and INACTIVE without the seed."

#### Pathfinder/lib/inngest/functions/internal-enrich-geo-adjacency.ts
**Implements:** Blueprint §7 + PLAN Stage 5. Subscribes to `pathfinder/project.qualified` and runs enricher + geo + adjacency for slug='internal' only. Funder events pass through unchanged into the Funder handler. Registered in app/api/inngest/route.ts.
**Last verified against spec:** 2026-05-22. Typecheck + lint clean.
**Drift:** none.

#### Pathfinder/lib/agents/ranker/genericScorer.ts
**Implements:** Architecture scoring.weights for Internal + Funder + Zedcor. Stage 6 ADDITIVELY adds five new extractors (sales_motion_strength, operational_footprint, federal_signal, project_driven_fit, association_presence) and reuses the existing `recency` extractor. All Funder + Zedcor extractors untouched.
**Last verified against spec:** 2026-05-22. 15 unit tests pass; Funder ranker regression (11 tests) + qualifier/geo regression (14 tests) all pass.
**Drift:** none.

#### Pathfinder/lib/agents/ranker/genericRationale.ts
**Implements:** Closes the generic-org Sonnet rationale gap. Stage 6 surfaces additional Internal raw_payload keys (internal_qualifier_reason, internal_enrichment, internal_geo, internal_adjacency, etc.) so Sonnet can quote them.
**Last verified against spec:** 2026-05-22. Funder regression tests pass unchanged.
**Drift:** none.

#### Pathfinder/lib/agents/internal/verifier.ts
**Implements:** Blueprint §8 + PLAN Stage 7. Four checks: company_exists, sales_motion_corroborated, footprint_present, score_above_threshold (threshold read from architecture.scoring.thresholds.verified × 100).
**Last verified against spec:** 2026-05-22. 7 unit tests pass including architecture-driven threshold verification.
**Drift:** none.

#### Pathfinder/app/api/cron/verifier/route.ts
**Implements:** PLAN Stage 7. The non-Zedcor branch now switches on orgEntry.slug. slug='internal' routes to verifyInternalProject; everything else non-Zedcor stays on verifyFunderProject. Zedcor's 5-check kernel path untouched.
**Last verified against spec:** 2026-05-22. Typecheck + lint clean; Funder verifier regression covered by existing tests in __tests__/api/verifier-*.
**Drift:** none.

#### Pathfinder/lib/agents/internal/digest.ts
**Implements:** Architecture business_summary + PLAN Stage 8. Composes the daily morning digest. Pure function — projects[] in, slack_text + slack_blocks + entries[] out.
**Last verified against spec:** 2026-05-22. 5 unit tests pass.
**Drift:** none.

#### Pathfinder/app/api/cron/internal-digest/route.ts
**Implements:** PLAN Stage 8. Vercel cron route. Looks up Internal org, pulls verified projects in the last 24h, posts to Slack via INTERNAL_SLACK_WEBHOOK_URL, and seeds deals at pipeline_stage='NEW' for each verified project (idempotent).
**Last verified against spec:** 2026-05-22. Typecheck + lint clean. Live cron verification deferred to Stage 11.
**Drift:** none.

#### Pathfinder/vercel.json
**Implements:** PLAN Stage 8. Appends `{ path: /pathfinder/api/cron/internal-digest, schedule: "0 13 * * 1,2,3,4,5" }`. Numeric day-of-week 1-5 (Mon-Fri) per CLAUDE.md rules.
**Last verified against spec:** 2026-05-22.
**Drift:** none.

#### Pathfinder/lib/agents/internal/outreachDrafter.ts
**Implements:** Architecture outreach + PLAN Stage 9. Three artifacts per verified company: cold email (Sonnet), LinkedIn message (Sonnet), internal HubSpot note (deterministic) + hubspot fields bag. Em-dash stripping enforced. Graceful no-api-key fallback for both Sonnet calls.
**Last verified against spec:** 2026-05-22. 6 unit tests pass.
**Drift:** none.

#### Pathfinder/lib/agents/internal/hubspotNote.ts
**Implements:** PLAN Stage 9. HubSpot writer. Gated on INTERNAL_HUBSPOT_API_KEY; missing key returns status='skipped:no_api_key' without throwing. Finds-or-creates company by name then attaches note via HubSpot association 190.
**Last verified against spec:** 2026-05-22. Graceful-skip path covered by unit test.
**Drift:** none.

#### Pathfinder/lib/metrics/kpiQueries.ts
**Implements:** Architecture ui_plan.kpis + PLAN Stage 10. Adds four Internal metric_id implementations: verified_count_1d, active_motion_pct, count_by_category, verified_count. avg_score and sources_live (Funder Stage 9) untouched. Stage 3 graceful-degradation contract preserved.
**Last verified against spec:** 2026-05-22. 3 KPI-routing unit tests pass.
**Drift:** none.

#### Pathfinder/app/[slug]/page.tsx
**Implements:** Stage 1 audit finding fix + PLAN Stage 10. Bug fix: `org_id` -> `organization_id` on the projects fetch. Unblocks every non-Zedcor slug page (Funder, Realberry, Internal). Regression guard: __tests__/api/slug-page-org-filter.test.ts greps source for the correct column name.
**Last verified against spec:** 2026-05-22. 1 regression-guard test passes.
**Drift:** none.

---

## Funder UX pass (PR #464)

**State:** PR #464 on `funder-ux-pass`. End-to-end UX repair against the audit gap list in `Pathfinder/docs/AUDIT-funder-ux-pass.md`.

#### Pathfinder/lib/agents/funder/leadView.ts
**Implements:** Build-Spec §4 Stage 8 (lead-card shape) + `ui_plan.lead_card_layout` field projection. Projects a `pathfinder.projects` row into the flat shape the funder LeadCard renders. Field names align with `architecture.lead_unit.schema` so `lead[field]` lookup in `LeadCardList` picks them up via `ui_plan.lead_card_layout.primary_fields` / `secondary_fields`. Reads enrichment-derived fields when present (`funder_enrichment.*`) and falls back to qualifier-time signals (`funder_inferred_thesis`, `funder_geo_hub`). Labels come from `architecture.lead_unit.schema.enum_values` → human labels.
**Last verified against spec:** 2026-05-22.
**Drift:** none (new file, additive).

#### Pathfinder/lib/metrics/chartQueries.ts
**Implements:** Build-Spec §4 Stage 9 — chart-data resolvers consumed by the `[slug]` dashboard's `FunderChartGrid`. Funder ui_plan.charts: `count_by_thesis` (bar, grouped by thesis_area); `verified_count` (line, 8-week ISO-week series of `verified=true` projects). Additive — Zedcor's dashboards live outside `[slug]` and do not import this module.
**Last verified against spec:** 2026-05-22.
**Drift:** none.

#### Pathfinder/lib/metrics/kpiQueries.ts (modified)
**Drift:** `actively_raising_count` extended to read both legacy `raw_payload.fundraising_stage` and enrichment-derived `raw_payload.funder_enrichment.fundraising_stage` so the KPI agrees with the verifier's data path. `sources_live` unchanged.
**Last verified against spec:** 2026-05-22.

---

## Internal dashboard bug-fix bundle (fix/internal-dashboard-bundle)

**State:** branch `fix/internal-dashboard-bundle` off `main`. Open PR for human review. Four defects reported live on `/pathfinder/internal`: dashboard scroll, Companies tab 404, sub-page back-link to `/pathfinder` (Zedcor), and dashboard / pipeline tile click landing on a Funder-shaped detail view that looks blank for Internal projects. Phase 0 verification ran `pnpm dev` locally and walked `/pathfinder/internal`, `/pathfinder/internal/leads`, `/pathfinder/internal/pipeline`, and `/pathfinder/internal/leads/<id>`: every route returns HTTP 200, every nav href is slug-prefixed (`/pathfinder/internal/...`), CSS allows scroll. Defects 1, 2, 3 against the live deploy are the prior PR #469 not yet rolled out on `pathfinder-ashy.vercel.app`. Defect 4 is a real product gap: the detail page renders Funder fields (Founders, raise stage) for Internal companies whose `raw_payload.internal_enrichment.*` has none of those keys.

#### Pathfinder/lib/agents/internal/companyLeadView.ts
**Implements:** Internal architecture (`Pathfinder-Internal-Architecture.json`) lead_unit.schema and `raw_payload.internal_enrichment` / `internal_geo` projection. Function `projectToCompanyLeadView(project)` returns a flat `CompanyLeadView` with company name, service category, sales motion, footprint (HQ + ops states), hq location, employee count, federal registration, associations, first step / warm intro, rationale, brief, citations, website, linkedin, and contact list. Falls back to qualifier-time signals (`internal_inferred_service_category`, `internal_sales_motion_signal`, `internal_federal_registration`, `internal_association_hint`) when enrichment has not filled in. Mirror of `lib/agents/funder/leadView.ts`. Drives the new `CompanyDetailContents` rendered inside `LeadDetailShell` at `app/[slug]/leads/[projectId]/page.tsx` when `architecture.lead_unit.name === 'company'`.
**Last verified against spec:** 2026-05-22. `pnpm typecheck`, `pnpm lint`, `pnpm test` (1833 tests) all pass. Verified live by curling `/pathfinder/internal/leads/<id>` and inspecting the rendered section list (Recommended first step, Why this scored, Snapshot, Trade associations, Brief, Contact, Citations); Funder lead detail at `/pathfinder/funder/leads/<id>` still renders Founders / Brief / Snapshot inside the same shell.
**Drift:** none (new file, additive).

---

## Sprint Z3 — Zedcor parser quality + phase inference (PR #488)

**State:** PR #488 on `feat/zedcor-z3-parser-phase`. Closes the parser-quality + phase-inference gap from Sprint Z1A. 9 Houston source adapters rebuilt to mirror the `galveston-county` gold-standard shape (project_stage + phase_confidence + buy_window_open + source_authority); `phase-signals` deterministic regex/keyword library wired through `enrichDetailPages()`; Notion writer additively populates Bid Stage / Buy Window / Source Type; verifier relaxed to drop only rows missing title OR source_url. Spec: `Specs/SPEC-zedcor-z3-parser-phase-fix.md`.

#### Pathfinder/lib/adapters/sources/_zedcor-shared.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" — shared HTTP fetch wrapper (PathfinderBot user-agent, 1.5s detail-fetch rate limit, robots.txt respect) + `enrichDetailPages()` helper that fetches up to 5 most-recently-posted opportunity detail pages per source and applies the phase-signals regex library, with per-URL Cloudflare/403/timeout errors swallowed so per-source yield stays at listing-level confidence=0.5 when detail pages are gated.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file, additive).

#### Pathfinder/lib/adapters/sources/brazoria-county.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 7. Primary path is the legacy Bonfire JSON (`brazoriacounty.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData`); HTML fallback constrains to the current-bids table with explicit archive-text rejection (the previous adapter surfaced 23 historical-tabulation links). source_authority=county_purchasing.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/fort-bend-county.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 6. Routes primary traffic through the county's Bonfire JSON; the legacy adapter scanned `table tr, .accordion-item, li, .panel` against any `rfp|rfq|bid|ifb` token and produced 23 historical-tabulation links. Structurally correct against the spec; populates when the county posts opportunities. source_authority=county_purchasing.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/harris-county-bonfire.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 3. Reads the modern Bonfire JSON (`harriscountytx.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData`). Detail pages 403 via Cloudflare → enrichment swallows per-URL errors. source_authority=county_purchasing.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/hisd-ionwave.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 8. Selector scoped to Telerik RadGrid master-table at `/SourcingEvents.aspx?SourceType=1` (the documented `/CurrentSolicitations.aspx` serves an "Invalid Address Requested" placeholder to unauthenticated GETs). BidIDs extracted from `_clientKeyValues` ClientState JSON regex. source_authority=school_district.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/houston-metro.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 4. Selector locked to `table[title="Open Procurements Table"] tbody > tr` (eliminates the ~50% junk from the previous indiscriminate `table tr, .views-row, .card` scan). Detail URLs route through Bonfire (`ridemetro.bonfirehub.com`). source_authority=public_construction.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/houston-obo.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 1. OBO publishes a directory of 12 partner-portal links — the rebuilt adapter emits one row per partner-portal and the orchestrator's detail-page enricher probes the top-5 partner portals for phase signals. source_authority=public_construction.
**Last verified against spec:** 2026-05-28.
**Drift:** none (rewritten against spec).

#### Pathfinder/lib/adapters/sources/houston-public-works.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 2. HPW publishes a gateway page pointing at CivCast + the 12-month Forecast PDF (~58 upcoming advertisements); the rebuilt adapter scopes to procurement-href regex (`civcastusa.com/publishers/|advertisement_report|advertisement_forecast|construction_bid|bid_set|capital_projects_forecast|purchasinghouston.org`). PDF parsing deferred to Z4 (spec §"Hard-halt conditions" allows the documented deferral). source_authority=public_construction.
**Last verified against spec:** 2026-05-28.
**Drift:** PDF-parsing deferred to Z4 per spec §"Hard-halt conditions".

#### Pathfinder/lib/adapters/sources/port-houston.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 5. Adapter probed every plausible Workday Strategic Sourcing JSON path; the public portal is a JS-rendered SPA that returns a 1,489-byte shell for every path, with real data gated by `_pp_xsrf` and `_pp_session` cookies. Adapter is structurally correct; Z4 plan is Playwright headless or vendor-specific public-portal API key. source_authority=public_construction.
**Last verified against spec:** 2026-05-28.
**Drift:** Workday SPA fetch deferred to Z4 per spec §"Hard-halt conditions".

#### Pathfinder/lib/adapters/sources/txdot-houston-district.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Per-adapter rebuild" item 9. TxDOT Houston-District page returns HTTP 404; the statewide letting hub funnels Houston-district letting to Tableau dashboards and the authenticated EBS portal. Adapter logs the 404 verbatim; Z4 plan is Tableau VizQL client OR FTP+PDF parser. source_authority=state_dot.
**Last verified against spec:** 2026-05-28.
**Drift:** Tableau/FTP-PDF fetch deferred to Z4 per spec §"Hard-halt conditions".

#### Pathfinder/lib/adapters/zedcor/phase-signals.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Phase signals to look for". Deterministic regex/keyword library for inferring bid-lifecycle phase from detail-page text (gc_selected, sub_bid, mobilization, etc.). Take-the-latest-stage resolution per spec; `applyBuyWindowAging()` drops `buy_window_open=true` after 60 days for awarded/gc_selected/sub_bid and 30 days for mobilization, per spec §"Aging rule for buy_window_open=true".
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file, additive).

#### Pathfinder/lib/notion/types.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Notion DB schema update" — `NotionBidStage` / `NotionBuyWindow` / `NotionSourceType` union types matching the new Notion DB select properties (Pre-Budget, Solicitation, GC Selected, Sub Bid, Mobilization, Awarded, Unknown for Bid Stage; Open, Closed, Unknown for Buy Window; Public Construction, Federal Contract, Federal Spending, State DOT, County Purchasing, School District, News Report, Other for Source Type). Additive — existing `NotionPhase` / `NotionState` unions preserved.
**Last verified against spec:** 2026-05-28.
**Drift:** none (additive type union expansion).

#### Pathfinder/lib/notion/zedcor-writer.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Wave 2: Notion writer (ADDITIVE)". `bidStageFor` / `buyWindowFor` / `sourceTypeFor` mapping per spec. Federal authorities (sam.gov/usaspending) always map to Closed buy window so they stop polluting Rep View even when their project_stage is 'awarded'. Existing `Phase` property mapping unchanged.
**Last verified against spec:** 2026-05-28.
**Drift:** none (additive property mappings only).

#### Pathfinder/lib/orchestrator/orchestrator.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Wave 2: Notion writer (ADDITIVE)" wiring. ProjectRow type extended with project_stage / buy_window_open / source_authority columns; loadRunProjects() reads them; Notion writer call passes them. The legacy date-based tag-phase is preserved ONLY for Notion's date-based Phase property; it no longer overwrites project_stage (which is now set by the adapter + detail-page enrichment).
**Last verified against spec:** 2026-05-28.
**Drift:** none (additive — existing tag-phase wiring preserved for the date-based Phase Notion property).

#### Pathfinder/lib/orchestrator/run-source.ts
**Implements:** SPEC-zedcor-z3-parser-phase-fix.md §"Wave 3: Verifier relaxation" + §"Wave 0: Foundation" source_authority promotion. Reject rows missing title OR source_url (the new structural floor — solicitation-stage rows pass through). Adapter-stage project_stage / phase_confidence / buy_window_open promoted from raw_payload to top-level columns. source_authority fallback table maps each slug to its taxonomy value.
**Last verified against spec:** 2026-05-28.
**Drift:** none (additive — geofence + dedup paths preserved).

---

## Sprint Z3.5 — Zedcor detail-page enrichment (GC + contact extraction)

**State:** PR #490 on `feat/zedcor-z35-enrichment`. Spec: `Specs/SPEC-zedcor-z35-enrichment.md` (also at `/Users/kylekesterson/Documents/Claude/Unicron/Specs/SPEC-zedcor-z35-enrichment.md`). Parallel to Sprint Z3 (parser-phase) and Sprint Z4 (cross-poll pitch). Strictly additive on the two shared files (`lib/notion/zedcor-writer.ts`, `lib/orchestrator/orchestrator.ts`); Z3/Z4 territories untouched. Adds a three-layer extraction pipeline (cheerio → Anthropic Sonnet 4.6 → Perplexity Sonar fallback) and surfaces results in the rep list + 8 pre-existing Notion columns.

### Migration

#### Pathfinder/supabase/migrations/20260528_zedcor_z35_gc_metadata.sql
**Implements:** SPEC-zedcor-z35-enrichment.md §"Schema additions" — additive `pathfinder.projects.gc_metadata jsonb DEFAULT '{}'`. Two indices: one on `gc_metadata->>'gc_name'` (partial — `WHERE gc_metadata ? 'gc_name'`), one on `(gc_metadata->>'fetched_at')::timestamptz desc nulls last` (partial — `WHERE gc_metadata ? 'fetched_at'`).
**Last verified against spec:** 2026-05-28.
**Drift:** none. Idempotent (`IF NOT EXISTS`). Hard rule from spec §"Hard rules" enforced by code (no raw HTML in column): comment documents the constraint.
**Live state:** not applied yet — operator applies via Supabase MCP on merge.

### Lib

#### Pathfinder/lib/adapters/zedcor/detail-page-fetcher.ts
**Implements:** SPEC §"Detail-page fetch policy" — `fetchDetailPage(sourceUrl)`. 5s per-request timeout, 1.5s per-host throttle, `PathfinderBot/1.0 (+https://unicron.systems/pathfinder)` UA, RFC 9309 robots.txt awareness (per-host cache), 429 backoff (single retry at 2× polite delay), gated detection (login-wall heuristic on body window + 401/403 short-circuit). Caps body read at 2 MB. Returns `{status, finalUrl, html, httpStatus, fetchedAt}`; never persists raw HTML beyond the caller's extraction pass.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/lib/adapters/zedcor/contact-extractor.ts
**Implements:** SPEC §"Extraction strategy" Layer 1 contact fields — `extractContactFromHtml(html)`. Generic-mailbox filter (`info@`, `support@`, etc. excluded); US phone normalizer to `+1-XXX-XXX-XXXX`; "Name, Role" parser for award notice contact blocks. Pure function over HTML; no network.
**Last verified against spec:** 2026-05-28.
**Drift:** none. US-only by design (normalizeUsPhone rejects non-US shapes — Zedcor is Houston-area construction so this is correct for the entire eligible corpus).

#### Pathfinder/lib/adapters/zedcor/gc-extractor.ts
**Implements:** SPEC §"Extraction strategy" Layers 1–3 + §"Hard rules". Public `extractGcMetadata({source_url, title})` fetches the detail page, runs Layer 1 (cheerio award-notice scan via `extractGcFieldsFromHtml` + `extractContactFromHtml`), Layer 2 (Anthropic Sonnet 4.6 structured JSON with the verbatim system prompt from the spec; temperature 0, max_tokens 800, page text capped at ~24K chars), and Layer 3 (Perplexity Sonar fallback for `gc_name` only, OpenAI-compatible chat-completions endpoint; skipped cleanly when `PERPLEXITY_API_KEY` is unset). Returns the full `GcMetadata` bundle with `fetched_at`, `fetch_status`, `extraction_layer` ('html'|'anthropic'|'sonar'|'mixed'|'none'), `source_citation`. Layer-2 skipped when Layer 1 already has gc_name + (email or phone) per `isComplete` heuristic.
**Last verified against spec:** 2026-05-28.
**Drift:** none. `claude-sonnet-4-6` used (overridable via `ZEDCOR_ENRICHMENT_MODEL`); spec said "claude-sonnet-4-5 (or current)".

#### Pathfinder/lib/orchestrator/enrich-zedcor.ts
**Implements:** SPEC §"Soft cap" + §"Backfill scope" eligibility — `enrichEligibleProjects(runId)`. Eligibility filter: `buy_window_open=true OR project_stage IN ('awarded','gc_selected','sub_bid')`. Soft cap `ZEDCOR_ENRICHMENT_CAP` (default 200). Ordering: `buy_window_open=true` first → `posted_date desc` → `score desc`. Per-project persistence to `pathfinder.projects.gc_metadata`. Returns `{attempted, succeeded, failed, enrichedById, errors}` for the orchestrator's run summary.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Lib (additive modifications)

#### Pathfinder/lib/notion/zedcor-writer.ts (additive)
**Implements:** SPEC §"Notion writer integration" — three new exports plus an additive arg on the existing writer.
- `enrichmentToNotionProperties(meta)` → maps `gc_metadata` to the 8 pre-existing Notion property shapes (`GC Name` rich_text, `GC Award Date` date, `GC Contact Name/Role` rich_text, `GC Contact Email` email, `GC Contact Phone` phone_number, `Sub-Bid Deadline` date, `Subcontract Package URL` url). Empty object when meta is null/undefined.
- `findExistingProjectInNotion(source, source_id)` → returns `{leadId, notionPageUrl, notionPageId}` or null using the same dedup signature as `writeProjectToNotion`.
- `updateProjectEnrichmentInNotion(notionPageId, meta)` → `pages.update` of only the 8 enrichment columns. Never touches Rep Status / Rep Notes (rep-owned).
- `writeProjectToNotion(input, enrichment?)` second arg appends enrichment props on the create path.
**Last verified against spec:** 2026-05-28.
**Drift:** none. Existing property mappings and dedup-by-Project-ID behavior unchanged.

#### Pathfinder/lib/notion/types.ts (additive)
**Implements:** Optional `notionPageId?: string` on `NotionWriteResult` so the backfill's update-in-place path has the page id to call `pages.update` against. Field is optional; all existing callers compile.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/lib/orchestrator/orchestrator.ts (additive)
**Implements:** SPEC §"Notion writer integration" — new enrichment step between Wave 2 (phase tagging + scoring) and Wave 3 (Notion writes). Calls `enrichEligibleProjects(runId)` inside a try/catch (logs `enrichment_complete` / `enrichment_failed` events; never aborts the run per spec §"No halts"). Passes the resulting `enrichedById.get(p.id)` as the second arg of the existing `writeProjectToNotion` call. `RunSummary` gains optional `enrichment_{attempted,succeeded,failed}` counters so older clients tolerate the new shape.
**Last verified against spec:** 2026-05-28.
**Drift:** none. Wave 1/2/3 of the original orchestrator are unmodified; the new step is purely insertional.

### Scripts

#### Pathfinder/scripts/backfill-gc-enrichment.ts
**Implements:** SPEC §"Backfill scope" — one-shot backfill of `extractGcMetadata` + Notion update against existing Zedcor projects. Filter: `project_stage IN ('awarded','gc_selected','sub_bid','mobilization') OR buy_window_open=true`. Cap default 500 (`--cap=N` override). Skip rows without `source_url`. Order: source authority class (public_construction → county_purchasing → school_district → federal-deprioritized) then `buy_window_open` → `posted_date desc` → `score desc`. Update-in-place for existing Notion rows; create new for absent. `--dry-run` for log-only inspection; `--notion=false` for DB-only smoke. Final stats line reports gc_name % coverage, contact % coverage, extraction-layer attribution, fetch-status breakdown (PR evidence).
**Last verified against spec:** 2026-05-28.
**Drift:** none. `source_authority` doesn't exist as a column today; the script encodes the priority mapping in `SOURCE_PRIORITY` keyed by source slug.

### Tests

#### Pathfinder/__tests__/adapters/zedcor-extractors.test.ts
**Implements:** Unit smoke for the pure-function (no-network) layer-1 + helper paths. 16 tests covering `normalizeUsPhone` (assorted US formats; rejection of non-US and 0-leading area codes), `parseNameAndRole` (Name+Role pairs, name-only, rejection of single tokens), `extractContactFromHtml` (label-block extraction, generic mailbox skip, mailto/tel link fallback, null-on-nothing), `toIsoDate`, `parseJsonFromAnthropic` (fenced and unfenced output), and the full `extractGcFieldsFromHtml` against a synthetic award-notice fixture. Network + Anthropic + Perplexity paths are covered by the live backfill smoke documented in PR #490.
**Last verified against spec:** 2026-05-28. 16/16 pass locally; CI green for this file (pre-existing dashboard-filters and onboarding-connectors failures are unrelated).
**Drift:** none.

### UI

#### Pathfinder/app/zedcor/leads/page.tsx + Pathfinder/components/zedcor/ZedcorLeadList.tsx (additive)
**Implements:** SPEC §"Acceptance criteria" #5 — Rep View displays GC Name + GC Contact Name as primary fields between Title and Stage. Page query now selects `gc_metadata`; row mapper extracts `gc_name` + `gc_contact_name`; list adds two sortable columns inserted between Title (now narrower) and Score, with em-dash fallback for null. Empty-state colspan updated.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

---

## Sprint Z4 — Zedcor cross-pollination + pitch generation (feat/zedcor-z4-cross-pollination-pitch)

**State:** PR #489 open. Branch off `main` at 9fd9933. Closes the "what to say / when to act" gap on Zedcor projects.

#### Pathfinder/lib/adapters/zedcor/type-tag-inferrer.ts
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 2" — inferred type tags. Pure utility mapping title+summary to `ZedcorTypeTag[]` via keyword patterns (linear_infrastructure, school, hospital, recreation, renovation, vertical_build). Output is consumed by the Sonnet pitch-hook generator.
**Last verified against spec:** 2026-05-28. `pnpm typecheck` + `pnpm lint` + `pnpm build` (next build) all exit 0.
**Drift:** none (new file, additive).

#### Pathfinder/lib/adapters/zedcor/cross-pollination.ts
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 1". Fuzzy-matches `gc_name` against `pathfinder.zedcor_customer_sites` for `customer_org_id='zedcor'`. Levenshtein-derived similarity + normalized-substring bonus + `parent_company_canonical` comparison. Warm intro threshold 0.8; 0.6-0.8 surfaced as `possible_cross_pollination`. Reuses `normalizeCustomerName` from `lib/normalization/customer-name.ts`.
**Last verified against spec:** 2026-05-28.
**Drift:** **minor.** Spec text references "pathfinder.customers WHERE organization_id=<uuid>"; actual table is `pathfinder.zedcor_customer_sites` keyed by `customer_org_id='zedcor'` (string slug). Module honors the spec's intent against the real schema. Documented in the file header.

#### Pathfinder/lib/adapters/zedcor/pitch-generator.ts
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 2" — Sonnet hook generator. claude-sonnet-4-6 (overridable via `ZEDCOR_PITCH_MODEL`) at temperature 0.7, max_tokens 600. System prompt anchored to Zedcor's exact catalog + reference projects. User prompt assembles title/agency/summary/value/location/stage/posted/GC + inferred type tags. Returns three single-sentence hooks (≤25 words each). Graceful degrade when `gc_name` absent → agency + title-only mode (still 3 hooks; `degraded: true` in result).
**Last verified against spec:** 2026-05-28.
**Drift:** **minor.** Spec calls for `claude-sonnet-4-5`; production gateway exposes `claude-sonnet-4-6` (latest). Default model upgraded to 4-6; override available via env.

#### Pathfinder/lib/adapters/zedcor/recommended-action.ts
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Component 3". Pure assembly + `action_by_date` precedence: sub_bid_deadline - 14d → gc_award_date + 21d → posted_date + 30d → today fallback. Clamps to today when computed date is in the past (spec hard rule: never set action_by_date in past unless TODAY is the intentional urgent fallback).
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file, additive).

#### Pathfinder/lib/notion/zedcor-writer.ts (modified — additive)
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Notion writer integration". Appends `NotionPitchInput` interface, `pitchToNotionProperties()`, `updateProjectPitchOnNotion(pageId, pitch)`, and `updateProjectPitchBySignature(source, source_id, pitch)`. Maps to the seven Notion columns provisioned at Z4-spec time: Cross-Pollination, Warm Intro Path, Pitch Hook 1/2/3, Recommended Action, Action By Date. Existing `writeProjectToNotion()` and the Z1A property builder are untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none — append-only, parallel-safe with Z3 + Z3.5 per file-ownership section of the Z4 spec.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — additive)
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"File ownership" — adds pitch generation step after enrichment without modifying existing waves. Appends `runZedcorZ4PitchWave(runId)`. Loads pitch-eligible projects (`buy_window_open=true` OR `project_stage in (awarded, gc_selected, sub_bid, mobilization)`) with `ZEDCOR_PITCH_CAP_PER_RUN` cap (default 200). For each: cross-pollination → Sonnet hooks → recommended-action → write `pitch_metadata` jsonb + update Notion page. Gated on `ANTHROPIC_API_KEY` + `ZEDCOR_DISABLE_PITCH`/`ZEDCOR_DISABLE_ANTHROPIC` envs. Failures are logged as `zedcor_z4_pitch_generation_failed` / `zedcor_z4_notion_pitch_update_failed` and never halt the wave. `loadPitchEligibleProjects` uses `SELECT *` so missing optional columns (gc_metadata pre-Z3.5) don't break the query.
**Last verified against spec:** 2026-05-28.
**Drift:** none — append-only, existing Waves 1-3 untouched.

## Sprint Z5 — Backfill UX + adapter URL repair

### Lib

#### Pathfinder/lib/anthropic.ts (modified — bug fix)
**Implements:** SPEC - Backend Architecture.md §5 (LLM gateway) — preserves legacy callers (`completeRationale`, `streamRationaleDeltas`, raw `anthropic()` accessor) while delegating to `lib/llm/run.ts` and wrapping `messages.create`/`messages.stream` with the `pathfinder.llm_calls` recorder. Z5 change: hoist `process.env.ANTHROPIC_API_KEY` read from module-load top-level into the `anthropic()` factory function so standalone `pnpm tsx scripts/*.ts` callers that load env via `dotenvConfig()` in the script body see the key. ES-module imports evaluate before the script body runs, so the old module-top read always saw `undefined` for backfill scripts — surfaced as 200/200 failures in the Z5 pitch backfill. Pattern now matches `lib/llm/run.ts:42-46` (anthropicClient) and `lib/adapters/zedcor/gc-extractor.ts:231` which already read lazily.
**Last verified against spec:** 2026-05-28.
**Drift:** none — semantics identical for cron handlers (env set before module imports under Vercel), behavior change is scoped to standalone-script invocations.

#### Pathfinder/lib/adapters/sources/txdot-houston-district.ts (modified — doc only)
**Implements:** SPEC-zedcor-source-adapters.md §"Per-orchestrator behavior" — no-op `poll()` returning `[]` for the Houston district. Z5 docstring update reflects the new `pathfinder.data_sources.candidate_url` migrated from `https://www.txdot.gov/about/districts/houston.html` (404) to `https://www.txdot.gov/business/road-bridge-maintenance/contract-letting.html` (200, statewide letting hub). Adapter behaviour unchanged; real-row extraction still gated on a Tableau Vizql client or PDF/FTP parser (Z4 deferral). The candidate_url repair is captured in the Supabase migration `zedcor_z5_repair_brazoria_txdot_candidate_urls` applied to production project `anfihcusvekpovcchpoh`.
**Last verified against spec:** 2026-05-28.
**Drift:** none — file is a deliberate stub. Z5 only updated the deferral-rationale comment.

### Run page UI

#### Pathfinder/app/internal/zedcor/run/components/RunButton.tsx (modified)
**Implements:** internal Zedcor run-page button. Z5 adds `pending` prop (separate from `disabled`) that renders an animated SVG spinner inside the button and sets `aria-busy`. Allows the parent panel to flip the button into "Running…" state synchronously on click, before the synchronous POST to `/api/zedcor/run-orchestrator` returns — the previous version only disabled after the POST resolved, so for short runs (Run #6684 at 2.7s) the user saw no state change at all.
**Last verified against spec:** 2026-05-28.
**Drift:** none — new prop is additive; default UX unchanged when `pending=false`.

#### Pathfinder/app/internal/zedcor/run/components/LiveProgress.tsx (modified)
**Implements:** progress strip below the run button. Z5 adds `pending` prop and `lastSummary` prop. While `pending` is true (POST in flight), shows the same emerald-pulse + progress bar as `running`, even before `run_id` is known. When the run finishes and `currentRunId` clears, displays a one-line summary banner: "Run #N · X projects · Y sources · Zs" formatted with the live `orchestrator_run_summary` payload + measured wall-clock duration.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/app/internal/zedcor/run/components/RunPanel.tsx (modified)
**Implements:** client root for `/internal/zedcor/run`. Z5 wires `submitting` state (flipped true at click instant, false in finally) plus `lastSummary` state captured from the terminal poll. `handleRun` now opens with `setSubmitting(true)` and records `runStartedAtRef = Date.now()` before the POST so duration is measurable even when the run completes before polling starts. Polling interval bumped 2000ms → 1500ms per Z5 spec. On `finished=true`, captures the `orchestrator_run_summary` payload + computed `durationMs` into `lastSummary` for the LiveProgress banner.
**Last verified against spec:** 2026-05-28.
**Drift:** none — additive; existing in-flight polling + recent-runs refresh behavior unchanged.

#### Pathfinder/lib/notion/zedcor-writer.ts (modified — v5 SDK migration)
**Implements:** SPEC-zedcor-source-adapters.md §"Notion writer" + SPEC-zedcor-z4-cross-pollination-pitch.md §"Notion writer integration". Z5b migration: @notionhq/client@5.22.0 removed client.databases.query and changed pages.create's parent shape. Switched `findExisting()` from `databases.query({database_id})` to `dataSources.query({data_source_id})` and `writeProjectToNotion()`'s page-create from `parent: {database_id}` to `parent: {data_source_id}`. New `dataSourceId()` helper reads `ZEDCOR_NOTION_DATA_SOURCE_ID` env (default `39b001e3-fa1f-4fbf-aeea-219d4ef2b19a`, the single data_source on the Zedcor Houston Lead Feed DB verified via Notion MCP fetch on 2026-05-28). `pages.update` is unchanged — page_id-keyed calls were not affected by the v5 split.
**Last verified against spec:** 2026-05-28.
**Drift:** none — semantics identical; the SDK contract changed, the writer changed to match. Pre-Z5b code hit `TypeError: client.databases.query is not a function` on the first Notion call.

#### Pathfinder/scripts/backfill-pitch-generation.ts (modified — Notion-only mode)
**Implements:** SPEC-zedcor-z4-cross-pollination-pitch.md §"Backfill" — Z5b adds `--skip-anthropic` flag for Notion-only push of cached pitches. Loader switches to `pitch_metadata->pitch_hooks IS NOT NULL` (skips ~1748 rows with legacy stub pitch_metadata that lacks the hooks array). Per-row branch reads `pitch_hooks` / `cross_pollination` / `warm_intro_path` / `recommended_action` / `action_by_date` directly from the cached jsonb and pushes via `updateProjectPitchBySignature`, never calling Sonnet or `resolveCrossPollination`. Gate on ANTHROPIC_API_KEY relaxed when `--skip-anthropic` is set. Mutual exclusion with `--skip-notion` (combination would no-op).
**Last verified against spec:** 2026-05-28.
**Drift:** none — additive flag; default behaviour unchanged.

---

## Sprint Z10 — Multi-metro expansion (DFW, Austin, San Antonio, South Texas)

**State:** PR #495 open against main on 2026-05-28. Spec: `Specs/SPEC-zedcor-z10-multi-metro.md`.

### Adapters

#### Pathfinder/lib/adapters/sources/index.ts (modified, Z10 additions)
**Implements:** SPEC-zedcor-z10-multi-metro.md §"File ownership" — additive registry entries only. Adds 20 imports (one per new adapter), 20 registry entries under SOURCE_ADAPTERS, and a new `ZEDCOR_Z10_SOURCE_SLUGS` constant (20 slugs grouped by hub) + `ZedcorZ10SourceSlug` union. Z1A entries untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none — strictly additive.

#### Pathfinder/lib/adapters/sources/fort-worth-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `fort-worth-city`. Bonfire JSON primary (`fortworthtx.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData`) with HTML fallback (`fortworthtexas.gov/.../bids-current`). Top-5 by soonest DateClose get detail-page phase enrichment. source_authority=city_purchasing, Tarrant County / Fort Worth.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/tarrant-county.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `tarrant-county`. Bonfire JSON only (`tarrantcounty.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData`). source_authority=county_purchasing, Tarrant County / Fort Worth.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/dallas-isd.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `dallas-isd`. HTML scrape of `dallasisd.org/Page/2243`, positive-filter on `/cms/lib/` and RFP/RFQ/ITB/CSP/BID path tokens, top-5 enrichment skips PDF anchors. source_authority=school_district, Dallas County / Dallas.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/dfw-airport.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `dfw-airport`. HTML scrape of `dfwairport.com/business/contracts-and-procurement/`, positive-filter on procurement keywords + vendor portal hosts (bonfirehub, periscope, ionwave, publicpurchase). source_authority=airport_authority, Tarrant County / DFW Airport.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/arlington-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `arlington-city`. HTML scrape of `arlingtontx.gov/.../current_bids`, filters anchors to PDFs / BidNet / IonWave / Periscope / Bonfire / RFP-RFQ-IFB-ITB paths. source_authority=city_purchasing, Tarrant County / Arlington.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/plano-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `plano-city`. Two-tier: primary CivicPlus scrape of `/189/Purchasing` scoped to `.fr-view`, fallback to `publicpurchase.com?syndicatedOrgId=5493&region=TX`. source_authority=city_purchasing, Collin County / Plano.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/garland-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `garland-city`. CivicPlus scrape of `/162/Purchasing` scoped to `.fr-view`. source_authority=city_purchasing, Dallas County / Garland.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/irving-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md DFW source `irving-city`. CivicPlus scrape of `/372/Purchasing` with explicit recognition of `/DocumentCenter/View/{id}` PDF route (excluded from HTML enrichment). source_authority=city_purchasing, Dallas County / Irving.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/austin-eresponse.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md Austin source `austin-eresponse`. HTML scrape of the ColdFusion solicitations table at `financeonline.austintexas.gov/.../solicitations.cfm`. Detail URLs composed as `solicitation_details.cfm?sid=<SID>`. source_authority=city_purchasing, Travis County / Austin.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/austin-bergstrom.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md Austin source `austin-bergstrom`. HTML scrape of Drupal landing page, filters anchors by RFP/IFB/RFQ/RFI/Solicitation/Bid token. Often empty (returns []). source_authority=airport_procurement, Travis County / Austin.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/travis-county.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md Austin source `travis-county`. HTML scrape with header-driven column indexing (ref/title/posted/deadline) on `traviscountytx.gov/purchasing/solicitations`. source_authority=county_purchasing, Travis County / Austin.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/ut-system.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md Austin source `ut-system`. HTML scrape with two-shape support: rendered table OR `.views-row` fallback that regex-extracts `UTS-####` / `RFP-…` IDs. source_authority=state_university_system, Travis County / Austin.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/san-antonio-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md San Antonio source `san-antonio-city`. Scrapes `webapp1.sanantonio.gov/BidContractOpps/Default.aspx` ASP.NET GridView, harvests `Content.aspx?id=<ID>` anchors. source_authority=city_purchasing, Bexar County / San Antonio.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/bexar-county.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md San Antonio source `bexar-county`. Scrapes CivicPlus Bid Postings at `bexar.org/Bid` with stable `BidID=<n>` href pattern. Degrades to [] when index is empty. source_authority=county_purchasing, Bexar County / San Antonio.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/san-antonio-airport.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md San Antonio source `san-antonio-airport`. Scrapes `sanantonio.gov/aviation/about/contracting`, filters anchors by RFP/RFQ/IFB/Bid/Proposal/Solicitation regex within `<main>`. source_authority=airport_authority, Bexar County / San Antonio.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/northside-isd.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md San Antonio source `northside-isd`. Scrapes `nisd.net/departments/purchasing` with K-12 keyword filter (incl. CSP/competitive-sealed). Handles outbound PDF/TXSmartBuy/ESC links. source_authority=k12_purchasing, Bexar County / San Antonio.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/corpus-christi-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md South Texas source `corpus-christi-city`. Probes Bonfire `corpuschristi.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData` first; falls back to scraping `cctexas.com/departments/contracts-and-procurement`. source_authority=city_purchasing, Nueces County / Corpus Christi.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/nueces-county.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md South Texas source `nueces-county`. HTML scrape of `nuecesco.com/departments/purchasing`, keeps anchors matching `.pdf|/bids|/rfp|/rfq|/ifb|solicitation`, PDFs excluded from enrichment. source_authority=county_purchasing, Nueces County / Corpus Christi.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/port-corpus-christi.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md South Texas source `port-corpus-christi`. HTML scrape of `portofcc.com/about/procurement/`, matches PDF + procurement-subpage anchors. source_authority=port_authority, Nueces County / Corpus Christi.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/laredo-city.ts
**Implements:** SPEC-zedcor-z10-multi-metro.md South Texas source `laredo-city`. HTML scrape of `cityoflaredo.com/purchasing`, anchor PDFs are the opportunities, PDFs skipped from enrichment. source_authority=city_purchasing, Webb County / Laredo.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

## Sprint Z7 — Contact resolver (Hunter / Apollo / pattern)

**State:** PR #494 on `feat/zedcor-z7-contact-resolver`. Spec: `Specs/SPEC-zedcor-z7-contact-resolver.md` (also at `/Users/kylekesterson/Documents/Claude/Unicron/Specs/SPEC-zedcor-z7-contact-resolver.md`). Three-layer external contact resolution layered on top of Z3.5's gc_metadata: Hunter.io → Apollo.io → free email-pattern guesser with DNS MX validation. Strictly additive on `lib/orchestrator/orchestrator.ts` (new Wave 2.6 between Z3.5 enrichment and Wave 3 Notion writes); `lib/notion/zedcor-writer.ts` unchanged (existing gc_contact_* mapping already covers the resolved fields). Z6 / Z8 / Z10 territories untouched.

### Migrations

#### Pathfinder/supabase/migrations/20260528_zedcor_z7_contact_resolution_cache.sql
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"File ownership" — adds `pathfinder.contact_resolution_cache` (90-day cache, indexed on `lower(company_name), cached_at desc`) and `pathfinder.api_usage_log` (provider/units/called_at counter used by the monthly-quota throttle). Both `CREATE TABLE IF NOT EXISTS`, idempotent against rerun.
**Last verified against spec:** 2026-05-28.
**Drift:** none — purely additive; no existing rows rewritten.

### Lib

#### Pathfinder/lib/adapters/zedcor/contact-cache.ts
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"Soft caps" + cache layer for the three-layer resolver. `normalizeCompanyName()` strips corporate suffixes (inc, llc, llp, ltd, corp, co, company, holdings, group, construction, builders, building) iteratively + lowercases for stable cache keys. `readContactCache()` returns the most-recent cache row within 90 days; `writeContactCache()` persists on hits. `isProviderThrottled()` returns true at >=80% of Hunter's 25/mo or Apollo's 60/mo free-tier quota (read via `getMonthlyUsage()` summing `pathfinder.api_usage_log.units` since the first of the current UTC month).
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/zedcor/email-pattern-guesser.ts
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"Layer 3". `inferDomainCandidates()` derives plausible domains (joined / hyphenated / first-two / first-word stems × com/net/co TLDs, deduped). `generateEmailCandidates()` emits generic mailboxes (`contact@`, `info@`, `estimating@`, `projects@`, `office@`) since we don't know the real person. `guessContactEmail()` returns the first MX-validated candidate; confidence 0.3 (low) per spec.
**Last verified against spec:** 2026-05-28.
**Drift:** **minor.** Spec lists `firstname.lastname@`, `first.last@`, `firstinitial.lastname@`, `firstname@` patterns. We default to generic mailboxes since we don't have a person name at Layer 3; the resulting contact_name is "Project Manager" per spec ("Contact name defaults to 'Project Manager' / generic title since we don't know the real person"). When Layer 1/2 returned a person, those layers populate the name + role directly.

#### Pathfinder/lib/adapters/zedcor/external-contact-resolver.ts
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"Three-layer resolver". Entry point `resolveExternalContact(companyName, context)`:
- Cache lookup first (90-day TTL).
- Layer 1 (`HUNTER_API_KEY`): `GET https://api.hunter.io/v2/domain-search?company=…&type=executive&limit=10`, role-filtered to PM/Construction/Procurement/Subcontract/Operations, ranked by role-match then confidence. Logs api_usage_log row regardless of hit/miss (Hunter counts both).
- Layer 2 (`APOLLO_API_KEY`): `POST https://api.apollo.io/v1/mixed_people/search` with `q_organization_name` + `person_titles` filter; prefers `email_status=verified` rows.
- Layer 3: pattern guesser. Always runs.
- Both Hunter + Apollo skip gracefully when the env key is absent OR when the monthly throttle (80%) trips. On a successful resolve, writes back to `pathfinder.contact_resolution_cache`.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — additive)
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"Hooks". New `runZedcorZ7ContactResolutionWave(runId, enrichedById)` inserted between Z3.5's `enrichEligibleProjects` try/catch and Wave 3's Notion writes. Iterates the in-memory `enrichedById: Map<string, GcMetadata>` produced by Z3.5; skips rows that already have `gc_contact_email`; calls `resolveExternalContact()` for each remaining row with `gc_name`. On a hit, merges the resolved fields into the GcMetadata object in place (so Wave 3's Notion writer reads them without re-querying) and persists the merged `gc_metadata` jsonb to `pathfinder.projects` (including `contact_resolution_layer` attribution — 1/2/3 or 'cache'). Soft cap `DEFAULT_CONTACT_RESOLUTION_CAP_PER_RUN=100`, overridable via `ZEDCOR_CONTACT_CAP`. Failures are logged as `zedcor_z7_contact_resolution_project_failed` and never halt the wave; wave-level failures log `zedcor_z7_contact_resolution_failed` and the orchestrator proceeds to Wave 3 with whatever Z3.5 produced.
**Last verified against spec:** 2026-05-28.
**Drift:** none — append-only; existing Waves 1-3 + Z4 pitch wave untouched.

### Scripts

#### Pathfinder/scripts/backfill-contact-resolution.ts
**Implements:** SPEC-zedcor-z7-contact-resolver.md §"Acceptance criteria" + §"File ownership". Standalone walker that selects pathfinder.projects rows where `gc_metadata->>'gc_name' IS NOT NULL AND gc_metadata->>'gc_contact_email' IS NULL`, applies the same three-layer resolver, persists merged `gc_metadata`, and updates the corresponding Notion page via `updateProjectEnrichmentInNotion()`. Supports `--dry-run`, `--cap=N` (default 100; also honors `ZEDCOR_CONTACT_CAP`), and `--notion=false`. Reads env from `.env.production.local` → `.env.local` → `.env` in order.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

### Tests

#### Pathfinder/__tests__/adapters/zedcor-contact-resolver.test.ts
**Implements:** unit coverage for the pure functions in `contact-cache.ts` (`normalizeCompanyName`) and `email-pattern-guesser.ts` (`inferDomainCandidates`, `generateEmailCandidates`). 7 tests, all passing 2026-05-28. Network-touching layers (Hunter / Apollo / DNS) are deferred to integration verification via the backfill smoke (`--cap=5 --dry-run`).
**Last verified against spec:** 2026-05-28.
**Drift:** none.

---

## Sprint Z12 — GC enrichment + pipeline visibility fixes

**State:** PR #499 open at commit `5596285` on `feat/zedcor-z12-gc-enrichment-fixes`. Three migrations applied pre-merge to `anfihcusvekpovcchpoh` (org-id fix, Fort Bend purge, tx-bid-tabs awarded-contractor backfill).

### Migrations

#### Pathfinder/supabase/migrations/20260528_zedcor_z12_org_id_fix.sql
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → org-id repair. UPDATE on pathfinder.zedcor_customer_sites slug→UUID.
**Last verified against spec:** 2026-05-28.
**Drift:** none. Pre-apply COUNT showed all 3,627 rows already on UUID; migration is a no-op safety net.

#### Pathfinder/supabase/migrations/20260528_zedcor_z12_fort_bend_purge.sql
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → Fort Bend purge.
**Last verified against spec:** 2026-05-28.
**Drift:** none. Pre-apply COUNT showed 0 fort-bend-county rows in pathfinder.projects; statement remains for future safety.

#### Pathfinder/supabase/migrations/20260528_zedcor_z12_tx_bid_tabs_awarded.sql
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → tx-bid-tabs awarded contractor. Sets `prime_contractor_name` + `raw_payload.awarded_to` on the three existing tx-bid-tabs mobilization rows using apparent-low-bidder data from `data.texas.gov/de7b-7dna` SODA.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Adapters

#### Pathfinder/lib/adapters/sources/fort-bend-county.ts (rewrite)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → rewrite to mirror galveston-county.ts gold standard. Bonfire JSON only; landing-page fallback removed because Fort Bend County stopped publishing solicitations on the landing page (verified 2026-05-28). The pre-Z12 fallback scraped historical "Tabulations" archive rows and page-nav tiles.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/tx-bid-tabs.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → tx-bid-tabs awarded-contractor extraction. Socrata SODA adapter for data.texas.gov/de7b-7dna emitting one row per project with `bid_rank_sequence_number='1' AND low_bidder_flag=true` as `prime_contractor_name` + `raw_payload.awarded_to`. `source_authority='state_dot'`, `project_stage='mobilization'`, `buy_window_open=true`.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/index.ts (modified — additive)
**Implements:** SOURCE_ADAPTERS registration of `tx-bid-tabs`. Existing 39 adapter registrations untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Zedcor pipeline

#### Pathfinder/lib/adapters/zedcor/construction-keywords.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → shared construction-relevance gate. Exports `CONSTRUCTION_KEYWORDS` and `isConstructionRelevant(...fragments)`. Consumed by cross-pollination.ts and notion/zedcor-writer.ts.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/zedcor/cross-pollination.ts (modified — additive)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → construction-relevance gate before fuzzy-match. New `projectTitle` + `projectSummary` opts; when both are absent, gate is bypassed (back-compat). When provided and neither contains a construction keyword, the engine short-circuits to "Skipped — title not construction-relevant" without scoring zedcor_customer_sites. Prevents federal-product false positives like "FRENCH PRESS" → National Homes.
**Last verified against spec:** 2026-05-28.
**Drift:** none — existing callers without projectTitle/projectSummary keep original behavior.

#### Pathfinder/lib/notion/zedcor-writer.ts (modified — additive)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → loosen filter. Exports new `shouldWriteToZedcorNotion(input)` predicate: true when `buy_window_open=true` OR `source_authority ∈ CONSTRUCTION_AUTHORITIES` AND `project_stage ∈ ELIGIBLE_PRE_WINDOW_STAGES` AND title/summary passes construction-keyword gate. Existing writer functions untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — additive)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → wire construction gate into the pitch wave. `resolveCrossPollination` call now passes `projectTitle: p.title, projectSummary: p.summary` so the gate activates inline.
**Last verified against spec:** 2026-05-28.
**Drift:** none — strictly additive.

### Scripts

#### Pathfinder/scripts/verify-z6-production.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"Execution sequence" #7. Reports SCRAPINGBEE_API_KEY presence and runs native → scrapingbee → playwright probes against a Bonfire URL. Honestly documents that the scrapingbee + playwright layers are not yet wired in `detail-page-fetcher.ts`.
**Last verified against spec:** 2026-05-28.
**Drift:** documented honest failure — Z6 layer infrastructure missing.

#### Pathfinder/scripts/trigger-z6-news-sources.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"Execution sequence" #8. Invokes the 5 named news adapters from `SOURCE_ADAPTERS`. Honestly documents that all 5 are unregistered (adapter files do not exist in lib/adapters/sources/).
**Last verified against spec:** 2026-05-28.
**Drift:** documented honest failure — Z6 news adapters missing.

#### Pathfinder/scripts/backfill-cross-pollination.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"Execution sequence" #10. Re-runs `resolveCrossPollination` (with Z12 construction gate) across Zedcor projects that have `gc_metadata.gc_name`. Writes result into `pitch_metadata.cross_pollination` (merge-preserving other pitch_metadata keys). Reports warm-intro count and federal-product regression check.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file). Effective output gated by Z3.5/Z6 having populated gc_name first.

#### Pathfinder/scripts/backfill-zedcor-notion-prewindow.ts (new)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"Execution sequence" #13. Notion writer pass that loads Zedcor projects missing `notion_lead_id`, filters via `shouldWriteToZedcorNotion`, and pushes through `writeProjectToNotion`. Idempotent.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/scripts/backfill-pitch-generation.ts (modified — additive)
**Implements:** SPEC-zedcor-z12-gc-enrichment-fixes.md §"File ownership" → pass `projectTitle`/`projectSummary` to `resolveCrossPollination` so the Z12 construction gate activates in this script too.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

---

## Sprint Z13 — Real Z6 build (fetcher bypass + 5 news adapters)

**State:** PR opening at `feat/zedcor-z13-real-z6-fetcher-news` against `main` (post-Z12 squash `78a4e96`). One Supabase migration applied pre-merge.

### Migration

#### Pathfinder/supabase/migrations/20260528_zedcor_z13_news_data_sources.sql
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"Registry + seed". INSERTs 5 new pathfinder.data_sources rows (one per Z13 news/aggregator adapter) scoped to the Zedcor org UUID. Idempotent via ON CONFLICT DO NOTHING.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Fetcher bypass

#### Pathfinder/lib/adapters/zedcor/detail-page-fetcher.ts (upgraded)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"Fetcher bypass". 4-layer tiered chain: Layer 1 (native fetch w/ browser UA) → Layer 2 (ScrapingBee `render_js=true&premium_proxy=true&block_resources=false&wait=2000`, `SCRAPINGBEE_API_KEY`) → Layer 3 (Playwright via @sparticuz/chromium + playwright-core, 30s) → Layer 4 (log `fetch_status='cloudflare_blocked'` with response excerpt, continue). Adds `useBypassFetcher` opt + Cloudflare-challenge detector regex set. Result type extended with `fetchedVia` + `layerAttempts` + `cloudflareExcerpt` (back-compatible: existing callers ignore new fields). Honors the Z13 robots-policy whitelist (skips robots.txt for `*.bonfirehub.com`, `*.ionwave.net`, and the explicit per-host whitelist).
**Last verified against spec:** 2026-05-28.
**Drift:** none.

#### Pathfinder/lib/adapters/zedcor/robots-policy.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"Fetcher bypass". Pure-function helpers `isWhitelisted(url)` + `fetchStrategyFor(url)`. Whitelist scopes: `*.bonfirehub.com`, `*.ionwave.net`, `*.workdayspend.com`, `*.demandstar.com`, `*.publicpurchase.com`, `*.bidcontract.com`, plus 35 explicit Texas county/city/agency hosts.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

### News adapters (mirror galveston-county.ts gold standard)

#### Pathfinder/lib/adapters/sources/news-engineering-record.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"5 new news adapters" → ENR Texas awards. Fetches `https://www.enr.com/topics/263-awards?topic=263&region=TX`, walks `.article-list-item / .article-card / article`, filters titles by award keywords, emits `project_stage='awarded'`, `phase_confidence=0.9`, `buy_window_open=true`, `source_authority='news_report'`.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/texas-construction-industry.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"5 new news adapters" → TX construction industry digest. Tries RSS feed `https://www.txconstructionindustry.com/feed/` first, falls back to landing HTML. Per-row stage inference (breaks-ground→mobilization, completes→subs_selected, default→awarded).
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/demandstar-texas.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"5 new news adapters" → DemandStar TX. Primary path: `https://api.demandstar.com/v2/buyer/notices?state=TX&pageSize=100` (JSON). Fallback: scrape `https://www.demandstar.com/search?state=TX` notice-cards. All rows `source_authority='public_construction'`, `project_stage='solicitation'`, `buy_window_open=true`.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/houston-business-journal.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"5 new news adapters" → HBJ construction news. Walks anchors under `https://www.bizjournals.com/houston/news/construction`, filters by award keywords. Deduplicates by source_event_id (template emits duplicate image+headline anchors per article). Title+deck only; detail pages are paywalled — the Z13 fetcher chain handles those at enrichment time.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/builders-exchange-texas.ts (new)
**Implements:** SPEC-zedcor-z13-real-z6-fetcher-news.md §"5 new news adapters" → BX Texas project leads. Walks table or card layout at `https://www.bxtexas.org/projects`. All rows `source_authority='public_construction'`, `project_stage='solicitation'`, `phase_confidence=0.75`.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/index.ts (modified — additive)
**Implements:** SOURCE_ADAPTERS registration of the 5 new Z13 adapters. Existing 40 adapter registrations untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Sprint Z14 — RSS news adapters + free GC enrichment path

#### Pathfinder/lib/adapters/zedcor/news-gc-extractor.ts (new)
**Implements:** SPEC-zedcor-z14-rss-news-free-contact-path.md §"News adapter RSS conversion" → two-layer GC-name extractor for RSS-feed snippets. Layer 1: regex (5 patterns covering award-verb frames + "general contractor X" + "team led by X" + "awarded to X"). Layer 2: Anthropic Sonnet fallback gated on `ANTHROPIC_API_KEY` (graceful no-op when absent). Stop-word list rejects owner-side titles ("Owner", "Authority", "City", "County", etc.). Critically: regexes do NOT use the `/i` flag because that turns `[A-Z]` into `[A-Za-z]` and breaks the capitalized-token guarantee; case alternation is inlined per verb.
**Last verified against spec:** 2026-05-28.
**Drift:** none (new file).

#### Pathfinder/lib/adapters/sources/news-engineering-record.ts (rewrite)
**Implements:** SPEC-zedcor-z14-rss-news-free-contact-path.md §"News adapter RSS conversion" → ENR RSS adapter. Swapped from Z13's HTML scrape (Cloudflare-shielded `/topics/263-awards`) to the public RSS at `https://www.enr.com/rss/articles` (verified live 200 OK with desktop-Chrome User-Agent — ENR has no per-topic/per-region feeds, so Texas/Gulf-state filtering is done post-fetch by scanning title+description). Award keywords + geofence keywords gate each item. Surviving items go through news-gc-extractor to populate `raw_payload.gc_name` at ingest time. Phase=awarded, confidence=0.9, buy_window_open=true. Per-item state inferred from text (defaults TX so geofence doesn't drop the row).
**Last verified against spec:** 2026-05-28.
**Drift:** Z13's `region=TX` filter URL is replaced — no Texas-filtered RSS exists. Post-fetch geofence approximates the same effect.

#### Pathfinder/lib/adapters/sources/houston-business-journal.ts (rewrite)
**Implements:** SPEC-zedcor-z14-rss-news-free-contact-path.md §"News adapter RSS conversion" → HBJ RSS adapter. Swapped from Z13's HTML scrape to the public RSS feed at `https://www.bizjournals.com/houston/news/construction/feed` (configurable via `HBJ_FEED_URL` env). Award keywords AND construction keywords both required (titles like "X wins lawsuit" pass the award gate but should not surface as construction projects). Surviving items go through news-gc-extractor to populate `raw_payload.gc_name`. State=TX, City=Houston. Per-item stage inference (breaks-ground→mobilization, completes→subs_selected, default→awarded).
**Last verified against spec:** 2026-05-28.
**Drift:** Verified locally that the construction/feed path returns 404 from this network (Cloudflare); URL is now env-configurable so Vercel can override without code change.

#### Pathfinder/lib/adapters/zedcor/gc-extractor.ts (modified — additive)
**Implements:** SPEC-zedcor-z14-rss-news-free-contact-path.md §"New backfill" → extended `ExtractionLayer` union with `'prime_contractor_field'` literal so the new Z14 backfill can tag gc_metadata.extraction_layer without a type assertion. Existing layers (`html`, `anthropic`, `sonar`, `mixed`, `none`) untouched.
**Last verified against spec:** 2026-05-28.
**Drift:** none.

### Sprint Z14.1 — adapter URL cleanup + pattern-guesser quality filter

#### Pathfinder/lib/adapters/sources/builders-exchange-texas.ts (rewrite)
**Implements:** Z14.1 cleanup → bxtexas.org DNS dead (verified 2026-05-29). Repointed adapter to https://www.virtualbx.com — "Virtual Builders Exchange — Commercial Construction Leads for Texas". WordPress RSS at /feed (~10 fresh items per refresh, real TX commercial lead content verified live). Same RSS-parse + news-gc-extractor pattern as Z14 ENR/HBJ adapters. Per-item stage inference (breaks-ground → mobilization, completes → subs_selected, awarded/wins → awarded, default → solicitation). VBX_FEED_URL env override available. Adapter id stays `builders-exchange-texas` for downstream lineage stability.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

#### Pathfinder/lib/adapters/zedcor/email-pattern-guesser.ts (modified — additive)
**Implements:** Z14.1 quality filter. New `rejectLowQualityDomain` (rejects stop-word roots {the, and, of, inc, llc, co} + roots with <3 alpha chars) and `rejectLowQualityEmail` (rejects `contact@<root-where-len<6>`). Both gate before MX lookup to avoid wasted DNS calls on parked domains. `PatternGuessResult` gains a `skipped: PatternSkip[]` field — additive, existing callers unaffected. Reason: Z14 backfill produced `contact@the.com`, `contact@ma.com`, `contact@opr.com` because the suffix-stripper left bare stopwords / 2-letter initials as domain roots and those domains have valid MX records (parked).
**Last verified against spec:** 2026-05-29.
**Drift:** none.

#### Pathfinder/lib/adapters/zedcor/external-contact-resolver.ts (modified — additive)
**Implements:** Z14.1 surface PatternSkip array so backfill scripts can aggregate skip counts. resolveViaPattern emits `[pattern-guesser] skipped <candidate> (<reason>) for "<company>"` per skip — caller (backfill-contact-resolution.ts) hooks console.log to total + group by reason.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

### Sprint Z14.2 — wire news adapters into orchestrator polling

#### Pathfinder/lib/adapters/sources/index.ts (modified — additive)
**Implements:** Z14.2 wire-in. Adds `ZEDCOR_NEWS_SOURCE_SLUGS` (4 live news adapters; texas-construction-industry excluded — paused in Z14.1) and `ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS` (combined Z1A 10 + news 4 = 14). Existing `ZEDCOR_Z1A_SOURCE_SLUGS` constant + `ZEDCOR_Z10_SOURCE_SLUGS` constant untouched. SOURCE_ADAPTERS registry untouched.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — swap import)
**Implements:** Z14.2 wire-in. Swapped import + 4 in-file references from `ZEDCOR_Z1A_SOURCE_SLUGS` to `ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS`. Net effect: `sources_polled` jumps from 10 to 14 per Run Zedcor invocation. Verified live (run_id 6694, 6695: `sources_polled=14`). No other orchestrator logic touched — same Wave 1 parallel poll, same Wave 2-3 scoring + Notion writes downstream.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

#### Pathfinder/lib/orchestrator/run-source.ts (modified — additive)
**Implements:** Z14.2 observability — stamps `pathfinder.data_sources.last_polled_at` (always) and `last_event_at` (when adapter produced ≥1 candidate) at adapter completion. Pre-Z14.2 the orchestrator never wrote these columns (verified: every row had `last_polled_at = NULL`). New `bumpDataSourceTimestamps(slug, candidatesFound)` helper called from all 3 reachable-adapter return paths (poll-threw, empty, normal end); silently no-ops on Supabase errors so observability writes never block runs. Resolves the data_sources row by `metadata->>'source_slug'` (canonical adapter slug). Verified live: all 4 news adapters + Z1A sources show `last_polled_at` at 2026-05-29T02:39:55Z after run_id 6695.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

#### Pathfinder/lib/adapters/sources/builders-exchange-texas.ts (modified — bugfix)
**Implements:** Z14.2 bugfix — default `VBX_FEED_URL` now uses trailing-slash `/feed/` instead of `/feed` because virtualbx.com 301-redirects the latter. Node `fetch` follows redirects by default but skipping the hop is faster and avoids edge cases where env-overridden values may not follow. Verified live: HTTP 301 → 200 on /feed/ direct. Note: Node 26 local fetch fails on virtualbx.com cert chain (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`); Vercel Node runtime expected to succeed.
**Last verified against spec:** 2026-05-29.
**Drift:** none.

---

## Stream A, Foundation (Internal rework)

**State:** PR open against `main` at branch `feat/stream-a-foundation` (2026-05-30). Auto-merge gate: human-merged per project CLAUDE.md "Never merge your own PR". Plan: `Pathfinder/docs/PLAN-stream-a-foundation.md`.

Stream A is plumbing only. The catalog renderer is not yet wired into `app/[slug]/page.tsx` or `app/[slug]/leads/[projectId]/page.tsx`. Surface streams B/C/D wire the renderer in and replace the floor stubs with real components.

### Catalog (Pathfinder/lib/catalog/)

#### Pathfinder/lib/catalog/types.ts (new)
**Implements:** PLAN-stream-a-foundation.md Slot grammar + Dependency grammar + ModuleDefinition + OrgModuleEntry + ValidationResult + SlotResolution + GateContext. Defines the eleven-entry `ModuleId` union.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/registry.ts (new)
**Implements:** PLAN section "Module registry, eleven entries". Registers `ranked-feed`, `company-detail`, `outreach-composer`, `hubspot-sync` (slotMode=action-affordance), `pipeline-kanban`, `filter-rail`, `warm-intro-panel`, `kpi-strip`, `analytics-charts`, `daily-digest`, `geo-map`. Component refs delegate to `floor-stubs`. Config schemas: `KpiStripConfig` (metrics min-1), `AnalyticsChartsConfig` (emphasis enum), `FilterRailConfig` (optional fields list), `NoConfig` elsewhere.
**Last verified against spec:** 2026-05-30.
**Drift:** none. Slot-collision resolution for hubspot-sync uses `slotMode: 'action-affordance'` so `validateOrgModules` exempts it from the one-module-one-slot check.

#### Pathfinder/lib/catalog/floor-stubs.tsx (new)
**Implements:** PLAN "Component refs are lazy stubs that render the floor for now". Each module id has a `data-module-stub` marker component returned via `() => Promise.resolve({default: Stub})` so the registry's loader contract is stable while stubs ship.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/validation.ts (new)
**Implements:** PLAN "PART 2, validateOrgModules" and the shared `checkSyncDep` helper. Codes: `unknown_module_id`, `slot_collision`, `pinned_version_missing`, `config_schema_failure`, `hard_gate_unmet`. Synchronous hard-gate enforcement for `integration` + `schema_field` + `agent`; defers `data_signal` to render-time `resolveGate`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/gating.ts (new)
**Implements:** PLAN "resolveGate" + `resolveAllGates` + production `makeSupabaseGateContext`. Sentinel `__configured_filters__` and `__configured_metrics__` expand per per-org config. Production gate context's `SIGNAL_QUERIES` map starts conservative (unknown ref falls closed to false).
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/renderer.ts (new)
**Implements:** PLAN "Renderer slot resolution" + `resolveAllSlots` convenience. Modes: `active` | `inactive` | `floor` | `hidden`. Never crashes on misconfiguration; logs via injectable `log` hook (defaults to `console.warn`) and degrades. Action-affordance modules with met gates are resolved inside `SlotResolution.affordances` for the slot owner.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/index.ts (new)
**Implements:** single-import surface for surface streams. Re-exports types + registry + validation + gating + renderer.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Org-context navigation helper

#### Pathfinder/lib/nav/orgPath.ts (new)
**Implements:** PLAN PART 4 "buildOrgPath" helper. Always prefixes `/${slug}`, URL-encodes segments unless `{ raw: true }`, strips leading slashes, throws on empty slug. Convenience wrappers `orgPaths.dashboard|leads|leadDetail|pipeline`. Surface streams import this for every internal link so org slug is never dropped.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Design tokens

#### Pathfinder/lib/design/tokens.ts (new)
**Implements:** PLAN PART 5 design tokens. Palette captured from `components/zedcor/ZedcorLeadList.tsx` so the rework surfaces match Zedcor calibration: `bg #0e1116`, `border rgba(91,127,255,0.20)`, `accent #5B7FFF`, `scoreHi #FFB454`, `scoreMid #3DDC97`, mono `var(--font-jetbrains-mono)`. `scoreColor(n)` threshold helper (>=80 hi, >=60 mid, else low) matches the Zedcor `ScorePill`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Additive edits to existing lib/ files

#### Pathfinder/lib/types/architecture.ts (modified, additive)
**Implements:** PLAN "Additive edits". Added optional `modules?: import('@/lib/catalog/types').OrgModulesBlock` to `OrgArchitecture`. Inline type import keeps `lib/types` agnostic of `lib/catalog` at module-graph level.
**Last verified against spec:** 2026-05-30.
**Drift:** none. Pre-existing `ui_plan` shape and every other field untouched. Architect agent emissions remain valid.

#### Pathfinder/lib/config/resolveArchitecture.ts (modified, additive)
**Implements:** PLAN "Additive edits". Pass-through of `partial.modules` into the resolved architecture so persisted org modules surface to the renderer. Cloned, never base-merged (modules are wholly per-org).
**Last verified against spec:** 2026-05-30.
**Drift:** none. Existing tests in `__tests__/config/resolveArchitecture.test.ts` continue to pass unchanged (verified locally).

### Migration

#### Pathfinder/supabase/migrations/20260530_internal_modules_block.sql (new)
**Implements:** PLAN PART 3. `jsonb_set` adds top-level `modules` key into `pathfinder.organizations.architecture` WHERE `slug='internal'`. WHERE clause is the physical guarantee Zedcor / Realberry / Funder are untouched. Verification script: `scripts/verify-orgs-byte-unchanged.ts`.
**Last verified against spec:** 2026-05-30 (statically reviewed; applied to live DB after PR merge).
**Drift:** none.

---

## Stream D, Pipeline and Delivery (Internal rework)

**State:** branch `stream-d-pipeline-delivery` off post-Stream-A main at `3c2c927`. Plan: `Pathfinder/docs/PLAN-stream-d-pipeline-delivery.md`. Replaces the two Stream A floor stubs `pipeline-kanban` (slot `pipeline.board`) and `daily-digest` (slot `delivery.digest`) with real implementations for Internal (#4). Zedcor and Funder unaffected.

### Pipeline kanban module

#### Pathfinder/lib/catalog/modules/pipeline-kanban/internalStageMap.ts (new)
**Implements:** SPEC §STREAM D Internal stage list. 1:1 mapping between Internal pipeline stage ids (`new-outreach-ready`, `contacted`, `in-conversation`, `demo-scheduled`, `proposal`, `won`, `lost`) and the existing `DealPipelineStage` enum so the module can reuse `/api/deals/[id]/stage` without any backend or schema change.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/pipeline-kanban/PipelineKanbanModule.tsx (new)
**Implements:** SPEC §STREAM D Module 1. Server entry. Hydrates `deals` joined to `projects` filtered by `org.id`, buckets by `DEAL_TO_INTERNAL`, hands the pre-grouped shape to the client island. Reads `architecture.pipeline.stages` and `architecture.pipeline.stage_labels`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland.tsx (new)
**Implements:** SPEC §STREAM D Module 1 drag-and-drop semantics. `'use client'` island. HTML5 native drag (matches Zedcor `components/pipeline/PipelineKanban.tsx`). On drop: optimistic update, POST `/pathfinder/api/deals/[id]/stage` with `to_stage = INTERNAL_TO_DEAL[stage]`, revert on non-2xx. Card click navigates via `orgPaths.leadDetail(slug, projectId)` so the org slug survives URL encoding of project ids. Uses Stream A design primitives (`Card`, `ScoreBadge`, `EmptyState`, tokens) so cards match the ranked-feed visual language.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Daily digest module

#### Pathfinder/lib/catalog/modules/daily-digest/runner.ts (new)
**Implements:** SPEC §STREAM D Module 2. Pure-ish runner `runInternalDailyDigest`. Hard gates: returns `{ skipped: 'no_verified_companies' }` when zero verified projects in the window; returns `{ skipped: 'no_slack_integration' }` when `INTERNAL_SLACK_WEBHOOK_URL` is unset; in both cases does NOT post to Slack and does NOT seed deals. Reuses `composeInternalDigest` and the existing Slack POST path; new-verified loader seeds at `INTERNAL_TO_DEAL['new-outreach-ready']` (NEW) only for projects without an existing deal.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/daily-digest/DailyDigestModule.tsx (new)
**Implements:** SPEC §STREAM D Module 2 catalog binding. Non-visual component bound by `FLOOR_STUB_LOADERS['daily-digest']`. Fallback strategy `hidden` per Stream A registry; this module exists so the catalog has a real lazy import instead of the marker stub. Delivery runs via `app/api/cron/internal-digest/route.ts`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Catalog binding update

#### Pathfinder/lib/catalog/floor-stubs.tsx (modified — additive)
**Implements:** Stream D wiring of `FLOOR_STUB_LOADERS['pipeline-kanban']` and `FLOOR_STUB_LOADERS['daily-digest']` to lazy imports of the two new module entries. Every other slot continues to point at the Stream A stub (Stream B/C will replace theirs).
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Surface wiring

#### Pathfinder/app/[slug]/pipeline/page.tsx (modified — additive)
**Implements:** SPEC §STREAM D pipeline route discovery: when the org's `architecture.modules` claims slot `pipeline.board` (Internal #4 does, Funder #3 does not), the page short-circuits to the catalog renderer and mounts the resolved module. Orgs without a modules block fall through and render byte-identical to today (Funder behavior unchanged).
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Cron route refactor

#### Pathfinder/app/api/cron/internal-digest/route.ts (modified)
**Implements:** delegation to `runInternalDailyDigest` for the daily-digest module. Auth + query-string parsing unchanged. Response shape: `slack_result` now carries `{ skipped: 'no_slack_integration' | 'no_verified_companies' | 'dry_run' } | { ok, error? }` (added the two hard-gate skip reasons; pre-existing `no_webhook` rename to `no_slack_integration` is the only response-shape delta).
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Cron schedule

#### Pathfinder/vercel.json (modified — additive)
**Implements:** SPEC §STREAM D digest cron registration. Appended `{ path: '/api/cron/internal-digest', schedule: '0 14 * * 1,2,3,4,5' }` (Mon–Fri 14:00 UTC, weekday morning US Pacific). Numeric day-of-week per CLAUDE.md and per SPEC ("If a cron schedule is touched, use a numeric day-of-week"). Existing `functions` block untouched.

---

## Sprint Z17 — Manual trigger runs full pipeline (no cron dependency)

**State:** PR #508 on `z17-manual-full-pipeline`. Spec: `Company Docs/Specs/SPEC-zedcor-Z17.md`. Restores end-to-end completion to the manual `runZedcorOrchestrator()` path so a single trigger of Run Zedcor produces fully-enriched Notion Lead Feed rows with Vercel crons disabled. Closes the silent-write bug in `updateProjectScore` that had been dropping every manually-ingested row's score on the floor.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — bugfix + additive)
**Implements:** SPEC-zedcor-Z17.md §"Diagnosis sequence" + §"Fix" + §"Acceptance criteria". Drops the non-existent `ranked_by` column from `updateProjectScore` (UPDATE was silently 42703-erroring against the live schema; `error` field never inspected). Surfaces write failures via a thrown Error. Reorders waves so pitch generation runs BEFORE Notion writes so the Notion gate can withhold in-window rows that lack pitch hooks. Adds `isReadyForNotion()` gate calling the already-exported `shouldWriteToZedcorNotion` (Z12) plus a score-present check and an in-window pitch-hooks-required check. Adds `runZedcorZ17Backfill()` Wave 5 that pulls pre-existing un-enriched construction-relevant rows (non-federal) and runs them through score → GC → pitch → Notion-gated; capped at `ZEDCOR_Z17_BACKFILL_CAP=30` per run. Drops the legacy `ZEDCOR_DISABLE_ANTHROPIC` kill-switch from `isPitchEnabled` (per spec hard rules: no paid-key dependence for core stages). Adds per-stage counts to `run_metadata`: `scored, gc_resolved, contact_resolved, hooks_generated, notion_withheld, backfill_attempted/scored/gc_resolved/hooks_generated/notion_writes`. Adds `ZEDCOR_Z17_SKIP_NOTION` diagnostic escape hatch read by the new `notionDisabled()` helper so `scripts/diagnose-z17-full-pipeline.ts` can verify the chain against the live DB without the Vercel-only `NOTION_API_TOKEN` secret; the hatch is unset in production.
**Last verified against spec:** 2026-05-30. Live runs 6716, 6717, 6718 against `pathfinder.projects` (Zedcor org) confirmed acceptance criteria 1-6 — full evidence in `Pathfinder/docs/Z17-DOSSIER.md`.
**Drift:** none.

#### Pathfinder/lib/orchestrator/zedcor-scorer.ts (modified — bugfix)
**Implements:** SPEC-zedcor-Z17.md §"Hard rules" → no paid-key dependence for core stages. Removes the misnamed `anthropicEnabled()` gate that had wrapped the scorer's deterministic 0..100 arithmetic — none of the math calls Anthropic, so returning `{ score: null, rationale: '(scoring disabled)' }` when `ZEDCOR_DISABLE_ANTHROPIC=true` (or `ANTHROPIC_API_KEY` unset) was a trap that caused the Notion writer to stamp the `(scoring disabled)` sentinel on every row regardless of why the score was null. Scorer now always produces a real score.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

---

## Stream B , Internal Dashboard surface

**State:** PR open on branch `feat/stream-b-dashboard` at `37afc8c` (2026-05-30). Pending Kyle merge per Pathfinder/CLAUDE.md "Never merge your own PR".

### Module 1 , ranked-feed (slot dashboard.hero)

#### Pathfinder/lib/catalog/modules/ranked-feed/labels.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B "real values with human labels, never raw schema keys". Single chokepoint Stream B modules call to translate a schema key into the user-facing label. Reads `architecture.lead_unit.schema[key].display_label` and falls back to a humanized key form when the entry is missing.
**Last verified against spec:** 2026-05-30 (4/4 unit tests).
**Drift:** none.

#### Pathfinder/lib/catalog/modules/ranked-feed/data.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `ranked-feed` data layer. Queries `pathfinder.projects` scoped to one org with `score IS NOT NULL`, score desc, default cap 50; applies the shared filter narrowing from `filter-rail/applyFilters` so ranked-feed and filter-rail agree on the visible set. Returns empty array on Supabase error so the renderer falls back to the designed EmptyState.
**Last verified against spec:** 2026-05-30 (5/5 unit tests, including the score-desc invariant).
**Drift:** none.

#### Pathfinder/lib/catalog/modules/ranked-feed/RankedFeed.tsx (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `ranked-feed` renderer. Reuses `lib/agents/internal/companyLeadView.projectToCompanyLeadView` so the same Internal projection backs both the dashboard and the existing detail view. Each card surfaces company name, service category, operating footprint, sales motion, score badge top-right, and a one-line "why" clamped from the rationale. Wraps each card in `next/link` with `href` built via `lib/nav/orgPath.buildOrgPath` so the org slug is never dropped.
**Last verified against spec:** 2026-05-30 (7/7 render tests via jsdom).
**Drift:** none.

### Module 2 , filter-rail (slot dashboard.filters)

#### Pathfinder/lib/catalog/modules/filter-rail/applyFilters.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `filter-rail` narrowing helper, shared with `ranked-feed/data.ts`. Reads enum slugs out of `raw_payload.internal_enrichment.service_category`, `raw_payload.internal_enrichment.sales_motion`, `raw_payload.internal_federal_registration`, and the top-level `Project.source` column. Missing nested fields count as non-match so the user's "filter by active-outbound" intent does not surface rows where sales_motion is absent.
**Last verified against spec:** 2026-05-30 (8/8 unit tests).
**Drift:** none.

#### Pathfinder/lib/catalog/modules/filter-rail/FilterRail.tsx (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `filter-rail` per-element soft-gate. Drops a filter whose backing schema field is absent from `architecture.lead_unit.schema`; never renders a disabled control left behind. Persists selection to URL search params via `useRouter().replace` so the slug page server component re-renders with narrowed `fetchRankedCompanies({ filters })` on next paint.
**Last verified against spec:** 2026-05-30 (6/6 render tests via jsdom + next/navigation mock).
**Drift:** none.

### Module 3 , kpi-strip (slot dashboard.kpi)

#### Pathfinder/lib/catalog/modules/kpi-strip/metrics.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `kpi-strip` resolution semantics. Each resolver returns `number | null`; null means DROP this KPI so the strip never renders a misleading zero. Resolution table per `docs/PLAN-stream-b-dashboard.md`:
- `verified_count_1d`: real zero is meaningful, renders `0`.
- `active_motion_pct`: returns null when (a) zero verified rows, (b) schema lacks `sales_motion`, or (c) schema enum has no outbound-semantic member. Fixes the false-zero in `lib/metrics/kpiQueries.ts:117`.
- `avg_score`: returns null when no scored rows; rounded mean otherwise.
- `sources_live`: count of `architecture.sources` where `type='registered'`; real zero is meaningful.
**Last verified against spec:** 2026-05-30 (11/11 unit tests).
**Drift:** none.

#### Pathfinder/lib/catalog/modules/kpi-strip/KpiStrip.tsx (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `kpi-strip` "slim and secondary, not the hero". `KpiStripView` is a pure renderer over already-resolved metrics; filters nulls before composing the strip; when every metric drops, the strip itself is absent (no empty chrome). Server-component `KpiStrip` shell calls `resolveMetrics` then hands off to the pure view.
**Last verified against spec:** 2026-05-30 (5/5 render tests).
**Drift:** none.

### Module 4 , analytics-charts (slot dashboard.charts)

#### Pathfinder/lib/catalog/modules/analytics-charts/charts.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `analytics-charts` data shapers. `byServiceCategory` reads `raw_payload.internal_enrichment.service_category` with fallback to `raw_payload.internal_inferred_service_category` and sorts desc; drops rows with no resolvable category rather than bucketing as "unknown". `verifiedOverTime` produces one entry per UTC day in the lookback window (default 14d) so the line chart has a continuous axis even at zero counts.
**Last verified against spec:** 2026-05-30 (7/7 unit tests).
**Drift:** none.

#### Pathfinder/lib/catalog/modules/analytics-charts/AnalyticsCharts.tsx (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B `analytics-charts` renderer. Bar chart (companies by service category) and line chart (verified companies over time) both inline-SVG to keep bundle small. Soft-gated per chart: an empty bar series renders the designed `EmptyState`; an all-zero line series likewise. Categories on the bar are humanized via `humanizeKey` so raw slugs never leak.
**Last verified against spec:** 2026-05-30 (5/5 render tests).
**Drift:** none.

### Integration

#### Pathfinder/app/[slug]/internalDashboardBranch.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B route integration. `shouldUseInternalDashboard(arch)` is true iff `architecture.modules` is a non-empty plain object. Stream A's migration introduced this block on Internal (#4) only; Zedcor, Realberry, and Funder continue to take the legacy rendering path so their dashboards are byte-identical to today.
**Last verified against spec:** 2026-05-30 (6/6 unit tests).
**Drift:** none.

#### Pathfinder/app/[slug]/InternalDashboard.tsx (new)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B layout composition: header + Dashboard / Companies / Pipeline nav (via `buildOrgPath`), slim secondary `KpiStrip` at top, hero grid (`FilterRail` left + `RankedFeed` right so the feed is the visual hero), `AnalyticsCharts` secondary below. `min-height: 100vh`, no overflow-clipping container, page scrolls. Fetches via `supabaseAdmin()` so behaviour matches the existing `app/[slug]/page.tsx` data layer.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/floor-stubs.tsx (modified, additive)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B "replace four floor stubs". The four `FLOOR_STUB_LOADERS` entries for `ranked-feed`, `filter-rail`, `kpi-strip`, `analytics-charts` now dynamic-import the real components. The seven other entries stay as floor stubs until Streams C and D land.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/app/[slug]/page.tsx (modified, additive)
**Implements:** SPEC-Internal-Parallel-Build.md §Stream B route integration branch. Single early return inserted after the org load: if `shouldUseInternalDashboard(rawArch)`, render `<InternalDashboard>`; else fall through to the existing layout verbatim. Existing rendering block unchanged byte-for-byte.
**Last verified against spec:** 2026-05-30 (regression confirmed via `git stash` retest of pre-existing test failures; 0 new regressions in scope).
**Drift:** none.

---

## Stream C, Detail surface (Internal rework)

**State:** PR open against `main` from branch `feat/stream-c-detail` (2026-05-30). Operator-authorized self-merge per SPEC-Internal-Parallel-Build.md AUTHORITY block. Plan: `Pathfinder/docs/PLAN-stream-c-detail.md`. Rebased onto post-B / post-D main before merge so the shared `lib/catalog/floor-stubs.tsx` and `MEMORY/spec-references.md` entries union with Streams B and D rather than replace them.

Replaces the four detail-surface floor stubs (`company-detail`, `outreach-composer`, `hubspot-sync`, `warm-intro-panel`) with real components; wires the catalog renderer into `app/[slug]/leads/[projectId]/page.tsx` only for orgs whose architecture carries a `modules` block (Internal today). Orgs without a modules block (Zedcor, Realberry, Funder) stay on the existing `<CompanyDetailContents>` path so their surfaces are byte-identical.

### New lib/ files

#### Pathfinder/lib/catalog/internalSignals.ts (new)
**Implements:** SPEC-Internal-Parallel-Build.md SCORE-COMPONENTS NOTE (the resolved-do-not-re-ask block). Pure function `extractInternalSignals(lead, raw_payload)` returns six `InternalSignal` entries in weight-descending order. Each entry carries the architecture weight and a real evidence string drawn from observable fields (`CompanyLeadView` + `raw_payload.internal_geo` + qualifier hints). NEVER emits a fabricated numeric contribution; evidence is the empty string when no observable signal fires. The ranker's total score is shown by `CompanyDetail` directly via the header `ScoreBadge`, not reconstructed.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Modified lib/ files

#### Pathfinder/lib/catalog/registry.ts (modified — additive removal)
**Implements:** SPEC SCORE-COMPONENTS NOTE: `score_components` is removed from `company-detail`'s `dependencies`. Inline comment cites the SPEC block. All other registry entries and the slot-collision resolution for `hubspot-sync` (slotMode='action-affordance') are unchanged. Stream A's `validateOrgModules` + renderer behavior remains identical for the other ten modules.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/floor-stubs.tsx (modified — Stream C swap)
**Implements:** Stream C swap point. The four detail-surface loader thunks now point at the real components under `components/catalog/modules/`: `company-detail` → `CompanyDetail`, `outreach-composer` → `OutreachComposer`, `hubspot-sync` → `HubspotSync`, `warm-intro-panel` → `WarmIntroPanel`. After the post-B / post-D rebase the file is the union of all three stream swaps: ranked-feed / filter-rail / kpi-strip / analytics-charts via Stream B (`lib/catalog/modules/<id>/<Component>.tsx`), pipeline-kanban / daily-digest via Stream D (`lib/catalog/modules/<id>/<Component>.tsx`), and the four Stream C entries above. Only `geo-map` remains Stream A's invisible marker (no org enables it). The real Stream C components consume per-page data via the `CompanyDetailContext` provider mounted by `CatalogDetailRenderer`; the file header comment notes that calling the Stream C loaders outside that provider throws with a clear message.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Sprint Z17.1 — Enrich the existing backlog on every trigger (corrective to Z17)

**State:** PR pending on `z17.1-enrich-backlog`. Spec: `Company Docs/Specs/SPEC-zedcor-Z17.1.md`. Corrective follow-up to Z17 (#508). Z17 added `runZedcorZ17Backfill()` but reported its counts under `backfill_*` fields, leaving the original `enrichment_attempted` / `enrichment_succeeded` at 0 on every re-run with no new ingests — anyone reading the canonical metric saw 0 and concluded the backlog was untouched. Z17.1 folds backlog work into the canonical fields, raises the per-trigger cap so one trigger clears the typical backlog, and parallelizes the HTTP-bound GC stage.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — additive)
**Implements:** SPEC-zedcor-Z17.1.md §"The fix" + §"Acceptance criteria". `enrichment_attempted` / `enrichment_succeeded` / `enrichment_failed` in `RunSummary` now sum Wave 2.5 (this-run inserts) + Wave 5 (backlog) so a single trigger's enrichment work is readable off the canonical field; per-source breakdown stays (`scored`, `gc_resolved`, `hooks_generated`, `backfill_*`). `DEFAULT_BACKFILL_CAP_PER_RUN` raised 30 → 200 so one trigger clears the typical ~190-row construction backlog instead of needing 6+ triggers. `runZedcorZ17Backfill()` restructured into Phase A (score, deterministic) + Phase B (GC extract, parallel batches of `GC_BACKFILL_CONCURRENCY=8`) + Phase C (pitch + Notion, sequential). HTTP-bound GC work collapses from N×2s sequential to ⌈N/8⌉×2s parallel; pitch stays sequential because Sonnet's per-key rate limit makes naive parallelism a wash. Pre-window construction rows (solicitation / owner_bid / rfp / unknown / fallback) that are not pitch-eligible now receive a deterministic tracking action via `buildPreWindowTrackingAction()` written to `pitch_metadata.recommended_action` (with `pitch_hooks: []` and a `tracking_action_kind` tag), so spec §"ZED-58 sanity" — score + phase + tracking action with no hooks and no GC required — is satisfied on the first trigger. `backfillNeedsWork()` counts "missing tracking action" as work, so the deterministic step runs once per row and then idempotently skips.
**Last verified against spec:** 2026-05-30. Live verification runs 6722 (enrichment_attempted=144, backfill_scored=144, hooks_generated=19, notion_writes=44) + 6723 (enrichment_attempted=0, idempotency) against `pathfinder.projects`; aggregates moved construction_with_score 46→190 (100%) and construction_with_hooks 35→45.
**Drift:** none.

---

## Stream E, Cards and Companies (Internal rework V2)

**State:** Open against `main` from branch `stream-e-cards-companies` (2026-05-30). Operator-authorized self-merge per `Pathfinder/docs/SPEC-Internal-Rework-V2.md` SHARED AUTHORITY block (commit `8a74833`, landed on main mid-session and pulled in via rebase before the second push). Plan: `Pathfinder/docs/PLAN-stream-e-cards-companies.md`. SPEC-Internal-Parallel-Build.md SHARED governed the first commit (V2 was absent at session start, V1 SHARED is verbatim-equivalent on every non-negotiable); after rebase the V2 Stream E section drove the refactor that extracted the shared `CompanyLeadCard` and added the one-line "why" + "one card" unification.

Defect: Internal `/[slug]/leads` projected rows through `projectFunderLead`, so its `lead_card_layout.primary_fields` (`company_name`, `service_category`, `footprint`, `sales_motion`) had no matching keys on the projection. The cards rendered raw uppercase labels (CSS `text-transform: uppercase`) with em-dash placeholders; only `score` resolved because both projections set it. Fix is additive and Internal-scoped: the page branches on `architecture.lead_unit.name === 'company'`, projects via `projectToCompanyLeadView`, sorts via `sortCompanies`, and renders through the new shared `CompanyLeadCard` (the same component the Stream B `RankedFeed` now delegates to). Funder, Realberry, Zedcor stay byte-identical: the `LeadCard` markup is unchanged when no schema is passed (which they never do); the SQL ordering and projection on those paths are untouched.

### New lib/ files

#### Pathfinder/lib/agents/internal/sortCompanies.ts (new)
**Implements:** SPEC-Internal-Rework-V2.md Stream E sort-controls requirement. Pure helpers `parseSortKey(input)` and `sortCompanies(rows, key)` over the `CompanyLeadView` projection. Keys: `score` (score desc, nulls last; verified true sorts before verified false as a tiebreaker so the prior verified-first floor ordering is preserved), `name` (company_name asc, locale-aware case-insensitive), `category` (service_category display string asc), `recent` (posted_date desc nulls last). `score` is the default. The Companies route URL carries `?sort=`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### New component files

#### Pathfinder/components/catalog/cards/CompanyLeadCard.tsx (new)
**Implements:** SPEC-Internal-Rework-V2.md Stream E "one fixed card" requirement. Shared Internal lead card used by the Companies list (`app/[slug]/leads/page.tsx`), the Dashboard ranked feed (`lib/catalog/modules/ranked-feed/RankedFeed.tsx`), and the Pipeline kanban (Stream G). Renders the company name (h3), score badge top-right, score eyebrow line, a three-cell FieldGrid (service category, operating footprint, sales motion) plus HQ when present, and the one-line "why" clamped from `view.rationale`. Labels resolve via `displayLabel(schema, key)` (the Stream B chokepoint). Null fields render as `-`, never an em-dash. Two modes: `link` (default, wraps in `next/link` to `buildOrgPath(slug, 'leads', view.id)`) and `bare` (no link wrapper, for the Pipeline kanban so it can attach drag handlers). `testIdPrefix` defaults to `company-lead-card` and is overridden to `ranked-feed` by Stream B so its existing tests stay stable.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/components/internal/CompaniesSortControl.tsx (new)
**Implements:** SPEC-Internal-Rework-V2.md Stream E sort-controls requirement (Companies route: score desc default, name, category, recently added). Server-rendered `next/link` rail; preserves the four Stream B filter params (`service_category`, `sales_motion`, `federal_registration`, `source`) when flipping `?sort=`. Targets `/[slug]/leads?...` directly so the redirect at `/[slug]/companies` (Stream A Phase 0 alias) does not drop the query string.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Modified component / route files

#### Pathfinder/components/LeadCard.tsx (modified, additive)
**Implements:** SPEC SHARED quality bar "always render the schema display_label, never the field key" as defense in depth for any future caller that still routes through this floor card. Adds two optional props: `schema?: LeadUnitSchema` and `placeholder?: string`. When `schema` is provided: labels resolve via `displayLabel(schema, field)`, the CSS uppercase transform is dropped from the label, and the placeholder defaults to `-`. When `schema` is absent (Funder + every other current caller): the rendered markup is byte-identical to today (raw key label, CSS uppercase, em-dash placeholder; no change to `fieldDisplay` behavior). Internal's Companies route now uses `CompanyLeadCard` instead of `LeadCard`, but the schema-aware path stays in `LeadCard` so any later module that still mounts the floor card on a schema-driven org renders correctly.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/app/[slug]/leads/page.tsx (modified, additive Internal branch)
**Implements:** SPEC-Internal-Rework-V2.md Stream E. New branch on `architecture.lead_unit?.name === 'company'`: rows are loaded without an SQL `order` clause, projected through `projectToCompanyLeadView`, then sorted in JS via `sortCompanies(view, parseSortKey(?sort))` so the visible "Category" sort follows the humanized display string. Renders `CompaniesSortControl` plus a grid of `CompanyLeadCard`. The Funder branch keeps the original SQL ordering and `projectFunderLead` mapping verbatim; its `LeadCardList`/`LeadCard` markup is byte-identical.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/ranked-feed/RankedFeed.tsx (modified, "one card" delegation)
**Implements:** SPEC-Internal-Rework-V2.md Stream E "one fixed card". The inner card component was extracted to `Pathfinder/components/catalog/cards/CompanyLeadCard.tsx`. `RankedFeed` is now a thin projector + iterator that delegates each row to `CompanyLeadCard` with `testIdPrefix="ranked-feed"` so every Stream B selector (`ranked-feed-card-*`, `ranked-feed-link-*`, `ranked-feed-why-*`, `ranked-feed-score-*`, `ranked-feed-rank-eyebrow-*`) keeps its identity. The visual contract is unchanged.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

---

## Stream H, Lead Chat Agent (Internal rework V2)

**State:** PR pending on `feat/stream-h-lead-chat`. Spec: `Pathfinder/docs/SPEC-Internal-Rework-V2.md` §Stream H. Plan: `Pathfinder/docs/PLAN-stream-h.md`. Operator-authorized self-merge per the SHARED AUTHORITY block; never Verified.

Adds an Internal-only pop-up chat agent that lets a salesperson reason about the Internal companies dataset, draft outreach, and run live Perplexity Sonar research. Additive. The existing customer-facing Pathfinder chat at `/api/chat` and `components/chat/*` keeps serving Zedcor untouched. Zedcor, Realberry, and Funder remain byte-identical (no mount, no shared component edited).

### New lib/ files

#### Pathfinder/lib/chat/lead-chat-types.ts (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H types layer. Exports `LeadChatScope`, `LeadChatRole`, `LeadChatMessageRow`, `LeadChatSseEvent`, `LeadChatPostBody`. Kept separate from `lib/types.ts` chat types (which are Zedcor-shaped: Project, Branch, Customer, contextKey) so the two paths stay decoupled.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/chat/lead-chat-context.ts (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "Answers from the org's real lead data" + SCORE-COMPONENTS qualitative rule. `buildLeadChatSystemPrompt` constructs the Sonar system prompt grounded in a CompanyLeadView projection (`projectToCompanyLeadView`) plus the six qualitative weighted signals from `lib/catalog/internalSignals`. Never emits fabricated numeric point contributions; signal evidence is either a real stored string or the literal "no observable evidence". Style rules mirror the existing chat: no em-dashes, no fabricated values, plain spoken. `projectBundle` wraps the projection + signal extraction for one row.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/chat/lead-chat-persist.ts (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "Persisted history" wrappers. `appendLeadChatMessage` inserts into `pathfinder.lead_chat_messages` (migration `20260530_lead_chat_messages.sql`) keyed by (org_id, company_id, thread_id, user_email). `listLeadChatMessagesByThread` returns the thread for hydration on open. `listLeadChatThreads` returns prior threads in scope for the optional thread chip row. Casts through `InsertOne<TPayload, TRow>` mirror the existing pattern in `app/api/chat/route.ts` and `app/api/refresh/route.ts` because Supabase 2.45 strict typing was generated before this table existed.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### New API route

#### Pathfinder/app/api/internal/chat/route.ts (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "REUSE + mirror, do not rebuild" + "Built-in Perplexity Sonar research tool" + LIVE-VERIFICATION constraints. POST streams Sonar via `streamSonar` from `lib/chat/sonar.ts` (the same surface the existing chat uses), grounding the response in real Internal data via `buildLeadChatSystemPrompt`. SSE event types: `meta`, `researching` (new explicit chip signal), `delta`, `sources`, `done`, `error`. Persists user and assistant turns to `pathfinder.lead_chat_messages`. GET returns prior messages for `(org_slug, company_id?, thread_id)` or, with `list_threads=1`, recent thread summaries in scope. Internal-only: refuses any `org_slug !== 'internal'` with 403; refuses any unknown company_id with 404. Basic-auth `userEmail` gates per-user retrieval.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### New surface components

#### Pathfinder/components/internal/lead-chat/LeadChatPanel.tsx (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "slide-in panel that does not navigate away, can be minimized, scope shown in context indicator, streaming responses, copy-to-clipboard, Researching with Perplexity state". Mirrors the existing `IntelligenceChat` shape (420px, slides via translateX, Escape closes) but is its own client component so the existing chat at `components/chat/*` is not modified. Reuses `ChatContextIndicator` directly. Stable thread_id is stored per (orgSlug, companyId) in `localStorage` so reloads continue the same thread (the SPEC's "persisted history" requirement, complemented by the server table).
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/components/internal/lead-chat/LeadChatLauncher.tsx (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "floating launcher (small button, bottom-right)". `position: fixed`, bottom-right, z-index 70. Mounts the `LeadChatPanel` and owns the open/closed state.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Modified app/ files (mount points only, Internal-only)

#### Pathfinder/app/[slug]/InternalDashboard.tsx (modified, additive)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "mount on the Internal dashboard". Appends `<LeadChatLauncher>` at the end of the rendered JSX with the dashboard scope label. The route gate `shouldUseInternalDashboard` already restricts this component to Internal-shaped orgs, so Zedcor / Realberry / Funder never reach this mount point.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/app/[slug]/leads/[projectId]/page.tsx (modified, additive)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "on a lead detail page it opens scoped to that company". Inside the `leadUnitName === 'company' && architecture.modules` branch (Internal), and only when `org.slug === 'internal'` (extra safety belt so a future org with `modules` does not start surfacing the chat), appends `<LeadChatLauncher>` scoped to the open company. Funder and Zedcor branches remain untouched.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### New migration

#### Pathfinder/supabase/migrations/20260530_lead_chat_messages.sql (new)
**Implements:** SPEC-Internal-Rework-V2.md §Stream H "a new table (e.g. pathfinder.lead_chat_messages) keyed by org and optionally company" + LIVE-VERIFICATION "the history table must be APPLIED to the production Supabase project and confirmed by query". Creates `pathfinder.lead_chat_messages` with FK to `pathfinder.organizations.id` (uuid) and nullable FK to `pathfinder.projects.id` (text). Indexes on (org_id, company_id, created_at DESC), (thread_id, created_at), and (user_email, created_at DESC). RLS enabled; service_role bypasses; anon / authenticated denied by default (the API route runs under service role and scopes by `userEmail` in app code). Applied to prod project ref `anfihcusvekpovcchpoh` via Supabase MCP `apply_migration`; confirmation query result is captured in the PR body.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

---

## Stream F, Dashboard and Search (Internal rework V2)

**State:** Open against `main` from branch `stream-f-dashboard-search` (2026-05-30). Operator-authorized self-merge per `Pathfinder/docs/SPEC-Internal-Rework-V2.md` SHARED AUTHORITY block for this batch. Plan: `Pathfinder/docs/PLAN-stream-f-dashboard-search.md`. Rebased onto post-Stream-E + post-Stream-H main mid-session: my refactor of `InternalDashboard.tsx` (tab strip + section components) keeps Stream H's `<LeadChatLauncher>` mount in the top-level dashboard JSX so the chat launcher stays present across the Feed and Metrics tabs.

Defect: the live Internal dashboard rendered four dead text inputs (`Pathfinder/components/FilterSidebar.tsx` from the legacy floor) and a misleading `Active outbound motion 0%` from the legacy `Pathfinder/lib/metrics/kpiQueries.ts`. Stream F replaces the four inputs with one smart search bar plus four real dropdown refinements, and ships a separate Metrics tab where every KPI is legible to a salesperson with a plain-language tooltip. The active outbound motion tile no longer renders a bare misleading zero: when most rows are Unknown, the tile surfaces the honest breakdown ("Confirmed active: 10 of 229; 219 Unknown") with a tooltip explaining that Unknown means enrichment has not yet confirmed motion, not that no motion exists.

### New lib/ files

#### Pathfinder/lib/catalog/modules/smart-search/applySearch.ts (new)
**Implements:** SPEC Stream F feed-first landing, "typing a company name, service category, state, or score filters and surfaces matching companies". Pure tokenized-AND helper. Tokens match against company name (from `raw_payload.internal_enrichment.company_name`, falling back to `row.title`), service_category (slug AND humanized label), sales_motion (slug AND humanized label), `hq_location` (raw substring + the 50 US state name-to-abbrev aliases so `Texas` and `TX` both match), and the stringified `row.score`. Two-letter all-caps tokens also match a state abbreviation extracted from `hq_location`.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/smart-search/SmartSearch.tsx (new, client)
**Implements:** SPEC Stream F feed-first landing, one smart search bar that replaces the four dead text inputs, with optional dropdown refinements beside. Client component. Debounced (200ms) writes of `?q=` via `router.replace`; dropdown changes write the same URL params the prior `FilterRail` used (`service_category`, `sales_motion`, `federal_registration`, `source`). A filter whose backing schema field is absent is dropped from the dropdown row entirely (matches FilterRail soft-gate semantics). A `Clear` button removes `q` and the four field params in one click.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/metrics-view/labels.ts (new)
**Implements:** SPEC Stream F metrics-view tooltip requirement. One file with the plain-language label and tooltip text for each tile so a copy change is single-file.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/lib/catalog/modules/metrics-view/metrics.ts (new)
**Implements:** SPEC Stream F PR-blocker "every metric reconciles to a real query; a metric that cannot resolve is dropped, not shown as zero" and "compute Active outbound motion honestly from the sales_motion signal". Each resolver returns a `MetricTile { id, label, value, suffix?, subText?, tooltip }` shape. `active_outbound_motion` buckets rows into Confirmed (`active-outbound` OR `hiring-bd`), Unknown (`unknown` OR missing), and Other; when `unknown / total >= 0.25` OR `confirmed == 0` the tile sets `value = null` and renders the breakdown subtext, NEVER a bare misleading 0. `avg_score_out_of_100` labels the suffix as `/100` (not bare `%`). `sources_live` names the live sources in subText so the rep sees which two are running.
**Last verified against spec:** 2026-05-30.
**Drift:** none. Note: this set is parallel to `Pathfinder/lib/catalog/modules/kpi-strip/metrics.ts` (Stream B) by design; the Stream B strip stays untouched and dormant. Removing the kpi-strip resolvers would have changed the byte-unchanged guarantees for any future caller, so Stream F kept them in place.

#### Pathfinder/lib/catalog/modules/metrics-view/MetricsView.tsx (new, server)
**Implements:** SPEC Stream F metrics-view, KPI cards with tooltip glyph and optional breakdown subtext. Server component resolves tiles via `resolveMetricTiles`, renders responsive grid of `Card`s. Each card has an info glyph with `title` + `aria-label` carrying the tooltip text. A tile whose resolver returns null is absent from the DOM entirely.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Modified files

#### Pathfinder/lib/catalog/modules/filter-rail/applyFilters.ts (modified, additive)
**Implements:** SPEC Stream F search composition. `InternalFilters` gains an optional `q?: string` field; when empty (today's behavior) the function short-circuits to the prior result; when non-empty the row set is piped through `applySearchQuery` after the dropdown narrowing. The existing dropdown semantics (slug equality, AND combine, empty string means "all") are byte-identical.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

#### Pathfinder/app/[slug]/InternalDashboard.tsx (rebuilt, Internal-only path)
**Implements:** SPEC Stream F feed-first landing AND separate metrics view. Adds a `view` prop driven by `?view=feed|metrics` from the page. On `feed` (default) renders `SmartSearch` then `RankedFeed` (full width, no sidebar). On `metrics` renders `MetricsView` then `AnalyticsChartsView`. The Stream B `KpiStrip` and `FilterRail` are no longer mounted from this file but their components remain untouched. Tab strip uses `next/link` so deep links preserve `q` and the four field params across the tab toggle.
**Last verified against spec:** 2026-05-30.
**Drift:** none. Zedcor, Realberry, Funder do NOT enter this branch (see `internalDashboardBranch.ts`); they continue to render via `Pathfinder/app/[slug]/page.tsx` legacy block byte-identically.

#### Pathfinder/app/[slug]/page.tsx (modified, additive params)
**Implements:** SPEC Stream F URL plumbing for the new dashboard. The Internal branch now also reads `q` and `view` from `searchParams` and passes them through to `InternalDashboard`. Empty / missing values preserve Stream B behavior unchanged. The legacy floor branch (Zedcor, Realberry, Funder) is untouched.
**Last verified against spec:** 2026-05-30.
**Drift:** none.

### Live-verification

- `pathfinder.organizations.architecture.modules` block confirmed present on the Internal row in prod (Supabase ref `anfihcusvekpovcchpoh`); zedcor, funder, and realberry-* rows have no `modules` key.
- `Pathfinder/scripts/verify-orgs-byte-unchanged.ts` run from the worktree: `OK: internal has expected modules block; zedcor / realberry / funder have no modules key.` (Realberry warning is pre-existing; that slug is absent from prod.)
- Live data shape that drove the honesty fix (from `pathfinder.projects` GROUP BY sales_motion against the Internal org): 219 unknown, 9 hiring-bd, 1 active-outbound (total 229). The metrics-view tile therefore renders the subtext `Confirmed active: 10 of 229; 219 Unknown` with `value = null` instead of a bare 0%.

### Sprint Z17.2 — Notion catch-up + free agency-contact fallback

**State:** PR pending on `z17.2-notion-catchup`. Corrective follow-up to Z17.1. Z17 + Z17.1 enriched the DB to 100% of construction rows but the Lead Feed in Notion showed 161 missing pages + 31 stale-pre-Z17 pages because `backfillNeedsWork()` returned false for any row already DB-enriched, so the production triggers never told the Notion writer about them. Z17.2 closes the loop and adds a free agency-contact fallback for pre-window rows that have no GC.

#### Pathfinder/lib/orchestrator/orchestrator.ts (modified — additive)
**Implements:** Z17.2 §"Notion catch-up". `backfillNeedsWork()` extended with `notionNeedsSync(p)` — true when (no `external_refs.notion_page_url`) OR (`notion_written_at` predates the latest `pitch_metadata.generated_at` / `gc_metadata.fetched_at`). Backfill then writes/updates Notion for the 161+31 stragglers. Both Notion pitch-update call sites (Wave 4 this-run + Wave 5 backlog) broadened: pre-Z17.2 they only fired when `pitch_hooks.length > 0`, so pre-window rows (which have an action but no hooks by design) never got their Recommended Action column populated. Now fires when EITHER hooks OR a non-empty `recommended_action` is present; `pitchToNotionProperties` already handles empty hooks gracefully. `buildPreWindowTrackingAction()` takes an optional `source` slug and embeds `agencyContactSnippet(source)` so the Recommended Action text carries a callable procurement contact for pre-window rows.
**Last verified against spec:** 2026-05-30 (typecheck + lint clean; live verification deferred to post-merge prod trigger because NOTION_API_TOKEN is a Vercel-only secret).
**Drift:** none.

#### Pathfinder/lib/adapters/zedcor/agency-contact-fallback.ts (new)
**Implements:** Z17.2 §"Free agency-contact fallback". Hardcoded `Record<sourceSlug, AgencyContact>` for the 15 Texas/Houston-area procurement sources we poll (Harris County Purchasing, City of Houston OBO, METRO, Port Houston, Fort Bend / Galveston / Brazoria County, Houston ISD, TxDOT Houston, City of Austin, San Antonio, Port of Corpus Christi, Fort Worth). Every entry is department-level only (no individual names) and copied from each agency's public procurement web page (the `source_url` field on each entry preserves the citation). News-source slugs are intentionally absent — those rows mention the GC by name in the article body, so the right fallback is a `news-gc-extractor` improvement, not an agency contact. Exports `getAgencyContact(slug)` and `agencyContactSnippet(slug)` (one-line "Agency · Phone · Email" used by the orchestrator's pre-window tracking action).
**Last verified against spec:** 2026-05-30.
**Drift:** none.
