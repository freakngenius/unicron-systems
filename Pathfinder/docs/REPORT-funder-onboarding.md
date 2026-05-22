# REPORT — Funder Onboarding Autonomous Build

**Run:** Stages 1–10, autonomous, integration branch `funder-onboarding` off `origin/main`.
**Spec:** `Pathfinder/Pathfinder-Funder-Build-Spec.md`.
**Plan:** `Pathfinder/docs/PLAN-funder-onboarding.md` (Stage 1 audit + resized plan).
**End commit:** `691cc37`.
**End state:** Single PR `funder-onboarding → main` open for human review. NOT merged.

---

## 1. Stage-by-stage summary

| # | Stage | Commit | Status | Notes |
|---|---|---|---|---|
| 1 | Platform audit | `bb322b9` | Deployed | No-code; `Pathfinder/docs/PLAN-funder-onboarding.md` + spec docs landed on branch |
| 2 | Org record (Funder persisted) | `bf34955`, `ba9b05c` | Deployed | Funder row id=`a91e88ef-be63-43d0-84f1-cc2fadf01467`, status advanced setting_up → first_run via direct insert + Inngest event |
| 3 | 7 source adapters + `SOURCE_ADAPTERS` registry + `org.ingest_requested` subscriber | `312ddc4` | Deployed | Additive; existing `lib/ingestor.ts` and kind-keyed `ADAPTERS` unchanged. Subscriber slug-gated to `{'funder'}` |
| 4 | Funder qualifier + enricher + adjacency + geo + synthetic portfolio | `12d9c61` | Deployed | 10 synthetic portfolio rows inserted live; qualifier+geo wired into Stage 3 subscriber pre-insert |
| 5 | 6 ranker extractors + generic-org Sonnet rationale | `790dfeb` | Deployed | Closes the platform gap that affected all non-Zedcor orgs. Also serves Realberry — rationale change expected, not a regression |
| 6 | Verifier: org-aware thresholds + 3 Funder checks | `60bb392` | Deployed | Non-Zedcor verifier branch reads `architecture.scoring.thresholds`; Zedcor branch untouched |
| 7 | Weekly Deal Memo (HTML email + print-ready) | `c3501aa`, `9024f22` | Deployed | Resend via direct fetch; vercel.json cron entry at Monday 14:00 UTC |
| 8 | Funder outreach drafter (email + Slack one-liner + HubSpot fields) | `dabc730` | Deployed | Env-gated graceful degrade; biosecurity-flagged opportunities skip email auto-draft |
| 9 | KPI queries populated for Funder | `7e5b041` | Deployed | 4 metric_ids: verified_count_7d, actively_raising_count, avg_score, sources_live |
| 10 | E2E + branch deploy verification | `691cc37` | Deployed | Local runner script; 4 real EA Forum opportunities ingested live |

Every kanban card (Stage 1–10) is in Deployed. None in Verified — human-only per the kickoff and CLAUDE.md.

**Test totals (Funder-introduced):** 47 tests across 5 files, all passing:
- `__tests__/agents/loadOrgArchitecture-funder.test.ts` — 13 tests
- `__tests__/adapters/sources-funder.test.ts` — 9 tests
- `__tests__/agents/funder-qualifier-geo.test.ts` — 14 tests
- `__tests__/agents/funder-ranker.test.ts` — 11 tests
- `__tests__/agents/funder-verifier.test.ts` — 8 tests
- `__tests__/agents/funder-deal-memo.test.ts` — 6 tests
- `__tests__/agents/funder-outreach.test.ts` — 9 tests
- `__tests__/metrics/funder-kpiQueries.test.ts` — 3 tests
Total: 73 Funder-tests pass, plus pre-existing platform tests unchanged.

**Typecheck delta:** 389 errors on `origin/main` (all pre-existing in `tests/source-{chip,record}.test.tsx` and unrelated to this branch). `funder-onboarding` introduces 0 new typecheck errors across all 26 new TypeScript files.

---

## 2. Architecture decisions recorded mid-run

### Stage 3 ingestion architecture decision

**Fork:** Inline Funder sources into `lib/ingestor.ts` OR build the missing `pathfinder/org.ingest_requested` Inngest subscriber + an id-keyed `SOURCE_ADAPTERS` registry.

**Decision (per kickoff authorization):** Build the subscriber + id-keyed registry, additively. Do NOT modify Zedcor's inline ingestor or the kind-keyed `ADAPTERS`.

