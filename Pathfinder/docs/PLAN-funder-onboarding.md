# PLAN — Funder Onboarding (Pathfinder organization #3)

**Stage:** 1 of 10 — Platform Audit (no code, no PR).
**Spec:** `Pathfinder/Pathfinder-Funder-Build-Spec.md` §4 Stage 1.
**Blueprint:** `Pathfinder/Pathfinder-Funder-Blueprint.md` §4 (the rows to verify).
**Date:** 2026-05-20.
**Author:** Claude Code, autonomous run (per `Pathfinder/Pathfinder-Funder-Claude-Code-Kickoff.md`).

This document is the evidence-first control point inside the run. It audits the live Pathfinder codebase against blueprint §4, resolves the four open Stage-1 questions, and resizes Stages 2–10 based on what was actually found.

---

## 1. Platform-state inventory (corrected, with file:line evidence)

| Layer | Blueprint state | Audited state | Evidence |
|---|---|---|---|
| 2A — slug routing + operator auth | Scaffolded | **Shipped** (page + layout exist; per-render `flipToOperatorViewed` wired) | `app/[slug]/page.tsx:32-52`, `app/[slug]/layout.tsx`, `lib/agents/operator-viewed.ts` |
| 2B — tenant config layer | Shipped | **Shipped** (types, resolver, base template, `ui_plan` in type) | `lib/types/architecture.ts:10-29`, `lib/config/resolveArchitecture.ts:20-85`, `lib/config/baseTemplate.ts:12-66` |
| 2C — per-org dispatch (ranker) | Partial | **Shipped** — non-Zedcor projects routed to `scoreGenericProject` via `loadOrgArchitecture`; Zedcor falls through to kernel | `app/api/cron/ranker/route.ts:35-40`, `:768-845`; `lib/agents/loadOrgArchitecture.ts:50-71` |
| 2C — per-org dispatch (ingestor) | Partial | **Shipped** as cron-based dispatch (`ingest-all-orgs` emits `pathfinder/org.ingest_requested` per org every 4h) | `lib/inngest/functions/ingest-all-orgs-cron.ts:27-75` |
| 2C — generic-scorer extractors | Stub-heavy (construction-shaped) | **Confirmed stub-heavy.** Real: `geography_match`, `asset_class_match`, `trigger_strength`. Returns 0: `basis_fit`, `unit_count_fit`. Unknown weight keys are skipped cleanly (forward-compat). No Funder extractors yet. | `lib/agents/ranker/genericScorer.ts:64-103`, `:117-128` |
| 2C — generic-org Sonnet rationale | Not built | **Confirmed not built.** Non-Zedcor rationale is a hand-built debug string from component values, not a Sonnet call. | `app/api/cron/ranker/route.ts:797-807` (`"Scored by ${display_name} weights … no extractable features"`) |
| 2D / Build-Out Pass Slice 2 — schema-driven UI | Partial / Slice 1 only | **More complete than blueprint asserts.** `/[slug]` already renders KPIStrip + FilterSidebar + ChartGrid + LeadCardList from `ui_plan`. DoD smoke markers (`data-kpi-strip`, `data-lead-card`, `data-chart`) are unconditional. | `app/[slug]/page.tsx:43-141` |
| Build-Out Pass — KPI metric query layer | n/a | **Stub.** `kpiQueryByMetricId` is an empty map; every Funder KPI resolves to `null` / em-dash until real queries land. | `lib/metrics/kpiQueries.ts:18-30` |
| 2E — onboarding state machine | Spec'd | **Shipped end-to-end through `build_out_complete`.** `POST /api/organizations` validates + inserts + emits `pathfinder/org.created`. `orgCreated` flips `setting_up → first_run`. `checkReadyToViewCron` advances to `ready_to_view` / `awaiting_threshold`. `verifyBuildOut` lands `build_out_complete` / `build_out_failed`. | `app/api/organizations/route.ts:44-135`, `lib/inngest/functions/org-created.ts:20-92`, `lib/inngest/functions/check-ready-to-view-cron.ts`, `lib/inngest/functions/verify-build-out.ts`, `supabase/migrations/20260511_phase2e_organizations_status.sql`, `supabase/migrations/20260513_phase2e_buildout_status.sql` |
| Source adapter registry | Shipped sparse | **Different shape than blueprint described.** `lib/adapters/index.ts` exposes `ADAPTERS` keyed by **adapter kind** (`socrata`, `rest`, `rss`, `json-dump`, `custom`), not a single source-id registry. The currently-live sources (USAspending, SAM.gov, Harris County, etc.) are inlined in `lib/ingestor.ts` rather than registered by id. There is no `SOURCE_ADAPTERS` Record<sourceId, …>. | `lib/adapters/index.ts:21-29`, `lib/ingestor.ts:468-508` |
| Realberry org row | Mentioned in blueprint as second tenant | **Persisted** (slug `realberry-is-a-3-6b`); already backfilled to `operator_viewed` | `supabase/migrations/20260511_phase2e_organizations_status.sql:88` |

