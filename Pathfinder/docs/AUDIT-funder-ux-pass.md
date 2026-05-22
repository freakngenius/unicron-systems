# AUDIT — Funder UX (pre-fix)

**Branch:** `funder-ux-pass` off `origin/main` @ `04b612e`.
**Captured:** 2026-05-22, live at https://funder.unicron.systems.
**Method:** Playwright walk, full-page PNGs in `docs/audit-screenshots/`.
**Blueprint reference:** `Pathfinder/Pathfinder-Funder-Architecture.json` → `ui_plan`.

## Blueprint target state (ui_plan)

```
nav         tabs: Dashboard, Leads, Pipeline, Settings — all org-scoped under /funder
kpis        verified_count_7d · actively_raising_count · avg_score (unit %) · sources_live
charts      "Opportunities by thesis area" (bar, grouped by thesis_area, metric_id=count_by_thesis)
            "Verified opportunities over time" (line, grouped by week, metric_id=verified_count)
filters     thesis_area · fundraising_stage · geo_hub · legal_form
lead card   primary: org_name, thesis_area, founders, raise_target, score (top-right)
            secondary: legal_form, founded_date, fundraising_stage, geo_hub, source
emphasis    quality (over volume)
```

## Per-view gaps

### 1. Dashboard root — `https://funder.unicron.systems/` → `app/[slug]/page.tsx` for `slug=funder`

Screenshot: `01-funder-root.png` / `06-pathfinder-funder-explicit.png` (identical render after the funder-host rewrite).

| # | Gap | Code source | Severity |
|---|---|---|---|
| 1a | **Nav links are global, not org-scoped.** Dashboard `href='/'`, Leads `'/leads'`, Pipeline `'/pipeline'`, Settings `'/settings'`. The funder-host edge middleware does not prepend `/funder` for nav clicks — the browser address bar stays on `funder.unicron.systems/leads`, which Pathfinder resolves as the global Zedcor `/leads` route, not the org-scoped surface. Result: every tab leaks to Zedcor. | `app/[slug]/page.tsx:104-127` (nav array) | **blocker** |
| 1b | **Lead-card list renders empty.** Pathfinder queries `.eq('org_id', org.id)` but the `pathfinder.projects` column is `organization_id`. Funder has 65 rows in DB; the dashboard shows zero leads. This is the same platform bug flagged in the Internal Stage 1 audit. | `app/[slug]/page.tsx:63` | **blocker** |
| 1c | **Charts render placeholder text.** `ChartGrid` renders `"chart placeholder"` strings instead of bar/line charts from real per-org data. | `components/ChartPlaceholder.tsx` | **blocker** (customer-visible "broken shell" signal) |
| 1d | **Architecture JSON disclosure.** A `<details>` toggle at the bottom of the page dumps the full resolved architecture (sources config, scoring weights, vocabulary). Operator-only data leaked into customer UI. | `app/[slug]/page.tsx:142-158` | **blocker** (operator-only data) |
| 1e | **`Sources live` = 0.** Funder has 7 source adapters; 4 are returning live data (ProPublica 44 rows, EA-Forum 7, philanthropy-RSS 2, funder-990 2). The KPI says zero. | `lib/metrics/kpiQueries.ts` mapping for `sources_live` (architecture.sources count or filtered by type=registered) | **blocker** (dishonest number) |
| 1f | **`Actively raising` = 0.** Plausible if Sonar enrichment didn't surface a `fundraising_stage='actively-raising'` value. Needs trace; may be honest. | KPI query for `actively_raising_count` | minor (verify trace) |
| 1g | **`Average thesis fit` = 46%.** Real scoring data exists (top 85, mean ~46 plausible across 65 rows). Likely accurate; needs trace. | KPI query for `avg_score` | minor (verify trace) |
| 1h | **No "verified opportunity" link/CTA.** "1 verified" is a number with nothing behind it. The Longevity Research Institute row (the verified one) is invisible to the customer. | dashboard page composition | **blocker** (the deliverable for the customer) |
| 1i | Filter sidebar renders empty inputs (no options populated from real data). | `components/FilterSidebar.tsx` | minor |

### 2. Leads — `https://funder.unicron.systems/leads`

Screenshot: `02-funder-leads.png`.

Renders Pathfinder's `app/not-found.tsx`: **"404 / Page not found / That org or page does not exist in Pathfinder. / [Back to dashboard]"**.

| # | Gap | Severity |
|---|---|---|
| 2a | **/leads is not org-scoped.** No `app/leads/page.tsx` and no `app/[slug]/leads/page.tsx`. The global `app/leads` directory exists only as `app/leads/[projectId]` (lead detail). The Leads tab in nav targets `/leads` which falls through to not-found. | **blocker** |
| 2b | The "Back to dashboard" CTA goes to `/` (global Zedcor root, not funder root). | minor (follows from 2a fix) |

### 3. Pipeline — `https://funder.unicron.systems/pipeline`

Screenshot: `03-funder-pipeline.png`.