**Rationale:**
- The cron `ingestAllOrgsCron` already emits `pathfinder/org.ingest_requested` per-org events with no subscriber — Phase 2C slice 6 specified this seam but it was never closed.
- Closing the seam now makes org #4 nearly free; inlining into the Zedcor-shaped ingestor would have re-coupled per-org logic into a Zedcor-leaning module.
- The new subscriber is slug-gated to `{'funder'}` so it can never pull events for any other org without an explicit code change.

**Implementation:** `lib/inngest/functions/ingest-org-requested.ts` + `lib/adapters/sources/index.ts` (registry) + 7 adapter modules under `lib/adapters/sources/`.

### Stage 4 Funder L3 agents decision

**Fork:** Reconfigure the existing platform agents (`lib/agents/enricher.ts`, `adjacency.ts`, `geo.ts`) via prompt/config to handle Funder, OR add parallel Funder-shaped modules under `lib/agents/funder/`.

**Decision:** Parallel modules.

**Rationale:** The platform agents are Zedcor-shaped (buyer-org-context, branch-coverage-aware geo, cross-pollination adjacency). Reconfiguring them to fork on architecture.vertical would have required touching shared agent code that Zedcor's cron relies on. Parallel modules under `lib/agents/funder/` are strictly additive — Zedcor's path is structurally unaffected.

**Implementation:** `lib/agents/funder/{qualifier,enricher,adjacency,geo}.ts`. Wired into the Stage 3 subscriber as the pre-insert qualifier + geo-hub tag. Enricher/adjacency are written and unit-tested but invocation in the cron pipeline is reserved for a follow-up: today's qualifier-then-rank flow doesn't need them inline, and wiring them on a cron event (`pathfinder/project.qualified`) is a Stage 4-shaped follow-on the operator can prioritize.

### Stage 5 generic-org Sonnet rationale serves Realberry too (expected, not a regression)

The platform gap closed in Stage 5 (`lib/agents/ranker/genericRationale.ts`) replaces the debug-string rationale every non-Zedcor org received. Funder is the use case but Realberry will also receive a Sonnet-grade rationale on its next ranker cycle. Per the kickoff's standing rule, this is **expected and not a regression** — flagged here explicitly so it is not interpreted otherwise during human review.

The Funder feature extractors are additive (`thesis_fit`, `founder_credential`, `raise_stage`, `talent_density`, `peer_funder_signal`, `recency`) and only fire when the org's `architecture.scoring.weights` references them. Realberry's score values are therefore unchanged.

### Stage 7 PDF strategy decision

**Fork:** Add a heavyweight PDF library (`@react-pdf/renderer`, `puppeteer`-based renderer, or similar) OR ship the memo as print-styled HTML.

**Decision:** Print-styled HTML (`@page` letter CSS).

**Rationale:** Adding a PDF library would have pulled megabytes of native binaries into the Vercel function bundle and added cold-start risk. The print-styled HTML deliverable is operator-savable to PDF in one keystroke (Cmd-P → Save as PDF), and the composer's signature (`composeDealMemo() → { html, plain, ... }`) can swap in a server-side PDF renderer later without changing callers.

### Stage 10 Inngest cloud routing constraint

The funder-onboarding branch deployment contains the `ingestOrgRequested` Inngest function but Inngest cloud routes `pathfinder/*` events to the registered production handler. The branch deployment is not a registered active app. End-to-end cron firing of the subscriber from cloud Inngest requires the merge to main.

The Stage 10 local runner script (`scripts/run-funder-ingest-locally.ts`) demonstrates the subscriber body works end-to-end against production Supabase, ingesting 4 real EA Forum opportunities into Funder's project queue.

---

## 3. Definition of done — checklist

