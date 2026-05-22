# Pathfinder Funder Instance Blueprint

**Status:** DRAFT for Kyle review. This is the Step 3 control point. Do not start the build until this is approved.
**Date:** 2026-05-20
**Author:** Cowork (Pathfinder chat)
**Supersedes:** the fork framing in `Pathfinder-New-Instance-Kickoff-Prompt.md`. See Section 3.

---

## 1. Decision recorded

Funder is **organization #3** on the Pathfinder multi-tenant platform (Zedcor, Realberry, Funder). It is onboarded as a row in `pathfinder.organizations` with an Architect-emitted `architecture` JSON. It is **not** a codebase fork. Confirmed by Kyle, 2026-05-20.

Two earlier discovery answers also recorded: seed with **real portfolio data** (Funder provides its current grantee list and thesis taxonomy before the build), and the dashboard primary view is a **thesis-grouped opportunity feed**.

---

## 2. What Funder is

Funder is a philanthropic capital deployer. Its deal-sourcing and portfolio team needs to find early-stage, talent-dense, mission-locked organizations (nonprofit or mission-locked for-profit, founded within three years, credentialed founders) that are actively raising $1M to $100M+ on AI-transition-risk or human-flourishing problems, and reach them before they are widely known in philanthropic networks. The deliverable is a weekly curated Deal Memo (one-page email plus PDF, grouped by thesis area), with a ready-to-send outreach email, a one-line Slack alert, and a pre-filled HubSpot record per opportunity.

Funder operates at venture speed against a market that forms faster than relationship-based philanthropy discovers it. The product is the systematic monitoring layer.

---

## 3. The model: onboarding, not forking

The April handoff doc describes Pathfinder as single-tenant, where a new customer is a fork. That is out of date. Phases 2A through 2E plus the Build-Out Pass were specified and partly built after the handoff. The platform now onboards a customer as a configured organization.

**Onboarding path (Phase 2E state machine):**

```
Architect approves the decomposition in Metacron
  -> ApproveDeployModal captures name + slug
  -> POST /api/organizations  (architecture JSON, status=setting_up)
  -> Inngest event org.created
  -> ingestOrgFunction runs the org's source adapters       (status=first_run)
  -> rankAndVerifyOrgFunction                               (status=ranking)
  -> verified opportunity count >= 3 ? ready_to_view : awaiting_threshold
  -> Build-Out verification agent renders /[slug], screenshots, asserts
  -> status=build_out_complete
  -> operator opens https://pathfinder.unicron.systems/funder from Metacron
```

Customers do not log in. Operators (Unicron) view the tailored `/[slug]` dashboard via a Metacron deep-link. For Funder this reinforces the product split: the **Weekly Deal Memo is the customer-facing deliverable** (push: email, PDF, Slack, HubSpot), and the **`/funder` dashboard is the internal review surface** for the deal team and Unicron operators. The decomposition Kyle pasted is the Architect's draft output for Funder. It is the raw material for the `architecture` JSON in Section 5.

**Why this beats a fork:** a fork is throwaway work plus a second codebase to maintain. Onboarding Funder spends effort on completing the generic multi-tenant paths, which makes org #4 and #5 nearly free. The cost is that Funder is the first org to run the platform end-to-end with real data, so it will surface platform bugs. That is acceptable and expected.

---

## 4. Platform state: what exists, what is a gap

Honest inventory. The build's plan-first checkpoint must verify each line against the live codebase before writing code.

| Layer | State | Notes |
|---|---|---|
| 2A slug routing + operator auth | Scaffolded | `app/[slug]/` route directory exists. Verify operator allowlist auth path. |
| 2B tenant config layer | Shipped | `organizations` table, `OrgArchitecture` type, `resolveArchitecture`, `BASE_ARCHITECTURE`, `useVocab`. |
| 2C per-org dispatch | Partial | Ranker slice 2 dispatches non-Zedcor orgs to `scoreGenericProject`. Ingestor has the `ingest-all-orgs` pattern. Source registry, geo filter, per-org Verifier and Outreach are spec'd; verify shipped state. |
| 2C generic scorer extractors | Stub-heavy | Working: `geography_match`, `asset_class_match`, `trigger_strength`. Stubbed (return 0): `basis_fit`, `unit_count_fit`. All are construction or real-estate shaped. Funder needs its own extractors. |
| 2C generic-org rationale | Not built | Non-Zedcor orgs currently get a debug-string rationale, not Sonnet prose. Platform gap Funder must close. |
| 2D schema-driven UI | Partial | `LeadCard`, `PipelineKanban`, `useVocab`, branding, business summary, filters spec'd. Verify which are wired. |
| Build-Out Pass renderer | Slice 1 only | `ui_plan` type shipped and resolved. KPI strip, charts, `ui_plan`-driven layout wiring is later slices. |
| 2E onboarding state machine | Spec'd | `POST /api/organizations`, `org.created`, `ingestOrgFunction`, `rankAndVerifyOrgFunction`, status badges. Verify shipped state. |
| Source adapter registry | Shipped, sparse | Registered: `sam-gov`, `usaspending`, `harris-county`, `sec-edgar`, `rentcafe`, `loopnet-feed`. None of Funder's 7 sources exist. |
| Lead table naming | Ambiguous | Phase 2E spec references `pathfinder.leads`; the ranker route reads `pathfinder.projects`. Resolve at plan-first checkpoint. |
| Score scale | Ambiguous | `scoreGenericProject` returns 0-100; `scoring.thresholds` in the base template are 0-1. Reconcile before wiring the Verifier. |