Renders the global pipeline kanban from `app/pipeline/page.tsx`: NEW / CONTACTED / REPLIED / MEETING / PROPOSAL / WON columns, all empty ("No deals"). Has no header — the Pathfinder brand, the org breadcrumb, and the nav strip are all missing.

| # | Gap | Severity |
|---|---|---|
| 3a | **No header / nav / back link.** Page is a bare kanban with no way to return to the funder dashboard. The screenshot user has no idea what app they're in. | **blocker** |
| 3b | **No org scoping on the kanban query.** Pipeline reads global `deals` table; not filtered by `organization_id=funder`. Funder has no deal rows so this renders as zeroes — but the lack of scoping is structurally wrong (cross-tenant leak risk if Funder ever has deals via shared writer). | **blocker** (multi-tenant correctness) |
| 3c | Nav style (font, weight, color) is completely different from the dashboard nav (white-on-light vs dark dashboard). | minor (consistency) |

### 4. Settings — `https://funder.unicron.systems/settings`

Screenshot: `04-funder-settings.png`.

Header reads literally: **`Pathfinder / ZEDCOR  / SETTINGS`** with a `YOU [email]` and `CUSTOMER` chip.

| # | Gap | Severity |
|---|---|---|
| 4a | **Brand leak: header says "ZEDCOR".** The Settings page hardcodes Zedcor as the org context. Funder customer sees Zedcor name on their own subdomain. | **blocker** |
| 4b | **Zedcor-shaped sections.** Display, Notifications, Branches and customers (Zedcor has branches; Funder does not), Sources, Scoring and thresholds, Agents, Integrations, Users and permissions, Data and security, Advanced — many of these are Zedcor-conceptual and don't apply to Funder. | **blocker** (wrong product surface) |
| 4c | Back link `←` goes to `/pathfinder` (Zedcor root). | minor (follows from 4a) |
| 4d | The Settings surface is currently designed as operator-side configuration; per the prompt's directive, this should not appear in the customer-facing funder UI at all. | **blocker** (whether to hide or rewrite for funder) |

### 5. Onboarding connectors — `https://funder.unicron.systems/onboarding/connectors`

Screenshot: `05-funder-onboarding-connectors.png`.

Header has an `ORG / ZEDCOR` chip top-right.

| # | Gap | Severity |
|---|---|---|
| 5a | **Brand leak: chip says "ZEDCOR".** Same hardcode pattern as Settings. | **blocker** |
| 5b | Onboarding flow is Slack / Teams / HubSpot connector wizard — Zedcor-shaped. Funder's outreach surfaces are HubSpot + Slack + email (per Architecture JSON `outreach.channels`). The funder customer probably shouldn't see this wizard at all on their dashboard subdomain. | **blocker** (presence-of-page question) |

### 6. /pathfinder/funder (explicit) — `https://funder.unicron.systems/pathfinder/funder`

Screenshot: `06-pathfinder-funder-explicit.png`. Identical to `01` because the funder-host edge middleware rewrites `/` → `/pathfinder/funder` transparently.

## Cross-cutting gaps