---

## 2. Resolutions for the four Stage-1 open questions

### Q1 — Lead table: `projects` vs `leads`?

**Resolution: `pathfinder.projects`.** All live writers and readers use `projects`. There is no `pathfinder.leads` table.

Evidence (representative subset):
- `lib/ingestor.ts:468-508` (read/insert)
- `lib/briefing.ts:156-204`
- `lib/lead-detail-data.ts:64-131`
- `lib/inngest/functions/check-ready-to-view-cron.ts:81-96`
- `app/[slug]/page.tsx:62-65` (`.from('projects').select('*').eq('org_id', org.id)`)

The blueprint's `pathfinder.leads` reference was aspirational from the Phase 2E SPEC. Funder rides the existing `projects` table, scoped by `organization_id`. The vocabulary mapping (`lead → opportunity`, `project → organization`) is purely UI/schema and lives in `architecture.vocabulary` and `architecture.lead_unit`. No rename, no migration, no destructive schema change required.

### Q2 — Score scale: 0–100 vs 0–1?

**Resolution: store 0–100 integer, scale thresholds × 100 at read.**

- `scoreGenericProject` returns `Math.round(raw * 100)` — 0..100 integer (`lib/agents/ranker/genericScorer.ts:132`).
- `scoreProject` (Zedcor kernel) also returns 0..100 (`lib/scoring.ts`).
- `BASE_ARCHITECTURE.scoring.thresholds = { verified: 0.6, high_priority: 0.8 }` — 0..1 (`lib/config/baseTemplate.ts:37`).
- Funder architecture JSON ships thresholds at 0..1 (`verified: 0.65, high_priority: 0.80`).
- Verifier currently consults `fetchActiveScoringConfig`, **not** `architecture.scoring.thresholds`, for non-Zedcor orgs (`app/api/cron/verifier/route.ts:31`).

The reconciliation lives at the read site (verifier + UI), not the write site: thresholds × 100 when comparing to a stored score. Score writes stay 0..100. This is the minimum-blast-radius fix and is generic-path-only (Zedcor kernel untouched).

### Q3 — Per-org dispatch path: fundamentally broken or workable?

**Resolution: workable. No hard-halt.**

The ranker dispatch already routes any non-Zedcor `organization_id` to `scoreGenericProject` via `loadOrgArchitecture` (`app/api/cron/ranker/route.ts:768-845`). The Zedcor fall-through is below and untouched. The ingestor dispatches per-org via `ingest-all-orgs-cron` every 4h. The `org.created` event fires from `POST /api/organizations` and `orgCreated` flips status. `checkReadyToViewCron` advances to `ready_to_view`. `verifyBuildOut` lands `build_out_complete`.

The named functions in the blueprint (`ingestOrgFunction`, `rankAndVerifyOrgFunction`) do **not** exist as a single on-demand pair — the functionality is split across `orgCreated` (status flip), `ingestAllOrgsCron` (cron-based dispatch), and `checkReadyToViewCron`. The `org-created.ts:9-13` comment is explicit that on-demand first-run depends on Phase 2C slice 6 (source adapter registry) which hasn't shipped. Funder rides the existing cron-based pipeline. Time-to-first-data after `POST /api/organizations` is bounded by the ingest cron (≤4h) and the ranker cron (≤30m). The blueprint's name mismatch is not a blocker.

