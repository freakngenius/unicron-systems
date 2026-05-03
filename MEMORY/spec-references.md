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
<<<<<<< HEAD

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
=======
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
>>>>>>> 263eec4 (feat(connectors): C-2A Microsoft Teams OAuth + Bot Framework + Adaptive Cards)

### Tests

| File | Tests | Covers |
<<<<<<< HEAD
|---|---|---|
| `tests/connectors/hubspot-oauth.test.ts` | 13 | buildAuthorizeUrl host/scope/redirect/state; exchangeCode body shape, error mapping, expires_in; refreshToken grant_type; introspection failure tolerance |
| `tests/connectors/hubspot-bulk-sync.test.ts` | 10 | previewSync read-only behavior; pagination via `after`; ON CONFLICT upsert correctness on re-run; sync_state running flags + final counts; maxObjects truncation; 429 retry; error path writes last_error |

23 new tests; full suite remains 782/782 green; lint clean; build clean.
=======
|------|-------|--------|
| tests/connectors/teams-commands.test.ts | 18 | parser verbs, mention stripping, thumb synonyms |
| tests/connectors/teams-adaptive-cards.test.ts | 10 | card shape, action ids, truncation, attachment wrap, 28KB guard |
| tests/connectors/teams-oauth.test.ts | 11 | exchangeCode happy + error, refresh, bot app token, id_token tid extraction |
| tests/connectors/teams-signature.test.ts | 11 | RS256 happy path, every JWT failure mode, prod escape-hatch hard-off |

Total new: 50 tests. All green; full Pathfinder suite remains 809 passing.
>>>>>>> 263eec4 (feat(connectors): C-2A Microsoft Teams OAuth + Bot Framework + Adaptive Cards)

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