| # | Gap | Severity |
|---|---|---|
| X1 | **No funder-host nav rewriting.** The dashboard's nav array hardcodes global paths (`/`, `/leads`, `/pipeline`, `/settings`). For the funder host to route correctly, either (a) nav must produce org-scoped paths (`/`, `./leads`, `./pipeline`, `./settings`) under the `[slug]` segment, OR (b) the funder-host middleware must rewrite `/leads`, `/pipeline`, `/settings` to `/funder/leads`, etc. Decision: do (a) so nav is correct under any host. | blocker (gates 1a, 2a, 3a, 4a, 5a) |
| X2 | **Customer-facing pages mix Zedcor copy.** Pipeline references "drag a card... stage transitions are logged to `deal_activities`" — internal/operator phrasing in a customer surface. Settings sub-tabs reference "branches", "cross-pollination", "agents" — Zedcor implementation vocabulary. Funder's customer language per the blueprint is "opportunities", "thesis areas", "founders", "talent edges". | blocker (copy + scope) |
| X3 | **No org-scoped lead detail.** The lead detail route is `/leads/[projectId]` (global). A "verified opportunity" link should resolve to an org-scoped detail that doesn't leak Zedcor columns. | blocker (gates 1h) |
| X4 | **Pipeline & Settings have no PUBLIC_HOSTS / PUBLIC_SLUGS analog.** `app/[slug]/layout.tsx` was the public gate (PR #463). `/leads`, `/pipeline`, `/settings`, `/onboarding/*` have their own auth checks (or none) and were always Zedcor-shaped. Either the funder customer should not reach those routes at all (recommended), or each must be made tenant-safe. | blocker (architecture decision) |

## Data-layer gaps (not yet investigated visually)

These are pre-existing observations carried in from PR #463's REPORT §8:

| # | Gap | Severity |
|---|---|---|
| D1 | `architecture.sources` entries for IRS and accelerator-cohort-pages are marked `pending` in `Pathfinder-Funder-Architecture.json`. KPI `sources_live` may be counting `type='registered'` only. Need to verify the count rule and update the architecture file. | blocker (gates 1e) |
| D2 | Funder verified count = 1 (Longevity Research Institute). Verifier fix from PR #463 reads `funder_enrichment.founders[*].prior_affiliation` but Sonar enrichment returned empty `founders[]` or no `prior_affiliation` for the 7 other high-scoring rows. Honest count is 1; not loosening the gate. | noted (no fix — see PR #463 §8.5) |
| D3 | IRS adapter `config.bulk_url` is unset, returning `[]`. Set to one of `https://www.irs.gov/pub/irs-soi/eo[1-4].csv`. | minor (operator config) |
| D4 | Inngest dispatch of `pathfinder/project.qualified → funderEnrichAdjacency` was verified end-to-end in PR #463. Re-test post-merge to confirm. | minor (verify) |

## Proposed fix surface (next phase)

Per the prompt's "additive, Zedcor byte-identical" constraint, the cleanest plan:

1. **Rewrite the funder dashboard's nav to use org-scoped paths.** `/`, `./leads`, `./pipeline` are the nav targets when rendered under `[slug]`. Create `app/[slug]/{leads,pipeline}/page.tsx` (Settings deferred — see (5) below).
2. **Create `app/[slug]/leads/page.tsx`** that lists org-filtered lead cards using the blueprint `lead_card_layout`. Reuses existing `LeadCardList` component and proper `organization_id` filter (fixes 1b at the same time).
3. **Create `app/[slug]/pipeline/page.tsx`** with the kanban filtered by `organization_id`, plus a header + back nav matching the dashboard's styling.
4. **Hide Settings + onboarding-connectors from the funder host.** Either return 404 (preferred — Settings is operator-only per prompt directive #6) or move to operator-only routes. Funder customer should never see these tabs.
5. **ChartGrid: wire `count_by_thesis` and `verified_count` to real per-org queries.** Render with a small SVG bar+line component (no new dep — Pathfinder already uses Leaflet but not chart libs; keep light).
6. **Remove the `<details>Architecture JSON</details>` block** from `[slug]/page.tsx`. Move to an operator-only route if needed for debugging.
7. **`sources_live` KPI: count adapters returning data**, not type=registered. Or update architecture file to mark the 4 live ones as `registered`. Decision needed (see Open Questions).
8. **Lead detail under `app/[slug]/leads/[projectId]/page.tsx`** so the verified opportunity is a clickable destination scoped to funder.

## Open Questions (decisions before fixing)

1. **`sources_live` semantics.** Two options:
   (a) Count rows in `architecture.sources` where `type='registered'` — what the KPI query likely does today. Honest count after we set IRS+accelerator+business-license to `registered`: 4. After IRS bulk_url is set: 5. After accelerator/business-license operator config: up to 7.
   (b) Count adapters that returned non-empty data in the last N hours — operationally honest. Requires a new query.
   I'll default to (a) with an architecture file update setting EA-Forum, philanthropy-rss, propublica-nonprofit-explorer, funder-990-filings to `registered` and leaving the three operator-config-needed ones as `pending`. KPI shows 4 today, climbs as operator fills config.

2. **Settings and onboarding/connectors disposition.** Three options for the funder host:
   (a) **404 them.** Cleanest from a customer-facing POV; reflects the prompt's "org config is operator-only".
   (b) **Rewrite to a funder-shaped placeholder** ("Settings managed by the Pathfinder team").
   (c) Build a real funder-shaped Settings (thesis-area edits, notification preferences). Out of scope for this PR.
   I'll default to (a). Settings + onboarding/connectors return Not Found for the funder host.

3. **Lead detail content.** The `app/leads/[projectId]/page.tsx` route shows Zedcor-shaped detail (branch attribution, distance, cross-pollination). For the funder lead detail, we need a different shape (org name, thesis area, founders, raise stage, brief, citations). Two options:
   (a) **Create `app/[slug]/leads/[projectId]/page.tsx`** that renders a funder-shaped detail, additive to the existing route.
   (b) **Conditional rendering inside the existing route** keyed on `organization.architecture.vertical` ("funder" vs "lead-intelligence"). Riskier — touches Zedcor code path.
   I'll default to (a). New file, no Zedcor diff.

4. **Customer-facing copy.** Funder customer language: "opportunities", "thesis areas". I'll align all funder-surface copy. Zedcor surfaces ("Pipeline" page kanban etc.) untouched.

## Acceptance bar (recap)

A customer can be shown `funder.unicron.systems` without losing the deal:
- Every tab works (Dashboard, Leads, Pipeline). Settings is hidden.
- Nav never leaks to another org. Browser stays on funder.unicron.systems.
- Lead cards render real Funder data (65 rows, 1 verified visible).
- Charts show real per-org series.
- No `chart placeholder`.
- No architecture JSON leaked.
- KPIs trace to real numbers.

---

**Status: AUDIT COMPLETE. AWAITING USER ACK ON OPEN QUESTIONS BEFORE FIXING.**
