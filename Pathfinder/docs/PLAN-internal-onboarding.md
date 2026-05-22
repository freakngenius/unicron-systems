# Pathfinder Internal Onboarding, Plan

**Stage:** 1 of 11, Platform Audit (no code, no PR).
**Spec:** `Pathfinder/Pathfinder-Internal-Blueprint.md` Section 4 (audit targets) and Sections 6-11 (resized plan).
**Architecture JSON:** `Pathfinder/Pathfinder-Internal-Architecture.json` (canonical Internal config).
**Prior art audited:** `Pathfinder/docs/PLAN-funder-onboarding.md`, `Pathfinder/docs/REPORT-funder-onboarding.md`.
**Worktree:** `Pathfinder-worktrees/internal-onboarding/`, branch `internal-onboarding`.
**Date:** 2026-05-21.

This document is the evidence-first control point for the Internal autonomous build. It re-verifies blueprint Section 4 against live HEAD code, confirms which Funder gap-closes have shipped, then resizes Stages 2 through 11.

---

## Stage 1, Audit

### Source code state at HEAD

Files exist and were read in full as cited below.

- Org architecture types: `lib/types/architecture.ts:10-115` (OrgArchitecture, UIPlan present, ui_plan optional with BASE fallback).
- Tenant config resolver: `lib/config/resolveArchitecture.ts:20-124` (shallow per-key merge, ui_plan merge included).
- Base template: `lib/config/baseTemplate.ts:12-66` (BASE_ARCHITECTURE with default ui_plan; thresholds 0.6 / 0.8 in 0-1 scale).
- Org architecture loader: `lib/agents/loadOrgArchitecture.ts:50-71` (id-based fetch + resolveArchitecture round-trip).
- Generic ranker: `lib/agents/ranker/genericScorer.ts:221-268` (EXTRACTORS map; returns 0-100 integer; unknown weight keys skipped).
- Generic rationale: `lib/agents/ranker/genericRationale.ts:145-188` (Sonnet call with fallback; closes prior debug-string gap).
- Ranker dispatch: `app/api/cron/ranker/route.ts:806-899` (non-Zedcor org branch routes to scoreGenericProject + generateGenericRationale; Zedcor kernel untouched).
- Verifier dispatch: `app/api/cron/verifier/route.ts:475-503` (Funder-specific `verifyFunderProject` for non-Zedcor; thresholds read from architecture).
- Org create endpoint: `app/api/organizations/route.ts:75-135` (Zod-validated, x-unicron-api-key header, emits `pathfinder/org.created`).
- Org-created subscriber: `lib/inngest/functions/org-created.ts:20-92` (flips setting_up to first_run, idempotent).
- Per-org ingest dispatch cron: `lib/inngest/functions/ingest-all-orgs-cron.ts:27-75` (emits `pathfinder/org.ingest_requested` every 4h per org).
- Per-org ingest subscriber: `lib/inngest/functions/ingest-org-requested.ts:56-289` (consumes the event, runs SOURCE_ADAPTERS per org).
- Source-id-keyed adapter registry: `lib/adapters/sources/index.ts:32-46` (SOURCE_ADAPTERS Record<string, SourceAdapter>).
- Source adapter contract: `lib/adapters/sources/types.ts:24-67` (SourceAdapter, SourceEvent, SourcePollOptions).
- Kind-keyed adapter registry (legacy, untouched): `lib/adapters/index.ts:21-29` (socrata/rest/rss/json-dump/custom).
- Inline Zedcor ingestor: `lib/ingestor.ts:3,32,169-561` (USAspending opportunities + SAM.gov opportunities, Zedcor-scoped, fixed org filter `.eq('org_id','zedcor')` at line 106 - note the column-name oddity: `org_id` in legacy code; `organization_id` is the multi-tenant column).
- KPI query layer: `lib/metrics/kpiQueries.ts:86-103` (kpiQueryByMetricId populated with verified_count_7d, actively_raising_count, avg_score, sources_live).
- Slug renderer: `app/[slug]/page.tsx:32-160` (KPIStrip + FilterSidebar + ChartGrid + LeadCardList from ui_plan).
- Briefing module: `lib/briefing.ts:1-60+` (Zedcor-only; not org-scoped; no daily-cadence variant).
- Middleware: `middleware.ts:77-177` (basic-auth gate, comment block at 22-31 documents Funder host-routing via parent unicron-systems next.config.mjs).
- Vercel cron config: `vercel.json:2-13` (no daily morning briefing cron; existing weekly Friday entry at line 7).

### Funder gap-closes, verified

| Funder claim | Live state | Evidence |
|---|---|---|
| Generic-org Sonnet rationale shipped | Confirmed shipped | `lib/agents/ranker/genericRationale.ts:1-192`; called from `app/api/cron/ranker/route.ts:835-849` |
| KPI query layer populated | Confirmed populated for 4 metric_ids | `lib/metrics/kpiQueries.ts:86-92` (verified_count_7d, actively_raising_count, avg_score, sources_live) |
| Source-id registry exists (SOURCE_ADAPTERS) | Confirmed shipped (additive, coexists with kind-keyed ADAPTERS) | `lib/adapters/sources/index.ts:32-46`, `lib/adapters/sources/types.ts:24-67` |
| Per-org ingest subscriber (`pathfinder/org.ingest_requested`) shipped | Confirmed shipped, but slug-gated to `'funder'` only | `lib/inngest/functions/ingest-org-requested.ts:56` (`SUBSCRIBER_OPT_IN_SLUGS = new Set(['funder'])`) |
| Verifier per-org branch shipped | Confirmed, but hardcoded to `verifyFunderProject` (Funder checks only) | `app/api/cron/verifier/route.ts:480-502` |
| Parallel per-org agents pattern | Confirmed established under `lib/agents/funder/` (qualifier, enricher, adjacency, geo, dealMemo, outreachDrafter, outreachChannels) | `ls lib/agents/funder/` |
| Recency extractor exists | Confirmed shipped by Funder; Internal reuses with no change | `lib/agents/ranker/genericScorer.ts:208-219, 234` |