---

## 5. Funder architecture JSON (draft)

This is the core artifact. It is the value that gets persisted as `pathfinder.organizations.architecture` for Funder. Weights, thesis taxonomy, and vocabulary are drafts for Kyle and the Architect to tune. `"Funder"` is a working name (see Open Decisions).

```json
{
  "vertical": "philanthropic-deal-sourcing",
  "lead_unit": {
    "name": "opportunity",
    "plural": "opportunities",
    "schema": {
      "org_name":         { "type": "string",   "display_label": "Organization", "required": true },
      "legal_form":       { "type": "enum",     "display_label": "Legal form",
                            "enum_values": ["501c3","pbc","llc-mission-lock","fiscally-sponsored","other"] },
      "thesis_area":      { "type": "enum",     "display_label": "Thesis area",
                            "enum_values": ["ai-safety","biosecurity","longevity","civic-infrastructure","ai-governance","epistemics","other"] },
      "founders":         { "type": "object",   "display_label": "Founders" },
      "founded_date":     { "type": "date",     "display_label": "Founded" },
      "raise_target":     { "type": "string",   "display_label": "Raise target" },
      "fundraising_stage":{ "type": "enum",     "display_label": "Fundraising stage",
                            "enum_values": ["forming","pre-raise","actively-raising","closing","raised"] },
      "geo_hub":          { "type": "enum",     "display_label": "Hub",
                            "enum_values": ["sf-bay","nyc","dc-metro","boston","london","remote","other"] },
      "thesis_fit":       { "type": "string",   "display_label": "Thesis fit" },
      "first_step":       { "type": "string",   "display_label": "Recommended first step" },
      "score":            { "type": "number",   "display_label": "Score" },
      "source":           { "type": "string",   "display_label": "Source" }
    }
  },
  "pipeline": {
    "stages": ["sourced","reviewing","contacted","in-diligence","funded","passed"],
    "stage_labels": {
      "sourced": "Sourced", "reviewing": "Reviewing", "contacted": "Contacted",
      "in-diligence": "In diligence", "funded": "Funded", "passed": "Passed"
    }
  },
  "scoring": {
    "weights": {
      "thesis_fit": 0.30,
      "founder_credential": 0.25,
      "raise_stage": 0.15,
      "talent_density": 0.12,
      "peer_funder_signal": 0.10,
      "recency": 0.08
    },
    "thresholds": { "verified": 0.65, "high_priority": 0.80 }
  },
  "geography": {
    "scope": "metros",
    "defaults": ["sf-bay","nyc","dc-metro","boston","london"]
  },
  "sources": [
    { "id": "custom-irs-exempt-org-filings",      "type": "pending" },
    { "id": "custom-propublica-nonprofit-explorer","type": "pending" },
    { "id": "custom-accelerator-cohort-pages",    "type": "pending" },
    { "id": "custom-ea-forum-rss",                "type": "pending" },
    { "id": "custom-funder-990-filings",          "type": "pending" },
    { "id": "custom-philanthropy-trade-press-rss","type": "pending" },
    { "id": "business-license-issuances",         "type": "pending" }
  ],
  "outreach": {
    "persona": "philanthropic deal-sourcing lead at Funder",
    "tone": "warm, peer-to-peer, specific, non-transactional",
    "value_prop": "early high-conviction philanthropic capital and a fast, founder-friendly process"
  },
  "vocabulary": {
    "lead": "opportunity",
    "leads": "opportunities",
    "contact": "founder",
    "project": "organization",
    "branch": "thesis area"
  },
  "branding": { "display_name": "Funder", "accent_color": null, "logo_url": null },
  "compliance": ["public-data-only"],
  "integrations": ["hubspot","slack","resend"],
  "business_summary": {
    "lead_type": "An early-stage, talent-dense organization (nonprofit or mission-locked for-profit) founded within the last three years by credentialed founders (AI lab alumni, top-university researchers, or senior tech operators), actively seeking philanthropic capital of $1M to $100M+, working on AI-transition risk or human flourishing problems.",
    "business_area": "Funder's deal-sourcing and portfolio development team uses these opportunities to identify and approach fundable organizations before they are widely known in philanthropic networks, operating at venture speed rather than grant-cycle speed.",
    "problem_solved": "The most fundable mission-driven orgs form and begin raising faster than relationship-based philanthropy can discover them. Funder needs a systematic way to monitor regulatory filings, community forums, accelerator pipelines, and peer-funder grant records simultaneously, without a large research staff, so no high-fit founder slips through the window while still actively fundraising.",
    "what_they_get": "A weekly curated Deal Memo (one-page email and downloadable PDF) grouping the top verified opportunities by thesis area, each with a three-sentence org snapshot, founder bio, thesis-fit rationale, and a concrete first-step recommendation. Every opportunity also carries a ready-to-send personalized outreach email, a one-line Slack alert for the deal team, and a pre-filled HubSpot record."
  },
  "ui_plan": {
    "lead_card_layout": {
      "primary_fields": ["org_name","thesis_area","founders","raise_target","score"],
      "secondary_fields": ["legal_form","founded_date","fundraising_stage","geo_hub","source"],
      "score_position": "top-right"
    },
    "kpis": [
      { "label": "Verified opportunities this week", "metric_id": "verified_count_7d" },
      { "label": "Actively raising",                 "metric_id": "actively_raising_count" },
      { "label": "Average thesis fit",               "metric_id": "avg_score", "unit": "%" },
      { "label": "Sources live",                     "metric_id": "sources_live" }
    ],
    "charts": [
      { "title": "Opportunities by thesis area", "type": "bar",  "metric_id": "count_by_thesis", "grouping": "thesis_area" },
      { "title": "Verified opportunities over time", "type": "line", "metric_id": "verified_count", "grouping": "week" }
    ],
    "filters": [
      { "field": "thesis_area",       "label": "Thesis area" },
      { "field": "fundraising_stage", "label": "Fundraising stage" },
      { "field": "geo_hub",           "label": "Hub" },
      { "field": "legal_form",        "label": "Legal form" }
    ],
    "dashboard_emphasis": "quality"
  }
}
```