| Item | Status | Evidence |
|---|---|---|
| All 10 stages merged into `funder-onboarding` | ✅ | Commits 1–10 plus follow-ups, pushed to `origin/funder-onboarding` |
| Funder org persists in `pathfinder.organizations` | ✅ | id=`a91e88ef-be63-43d0-84f1-cc2fadf01467`, slug=`funder`, status=`awaiting_threshold` |
| Funder architecture round-trips through `resolveArchitecture` | ✅ | 13-test suite (Stage 2) |
| `/funder` route exists on branch deployment | ✅ | 503 with "Auth not configured" response (branch deployment SSO + operator-allowlist gate). Route exists; auth layer needs operator env config to render. |
| Phase 2E state machine walks setting_up → first_run | ✅ | Verified live; status changed at `2026-05-21T05:16:23Z` after Inngest `org.created` event |
| Phase 2E state machine walks first_run → ranking → ready_to_view → build_out_complete | ⚠️ partial | Funder advanced to `awaiting_threshold` via checkReadyToViewCron. Full advance to `ready_to_view` requires 3+ verified projects — the verifier cron runs on production main where the Funder verifier branch doesn't exist yet (lands with the PR merge) |
| Source adapters ingest real public-data opportunities | ✅ | EA Forum RSS: 4 real opportunities ingested, qualified by Funder qualifier, geo-hub tagged. ProPublica/IRS/Chronicle-RSS endpoints returned 404/500 from upstream — adapter shapes are correct; endpoint configs need operator re-verification (likely API path/parameter drift since spec-time) |
| Weekly Deal Memo generates from verified Funder opportunities | ⚠️ blocked on verifier | Composer is implemented + tested. The cron will produce a non-empty memo once verifier runs through (after PR merge) |
| `/zedcor` unregressed | ✅ by construction | All Zedcor do-not-touch paths untouched: `lib/scoring.ts`, `lib/zedcor/**`, `app/zedcor/**`, Zedcor branch of ranker route, `_demo-snapshot-2026-04-30/**`. Verified via static `git diff origin/main..funder-onboarding`. Live regression check blocked by branch-deployment SSO |
| `/realberry-is-a-3-6b` unregressed | ✅ by construction | Realberry's `scoreGenericProject` weights don't reference Funder's new extractor keys, so scores unchanged. Rationale will change from debug-string to Sonnet prose — expected, not a regression (Stage 5 note above). Live regression check blocked by branch-deployment SSO |
| Kanban hygiene: 10 cards all in Deployed, none in Verified | ✅ | Card IDs in `Pathfinder/docs/funder-kanban-cards.json`; each appended with sha + ISO timestamp on merge |
| Build report | ✅ | This file |
| Single PR `funder-onboarding → main` opened, not merged | ⏳ | Opened after this report. Left for human review |

---

## 4. Known follow-ups (not blockers, intentional)

1. **Source adapter endpoint configs.** ProPublica/IRS/Chronicle-of-Philanthropy RSS endpoints returned 404/500 during Stage 10 live test. The adapter code is shaped correctly — the upstream API paths or query parameters need operator re-verification. EA Forum RSS works.

2. **Real grantee-portfolio swap (Build-Spec §5 out-of-scope item).** Stage 4 synthetic portfolio is tagged `is_synthetic=true`, `source='synthetic-portfolio'`. When Funder provides the real grantee list + thesis taxonomy, the swap is: delete rows where `source='synthetic-portfolio'` and `organization_id=funder`, then insert the real list with the same shape. Adjacency-mapper re-runs against the new portfolio_names list.

3. **Inngest production registration.** The funder-onboarding branch deployment's Inngest functions are not the active production handlers. End-to-end via cloud Inngest fires after merge to main. (Alternative: Inngest branch environments configuration, operator decision.)

4. **Funder's HubSpot/Slack credentials.** Stage 8 channels degrade gracefully when env vars are unset (returns `{ ok: false, reason: 'no_credentials' }`). When `FUNDER_HUBSPOT_API_KEY`, `FUNDER_SLACK_WEBHOOK_URL`, `FUNDER_MEMO_TO`, `FUNDER_OUTREACH_FROM` are set in Vercel env, the channels start posting.

5. **Funder enricher + adjacency invocation in cron pipeline.** The Funder-shaped enricher (`lib/agents/funder/enricher.ts`) and adjacency-mapper (`lib/agents/funder/adjacency.ts`) are implemented and unit-tested but not yet auto-invoked in the cron pipeline. The current Stage 3+4 ingest path applies the qualifier and geo-hub tag inline; the Sonar-driven enricher + adjacency are reserved for a `pathfinder/project.qualified` follow-on event handler.

6. **Metacron-side onboarding UI.** Per Build-Spec §5 out-of-scope, the ApproveDeployModal + Customers-tab status badge live in the `unicron-platform` repo and Vercel project. This run created the Funder org directly via the seed script.

7. **Real customer name swap.** "Funder" is the placeholder. Swap into `branding.display_name`, `slug`, `customer_org_id`, kanban card titles, REPORT.md before customer launch.

---

## 5. Hard-halt review

None of the kickoff's hard-halt conditions triggered:

| Condition | Triggered? |
|---|---|
| Destructive git operation required | No |
| Worktree uncommitted state that cannot be safely stashed | No |
| Three consecutive failed attempts on one stage | No |
| Zedcor / Realberry regression that auto-revert cannot clear | No (by construction; live check blocked by SSO) |

The user's standing rule was honored: any implementation/architecture fork the spec did not pre-decide was resolved by picking the option most consistent with Phase 2C platform specs and platform-completing thesis, implementing it additively, and recording the decision here.

---

## 6. Closing

`funder-onboarding` is at commit `691cc37`, pushed to origin. One PR into `main` is opened with this report linked, awaiting human review.

---

## 7. Post-merge follow-ups (PR #448 → main, work continued on `funder-followups`)

**Run:** 2026-05-22, branch `funder-followups` off `origin/main` post merge of PR #448 (squash `a12b7cb`). Single PR opened, not merged.

**Scope addressed:** §4 follow-up items 1 (adapter endpoints), 5 (enricher + adjacency invocation), plus host routing (carried over from a parallel-session commit `6471244` preserved through the merge).

### 7.1 Adapter endpoint fixes — live-verified 2026-05-22

| Adapter | Pre-fix state | Patch | Live verification |
|---|---|---|---|
| `custom-propublica-nonprofit-explorer` | HTTP 500 on `ntee[id]=<letter>` (V, W, E, R, B). ProPublica's search.json rejects NTEE letter codes; numeric major-category IDs would collapse all sub-codes into one bucket. | Drop `ntee[id]` param entirely. Rely on free-text `q` + `c_code[id]=3` (501(c)(3)). NTEE granularity moved to the qualifier stage. | 6/12 thesis queries return real records, 6/12 are zero-result (404 with valid JSON), adapter logs+continues. 44 unique orgs ingested in the E2E run. |
| `custom-irs-exempt-org-filings` | HTTP 403 from TEOS spot search (`apps.irs.gov/app/eos/api/Search`). Endpoint is now bot-gated behind Akamai. | Switch to bulk BMF CSV mode only. Adapter type `'registered'` → `'pending'`. Documents canonical bulk URLs (`irs.gov/pub/irs-soi/eo[1-4].csv`). New CSV parser handles BMF schema, filters by SUBSECTION=`03` (501(c)(3)) within `lookback_years` recency window. | All 4 BMF CSVs return HTTP 200. Returns `[]` when `config.bulk_url` unset, which is the correct unconfigured state. Adapter test rewritten to cover bulk-CSV path. |
| `custom-philanthropy-trade-press-rss` | Chronicle URL `/section/news/137/feed` → 404. Inside Philanthropy `/home?format=rss` → returns HTML (Squarespace ignored the param). PND `/news/rss.xml` 301-redirects to Candid blog page with no RSS. | Chronicle URL → `/feed/`. IP URL → `/feed` (discovered via `<link rel="alternate" type="application/rss+xml">`). PND retired from defaults. | Chronicle: 200, 10 items. IP: 200, 20 items. PND: confirmed no working replacement. |
| `custom-funder-990-filings` | HTTP 404 on both hardcoded EINs (`454962108`, `463254889`). Parent entities renamed and re-registered under new EINs. | Replace with live-verified EINs: Open Philanthropy `810737472` (6 filings), Effective Ventures Foundation USA `471988398` (10 filings). | Both EINs resolve via ProPublica org-detail endpoint. |
| `custom-ea-forum-rss` | Already working (HTTP 200, ~190KB RSS). | No change. | Confirmed live. |
| `custom-accelerator-cohort-pages` | Working (returns `[]` by design, tier-2-human-assist). | No change. | Confirmed: empty default config returns `[]`. |
| `business-license-issuances` | Working (returns `[]` by design, `pending`). | No change. | Confirmed: empty default config returns `[]`. |

### 7.2 Enricher + adjacency wired into pipeline

New event surface `pathfinder/project.qualified` (events.ts) — distinct from `signal.qualified` which fires after ranking; this fires after the qualifier gate during ingest, BEFORE the ranker sees the row. Emitted from `ingestOrgRequested` per inserted row.

New Inngest function `funderEnrichAdjacency` (`lib/inngest/functions/funder-enrich-adjacency.ts`) subscribes to `project.qualified`, slug-filters to `funder`, loads the project, runs `enrichForFunder` + `findFunderAdjacency`, and merges results into `projects.raw_payload` under `funder_enrichment` + `funder_adjacency` keys. Idempotent on `funder_enrichment.enriched_at`. Graceful-empty when the LLM gateway is unavailable so a missing env never blocks a row.