**Headline:** Funder closed the three generic gaps the blueprint expected (Sonnet rationale, kpiQueries, source-id registry). It also shipped a per-org-modules pattern (`lib/agents/funder/`) and a per-org verifier branch, but both are slug-or-name-gated to Funder. Internal must (a) opt the `internal` slug into the ingest subscriber, (b) add a sibling `verifyInternalProject` (or generalize the dispatch), and (c) ride the `lib/agents/internal/` pattern.

### Blueprint Section 4, line by line

**(1) 2A slug routing plus operator auth.**
- Blueprint claim: Shipped; `/internal` routes for free.
- Live state: Shipped. `app/[slug]/page.tsx:32-160` renders any slug; `app/[slug]/layout.tsx` enforces operator_allowlist gate (`app/[slug]/layout.tsx:51`); operator login at `app/login/actions.ts:14`, OTP callback at `app/auth/callback/route.ts:54`.
- Evidence: `app/[slug]/page.tsx:32-52`, `app/[slug]/layout.tsx:8,51`.
- Impact: Stage 3 unchanged. `/internal` routes the moment the org row lands.

**(2) 2B tenant config layer.**
- Blueprint claim: Shipped, OrgArchitecture conforms to `lib/types/architecture.ts`.
- Live state: Shipped. Architecture JSON shape matches the type. resolveArchitecture merges per-org partial over BASE_ARCHITECTURE; ui_plan inner arrays are replaced wholesale (sources, kpis, charts, filters), which is the semantics Internal needs.
- Evidence: `lib/types/architecture.ts:10-29`, `lib/config/resolveArchitecture.ts:20-85`, `lib/config/baseTemplate.ts:12-66`.
- Impact: Stage 2 minimal. POST the architecture JSON; the resolver handles fallback.

**(3) 2C per-org dispatch (ranker plus ingestor).**
- Blueprint claim: Shipped. Internal rides both.
- Live state: Ranker dispatches non-Zedcor org-ids to scoreGenericProject (`app/api/cron/ranker/route.ts:806-826`). Ingest cron emits per-org event every 4h (`lib/inngest/functions/ingest-all-orgs-cron.ts:27-75`). Subscriber consumes that event but only for `org.slug` in `SUBSCRIBER_OPT_IN_SLUGS = new Set(['funder'])` (`lib/inngest/functions/ingest-org-requested.ts:56`).
- Evidence: as cited.
- Impact: Stage 4 must add `'internal'` to `SUBSCRIBER_OPT_IN_SLUGS` so Internal's adapters fire. One-line additive change, but it is mandatory.

**(4) 2C generic-scorer extractors (stub-heavy claim).**
- Blueprint claim: Stub-heavy, construction-shaped. trigger_strength and asset_class_match partially reusable. Six Internal extractors net-new.
- Live state: Confirmed stub-heavy in part. EXTRACTORS map (`lib/agents/ranker/genericScorer.ts:221-235`) holds: geography_match, asset_class_match, trigger_strength (real), basis_fit, unit_count_fit (stub, return 0), plus Funder additions thesis_fit, founder_credential, raise_stage, talent_density, peer_funder_signal, recency (real). Unknown weight keys are silently skipped (`:256`). Internal's six weights (sales_motion_strength, operational_footprint, federal_signal, project_driven_fit, recency, association_presence) are net-new EXCEPT `recency` which already exists from Funder and is org-agnostic enough to reuse as-is.
- Evidence: `lib/agents/ranker/genericScorer.ts:36-235`.
- Impact: Stage 7 ranker adds 5 new extractors (sales_motion_strength, operational_footprint, federal_signal, project_driven_fit, association_presence) plus reuses Funder's `recency`. asset_class_match keyword tokens may match Internal's `construction-vertical-b2b-prospecting` vertical (tokens of length >= 4 include "construction" and "prospecting"), but the Architect did not weight it for Internal, so it is dormant.

**(5) 2C generic-org Sonnet rationale (closed by Funder? verify).**
- Blueprint claim: Gap, or closed by Funder.
- Live state: Closed by Funder. `lib/agents/ranker/genericRationale.ts` exists; ranker dispatch calls it for every non-Zedcor org. The prompt is generic (reads from `architecture.branding.display_name`, `business_summary`, `outreach.persona`, `outreach.tone`, `lead_unit.name`) and Internal's architecture JSON populates all of these.
- Evidence: `lib/agents/ranker/genericRationale.ts:38-67,145-188`; called at `app/api/cron/ranker/route.ts:835-849`.
- Impact: Stage 7 ranker work shrinks. No platform-gap to close; Internal inherits the Sonnet rationale path for free.

**(6) 2D / Build-Out renderer.**
- Blueprint claim: Shipped; Internal's ui_plan is config.
- Live state: Shipped. `/[slug]/page.tsx:131-140` renders KPIStrip, FilterSidebar, ChartGrid, LeadCardList from ui_plan. Architecture jsonb at `:43-45`, resolveArchitecture at `:44`, KPI value lookup at `:73`.
- Evidence: `app/[slug]/page.tsx:32-160`.
- Bug found: `app/[slug]/page.tsx:63` reads `projects` filtered by `.eq('org_id', org.id)` but every other reader/writer in the codebase uses `organization_id` (e.g. `lib/metrics/kpiQueries.ts:34,49,63`; `lib/inngest/functions/check-ready-to-view-cron.ts:93,106`; `lib/inngest/functions/ingest-org-requested.ts:211`). Result: the `/[slug]` LeadCardList is always empty for non-Zedcor orgs because `projects.org_id` is the legacy Zedcor-only column. Funder's PLAN cited `organization_id` in §2 Q1 but the renderer fix did not ship.
- Impact: Stage 10 dashboard must include a one-line fix to swap `org_id` → `organization_id` at `app/[slug]/page.tsx:63`. This is a Funder-affecting bug; flag in PR description as a pre-existing platform fix that also benefits Funder/Realberry. Existing-customer regression check still required.