### Q4 — `POST /api/organizations`, `org.created`, source registry — exist?

| Item | Exists | Where |
|---|---|---|
| `POST /api/organizations` (Zod-validated, API-key gated, CORS for Metacron) | ✅ | `app/api/organizations/route.ts:75-135` |
| `pathfinder/org.created` Inngest event emission | ✅ | `app/api/organizations/route.ts:115-132` |
| `orgCreated` Inngest function (`setting_up → first_run`) | ✅ | `lib/inngest/functions/org-created.ts:20-92` |
| `ingestOrgFunction` (named per blueprint) | ❌ — replaced by `ingestAllOrgsCron` cron-based dispatch | `lib/inngest/functions/ingest-all-orgs-cron.ts:27-75` |
| `rankAndVerifyOrgFunction` (named per blueprint) | ❌ — replaced by `app/api/cron/ranker/route.ts` (cron) + `verifier/route.ts` (cron) | n/a |
| `ui_plan`-driven `/[slug]` renderer (KPI strip, charts, filters, lead cards) | ✅ | `app/[slug]/page.tsx:131-140` |
| Build-Out verification (`verifyBuildOut`) | ✅ | `lib/inngest/functions/verify-build-out.ts` |
| Source adapter id-keyed registry (`SOURCE_ADAPTERS`) | ❌ — adapters keyed by **kind** (socrata/rest/rss/json-dump/custom), not by source id | `lib/adapters/index.ts:21-29` |

---

## 3. Resized stage plan (Stages 2–10)

Stage IDs match Build-Spec §4. Where the audit found the platform more complete than the blueprint expected, scope shrinks. Where it found new gaps, scope expands.

### Stage 2 — Org record & onboarding path (smaller than blueprint)

**Original scope:** Build `POST /api/organizations` if missing; build `org.created` event, `ingestOrgFunction`, `rankAndVerifyOrgFunction`; persist Funder.