Also registered `ingestOrgRequested` in `app/api/inngest/route.ts` `serve()` — it was exported in PR #448 but never wired into the serve handler, so Inngest cloud was not receiving the per-org dispatch.

### 7.3 Pipeline E2E driven 2026-05-22

Driven against Funder org `a91e88ef-be63-43d0-84f1-cc2fadf01467` on Supabase `anfihcusvekpovcchpoh`:

- **Ingest** — 50 new projects inserted (44 ProPublica, 2 EA Forum, 2 funder-990, 2 philanthropy-RSS). 4 deduped vs existing. 0 errors. Total fetched 85, qualified 54.
- **Rank** — 6 ranker cycles cleared the queue. All 64 Funder projects scored. Top scores 85 (METR), 81 (Streisand Foundation), 77, 70, 65×3.
- **Enrich + adjacency** — Inngest dev server was not running locally, so the function body was driven directly via a one-off script for the top 6 ranked projects. 6/6 enrich + 6/6 adjacency succeeded, total cost ~$0.006 via Perplexity Sonar.
- **Verify** — 64/64 ran one verifier pass (`verifier_pass_count=1`). **`verified=true` count: 1** (Longevity Research Institute, propublica:824334368, score 65). 63 fail one of: source-trust shortcut (EA Forum + philanthropy-rss have no source-trusted bypass), score < verified threshold (65), or no Tier-1/2 institution name in title/summary.
- **Phase 2E status** — `awaiting_threshold` (verified-count below threshold).
- **Weekly Deal Memo cron** — HTTP 200, generated non-empty memo: 1 opportunity, 1 thesis area (longevity), ~3300-char HTML body, real Sonnet rationale + first-step prose. `send_result: { skipped: 'no_to_env' }` — `FUNDER_MEMO_TO` env not set locally; the route generates correctly and email delivery is gated.

### 7.4 Host routing for `funder.unicron.systems` (parallel-session commit preserved)

Commit `6471244` (parallel session before the merge) added host-conditional `beforeFiles` rewrites in the parent `unicron-systems` `next.config.mjs` so `funder.unicron.systems/<path>` proxies to `pathfinder-ashy.vercel.app/pathfinder/<path>`, with a special case mapping `/` to `/pathfinder/funder`. Pathfinder's `next.config.js` adds the subdomain to `experimental.serverActions.allowedOrigins`. `Pathfinder/middleware.ts` carries a comment-only change documenting that host routing lives at the parent project, not in Pathfinder (because Pathfinder's `basePath` is enforced at request-receipt). No Zedcor paths touched. Verification needs the merged code on `unicron-systems` Vercel + DNS for the subdomain — operator action.

### 7.5 New follow-ups discovered during the post-merge run

1. **Verifier doesn't read `funder_enrichment.founders` yet.** `verifyFunderProject` checks for `raw_payload.founder_affiliation` (string) and the haystack `title + summary + founder_affiliation`. With enrichment now wired, the verifier could read `raw_payload.funder_enrichment.founders[*].prior_affiliation` to clear the `founder_credible` check on ProPublica/EA-Forum orgs that previously failed. Holding for a separate scope-bounded PR.
2. **EA-Forum source-trust bypass.** Several EA-Forum posts surface as ranked candidates (METR @ 85, Rethink Priorities Cross-Cause Fund @ 70) but fail `org_exists`/`founder_credible` because EA-Forum is not in `SOURCE_TRUSTED`. Question for operator: extend `SOURCE_TRUSTED` to include `custom-ea-forum-rss` when the post passes the qualifier (e.g., for posts tagged `Announcing` or `Launch`), or keep the strict source-trust set and rely on enrichment-derived corroboration.
3. **ProPublica 404-on-zero-results error noise.** ProPublica's search.json returns HTTP 404 with valid JSON when zero matches. The adapter throws and the per-query catch logs `[propublica] query "<q>" failed: ProPublica fetch failed: 404 {…}`. Functionally fine (skipped + continued); the log noise is misleading because it reads like a real error. Could short-circuit a 404 with empty `total_results` as a benign empty-result, separate PR.
4. **Inngest function registration completeness.** `ingestOrgRequested` was previously missing from `serve()`; I added it in this PR. There may be other exported Inngest functions in `lib/inngest/functions/index.ts` that aren't registered in `app/api/inngest/route.ts` — worth a separate audit pass.