**(7) KPI metric query layer.**
- Blueprint claim: Closed by Funder, additively.
- Live state: Closed for 4 Funder metric_ids: verified_count_7d, actively_raising_count, avg_score, sources_live (`lib/metrics/kpiQueries.ts:86-92`). Internal's ui_plan asks for: verified_count_1d, active_motion_pct, avg_score, sources_live, count_by_category, verified_count.
- Evidence: `lib/metrics/kpiQueries.ts:86-103`, `Pathfinder-Internal-Architecture.json:93-100`.
- Impact: Stage 10 dashboard adds 4 net-new metric_id query functions (verified_count_1d, active_motion_pct, count_by_category, verified_count) and reuses 2 (avg_score, sources_live) directly. Net-new is additive to the existing map; Funder's keys untouched.

**(8) 2E onboarding state machine.**
- Blueprint claim: Shipped end-to-end.
- Live state: Shipped. POST emits `pathfinder/org.created` (`app/api/organizations/route.ts:115-132`); orgCreated flips setting_up to first_run (`lib/inngest/functions/org-created.ts:20-92`); `check-ready-to-view-cron.ts` advances to ready_to_view; `verify-build-out.ts` lands build_out_complete.
- Evidence: as cited.
- Impact: Stage 2 unchanged in concept. Just POST and wait.

**(9) Source adapter registry (kind-keyed vs source-id-keyed; closed by Funder?).**
- Blueprint claim: Was kind-keyed only. Funder may introduce source-id registry.
- Live state: Both registries coexist. Legacy kind-keyed `ADAPTERS` at `lib/adapters/index.ts:21-29` (used by Source Onboarder code generation). New id-keyed `SOURCE_ADAPTERS` at `lib/adapters/sources/index.ts:32-46` (used by the per-org subscriber). The id registry holds 7 Funder adapters; none of Internal's 6 source ids are present.
- Evidence: `lib/adapters/sources/index.ts:32-46`, `lib/adapters/sources/types.ts:24-67`, `lib/inngest/functions/ingest-org-requested.ts:26,116`.
- Impact: Stage 5 (source adapters) builds 6 new SourceAdapter modules under `lib/adapters/sources/` and registers them in `SOURCE_ADAPTERS`. Pattern is in place; net-new work is the adapter logic itself per Section 8 of the blueprint.

**(10) Lead table: pathfinder.projects (no leads table).**
- Blueprint claim: Rides projects, scoped by organization_id; vocabulary is UI config.
- Live state: Confirmed. All readers and writers use `pathfinder.projects` with `organization_id` (except the `/[slug]` renderer bug above, item 6, and the Zedcor inline ingestor at `lib/ingestor.ts:106` which uses the legacy `org_id='zedcor'` literal).
- Evidence: `lib/inngest/functions/ingest-org-requested.ts:211`, `lib/inngest/functions/check-ready-to-view-cron.ts:93,106`, `lib/metrics/kpiQueries.ts:34,49,63`, `app/api/cron/funder-weekly-memo/route.ts:74`.
- Impact: No migration. Internal vocabulary (lead -> company) is config-only in `architecture.vocabulary` and `architecture.lead_unit`.

**(11) Score scale (0-100 stored, thresholds times 100 at read).**
- Blueprint claim: scoreGenericProject returns 0-100; thresholds are 0-1; reconcile at read site.
- Live state: scoreGenericProject returns Math.round(raw * 100) (`lib/agents/ranker/genericScorer.ts:265`). Internal's architecture.scoring.thresholds = { verified: 0.65, high_priority: 0.80 }. Verifier's Funder branch already reads `architecture.scoring.thresholds` and scales (per Funder REPORT and `app/api/cron/verifier/route.ts:485` `verified_threshold_0_100`). The `verifyFunderProject` function handles the scaling internally.
- Evidence: `lib/agents/ranker/genericScorer.ts:265`, `app/api/cron/verifier/route.ts:480-502`, `lib/agents/verifier/funderChecks.ts` (Funder-specific, must mirror for Internal).
- Impact: Stage 8 verifier writes an `verifyInternalProject` that mirrors funderChecks.ts scaling logic, or refactors the threshold-scaling out of funderChecks into a shared helper. Default: parallel module for blast-radius isolation.

**(12) sam-gov, usaspending adapters shipped, Zedcor-tuned.**
- Blueprint claim: Shipped, Zedcor-tuned; Internal reconfigures both for construction NAICS and recipient-side filtering.
- Live state: Inlined in `lib/ingestor.ts` (`:169-308` USAspending, `:310-461` SAM.gov), Zedcor-scoped (`.eq('org_id','zedcor')` at `:106`), Zedcor-tuned for construction security NAICS. They are NOT registered in the new id-keyed `SOURCE_ADAPTERS` registry. The SAM.gov adapter uses the Opportunities endpoint, not the Entity Management (registration) endpoint Internal needs.
- Evidence: `lib/ingestor.ts:32,106,169-461`; `lib/adapters/sources/index.ts:32-46` (sam-gov and usaspending absent).
- Impact: Stage 5 cannot "reconfigure" the inline ingestor for Internal without re-coupling per-org logic into a Zedcor-leaning module (Funder REPORT §2.1 made the same call). Internal builds two net-new SourceAdapter modules under `lib/adapters/sources/`: `sam-gov-entity.ts` (Entity Management API, construction NAICS 236/237/238/532412) and `usaspending-recipients.ts` (recipient/awardee search, not opportunities). The Zedcor inline ingestor stays untouched. Net effect: Stage 5 adapter count goes from "reconfigure 2 + build 4" to "build 6", but the two SAM/USAspending modules can reuse upstream API knowledge from the inline ingestor.