---

## 6. Component plan

The kickoff asked for a same / reconfigure / rewrite / new table. The org model changes the categories. A fork would "rewrite" outreach voice, scoring logic, and copy. On the platform, most of that is **config** (the architecture JSON), not code. The real categories are:

- **Config.** Expressed entirely in the architecture JSON. No code.
- **Reuse.** Platform component Funder uses as-is.
- **Platform gap.** A generic path that must be completed; benefits every future org, not just Funder.
- **Net-new.** Funder-specific code that has no analog.

| Component | Category | Detail |
|---|---|---|
| Org record + architecture JSON | Config | Section 5. Persisted via `POST /api/organizations`. |
| Slug routing + operator auth | Reuse | `/funder` route, operator allowlist. Verify 2A shipped. |
| Lead/opportunity table | Reuse + gap | Org-scoped by `organization_id`. Funder's `lead_unit.schema` fields need either columns or a jsonb payload. Resolve `projects` vs `leads` naming first. |
| Ingestor + source registry | Reuse pattern | `ingest-all-orgs` dispatch + `resolveSource`. Funder rides the pattern. |
| 7 source adapters | Net-new | None exist. Section 8. |
| Qualifier (L3) | Net-new | Gates raw events to real fundable-org signals. Pathfinder's Haiku classifier is Zedcor-hardcoded; a per-org qualifier is new. |
| Enricher (L3) | Reuse + config | `lib/agents/enricher.ts` exists. Funder enrichment (org name, legal form, founders, raise target) is prompt/config. |
| Adjacency-mapper (L3) | Reuse + config | `lib/agents/adjacency.ts` exists. Funder use: founder talent graph (prior employer = AI lab or top firm), peer-funder co-funding signal. |
| Geo-mapper (L3) | Reuse + config | `lib/agents/geo.ts` exists. Funder use: assign each org to a hub. No branches, no coverage radius. |
| Ranker dispatch | Reuse | `scoreGenericProject` already routes non-Zedcor orgs. |
| Funder feature extractors | Net-new | `thesis_fit`, `founder_credential`, `raise_stage`, `talent_density`, `peer_funder_signal`, `recency`. The generic scorer currently has no extractors for these. |
| Generic-org Sonnet rationale | Platform gap | Non-Zedcor orgs get a debug string today. Funder needs real rationale + first-step prose. Closing this serves Realberry too. |
| Verifier | Reuse + config | Thresholds from `architecture.scoring.thresholds`. Funder checks: org exists, founder bios corroborate, not already widely funded. Reconcile score scale first. |
| Briefer / Weekly Deal Memo | Reuse + net-new | `lib/briefing.ts` exists. Net-new: thesis-grouped memo template, one-page email, PDF render. This is the primary deliverable. |
| Outreach Drafter | Reuse + config | Persona/tone/value_prop from architecture. Net-new: channel set is cold email + Slack one-liner + HubSpot record fields (not email/LinkedIn/voicemail). |
| `/[slug]` dashboard renderer | Platform gap + config | Build-Out Pass renderer wiring (KPI strip, charts, `ui_plan` layout). Funder's `ui_plan` is config; the renderer is the gap. |
| HubSpot + Slack integrations | Net-new wiring | Funder's own HubSpot portal and Slack workspace. |
| Cross-pollination | Reuse (light) | Phase 2 inter-org wiring exists. Funder's intra-org warm-intro is the adjacency-mapper, not the cross-poll engine. |
| Deployment | Config | No new Vercel project, no new schema. Section 9. |