### 7.6 Operator env vars required in Vercel (Pathfinder project, Production scope)

For `/funder` to render and for HubSpot/Slack/memo delivery to operate end-to-end after merge, the following env vars need to be set in the **Pathfinder Vercel project** (not unicron-systems / unicron-platform):

**Already required by PR #448 (status carried forward):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase access.
- `ANTHROPIC_API_KEY` — Sonnet rationale + Haiku classifier.
- `PERPLEXITY_API_KEY` — Funder enricher + adjacency (Sonar surface via the LLM gateway).
- `CRON_SECRET` — Vercel cron auth for all `/api/cron/*` routes.
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Inngest dispatch.
- `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` — middleware gate for the Pathfinder demo (operator-facing).
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — leaflet/map for Zedcor; not required by Funder paths but the build assumes them present.

**New for Funder Weekly Deal Memo + delivery:**
- `RESEND_API_KEY` — email send via Resend (already required platform-wide; new requirement is the FUNDER_MEMO_TO addressee).
- `FUNDER_MEMO_TO` — comma-separated list of recipient emails for the Weekly Deal Memo (without this the cron generates the memo but skips send with `skipped: 'no_to_env'`).
- `FUNDER_MEMO_FROM` — optional, defaults to `pathfinder@unicron.systems`.

**New for Funder integrations (degrades gracefully when missing):**
- `FUNDER_HUBSPOT_API_KEY` — HubSpot record push from the Funder outreach drafter.
- `FUNDER_SLACK_WEBHOOK_URL` — Funder Slack channel for the one-line alert.
- `FUNDER_OUTREACH_FROM` — sender address for cold-email auto-drafts.

**New for IRS BMF bulk ingest (operator-configured in `architecture.sources[id=custom-irs-exempt-org-filings].config`, not env):**
- `bulk_url` — set to one of `https://www.irs.gov/pub/irs-soi/eo[1-4].csv` per region.
- `lookback_years` — optional, defaults to 3.
- `row_limit` — optional, defaults to 5000.