**(13) Anything the blueprint missed or got materially wrong against the live code.**
- Subscriber slug gate is hardcoded. `lib/inngest/functions/ingest-org-requested.ts:56` `SUBSCRIBER_OPT_IN_SLUGS = new Set(['funder'])` will silently no-op for `internal` until the slug is added. The blueprint does not mention this. Stage 4 must touch this file (one-line change) as a prerequisite for Stage 5.
- Verifier branch is name-gated. `app/api/cron/verifier/route.ts:483` calls `verifyFunderProject` for every non-Zedcor org with an architecture. Today Funder is the only non-Zedcor org with non-empty architecture, so this works. For Internal, calling `verifyFunderProject` against an Internal company project would produce nonsense Funder-shaped checks. Stage 8 must add a per-org-slug or per-vertical dispatch inside the non-Zedcor branch so Internal projects route to `verifyInternalProject`.
- `app/[slug]/page.tsx:63` `org_id` vs `organization_id` bug, noted under blueprint item 6. Pre-existing; the dashboard reads zero leads for Funder/Realberry/Internal until fixed.
- `briefing.ts` is Zedcor-only. The module has no organization_id scoping and no daily-cadence variant. Stage 9 daily-digest work is net-new (parallel module under `lib/agents/internal/` per Funder's `dealMemo.ts`/`outreachChannels.ts` precedent).
- Vanity-domain routing pattern is already documented. `middleware.ts:22-31` records that Funder's host routing (`funder.unicron.systems` -> `/pathfinder/funder/*`) lives in the parent unicron-systems project's next.config.mjs, not in Pathfinder. Internal mirrors the same pattern for `internal.unicron.systems` -> `/pathfinder/internal/*`. The Pathfinder middleware does not change.
- Outreach drafter for Funder uses parallel modules (`lib/agents/funder/outreachDrafter.ts`, `outreachChannels.ts`). Internal mirrors the same pattern.
- No `lib/agents/internal/` directory exists today. Stage 6 creates it.

---

## Resized stage plan

Numbering follows the blueprint Section 11 build sequencing (stages 2 through 11). Stage 1 (this audit) is complete on writing this document. Every stage runs in this worktree, on this branch, with the auto-merge / kanban-hygiene / multi-Vercel-verification rules from the kickoff carrying through.

Style rules from the runner prompt apply to every stage subsection: file:line citations only, no time estimates, no numeric cost caps, no em-dashes or en-dashes.

### Stage 2, Org record

**Acceptance criteria:**
- Persist Internal as a row in `pathfinder.organizations` via `POST /api/organizations` with body `{ name: 'Unicron Internal', slug: 'internal', customer_org_id: 'unicron-internal', architecture: <contents of Pathfinder-Internal-Architecture.json> }`. Authenticated with `UNICRON_INGEST_API_KEY` (`app/api/organizations/route.ts:37-42`).
- Confirm the row appears in pathfinder.organizations with `status='setting_up'` then advances to `'first_run'` after `orgCreated` runs (`lib/inngest/functions/org-created.ts:69-77`).
- Confirm `resolveArchitecture(row.architecture)` round-trips cleanly (unit test on a fixture loaded from the JSON file).
- Confirm `/internal` returns 200 from the existing renderer (will show empty KPIs and zero leads pre-ingest, expected).

**Files to touch:**
- `scripts/post-internal-org.ts` (new): one-shot loader that POSTs the architecture JSON. Mirror Funder Stage 2 pattern.
- `__tests__/agents/loadOrgArchitecture-internal.test.ts` (new): round-trip fixture test.
- No production code changes anticipated.

**Net-new vs reconfigure vs config-only:** Config-only (the architecture JSON is the entire payload). One-shot script is local utility, not production code.

**CI checks:** next build, lint, typecheck, vitest passes, no do-not-touch path modified.

**Cross-stage dependencies:** None inbound. Stage 3+ depend on the org row existing.

**Open questions and defaults:**
- The architecture JSON references metric_ids not yet implemented (verified_count_1d, active_motion_pct, count_by_category, verified_count). Default: ship Stage 2 with the JSON as-is. The renderer will show em-dash for unmapped metric_ids per `lib/metrics/kpiQueries.ts:96-103`. Stage 10 closes the gap. No-op for Stage 2.

### Stage 3, Vanity domain plus host routing plus auth

**Acceptance criteria:**
- `internal.unicron.systems` resolves to the `/pathfinder/internal` route, preserving the unicron-systems-domain URL bar.
- Operators in `operator_allowlist` can authenticate via the existing magic-link flow and see the Internal dashboard.
- DNS records for `internal.unicron.systems` point at the Vercel `pathfinder` project (or are aliased through the unicron-systems parent project per the existing Funder pattern).

**Files to touch:**
- Parent project (`unicron-platform/`, not this worktree's `Pathfinder/`): add a host-based rewrite in next.config.mjs for `internal.unicron.systems`, mirroring the Funder rewrite described at `Pathfinder/middleware.ts:22-31`. Cross-repo edit; flag for human review.
- `Pathfinder/middleware.ts`: no change. The basic-auth gate already protects `/internal` once the host rewrite lands inside basePath.
- Vercel domain config: add `internal.unicron.systems` to the pathfinder project's Domains UI. Operator-only step; cannot be done from this worktree.

**Net-new vs reconfigure vs config-only:** Config-only inside the Pathfinder repo. Net-new wiring lives in the parent unicron-systems repo + Vercel UI. Document the exact diff line in the PR description so the parent-repo change is a one-paste.

**CI checks:** next build, lint, typecheck. (Cross-repo step is verified post-deploy with `curl -I https://internal.unicron.systems/`.)

**Cross-stage dependencies:** Requires Stage 2 (the org row must exist before the route resolves with non-404 content).

**Open questions and defaults:**
- Does the parent unicron-systems project have a single host-routing map or per-host blocks? Default: read the Funder block first, mirror its structure exactly. The kickoff prompt does not block on this; the parent-repo edit is a small additive line.
- Are operator emails (`kyle@`, `keenan@`, `curtis@`) already in `operator_allowlist`? Default: assume yes (Funder shipped with them); confirm in PR description by a one-shot `select email from pathfinder.operator_allowlist`.

### Stage 4, Subscriber opt-in plus ingest plumbing

**Acceptance criteria:**
- `'internal'` is added to `SUBSCRIBER_OPT_IN_SLUGS` at `lib/inngest/functions/ingest-org-requested.ts:56` so the per-org ingest subscriber fires for Internal events.
- The Inngest function picks up the next `pathfinder/org.ingest_requested` event for organization_id=internal and runs through its source loop. With no adapters registered yet (Stage 5 work), each source ref will log `'adapter not registered in SOURCE_ADAPTERS'` (`:124`) but the agent_run completes cleanly.

**Files to touch:**
- `lib/inngest/functions/ingest-org-requested.ts` (one line, `:56`): add `'internal'` to the Set literal. Funder do-not-touch overlap: NONE (Funder's `'funder'` entry stays).

**Net-new vs reconfigure vs config-only:** Reconfigure (one-line gate change).

**CI checks:** next build, lint, typecheck, vitest passes. MEMORY/spec-references.md update if `lib/` touched (it is): cite the slug-gate change so future onboarders find it.

**Cross-stage dependencies:** Requires Stage 2 (org row + slug). Stage 5 builds the adapters this subscriber will then run.

**Open questions and defaults:**
- Should the subscriber gate evolve from a slug Set to an org-row flag (e.g. `architecture.flags.use_org_subscriber=true`)? Default: keep the Set for now. Refactor when a third org needs it.

### Stage 5, Source adapters

**Acceptance criteria:**
- Six SourceAdapter modules registered in `SOURCE_ADAPTERS` keyed by the ids in `Pathfinder-Internal-Architecture.json:53-60`: `sam-gov`, `usaspending`, `custom-state-contractor-licenses`, `custom-construction-sales-job-postings`, `custom-trade-association-directories`, `custom-sos-business-registrations`.
- Build order favors clean APIs first per blueprint Section 8: sam-gov + usaspending (priority 1), job-postings (priority 2), trade-association-directories (priority 3), sos-registrations + contractor-licenses (priority 4).
- Each priority-1 adapter ingests at least one real row from real public data into `pathfinder.projects` scoped by `organization_id=<internal_uuid>`. Priority 2 ships against keyless/low-cost sources. Priority 3 and 4 may ship as `type: 'tier-2-human-assist'` or `'pending'` per blueprint Section 8 and 10.
- agent_runs rows written per cycle (`lib/inngest/functions/ingest-org-requested.ts:86-107,258-273`).

**Files to touch:**
- `lib/adapters/sources/sam-gov-entity.ts` (new): SAM Entity Management API, NAICS 236/237/238/532412 filter, key from `process.env.SAM_GOV_API_KEY`.
- `lib/adapters/sources/usaspending-recipients.ts` (new): USAspending recipient/awardee search, construction NAICS.
- `lib/adapters/sources/construction-sales-job-postings.ts` (new): keyless sources (career-page RSS, aggregator structured data); paid Indeed/LinkedIn deferred.
- `lib/adapters/sources/trade-association-directories.ts` (new): AGC/ABC/NECA/AED; slow-refresh; degrade to `pending` per portal if scraping fragility hits.
- `lib/adapters/sources/sos-business-registrations.ts` (new): per-state Socrata where available; multi-state aggregator; ship accessible states first.
- `lib/adapters/sources/state-contractor-licenses.ts` (new): CA/TX/FL first; multi-state aggregator; fragile boards register `tier-2-human-assist`.
- `lib/adapters/sources/index.ts`: append imports + entries in the `SOURCE_ADAPTERS` map. **Funder do-not-touch overlap:** the seven Funder entries (`:33-39`) must remain unchanged; append only.
- `__tests__/adapters/sources-internal.test.ts` (new): smoke test per adapter (mocked fetch via `SourcePollOptions.fetch` test seam at `lib/adapters/sources/types.ts:48-50`).

**Net-new vs reconfigure vs config-only:** Net-new (six new adapters). The two "reconfigure" sources from the blueprint (sam-gov, usaspending) become net-new modules because the legacy inline versions in `lib/ingestor.ts` are Zedcor-coupled and point at the wrong SAM endpoint (Opportunities vs Entity Management). Pattern mirrors Funder's Stage 3 decision (`docs/REPORT-funder-onboarding.md` §2.1).

**CI checks:** next build, lint, typecheck, vitest passes. pnpm-lock.yaml regeneration if any new dep added (likely a small RSS parser or HTML scraper for the directory adapter; prefer reusing `lib/adapters/rss.ts` and standard fetch where possible to avoid lockfile churn). No do-not-touch path modified.

**Cross-stage dependencies:** Requires Stage 4 (subscriber opt-in) to actually fire. Stage 6 (qualifier) consumes raw events from these adapters.

**Open questions and defaults:**
- The SAM Entity Management endpoint shape differs per query param set. Default: filter by `entityRegistrationStatus=Active` and NAICS list; cap response to records updated in the last 90 days to bound the per-cycle queue.
- Per-state SOS portals do not all use Socrata. Default: ship CA/TX/FL via Socrata first; per the blueprint, the remaining states register `pending` and the org dashboard shows "X sources in setup" until they ship. Acceptable per Section 8 paragraph 3.
- AGC/ABC/NECA/AED scraping fragility. Default: each portal that proves fragile registers `type: 'tier-2-human-assist'` per blueprint Section 10.3. Stage 5 does NOT block on full national directory coverage.

### Stage 6, Qualifier plus enricher plus geo plus adjacency

**Acceptance criteria:**
- A new per-org qualifier under `lib/agents/internal/qualifier.ts` gates raw company records to genuine active-sales-motion construction-vertical companies. Returns `{ qualified, reason, inferred_service_category?, sales_motion_signal? }`, mirroring `lib/agents/funder/qualifier.ts:1-110`'s shape so the subscriber drops noise pre-Sonnet.
- Internal enricher under `lib/agents/internal/enricher.ts` fills company website, LinkedIn profile, employee count, service category, primary contacts. Contact resolution folds into the enricher (blueprint Section 6).
- Internal geo-mapper under `lib/agents/internal/geo.ts` maps each company to HQ plus operating states. No Unicron branches, no coverage radius.
- Internal adjacency-mapper under `lib/agents/internal/adjacency.ts` is built but **inactive by default**, gated on `process.env.INTERNAL_SEED_HANDOFF_LOADED === 'true'` or the absence of seed-data rows. Per blueprint Section 10.5 ("real data, gated").
- Subscriber wiring at `lib/inngest/functions/ingest-org-requested.ts` adds a per-slug qualifier dispatch (today line 157 calls `qualifyForFunder` unconditionally for `funder` slug; refactor to a small switch keyed on `org.slug` so `internal` projects route to `qualifyForInternal`). Funder path stays bit-identical.

**Files to touch:**
- `lib/agents/internal/qualifier.ts` (new).
- `lib/agents/internal/enricher.ts` (new).
- `lib/agents/internal/geo.ts` (new).
- `lib/agents/internal/adjacency.ts` (new, inactive).
- `lib/inngest/functions/ingest-org-requested.ts:157-174` (modify): switch dispatch on slug. **Funder do-not-touch overlap:** the Funder branch must produce bit-identical output. Verify with the existing Funder unit tests under `__tests__/agents/funder-qualifier-geo.test.ts`.
- `__tests__/agents/internal-qualifier-geo.test.ts` (new).

**Net-new vs reconfigure vs config-only:** Net-new four modules (parallel-module pattern from Funder per `docs/REPORT-funder-onboarding.md` §2.2). Subscriber dispatch is a small reconfigure.

**CI checks:** next build, lint, typecheck, vitest passes, **Funder regression tests still pass unchanged**, MEMORY/spec-references.md updated.

**Cross-stage dependencies:** Requires Stage 5 (adapters produce events to qualify). Stage 7 (ranker) reads `raw_payload.internal_*` keys the qualifier writes.

**Open questions and defaults:**
- Should adjacency stay inactive at file level, or only at runtime? Default: file ships and is unit-tested; runtime invocation is env-gated. Activation is a one-line env flag after Unicron delivers the seed handoff (blueprint Section 10.5).
- The Pathfinder Haiku classifier (`prompts/computer-ranker.md`-adjacent) is Zedcor-shaped per the blueprint. Default: do not reuse; write the Internal qualifier as a fresh Haiku call with `architecture.business_summary.lead_type` and `architecture.lead_unit.schema.service_category.enum_values` as the classifier criteria.

### Stage 7, Ranker (five new extractors plus reuse)

**Acceptance criteria:**
- Five net-new extractors added to `EXTRACTORS` map (`lib/agents/ranker/genericScorer.ts:221-235`): `sales_motion_strength`, `operational_footprint`, `federal_signal`, `project_driven_fit`, `association_presence`. Existing `recency` (line 208-219) is reused unchanged.
- All five extractors return 0..1, read `project + architecture + raw_payload` only, no LLM call. Pattern mirrors Funder extractors (`:147-219`).
- Internal score writes are 0..100 via the existing `Math.round(raw * 100)` at `:265`. No change to the rounding or clamp.
- Existing-customer regression: Zedcor, Realberry, Funder scores unchanged. Internal weights reference only Internal-specific keys plus `recency`; non-Internal orgs' weight maps do not reference the new keys, so they cannot fire.

**Files to touch:**
- `lib/agents/ranker/genericScorer.ts`: append five extractor functions and register them in `EXTRACTORS`. Strictly additive; existing code unchanged. **Zedcor + Funder do-not-touch overlap:** the existing extractors and EXTRACTORS-map entries must be byte-identical pre/post.
- `__tests__/agents/internal-ranker.test.ts` (new): per-extractor unit tests; Realberry/Funder/Zedcor regression placeholders if existing tests do not cover them.

**Net-new vs reconfigure vs config-only:** Net-new five functions; one register-map append. No Sonnet rationale work (already closed by Funder).

**CI checks:** next build, lint, typecheck, vitest passes, **existing-customer regression check** (Funder + Realberry + Zedcor scores stable on fixture inputs), MEMORY/spec-references.md updated.

**Cross-stage dependencies:** Requires Stage 6 (enricher/qualifier feed the `raw_payload` keys the extractors read).

**Open questions and defaults:**
- What raw_payload keys do the extractors read? Default per blueprint Section 6: `sales_motion_strength` reads `raw_payload.sales_motion_signal` (set by qualifier) plus job-postings count; `operational_footprint` reads `raw_payload.footprint` (set by enricher/geo); `federal_signal` reads `raw_payload.federal_registration` from the sam-gov adapter; `project_driven_fit` reads project_stage + USAspending NAICS; `association_presence` reads `raw_payload.association_memberships` (set by the directory adapter).
- Architecture weights sum to 1.0 in the JSON. Default: no normalization. The clamp at `:263` handles overflow.

### Stage 8, Verifier

**Acceptance criteria:**
- Non-Zedcor verifier branch (`app/api/cron/verifier/route.ts:480-503`) dispatches by slug so Internal projects route to a new `verifyInternalProject` and Funder projects continue to `verifyFunderProject`.
- New `lib/agents/internal/verifier.ts` (or `lib/agents/verifier/internalChecks.ts` for path symmetry with Funder) implements Internal-shaped checks: company exists in public record (org_name resolves in SAM Entity / SOS feed), active sales motion corroborates (qualifier signal plus at least one of: job posting, SAM-registered, customer-list match), footprint and licensure claims check out (geo + license-board evidence in raw_payload).
- Thresholds read from `architecture.scoring.thresholds.verified` * 100 (Internal: 65) and `high_priority` * 100 (Internal: 80), mirroring Funder pattern.

**Files to touch:**
- `lib/agents/verifier/internalChecks.ts` (new): mirror `lib/agents/verifier/funderChecks.ts` shape and export `verifyInternalProject`.
- `app/api/cron/verifier/route.ts:480-503`: switch on org slug to choose `verifyFunderProject` vs `verifyInternalProject`. **Funder do-not-touch overlap:** the Funder branch behavior must be byte-identical pre/post.
- `__tests__/agents/internal-verifier.test.ts` (new).

**Net-new vs reconfigure vs config-only:** Net-new internalChecks module; small reconfigure to the dispatch site.

**CI checks:** next build, lint, typecheck, vitest passes, **existing-customer regression check** (Funder verifier behavior bit-identical), MEMORY/spec-references.md updated.

**Cross-stage dependencies:** Requires Stage 7 (ranker writes the score the verifier compares against thresholds). Stage 9 (digest) depends on Stage 8 setting `verified=true`.

**Open questions and defaults:**
- Should the dispatch be by `org.slug` or by `architecture.vertical`? Default: by slug, matching the subscriber-opt-in pattern (Stage 4) and Funder verifier dispatch shape. Refactor to vertical-based dispatch when a third generic org needs it.
- Will Internal verifier need a Sonnet call (like Funder's anchor-extraction Check 1)? Default: no Sonnet for Internal v1. Use deterministic anchor checks only. Add a Sonnet check only if false-positive rate from the deterministic checks proves unacceptable in production.

### Stage 9, Daily digest plus kanban load

**Acceptance criteria:**
- A new `lib/agents/internal/digest.ts` builds a daily morning Slack digest scoped by `organization_id=internal`, listing the day's verified-companies-ranked-above-threshold.
- A new cron entry in `vercel.json` triggers the digest. Default: `0 13 * * 1-5` (6am Pacific, weekdays).
- The digest also calls `lib/kanban-writer.ts` (per blueprint Section 6 "Reuse plus reconfigure") to load each verified company into the Pathfinder pipeline kanban at the New / Outreach Ready stage.
- Slack credentials gracefully degrade per blueprint Section 9 "Degrade gracefully without credentials".

**Files to touch:**
- `lib/agents/internal/digest.ts` (new). Parallel to `lib/agents/funder/dealMemo.ts`.
- `app/api/cron/internal-daily-digest/route.ts` (new): thin wrapper that calls the digest module on cron. Pattern from `app/api/cron/funder-weekly-memo/route.ts`.
- `vercel.json:2-13`: append one cron entry. **Per-CLAUDE.md merge rule, append only; do not rewrite the array.**
- `lib/kanban-writer.ts`: verify org-scoping. If it is Zedcor-only today, refactor to accept organization_id; or add a parallel `lib/agents/internal/kanban-writer.ts`. Default to the parallel-module approach to keep Zedcor untouched.
- `__tests__/agents/internal-digest.test.ts` (new).

**Net-new vs reconfigure vs config-only:** Net-new digest module + cron + route. Reconfigure (or parallel) the kanban-writer.

**CI checks:** next build, lint, typecheck, vitest passes, vercel.json valid JSON, MEMORY/spec-references.md updated.

**Cross-stage dependencies:** Requires Stage 8 (verified rows exist). Stage 10 outreach drafts are referenced from the digest message.

**Open questions and defaults:**
- Which Slack workspace and channel? Default: Unicron's own Slack, `#pathfinder-internal-leads`. Operator provisions the channel; the route picks it up from `process.env.INTERNAL_SLACK_CHANNEL`.
- Volume cap per digest message? Default: top 25 verified companies by score; pagination link to `internal.unicron.systems` for the full list.

### Stage 10, Outreach plus integrations

**Acceptance criteria:**
- New `lib/agents/internal/outreachDrafter.ts` produces three drafts per verified company: cold email, LinkedIn message, internal HubSpot note. Reads `architecture.outreach.{persona, tone, value_prop}`.
- HubSpot connector writes the note to Unicron's own HubSpot portal under the company record. Env-gated; degrade gracefully without credentials.
- Slack one-liner per verified company (in addition to the digest at Stage 9).
- KPI metric_id queries added to `lib/metrics/kpiQueries.ts` for Internal's four ui_plan KPIs that are not yet implemented (`verified_count_1d`, `active_motion_pct`, `count_by_category`, `verified_count`). Two existing keys (`avg_score`, `sources_live`) are reused as-is.
- **Bug fix included:** `app/[slug]/page.tsx:63` swap `org_id` to `organization_id`. Flag in PR description as a Funder-and-Realberry-affecting platform fix that lights up the previously empty LeadCardList for every non-Zedcor org.
- Run `verifyBuildOut` headless verification for Internal (existing `lib/inngest/functions/verify-build-out.ts`).

**Files to touch:**
- `lib/agents/internal/outreachDrafter.ts` (new). Parallel to `lib/agents/funder/outreachDrafter.ts`.
- `lib/agents/internal/outreachChannels.ts` (new). Parallel to `lib/agents/funder/outreachChannels.ts`.
- `lib/metrics/kpiQueries.ts:86-92`: append four new entries to `kpiQueryByMetricId`. **Funder do-not-touch overlap:** the four Funder entries stay; append only.
- `app/[slug]/page.tsx:63`: `org_id` to `organization_id`. **Existing-customer regression:** Funder and Realberry LeadCardList becomes populated; flag in PR description as expected, not a regression (mirrors Funder Stage 5 Sonnet rationale flag in `docs/REPORT-funder-onboarding.md` §2.3).
- `__tests__/metrics/internal-kpiQueries.test.ts` (new).
- `__tests__/agents/internal-outreach.test.ts` (new).

**Net-new vs reconfigure vs config-only:** Net-new outreach modules; additive KPI queries; one-line page-renderer fix.

**CI checks:** next build, lint, typecheck, vitest passes, **existing-customer regression check on Funder/Realberry/Zedcor dashboards**, MEMORY/spec-references.md updated.

**Cross-stage dependencies:** Requires Stage 8 (verified rows) and Stage 9 (digest, which links to drafted outreach).

**Open questions and defaults:**
- HubSpot portal ID? Default: read from `process.env.UNICRON_HUBSPOT_PORTAL_ID`; route logs `degraded: no_hubspot_credentials` and continues if absent.
- LinkedIn drafting tone? Default: per `architecture.outreach.tone = "direct, peer-to-peer, operator-credible, names the prospect's own prospecting pain, no fluff"`.

### Stage 11, End-to-end live proof plus final PR

**Acceptance criteria:**
- Run the Phase 2E onboarding state machine end-to-end on Internal: setting_up to first_run to ranking to ready_to_view to operator_viewed to build_out_complete (`lib/inngest/functions/check-ready-to-view-cron.ts`, `lib/inngest/functions/verify-build-out.ts`).
- Verify `https://internal.unicron.systems` returns 200 with populated KPIStrip, ChartGrid, LeadCardList for real public-data leads. Multi-Vercel verification rule applies: pathfinder and unicron-platform are separate projects; verify each independently.
- Existing-customer regression check passes on Zedcor (`/zedcor`), Realberry (`/realberry-is-a-3-6b`), and Funder (`/funder`).
- Daily-digest cron has fired at least once and posted to Slack (or logged `degraded: no_slack_credentials` gracefully).
- Single PR `internal-onboarding -> main` open for human review. NOT merged (per CLAUDE.md "Never merge your own PR").
- `Pathfinder/docs/REPORT-internal-onboarding.md` written, stage-by-stage with commit shas and evidence.

**Files to touch:**
- `Pathfinder/docs/REPORT-internal-onboarding.md` (overwrite existing stub at `Pathfinder/docs/REPORT-internal-onboarding.md`): final stage-by-stage report.
- No production code changes anticipated.

**Net-new vs reconfigure vs config-only:** Config-only (documentation + verification commands).

**CI checks:** Full CI green: next build, lint, typecheck, vitest, build-out verification headless, multi-Vercel verification on both projects.

**Cross-stage dependencies:** Requires all prior stages.

**Open questions and defaults:**
- Adjacency activation. Default per blueprint Section 11 "Adjacency activation (post-build, gated)": ships inactive. When Unicron delivers the seed handoff, a follow-up branch loads it for organization_id=internal and re-runs the adjacency-mapper across verified rows.
- Architecture JSON weights and taxonomy redlining (blueprint Section 12 "Redline candidates if revisited"). Default: ship the JSON as committed in `Pathfinder-Internal-Architecture.json`. Kyle can edit and re-POST without code changes.

---

## Open questions and defaults

The following surfaced during this audit and are not stage-specific. Each carries a default so the autonomous build does not stall.

1. **Display name redline.** Blueprint Section 10.1 leaves "Unicron Internal" as a placeholder. Default: ship as "Unicron Internal" in `branding.display_name`. Kyle redlines via re-POST or a column-update; no code change required.
2. **Job-feed API access.** Blueprint Section 10.2. Default: keyless/low-cost sources only for v1. Paid Indeed/LinkedIn API access is a later cost decision, not a v1 blocker.
3. **Trade-association directory freshness.** Blueprint Section 10.3. Default: slow-refresh enrichment, not a timely trigger. Fragile portals register tier-2-human-assist per the SourceAdapter `type` field at `lib/adapters/sources/types.ts:22`.
4. **SAM.gov endpoint.** Blueprint Section 10.4 resolved: Entity Management (registration), not Opportunities. Stage 5 implements accordingly.
5. **Adjacency seed handoff.** Blueprint Section 10.5: real-data, gated. Default: ship adjacency module inactive (Stage 6); activation is post-build.
6. **Ranker threshold calibration.** Blueprint Section 10.6: ship at 0.65 verified / 0.80 high_priority; recalibrate after first weeks. Default: JSON values as-is.
7. **Daily volume confidence.** Blueprint Section 10.7. Default: ship; instrument; adjust cron cadence from real numbers.
8. **Geographic scope.** Blueprint Section 10.8: national, US-only. Default: `architecture.geography.defaults = []` (no exclusion). Stage 5 contractor-license and SOS adapters ship accessible states first per Section 8 paragraph 3.
9. **Score scale.** Blueprint Section 10.9: 0-100 stored, thresholds * 100 at read. Default: Funder's pattern in verifier already enforces this; Internal inherits via the new verifier dispatch in Stage 8.
10. **Funder platform-gap overlap.** Blueprint Section 10.10: branch off main after Funder merges, inherit closed gaps. Resolution from this audit: **Funder gap-closes have all shipped on this branch's `internal-onboarding` ancestor**. Internal inherits genericRationale, kpiQueries, and SOURCE_ADAPTERS directly. The remaining work is Internal-shaped modules in `lib/agents/internal/` plus the slug-gate, dispatch-switch, and KPI-append edits to shared files (each strictly additive; Funder behavior unchanged).
11. **Subscriber slug gate.** Audit-discovered (blueprint Section 4 missed it). `lib/inngest/functions/ingest-org-requested.ts:56` hardcodes `'funder'`. Default: Stage 4 adds `'internal'`; refactor to flag-based gating only when a third org needs it.
12. **Verifier dispatch hardcoding.** Audit-discovered. `app/api/cron/verifier/route.ts:483` always calls `verifyFunderProject` for non-Zedcor orgs. Default: Stage 8 switches by slug; Funder behavior bit-identical.
13. **`/[slug]/page.tsx` `org_id` bug.** Audit-discovered. Stage 10 includes the one-line fix as a platform-affecting improvement that benefits Funder and Realberry as well.
14. **Auto-merge vs CLAUDE.md "Never merge your own PR" tension.** Carried from Funder's audit (`docs/PLAN-funder-onboarding.md` §6.1). Default: open PR, hand off, do not auto-merge. Kyle promotes after review.

---

## Acceptance for Stage 1

- Document exists at `Pathfinder/docs/PLAN-internal-onboarding.md`.
- Every blueprint Section 4 line (13 items) resolved with file:line evidence.
- Funder gap-closes verified against HEAD: all three closed (genericRationale, kpiQueries, SOURCE_ADAPTERS). Two new gating surfaces discovered (subscriber slug-gate, verifier dispatch hardcode).
- Stages 2 through 11 resized with files-to-touch, net-new-vs-reconfigure split, CI checks, dependencies, defaults.
- No production code modified, no merge, no destructive git operation. This is the only file written.

Stage 1 is complete. Stage 2 (org record persistence) is the next step. The run continues on this plan with no human gate per the runner prompt.