---

## 7. Agent pipeline: decomposition mapped to platform agents

The Architect decomposition's L2/L3/L4 layers map onto the existing agent fleet. "L2 watcher per source" is the Architect's vocabulary; the platform implements it as one Ingestor with pluggable source adapters.

| Decomposition | Platform agent | Work |
|---|---|---|
| L2 watchers (7) | Ingestor + source adapters | Net-new: 7 adapters. |
| L3 qualifier | new per-org qualifier step | Net-new. |
| L3 enricher | `lib/agents/enricher.ts` | Reconfigure via prompt/config. |
| L3 adjacency-mapper | `lib/agents/adjacency.ts` | Reconfigure: founder talent graph. |
| L3 geo-mapper | `lib/agents/geo.ts` | Reconfigure: hub assignment. |
| L4 ranker | generic scorer + Funder extractors | Net-new extractors; platform-gap rationale. |
| L4 verifier | Verifier route | Reconfigure: Funder checks + architecture thresholds. |
| L4 briefer | `lib/briefing.ts` | Net-new: Weekly Deal Memo (email + PDF, thesis-grouped). |
| L4 outreach-drafter | Outreach Drafter | Reconfigure: email + Slack + HubSpot channels. |

Note: Pathfinder's Adjacent Discovery agent (next-customer research for Unicron) is not part of Funder's pipeline and is out of scope here.

---

## 8. Data sources

All 7 are net-new adapters; none are in the registry. Recommended build order favors clean APIs first, fragile scraping last.

| Source id | Integration method | Key needed | Build priority |
|---|---|---|---|
| `custom-propublica-nonprofit-explorer` | ProPublica Nonprofit Explorer JSON API | No | 1 (clean API) |
| `custom-irs-exempt-org-filings` | IRS Exempt Organizations data (BMF / determinations, scheduled bulk pull) | No | 1 (clean bulk) |
| `custom-ea-forum-rss` | EA Forum API / RSS | No | 2 (clean; volume spikes around conferences) |
| `custom-philanthropy-trade-press-rss` | RSS aggregation across trade outlets | No | 3 (RSS, per-outlet variance) |
| `custom-accelerator-cohort-pages` | Per-accelerator page scraping | No | 4 (fragile; candidate for tier-2-human-assist initially) |
| `business-license-issuances` | City/state open-data portals (mostly Socrata) | Some portals need a Socrata app token | 4 (multi-portal) |
| `custom-funder-990-filings` | IRS Form 990 data for anchor philanthropies | No | 5 (12-18 month lag; use as enrichment context, not a timely trigger) |

Until an adapter ships, its `SourceRef.type` stays `pending` and the org shows "X sources in setup" in the UI. The platform tolerates this by design.

---

## 9. Deployment plan