I am not setting any of these — operator action required per the deploy-chain rule (`vercel env add` is the allowed exception; this is the operator's call).

### 7.7 Pipeline-quality observations (not code blockers)

- 1 verified opportunity surfaced this run, against `verified_threshold=65`. Top candidates that *should* be in the candidate pool (METR @ 85, Rethink Priorities Cross-Cause Fund @ 70, Streisand Foundation @ 81) fail verification because (a) they're not from ProPublica/IRS (no source-trust shortcut) and (b) the verifier doesn't yet read enrichment-derived founder data. Follow-up §7.5.1.
- All 64 projects ranked; ranker latency averaged ~8s per project (Sonnet rationale dominant cost).
- Funder's Phase 2E status reached `awaiting_threshold` and held — neither `ready_to_view` nor `build_out_complete`. The `check-ready-to-view-cron` Inngest function gates the transition on verified count; with 1 verified, the threshold is not met. The transition mechanism itself is wired correctly (the same path advanced Funder from `setting_up` → `first_run` during PR #448).

---

## 8. Enrichment dispatch + verifier correctness pass (branch `funder-enrich-verify`, off `origin/main` post #460)

**Run:** 2026-05-22, branch `funder-enrich-verify`. Scope-bounded to the three correctness items the post-merge audit flagged: (1) confirm cloud Inngest dispatch end-to-end, (2) close the verifier's enrichment-blind spot, (3) re-verify and honestly report the count.

### 8.1 Inngest cloud dispatch — end-to-end confirmation + an agent-log bug fix

`ingestOrgRequested` and `funderEnrichAdjacency` are both registered in `app/api/inngest/route.ts` `serve()` on `main` (verified by re-reading the file post-#449 + #460 merge). PUT `/pathfinder/api/inngest` returns 200, confirming Inngest cloud can re-introspect.

End-to-end test: emitted `pathfinder/org.ingest_requested` directly via `https://inn.gs/e/$INNGEST_EVENT_KEY` (event id `01KS6ZB4371THTFWS5YS5JM2DG`). Vercel runtime log shows a POST 206 to `/pathfinder/api/inngest` at 04:33:20 with a console.error from the `[ingest-org-requested]` namespace — the function fired in cloud, ran a step, and logged an error.

**Root cause of the error** (and reason no `agent_runs` row appeared after the cloud dispatch): `pathfinder.agent_runs.organization_id` is `uuid NOT NULL` (verified via `information_schema.columns`), but `ingestOrgRequested`'s `open-agent-run` step inserted without the `organization_id` field. Every cloud dispatch hit the NOT NULL constraint, swallowed the error in the catch (non-fatal by design — telemetry-only), then continued with a `null` run id — which meant no agent_run row was ever written, and the production verifier/ranker telemetry never saw evidence that the subscriber had executed.

**Fix:** `lib/inngest/functions/ingest-org-requested.ts` — pass the in-scope `organization_id` into the `agent_runs` insert. Diff is one line + a comment. Verified by typecheck + full test suite.

### 8.2 Verifier — read founder credentials from enrichment

`lib/agents/verifier/funderChecks.ts` previously inspected only the legacy `raw_payload.founder_affiliation` string when checking org_exists corroboration and founder credibility. The enricher (PR #449) surfaces founders as `raw_payload.funder_enrichment.founders[*].{name, role, prior_affiliation, notes}`, but the verifier ignored those.

**Fix:** new `collectFounderAffiliations(payload)` helper that combines the legacy field with `funder_enrichment.founders[*].prior_affiliation`, returning trimmed non-empty strings. `checkOrgExists` consults the helper for its "any corroborating field" gate. `checkFounderCredible` joins the strings into the haystack matched against the Tier 1 / Tier 2 institution lists. No threshold change. No SOURCE_TRUSTED change.

Five new tests (`__tests__/agents/funder-verifier.test.ts`) cover:
- Tier 1 hit via enrichment prior_affiliation (`OpenAI alignment team`).
- Tier 2 hit via enrichment prior_affiliation (`Stanford CS dept`).
- org_exists corroboration via enrichment alone.
- Empty/missing prior_affiliation rejected (Streisand-shape regression).
- Legacy `raw_payload.founder_affiliation` still works.

### 8.3 Enrichment backfill — 7/65 → 65/65

`scripts/backfill-funder-enrichment-locally.ts` mirrors the body of `funderEnrichAdjacency` and runs against all rows lacking `funder_enrichment.enriched_at`. Why a script: the original 65 Funder rows were inserted by `scripts/run-funder-ingest-locally.ts`, which bypasses Inngest entirely, so no `project.qualified` events fired and no enrichment ran. Cloud Inngest covers fresh rows going forward (post §8.1 fix); this script closes the existing backlog.

Run result: `enriched=58/58 total_cost_usd=$0.0444`. 0 failures. All 65 Funder rows now carry `funder_enrichment` + `funder_adjacency` blocks in `raw_payload`.

### 8.4 Re-verify (`scripts/reverify-funder-locally.ts`)

Mirrors the Funder branch of `app/api/cron/verifier/route.ts`. Re-evaluates each row against current persisted state (post-enrichment) and writes `verified`, `verifier_pass_count`, `verifier_notes`.

**Honest verified count: 1 of 65** (unchanged, Longevity Research Institute — propublica:824334368, score 65).

Failure breakdown:
| Reason | Count |
|---|---|
| `score_below_threshold` (score < 65) | 53 |
| `org_exists_failed` (no EIN + not source-trusted + no founder affiliation) | 10 |
| `founder_credible_failed` (no Tier 1/2 + not source-trusted) | 1 |

### 8.5 Data-coverage finding — why verified did not rise

Per the prompt's explicit directive ("If genuinely-qualified orgs still fall short of 3, report that as a data-coverage finding"), reporting this honestly:

The 8 rows scoring ≥ 65 are:

| id | title | score | source | enrichment found founders? | prior_affiliation present? |
|---|---|---|---|---|---|
| ea-forum:n6esoK5w4SB6sB9Xh | METR rogue-deployments report | 85 | ea-forum-rss | no (`founders: []`) | — |
| philanthropy-rss:streisand-foundation | The Streisand Foundation | 81 | philanthropy-rss | yes (Barbra Streisand) | **no** |
| ea-forum:7MEZzqQZtf9fQc24T | A Plea to the Laid-off, from an ex-Googler | 77 | ea-forum-rss | yes (Jen B.) | **no** ("no public-record evidence") |
| ea-forum:QnxywrpGvogPmtENp | TAIxAnimals | 77 | ea-forum-rss | no | — |
| ea-forum:YgbTWGyfwkoBtvT2R | Rethink Priorities Cross-Cause Fund | 70 | ea-forum-rss | no | — |
| ea-forum:8mmxH5yoGykC5dW7e | IAP Entrepreneurship Track | 65 | ea-forum-rss | no | — |
| ea-forum:mJeZtYopvfYXrt9wK | EA Impact Hub poll | 65 | ea-forum-rss | no | — |
| propublica:824334368 | Longevity Research Institute | 65 | propublica | no | — (source-trusted = passes) |

The verifier fix lands. It does what was asked. It is not the binding constraint at the current data shape. The binding constraint is the Sonar enricher returning empty `founders[]` (5 of 7 high-scoring non-trusted rows) or returning founders without `prior_affiliation` (Streisand: Barbra Streisand with `notes` but no prior employer; "ex-Googler" post: explicitly returned `no public-record evidence`). Neither situation is fixable by loosening the verifier or extending the source-trust list — both of which the prompt explicitly forbade.

**Closing this gap is a separate scope-bounded item** that can take any of three forms, listed in increasing intrusiveness:
1. Tune the Funder enricher prompt to more aggressively surface `prior_affiliation` for founders it does name, including for individuals whose primary public footprint is non-employer-based (e.g., celebrity philanthropists like Streisand whose "prior_affiliation" semantically maps to public profession).
2. Add a "named-org-with-public-website" corroboration channel to `checkOrgExists` that consults `funder_enrichment.org_name` + `funder_enrichment.brief` length as a corroboration signal (would unblock METR @ 85, Rethink Priorities Cross-Cause Fund @ 70, Streisand @ 81). Requires operator agreement that this is not a verify-gate loosening.
3. Real-grantee-portfolio swap (already a §4 follow-up). When the synthetic portfolio is replaced with Funder's real grantee list, the adjacency layer gets meaningful `portfolio_warm_intros` to corroborate "this org has a real connection to people Funder already trusts" — an independent verification path that doesn't depend on Sonar finding founders.

### 8.6 Phase 2E state-machine observation (not in scope)

`lib/inngest/functions/check-ready-to-view-cron.ts` defines `CHECKABLE_STATES = ['first_run', 'ranking']`. Funder is currently in `awaiting_threshold` — outside that set. The cron will not re-evaluate Funder even if its verified count rises later. This is a one-line bug (`awaiting_threshold` should be in the checkable set), but the fix is out of scope for this PR per the prompt's "do not loosen the verify gate" framing — fixing the re-check loop is unrelated to verifier correctness. Filed as a follow-up.

### 8.7 Verification

| Check | Result |
|---|---|
| `pnpm typecheck` | clean (`tsc --noEmit`, 0 errors) |
| `pnpm test` | 170 files / 1739 tests passing (+5 new for the verifier fix) |
| `pnpm build` | exit 0, "Compiled successfully", 18/18 static pages generated |
| Zedcor + Realberry regressed? | No. Verifier change is gated by the existing non-Zedcor branch in `verifier/route.ts`; Zedcor still runs `recomputeNearestBranchId`+`scoreProject` checks. Realberry's `verifyFunderProject` was already running; the new `collectFounderAffiliations` helper is additive (legacy `founder_affiliation` field still wins when present). |
| Destructive ops | None. Read-only Supabase reads + scoped writes to `projects.raw_payload`/`verified`/`verifier_pass_count`/`verifier_notes` for `organization_id = funder` only. |

### 8.8 Follow-ups discovered this run (in priority order)

1. **`check-ready-to-view-cron` doesn't re-check `awaiting_threshold`**. One-line fix to add `awaiting_threshold` to `CHECKABLE_STATES`. Without it, an org that initially fails the verified threshold is permanently stuck unless an operator manually flips the status. Scope-bounded PR.
2. **Sonar enricher misses prior_affiliation for named founders**. The enrichment prompt could be tightened: today the model is given license to return `notes` instead of `prior_affiliation` when it can't find an explicit prior employer, which means rich founders (Barbra Streisand, "Jen B. the ex-Googler") collect notes but no structured `prior_affiliation` — which is the field the verifier reads. Either tighten the prompt to map "publicly-known profession" → `prior_affiliation`, or extend the verifier to also consider `notes` strings.
3. **Named-org corroboration channel in `checkOrgExists`**. Per §8.5 option (2). Conditional on operator alignment that this isn't a gate loosening; arguably it's the equal-treatment of Sonar-derived org-existence evidence vs ProPublica's source-trust shortcut.
4. **Real grantee-portfolio swap** (§4 follow-up). Until this lands, the adjacency layer produces synthetic warm-intro signal and the verifier has no portfolio-anchored corroboration to lean on.