**Audited scope (smaller):** The endpoint and event already exist. The named on-demand functions do **not** exist and the build does not need them — the cron-based pipeline is the supported path. Stage 2 collapses to:
1. `POST /api/organizations` with the Funder body (name=`Funder`, slug=`funder`, customer_org_id=`funder`, architecture=contents of `Pathfinder-Funder-Architecture.json`). Authenticated with `UNICRON_INGEST_API_KEY`.
2. Verify the row appears in `pathfinder.organizations` with `status='setting_up'`, then `'first_run'` after `orgCreated` runs.
3. Confirm `resolveArchitecture(row.architecture)` round-trips cleanly (jest unit test on a fixture loaded from the JSON file).
4. Confirm `/funder` returns 200 from the existing renderer (will show empty KPIs/leads — that's expected pre-ingest).

**No code changes anticipated** beyond the script/curl that POSTs and the round-trip test. If validation fails (Zod rejection on the architecture jsonb), patch the relaxed `z.record(z.unknown())` shape only if necessary.

### Stage 3 — Source adapters (largest stage)

**Original scope:** 7 adapters in priority order; register in `SOURCE_ADAPTERS`.

**Audited scope (different shape, same volume):** No id-keyed `SOURCE_ADAPTERS` registry exists. Two implementation paths are viable:

- **Path A (smaller):** Inline each Funder source as a function in `lib/ingestor.ts`, mirroring the existing `USAspending`/`SAM.gov`/`harris-county` pattern. Gate by `architecture.sources[].id`. Cheapest, but inconsistent with the future direction.
- **Path B (preferred):** Introduce `lib/adapters/sources/<source-id>.ts` modules that conform to the existing `Adapter` interface (`lib/adapters/types.ts`), plus a thin `SOURCE_ADAPTERS: Record<string, Adapter>` registry next to `ADAPTERS`. This is additive, mirrors the existing kind-based registry, and pays back for org #4+.

Stage 3 will use **Path B** for the three priority sources (ProPublica, IRS exempt-org, EA Forum) and **Path A** for the remaining four (philanthropy trade-press RSS, accelerator pages, business-license, funder 990) until the volume warrants migration. Source adapters that fail integration land at `SourceRef.type='tier-2-human-assist'` or `'pending'` per Build-Spec §3.

Acceptance still per Build-Spec §4 Stage 3: each adapter pulls real records into `pathfinder.projects` scoped by Funder's `organization_id`, `agent_runs` rows written, the three priority sources produce real data.

### Stage 4 — Qualifier & enrichment (unchanged)

Scope from Build-Spec stands. The existing `lib/agents/enricher.ts`, `adjacency.ts`, `geo.ts` are reconfigured via Funder's architecture (persona/tone/vertical) and per-org prompt selection. The per-org qualifier is net-new (the existing Pathfinder Haiku classifier is Zedcor-shaped). Adjacency seeds a clearly tagged synthetic portfolio with `organization_id=<funder_uuid>` and `source='synthetic-portfolio'`.

### Stage 5 — Ranker (larger than blueprint)

**Audited scope:**
1. Add 6 Funder extractors to `lib/agents/ranker/genericScorer.ts`: `thesis_fit`, `founder_credential`, `raise_stage`, `talent_density`, `peer_funder_signal`, `recency`. Strictly additive — keep the existing `geography_match`/`asset_class_match`/`trigger_strength` extractors so Realberry (and any future construction-shaped org) is unaffected.
2. Close the generic-org Sonnet rationale gap (`app/api/cron/ranker/route.ts:797-807`). Today this branch emits a debug string; replace with a real Sonnet rationale call modeled on the Zedcor rationale call below it, parameterized by `architecture`. **This is the platform-gap close that also serves Realberry** — must pass the existing-customer regression gate (Zedcor scores stable; Realberry rationale changes from debug-string to real prose is *expected and not a regression*; flag in PR description with verbatim before/after).
3. Reconcile score scale per Q2: read `architecture.scoring.thresholds.{verified,high_priority}` and multiply by 100 at compare sites only. Score writes remain 0..100.

**Touches shared code → existing-customer regression gate required.** No Zedcor-owned do-not-touch files modified.

### Stage 6 — Verifier (larger than blueprint)

**Audited scope:** The verifier currently reads `fetchActiveScoringConfig` (Zedcor-shaped) and does not consult `architecture.scoring.thresholds` for non-Zedcor orgs. Stage 6 adds an org-aware branch:
- For non-Zedcor orgs, read thresholds from `architecture.scoring.thresholds` (× 100 per Q2).
- Add Funder verification checks: org exists in public record (org_name resolves), founder bios corroborate (claimed founder appears in IRS/ProPublica/LinkedIn-public), org not already widely funded (peer-funder co-funding signal under threshold).
- Reuse the existing Sonnet-yes/no schema for Check 1.

Existing-customer regression gate required (verifier is shared code, gated by organization_id branch).

### Stage 7 — Weekly Deal Memo (unchanged)

Reconfigure `lib/briefing.ts`-equivalent flow for thesis-grouped one-page email + PDF. Email via Resend (already wired). PDF generation is net-new for the platform but bounded — single template, server-side render. Trigger via cron or `/api/cron/briefer` extension.

### Stage 8 — Outreach & integrations (unchanged)

Reconfigure outreach drafter channels: cold email, Slack one-liner, HubSpot record fields. Gate live integration on env-var presence. `compliance_flag=biosecurity-review` opportunities skip auto-draft (per Build-Spec §2 resolved default 2).

### Stage 9 — Dashboard renderer (smaller than blueprint)

**Original scope:** Complete the Build-Out Pass renderer wiring for `/[slug]` (KPI strip, charts, lead cards, filters from `ui_plan`).

**Audited scope (smaller):** The renderer wiring is already complete (`app/[slug]/page.tsx:131-140`). Stage 9 is now:
1. Populate `lib/metrics/kpiQueries.ts` with real query functions for Funder's KPI `metric_id`s: `verified_count_7d`, `actively_raising_count`, `avg_score`, `sources_live`. All four are SQL queries over `pathfinder.projects` and `pathfinder.organizations`, scoped by `organization_id`. Adding entries to `kpiQueryByMetricId` is purely additive — Zedcor's KPI rendering at `/zedcor` does **not** route through `/[slug]/page.tsx`, so adding new metric_ids cannot affect it.
2. Wire chart data sources (count_by_thesis, verified_count by week) — same pattern.
3. Run `verifyBuildOut` headless verification for Funder.

The Realberry regression check: confirm Realberry's existing empty `kpiQueryByMetricId` keys still resolve to em-dash (since the map is additive).

### Stage 10 — End-to-end & deploy verification (unchanged)

Full Phase 2E walk: `setting_up → first_run → ranking → ready_to_view → operator_viewed → build_out_complete`. Deploy verification per Build-Spec §3 multi-Vercel rule. `/zedcor` and `/realberry` unregressed checks (both in production today).

---

## 4. Hard-halt analysis

Stage 1 finds **no hard-halt condition**:
- Per-org dispatch path is functional (Q3).
- No destructive schema change required (Funder rides existing `projects` table and `organizations` row pattern).
- All Zedcor-owned do-not-touch paths are honored by the resized plan.

---

## 5. Net deltas from blueprint §11

| Stage | Direction | Why |
|---|---|---|
| 1 | unchanged | — |
| 2 | **smaller** | `POST /api/organizations` and the state machine are already shipped; this stage is now persistence + verification, not infrastructure build |
| 3 | **shape change** | adapter registry has kind-keys not source-id-keys; use Path B for top-3 sources |
| 4 | unchanged | — |
| 5 | **larger** | adds generic-org Sonnet rationale (platform-gap close) on top of the 6 extractors |
| 6 | **larger** | adds the per-org threshold read branch (verifier currently doesn't consult `architecture.scoring.thresholds`) |
| 7 | unchanged | — |
| 8 | unchanged | — |
| 9 | **smaller** | renderer wiring is already done; only `kpiQueryByMetricId` population remains |
| 10 | unchanged | — |

Net: Stage 3 stays the largest absolute lift. Stage 5 grows slightly. Stages 2 and 9 shrink materially.

---

## 6. Non-blocking observations for the run

1. **Auto-merge / CLAUDE.md tension.** `Pathfinder/CLAUDE.md` states *"Never merge your own PR. Open the PR, hand off, wait. Humans review and merge."* The kickoff prompt directs auto-merge when criteria pass. The durable instruction conflicts with the one-shot. Before Stage 2 merges, this needs an explicit Kyle decision: (a) honor the kickoff override for this run only, or (b) open PRs and pause at the merge gate.
2. **Current git state.** Working branch at audit time is `ci-billing-test`, not `main`. Untracked files include all four Funder spec docs in `Pathfinder/`. Stage 2 will need to branch from `origin/main` per Pathfinder CLAUDE.md worktree rule, into `Pathfinder-worktrees/feat-funder-org-record/`.
3. **Funder architecture jsonb size.** The architecture JSON is ~3KB. `POST /api/organizations` accepts `z.record(z.unknown())` unbounded — no validation friction expected.
4. **Synthetic portfolio tagging.** Adjacency seed rows must carry `source='synthetic-portfolio'` and an explicit `is_synthetic=true` field on the project row (column may need adding — Stage 4 verifies and adds a non-NULL boolean default false if absent). This is additive, non-destructive, and gated by `organization_id=funder`.
5. **Biosecurity flag plumbing.** The compliance filter today has only a SEC branch (`lib/zedcor/...`-adjacent). Stage 4's qualifier writes `compliance_flag` on the project row; Stage 8 reads it to skip auto-draft. A new `compliance_flag` column on `pathfinder.projects` may be needed — additive only.

---

## 7. Acceptance for Stage 1

- [x] Document exists at the spec'd path (`Pathfinder/docs/PLAN-funder-onboarding.md`).
- [x] Every blueprint §4 line resolved with file:line evidence.
- [x] Four Stage-1 open questions resolved (Section 2).
- [x] Stages 2–10 resized with explicit deltas (Section 3 + 5).
- [x] No code modified, no merge.
- [x] Hard-halt analysis: none triggered (Section 4).

Stage 1 is complete. Stage 2 (org record persistence) is the next step, gated on resolution of the auto-merge / CLAUDE.md tension flagged in §6.1.