- **Vercel:** no new project. Funder rides the existing `pathfinder` Vercel project. Multi-Vercel verification rule still applies: `pathfinder` and `unicron-platform` are separate projects; verify each independently after any deploy.
- **Supabase:** no new schema. Funder data lives in the shared `pathfinder` schema, scoped by `organization_id`, isolated by RLS. The kickoff's "schema per instance" convention belonged to the fork model and does not apply.
- **Org row:** insert into `pathfinder.organizations` with `name`, `slug` (`funder`), `customer_org_id`, `architecture` (Section 5), `status=setting_up`.
- **URL:** operators open `https://pathfinder.unicron.systems/funder` via the Metacron Customers tab deep-link.
- **Env vars:** Funder's HubSpot API key, Funder's Slack webhook URL. Resend already configured. A people-data provider key may be needed if founder-departure signals or contact resolution are pursued (Open Decisions). Source adapters are mostly keyless; a Socrata app token may be needed for some business-license portals.
- **Kanban:** Funder build work is tracked on the Pathfinder Features Kanban. Cards move In Process at sprint start, then Deployed / Review / Bug Fixes per outcome. Verified is human-only.

---

## 10. Open decisions

Carried from the Architect decomposition and surfaced during this blueprint. None block starting the build; each is flagged for Kyle.

1. **"Funder" naming.** Working placeholder. Real customer name swaps into `branding.display_name`, `slug`, `customer_org_id`, and this filename before launch.
2. **Biosecurity dual-use.** The decomposition flags biosecurity orgs as dual-use sensitive. Decide whether Funder wants biosecurity opportunities surfaced normally, held for manual review, or excluded. The compliance filter currently only special-cases SEC orgs; handling a biosecurity-sensitivity flag is a small platform extension.
3. **Founder-departure signals.** LinkedIn exposes no public job-change webhook. Surfacing "founder left an AI lab" needs a people-data provider or scraping. Decide whether this signal is in v1.
4. **Crunchbase integration.** Would improve org and funding-round coverage. Paid. Decide in or out.
5. **Warm-intro graph.** The funder-to-founder second-degree network map needs data Funder may not have. The adjacency-mapper covers the public founder talent graph without it; the private warm-intro layer can be deferred.
6. **Funder 990 lag.** Form 990 grant data runs 12-18 months behind. Treat `custom-funder-990-filings` as enrichment context, not a timely trigger. Confirmed as priority 5.
7. **Mission-locked for-profit detection.** PBCs and mission-lock LLCs are not flagged in IRS exempt-org data. Detecting them needs the business-license source plus qualifier logic. Confirm v1 scope.
8. **Lead table naming.** `projects` vs `leads`. Plan-first checkpoint resolves before any schema work.
9. **Score scale.** Generic scorer returns 0-100; thresholds are 0-1. Reconcile before wiring the Verifier.
10. **Real portfolio data handoff.** Kyle chose real data. The build is gated on Funder providing its grantee list and thesis taxonomy. Until then, synthetic seed can unblock development with a clear swap point.

---

## 11. Build sequencing

Ordered for Step 4 build prompts. No time estimates. Each stage is a candidate Claude Code sprint with a plan-first checkpoint.

1. **Plan-first platform audit.** Verify Section 4 against the live codebase: which of 2A/2C/2D/2E are wired, `projects` vs `leads`, score scale. Output a corrected platform-state note. No code.
2. **Org record.** Author and persist Funder's `architecture` JSON; insert the `organizations` row; confirm `resolveArchitecture` returns it cleanly and `/funder` routes.
3. **Source adapters.** Build the 7 adapters in priority order (Section 8). Register in `SOURCE_ADAPTERS`. Keep fragile ones behind `pending` or tier-2.
4. **Qualifier + enrichment.** Net-new per-org qualifier; reconfigure Enricher, Adjacency-mapper, Geo-mapper for Funder.
5. **Ranker.** Funder feature extractors in the generic scorer; close the generic-org Sonnet rationale gap.
6. **Verifier.** Funder verification checks; thresholds from architecture; score-scale fix.
7. **Weekly Deal Memo.** Briefer reconfigure: thesis-grouped one-page email + PDF. Primary deliverable.
8. **Outreach + integrations.** Outreach Drafter channels (email, Slack one-liner, HubSpot fields); wire Funder's HubSpot and Slack.
9. **Dashboard.** Build-Out Pass renderer wiring for Funder's `ui_plan`; run the headless build-out verification.
10. **End-to-end.** Run the 2E onboarding state machine on real data; confirm `ready_to_view` and `build_out_complete`.

---

## 12. Approval

This blueprint is the control point. On approval, Step 4 produces the paste-ready Claude Code prompts: worktree-based, plan-first checkpoint before code, CLAUDE.md coordination protocol, no self-merge, kanban hygiene at start and end, referencing the existing Pathfinder codebase as the platform base. The first prompt is the platform audit in stage 1, because the build sequencing depends on its findings.
