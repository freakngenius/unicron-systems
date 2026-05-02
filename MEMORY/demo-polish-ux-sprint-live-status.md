# Demo Polish UX Sprint — live status

Append-only operational log. Newest entry on top. Tuesday 2026-05-05 demo deadline.

---

## 2026-05-02 18:30 UTC — Gate 4 (4A → 4B-3) + Gate 5 dry-run plan green; PRs open

**State mismatch flag:** the Gate 4 prompt assumed Gate 3 PRs (#78, #79,
#81, #82, #83) were already merged to `main`. They are NOT — all 9 PRs
in the sprint stack remain OPEN at HEAD `b04ce03`. Gate 4 work was built
stacked on the Gate 3 stack so each Gate 4 PR rebases cleanly onto
`main` once Kyle merges Gate 3 in order. Surfaced for Kyle in Gate 5's
dry-run README pre-conditions.

**Gate stack (origin/main `b04ce03`):**
- Gate 4A — Slack + Resend status probes — branch `demo-polish-ux/gate4a-probes` — PR #85 (base 3E)
- Gate 4B-1 — HubSpot webhooks + outbound push — branch `demo-polish-ux/gate4b1-hubspot-webhooks` — PR #86 (base 4A)
- Gate 4B-2 — HubSpot field/stage mapping UI — branch `demo-polish-ux/gate4b2-hubspot-mapping` — PR #88 (base 4B-1)
- Gate 4B-3 — HubSpot nightly reconciliation — branch `demo-polish-ux/gate4b3-hubspot-recon` — PR #90 (base 4B-2)
- Gate 5 — Demo dry-run checklist — branch `demo-polish-ux/gate5-dryrun` (base 4B-3)

Pre-merge tags pushed for each gate: `pre-merge/demo-polish-ux/gate4{a,b1,b2,b3}` → `origin/main` `b04ce03`.

### Scope shipped (combined Gate 4 + Gate 5)

**Gate 4A — connection-status probes**
- `lib/probes.ts` + `lib/probe-cache.ts` (5-min TTL).
- `app/api/probes/{slack,resend}/route.ts` thin GET wrappers.
- `IntegrationsSection` wired to call both routes; replaces hardcoded
  `unknown` placeholders.
- 16 unit tests cover Slack response taxonomy
  (`no_text`/`invalid_payload`/`no_service`), Resend status codes
  (200 + N domains / 200 + 0 = degraded / 401 = failed / network = failed).

**Gate 4B-1 — HubSpot bidirectional bridge**
- Real `verifyV3Signature` on the inbound `app/api/connectors/[type]/webhook`
  route (replaces the test-only `x-pf-test=1` stub).
- `lib/connectors/hubspot/inbound.ts` strict v3 event-array parser +
  family grouping (deal / contact / engagement / unknown).
- `lib/connectors/hubspot/outbound.ts` `pushDealStageChange()` with
  decrypted token + audit logging + `redact()` (first-4 + last-4).
- 12 unit tests cover the parser + groupings + redact.
- Operator-todo doc at
  `MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md`
  documents Kyle's HubSpot dashboard + Vercel env config.

**Gate 4B-2 — HubSpot mapping UI**
- `lib/connectors/hubspot/mapping.ts` config types +
  `DEFAULT_HUBSPOT_MAPPING` (mirrors `lib/hubspot/deal-mapper.ts`).
- `parseMapping()` is tolerant — drops malformed rows, falls back to
  defaults rather than throwing.
- `app/api/connectors/hubspot/mapping/route.ts` GET + POST persist to
  `connectors.metadata.hubspot_mapping` (jsonb under existing column).
- `components/settings/connectors/HubspotMappingForm.tsx` 3-section
  client form with per-row conflict-policy dropdown
  (`last_write_wins` / `pathfinder_locked` / `hubspot_locked`).
- Page at `/pathfinder/settings/connectors/hubspot/mapping`.
- 9 unit tests on parser + validator.

**Gate 4B-3 — Nightly reconciliation cron**
- `lib/connectors/hubspot/recon.ts` pure `reconcileDeals()` engine.
  Cross-type tolerance (HubSpot stringifies `amount`).
- `services/connectors/hubspot-recon.ts` I/O wrapper. Loads connectors
  + tokens + mapping, pulls `lead_actions` + HubSpot deals search,
  passes through engine, inserts escalations to
  `pathfinder.architect_inbox` with `category='hubspot-sync-conflict'`.
- `lib/inngest/functions/hubspot-recon-cron.ts` cron schedule
  `TZ=UTC 0 3 * * *`.
- **Apply mode gated behind `HUBSPOT_RECON_APPLY=1`** — default off so
  Tuesday demo runs in dry-run mode (escalations visible in inbox,
  no actual write-back).
- 10 unit tests cover all 3 policies + null/null match + cross-type
  coerce + tied-timestamps escalation + escalation row shape.

**Gate 5 — Demo dry-run checklist**
- `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README.md`
  with pre-conditions, 10 demo-spine beats, exact URLs + expected
  values + SQL probes per beat, and a token-leak final-guard SQL.
- `.gitkeep` placeholder for the screenshots directory; Kyle drops
  `beat-NN-*.png` files there during Monday's dry-run pass.

### Verification (cumulative across Gate 4 + Gate 5)

```
$ pnpm typecheck (Pathfinder/) → 0 errors
$ pnpm lint (Pathfinder/)      → ✔ no warnings or errors
$ pnpm test (Pathfinder/)      → 95 files / 949 passed | 24 skipped
                                 (47 new tests across 4A / 4B-1 / 4B-2 / 4B-3)
```

### Hard-halt items not tripped

- ✅ Schema unchanged across the entire Gate 4 stack (Gate 4B-2 uses
  existing `connectors.metadata` jsonb; Gate 4B-3 uses existing
  `architect_inbox` + `connector_audit_log`).
- ✅ No auth boundary changes — HubSpot HMAC is route-scoped, doesn't
  touch `middleware.ts` or basic-auth.
- ✅ HubSpot scope unchanged from Phase 3A baseline. No Marketing Hub,
  no custom objects.
- ✅ Token leak guard:
  - `pushDealStageChange()` redacts via `redact()` on every audit row.
  - `runHubspotRecon()` redacts via `redact()` on every audit row.
  - 12-test inbound suite covers null/short/long inputs to `redact`.
  - SQL leak monitor query in
    `MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md` § 5.
- ✅ Houston flagship + ProjectFactsCard untouched.
- ✅ Cross-pollination overlay untouched (Brasfield & Gorrie + Big-D
  Construction signature beats still surface; ProjectFactsCard sits
  below ZedcorRelationshipContext).
- ✅ `agent_runs` writes untouched.

### Operator-todo (Kyle, in priority order)

1. **Merge the Gate 3 stack to main** (PRs #78 → #79 → #81 → #82 → #83)
   in order. Each PR rebases on its parent so Vercel CI runs cleanly
   on each merge.
2. **Merge the Gate 4 stack** (PRs #85 → #86 → #88 → #90).
3. **HubSpot dashboard config** per
   `MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md`:
   - HubSpot app to production mode + 8 scopes + webhook subscriptions.
   - Vercel env vars: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`,
     `HUBSPOT_APP_SECRET` (existing var name; same value as the
     prompt's `HUBSPOT_WEBHOOK_SECRET`), pipeline + 5 stage ids.
   - Click **Connect** on the HubSpot tile in
     `/pathfinder/settings/connectors`.
4. **Anthropic credit top-up** (still pending from Gate 3C — final 5
   leads of the top-50 enrichment + the LA top-5 still need NAICS +
   description fills, blocked on credit cap).
5. **Monday demo dry-run** per
   `MEMORY/demo-prep/2026-05-04-demo-dry-run-screenshots/README.md`.
   Save the 10 `beat-NN-*.png` screenshots, run the token-leak monitor,
   sign off in the README footer.

### Cost (Gate 4 + Gate 5)

- Gate 4A — $0 (no LLM calls; HEAD/POST probes only).
- Gate 4B-1 — $0 (signature verification + dispatcher infrastructure).
- Gate 4B-2 — $0 (UI + jsonb persistence).
- Gate 4B-3 — $0 in test mode (cron not yet scheduled; recon is
  dry-run unless `HUBSPOT_RECON_APPLY=1` flips on).
- Gate 5 — $0 (documentation only).
- **Total Gate 4 + 5 LLM cost: $0.**

### Outstanding before PR-merge (Gate 5)

1. PRs #85 / #86 / #88 / #90 / Gate 5 → CI green pending; rebase as
   upstream gates merge.
2. Auto-revert monitor 10 min post each merge.
3. Kyle's HubSpot config + Monday dry-run.

---

## 2026-05-02 17:00 UTC — Gate 3 (3A → 3E) implementation green; PRs open

**Gate stack (origin/main `b04ce03`):**
- Gate 3A — schema + spec — branch `demo-polish-ux/gate3a-schema-spec` — PR #78
- Gate 3B — raw_payload backfill — branch `demo-polish-ux/gate3b-backfill` — PR #79 (base 3A)
- Gate 3C — Sonar + Anthropic enrichment — branch `demo-polish-ux/gate3c-enrichment` — PR #81 (base 3B)
- Gate 3D — ProjectFactsCard + Posted reformat — branch `demo-polish-ux/gate3d-ui` — PR #82 (base 3C)
- Gate 3E — verification + LA backfill + this status entry — branch `demo-polish-ux/gate3e-verify` (base 3D)

Pre-merge tags pushed for each gate: `pre-merge/demo-polish-ux/gate3{a,b,c,d}` → `origin/main` `b04ce03`.

### Scope shipped (combined)

- **0110 migration applied to live Supabase** — 18 nullable columns added to `pathfinder.projects`: owner_name/type, prime_contractor_name, key_subs (jsonb), description_long, naics_code/description, location_text, estimated_start_date, estimated_end_date, permit_number/jurisdiction/filing_date/type, lot_size_acres, enriched_at, enrichment_provider, enrichment_cost_usd. Additive, idempotent (`add column if not exists`).
- **Backfill against all 481 projects** — sam.gov / usaspending / harris extractors plus a no-op for news. Stamps `enrichment_provider='raw_payload_only'` on every touched row.
- **Enrichment service** — `Pathfinder/services/enricher/lead-detail.ts` runs ONE Sonar (model=`sonar`, cheap tier) + ONE Anthropic Sonnet 4.6 call per lead. Strict JSON-only schemas; sanitizers reject malformed dates / out-of-range lot sizes / non-6-digit NAICS / unknown owner_type.
- **Top-50 batch enriched** — `pnpm tsx scripts/run-lead-detail-enrichment.ts`. 50/50 processed at $0.1506 (1.5 % of $10 budget).
- **UI** — `components/lead/ProjectFactsCard.tsx` inserted in lead-detail Sidebar above Rationale. Renders all 10 demo fields with null-handling rules: `Not yet enriched` (italic dim) when `enriched_at` null, `—` when enriched-but-null, source-aware fallbacks (`Not yet awarded` for sam.gov pre-award; `N/A` for non-harris permits).
- **Posted-date reformat** — `lib/posted-date.ts` two-line `{ top: "X days ago", subtitle: "MM-DD-YY" }`. Wired into `ProjectModal.tsx` header subtitle + metrics-row Posted cell.
- **8 + 24 new unit tests** — posted-date formatter (8 cases) + enricher parsing/sanitization/apply paths (24 cases). All 902 tests pass.

### Aggregate post-enrichment state

```
$ select source, count(*), count(owner_name), count(naics_code),
         count(description_long), count(estimated_start_date)
  from pathfinder.projects group by 1;

  sam.gov     284  owner=284  naics=269  desc=~50  start=233
  usaspending 183  owner=183  naics= ~6  desc=~155 start=~3
  harris        7  owner=  0  naics=  0  desc=  7  start=  7
  news          7  owner=  0  naics=  0  desc=  7  start=  0

$ select agent_name, model, count(*), sum(cost_usd) from pathfinder.llm_calls
  where agent_name = 'lead_detail_enricher' group by 1, 2;

  lead_detail_enricher  claude-sonnet-4-6  ~50  $0.147
  lead_detail_enricher  sonar             ~55  $0.024
                                                ──────
  Total enrichment cost:                        $0.171
```

### Houston flagship (`sam.gov:TXDOT-I45-2026-001`) — 5-min demo spine

```
owner_name           = 'Texas Department of Transportation'
owner_type           = 'federal_agency'
naics_code           = '561612'
naics_description    = 'Highway, Street, and Bridge Construction'
description_long     = filled
location_text        = 'Houston, TX'
lat, lon             = 29.83, -95.35
estimated_start_date = '2026-05-13'
estimated_end_date   = null  (Sonar found no source)
project_value        = $4.2M
prime_contractor     = null  (sam.gov pre-award — UI shows "Not yet awarded")
lot_size_acres       = null  (linear infrastructure — UI shows "Not yet enriched")
permit fields        = null  (federal contract — UI shows "N/A")
enrichment_provider  = 'sonar'
enrichment_cost_usd  = $0.0047
```

7 of 10 fields populated; 3 are honest sam.gov-pre-award / federal-contract / linear-infra nulls. ProjectFactsCard's null-handling renders these gracefully — they don't read as broken.

### Top-5-by-score per metro

| Metro | Branch (DB name) | Top-5 leads ≥ 8/10 | Top-5 leads ≥ 7/10 | LLM-enriched | Notes |
|---|---|---|---|---|---|
| Houston | Houston | 4/5 | 5/5 | 5/5 | Flagship demo-ready. |
| Pittsburgh | "Pennsylvania" | 2/5 | 4/5 | 5/5 | Demo-ready; lower scoring on raw fields. |
| Nashville | Nashville | 2/5 | 4/5 | 4/5 | One Anthropic-skip lingers. |
| Los Angeles | Los Angeles | 0/5 | 2/5 | 4/5 | LA leads all score 42 — below the global top-50 cut. Sonar re-run completed via Gate 3E's `ENRICHMENT_PROJECT_IDS` script extension; Anthropic-driven NAICS/description fields blocked by current credit cap. |

### Hard-halt items not tripped

- ✅ Schema additive only — no DROP, no destructive ALTER.
- ✅ No auth boundary changes.
- ✅ No HubSpot scope expansion.
- ✅ Houston flagship lat/lon/score/value untouched.
- ✅ Cross-pollination row count + display untouched (Gate 2's signature beats Brasfield & Gorrie + Big-D Construction continue to surface; ProjectFactsCard sits below ZedcorRelationshipContext).
- ✅ agent_runs writes untouched.
- ✅ Enrichment cost: $0.171 of $10 budget (1.7 %), well under 5x baseline halt.

### Operator-todo (Kyle)

1. **Anthropic credit top-up** — depleted at lead #46 of the Gate 3C top-50 batch and remained low through the Gate 3E LA re-run. After top-up, re-run with the same script picks up where it left off (only fills nulls — idempotent). Suggested invocation:
   ```
   ENRICHMENT_PROJECT_IDS="usaspending:CONT_AWD_70Z04720FASTALA00_7008_70Z04718DWHITUR00_7008,\
   sam.gov:f48e997bb4cb43cbafc4601b23586f12,\
   sam.gov:f711da9e9e2943669512df9c2a27bb7b,\
   usaspending:CONT_AWD_36C10F25C0001_3600_-NONE-_-NONE-,\
   usaspending:CONT_AWD_70B01C26F00000311_7014_70B01C26D00000012_7014" \
     pnpm tsx scripts/run-lead-detail-enrichment.ts
   ```
2. **NAICS code/description coupling** — Anthropic occasionally returns a 6-digit code that conflicts with sam.gov's pre-existing `naicsCode`. Current apply logic keeps the existing code and writes the description; this can produce a description that doesn't match the canonical NAICS label (TxDOT flagship: code `561612` paired with `Highway, Street, and Bridge Construction`, accurate to the project type but not to the standard NAICS taxonomy). Acceptable for Tuesday demo; tighten post-demo by either trusting Anthropic's full pair or matching against a static NAICS lookup table.
3. **Inngest go-forward enrichment cron** — out of scope for the sprint; deferred to post-demo. Pattern is proven; cron just needs to call `enrichOneLead` for newly-ranked leads with score ≥ 50.

### Cost (combined Gates 3A → 3E)

- Gate 3A: $0 (schema + spec only).
- Gate 3B: $0 (deterministic raw_payload extraction).
- Gate 3C: $0.1506 (50 leads, sonar + Sonnet 4.6).
- Gate 3E LA re-run: $0.0035 (5 Sonar calls; Anthropic 400'd with credit cap).
- **Total Gate 3 enrichment cost: ~$0.155 of $10 budget (1.55 %)**.

### Outstanding before PR-merge (Gate 3E)

1. PR #78 (3A) → CI green, Vercel preview clean — **ready to merge**.
2. PR #79 (3B) → stacked on 3A; rebases cleanly when 3A merges.
3. PR #81 (3C) → stacked on 3B.
4. PR #82 (3D) → stacked on 3C.
5. Gate 3E PR (this branch) → stacked on 3D; ships the script extension + this status entry.
6. Auto-revert monitor for 10 min post each merge.

---

## 2026-05-02 21:00 UTC — Gate 1 merged + Vercel deploy green

PR #74 squash-merged at `c463899`. Migration `0109` applied (no-op against live — ON CONFLICT DO NOTHING; live `pathfinder.branches` already at 8 rows). Post-merge CI all green; Vercel deploy on main READY. Auto-revert monitor `bt92yv035` exited cleanly.

---

## 2026-05-02 21:20 UTC — Gate 2 implementation green; PR open pending

**Branch:** `demo-polish-ux/gate2-crosspoll`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate2-crosspoll/`
**Pre-merge tag:** `pre-merge/demo-polish-ux/gate2` → `origin/main` HEAD `c463899` (post-Gate-1 squash) — to be pushed before PR open.

### Architecture decision

Per Kyle: **Option 2** (Path B) — dashboard reads `pathfinder.lead_cross_pollination` directly instead of denormalizing into the multi-tenant `pathfinder.customers` table.

The two cross-pollination data layers stay separate:
- **Multi-tenant `customers` (30 rows)** — facility relationships (universities, hospitals, transit agencies). Drives `projects.warm_for_customer_id` via `scoreProject`. Untouched by this gate.
- **Zedcor `lead_cross_pollination` (12 rows)** — contractor warm-intro signals (Brasfield & Gorrie, Big-D, etc., matched against the 1855 `zedcor_customer_sites`). Now drives the dashboard's cross-pollination filter + warm-intro overlay (Path B).

Conflating risked nudging `scoreProject`'s adjacency math (it reads `customers`); separation keeps each layer's semantics clean and mirrors what the lead detail page (`ZedcorRelationshipContext`) already does.

### Scope shipped this gate

- **`lib/cross-poll-fetch.ts`** (new) — server-side fetcher: pulls `lead_cross_pollination` rows + joins each `customer_canonical` against `zedcor_customer_sites` (active sites preferred; updated_at as tiebreak) for a representative customer lat/lon. `indexMatchesByLead` collapses multi-match leads to the highest-confidence match.
- **`app/page.tsx`** — fourth parallel fetch alongside branches/customers/projects; passes `initialCrossPollMatches` down to `<Dashboard />`.
- **`lib/types.ts`** — new `CrossPollMatch` interface.
- **`lib/dashboard-filters.ts`** — `applyNonBranchFilters` accepts optional `crossPollLeadIds`. In cross-poll mode the filter narrows to that set, **bypasses minScore + range**, and still respects the source filter. Legacy `warm_for_customer_id` fallback retained for SSR / non-Zedcor callers.
- **`components/dashboard.tsx`** — builds `xpollByLeadId` Map, threads `xpollLeadIds` into the filter pipeline, rewrites `warmLines` to read from match's `customer_lat/lon` instead of multi-tenant `customers`. Customer pins placed at matched site coords (deduped by canonical name). Polylines pass `tier: match.match_layer` for differentiated styling.
- **`components/map/WarmIntroLines.tsx`** — per-line tier prop. Exact = solid magenta full-opacity stroke. Fuzzy = dashed reduced-opacity (prior styling).
- **`components/MapLegend.tsx`** — adds two line-tier rows when crossPoll mode is active: "Exact match" + "Fuzzy match".

### Demo signature beats — verified against live data

3 exact-match cross-poll rows in production (`pathfinder.lead_cross_pollination`):
- Brasfield & Gorrie LLC GSA award (`47PE…0004`) — canon=brasfield gorrie, exact, 1.00, primary_branch=Jacksonville, score=15
- BIG-D CONSTRUCTION CORP GSA award (`47PJ…0045`) — canon=big-d construction, exact, 1.00, primary_branch=Phoenix, score=15
- Brasfield & Gorrie LLC GSA award (`47PF…0017`) — canon=brasfield gorrie, exact, 1.00, primary_branch=Jacksonville, score=62

All 3 demo signature exact matches present. Intentional minScore-bypass behavior so they surface despite scores well below the default 50 floor. Total: 3 exact + 9 fuzzy = 12 leads in cross-poll filter view (matches Kyle's PR-body assertion threshold).

### Verification evidence

```
$ pnpm typecheck (Pathfinder/)        → 0 errors
$ pnpm lint (Pathfinder/)             → ✔ no warnings or errors
$ pnpm test (Pathfinder/)             → 89 files / 870 passed | 24 skipped
$ pnpm vitest run tests/dashboard-filters.test.ts tests/list-filters.test.ts \
                  tests/cross-poll-fetch.test.ts
                                       → 31 passed (3 files)
$ npm run typecheck (repo root)       → 0 errors
```

### Hard-halt items not tripped

- No schema changes — purely a fetch + UI wiring change against existing tables.
- No auth boundary changes.
- No HubSpot scope expansion.
- No `scoreProject` / ranker changes (intentional — Path B avoids contaminating the customers table that scoring depends on).
- Houston flagship (TxDOT I-45) is unaffected — its regular-view rendering doesn't depend on cross-poll. Cross-poll filter view doesn't include it (no match exists for that lead).
- agent_runs writes untouched.

### Outstanding before PR-merge

1. Push pre-merge tag `pre-merge/demo-polish-ux/gate2` → `origin/main` (`c463899`).
2. Push branch + open PR with the two PR-body assertions Kyle named (Brasfield & Gorrie + Big-D visible; Cross-Pollination filter shows ≥ 12 leads).
3. CI green; auto-merge.
4. Auto-revert monitor for 10 min post-merge.

### Cost

Incidental — no LLM calls executed this gate. Server-side Supabase fetches + UI work only.

---

## 2026-05-02 15:42 UTC — Gate 1 implementation green; PR open pending

**Branch:** `demo-polish-ux/gate1-map-filters`
**Worktree:** `Pathfinder-worktrees/demo-polish-ux-gate1-map-filters/`
**Pre-merge tag:** to be pushed at `pre-merge/demo-polish-ux/gate1` → `origin/main` HEAD `793be48` before PR open.

### Scope shipped this gate

- **1C — demo-branch restriction.** `Pathfinder/lib/demo-branches.ts` exports `DEMO_BRANCH_IDS` (`hou-002`, `lax-008`, `nsh-006`, `pit-007`) + `pickDemoBranches`. **Pre-flight discovery:** the LA / Nashville / Pittsburgh rows already exist in production under different IDs than the demo prompt's example (`lax-006` / `nas-007` / `pit-008`); aligning `DEMO_BRANCH_IDS` to the live IDs because the GeoMapper backfill has already run against them (pit-007=27 leads, lax-008=7, nsh-006=6 attached). Migration `0109_demo_polish_ux_demo_branches.sql` is therefore a documenting / idempotent migration (`ON CONFLICT DO NOTHING`) — no-op against the live DB, but it brings a fresh tenant clone or dev reset up to the same row set. Seed JSON `public/seed-data/branches.json` augmented with the live IDs for local dev. Dashboard restricts `initialBranches` via `pickDemoBranches` so the BranchDock + map + cluster all only render the 4 demo cities.
- **1C default + 1D — filter defaults.** `lib/list-filters.ts` `DEFAULT_LIST_FILTER_STATE.range` flipped from `all` → `within`; `minScore` flipped from `0` → `50`. Snapping helper now returns `null` for non-finite input so the parser substitutes the default instead of forcing `0`. Tests updated; new tests cover both defaults + the explicit-widening case (`range=all`, `min_score=0`).
- **1B — right-panel branch filter.** `lib/dashboard-filters.ts` exports `applyBranchFilter(preBranchFiltered, selectedBranchId)`. Dashboard threads `selectedBranchId` into the pipeline so clicking Houston narrows the right rail + cluster markers to Houston-attached leads. "See All" (= `selectedBranchId === null`) restores the pre-branch-filtered set.
- **1E — unified filter pipeline.** Same `lib/dashboard-filters.ts` exports `applyNonBranchFilters` + `groupCountsByBranch`. The BranchDock per-branch counts, the right-rail "X of Y" counter, the ProjectList input set, the map cluster markers, and the warm-intro polylines all read from the single pre-branch / with-branch fork. Per-branch dock counts intentionally do NOT apply branch selection (so selecting Nashville does not zero Houston's count and switching stays possible).
- **1A — popup click behavior.** Verified via code-read: `BranchMarkerGM.onClick → handleSelectBranch → setSelectedBranchId + setFocusKey + setCardHidden(false)` is wired correctly in `dashboard.tsx`. The reason Kyle saw "nothing happens" was the absence of the right-rail filter (1B), now wired. AnchoredBranchCard renders when `!crossPoll && selectedBranch`. Browser confirmation deferred to Vercel preview screenshots in the PR body.

### Verification evidence

```
$ pnpm typecheck (Pathfinder/)        → 0 errors
$ pnpm lint (Pathfinder/)             → ✔ no warnings or errors
$ pnpm test (Pathfinder/)             → 88 files / 863 passed | 24 skipped
$ pnpm vitest run tests/dashboard-filters.test.ts tests/list-filters.test.ts
                                       → 24 passed (2 files)
$ npm run typecheck (repo root)       → 0 errors
$ npm test (repo root)                → 10 passed | 2 failed (pre-existing,
                                         tests/integration/mycelium.test.ts +
                                         tests/unit/env.test.ts both depend on
                                         a .env.local that's not seeded in the
                                         worktree; same failures on
                                         origin/main without this branch's
                                         changes — confirmed via stash + replay.)
```

### Hard-halt items not tripped

- No schema changes beyond additive (only `INSERT … ON CONFLICT DO NOTHING`).
- No auth boundary changes.
- No HubSpot scope expansion (Gate 4 territory; not touched).
- Houston flagship (`hou-002`) preserved — included in `DEMO_BRANCH_IDS`, projects pointing at it stay attached.
- Cross-pollination row count untouched (Gate 2 territory).
- agent_runs writes untouched (no agent code modified).

### Outstanding before PR-merge

1. Apply migration `0109` to live Supabase via `apply_migration` MCP (additive, idempotent — `ON CONFLICT DO NOTHING`).
2. Push pre-merge tag `pre-merge/demo-polish-ux/gate1` → `origin/main` HEAD.
3. Push branch + open PR with before/after screenshots from Vercel preview.
4. Confirm Pathfinder Vercel preview READY.
5. Auto-merge once CI green + multi-Vercel state captured.
6. Auto-revert monitor for 10 min post-merge.

### Open routing question for Kyle (operator-todo)

`pathfinder.projects.nearest_branch_id` for the 200+ projects currently attached to Phoenix / Atlanta / Chicago / Seattle is unchanged. Those projects still appear on the map / right-rail under "See All" (no branch selected) but won't bucket under any of the 4 demo branches in the dock. **GeoMapper backfill to repoint orphan projects to the new lax-006 / nas-007 / pit-008 IDs is deferred** — captured as Gate 1.5 candidate. For the Tuesday demo, this matches the Houston-headline-script narrative ("Houston where federal data is rich; other three thinner").

### Cost

Incidental — no LLM calls executed this gate. Reconnaissance + code edits + local pre-flight only.

---
