# Pathfinder Internal Instance Blueprint

**Status:** APPROVED by Kyle 2026-05-21. Materialized into the repo by the Stage 0 bootstrap of the autonomous build.
**Date:** 2026-05-21
**Author:** Cowork (Pathfinder New Instance chat)
**Supersedes:** the fork framing in `Pathfinder-New-Instance-Kickoff-Prompt.md`. See Section 3.
**Pairs with:** `Pathfinder-Internal-Architecture.json` (the canonical architecture JSON, embedded in Section 5).

---

## 1. Decisions recorded

This instance is **Pathfinder organization #4** on the multi-tenant platform (Zedcor, Realberry, Funder, Internal). It is onboarded as a row in `pathfinder.organizations` with an Architect-emitted `architecture` JSON. It is **not** a codebase fork. Four discovery decisions, confirmed by Kyle on 2026-05-21:

1. **Setup model.** Onboard as org #4, a configured organization on the existing platform. No fork, no new Vercel project, no new Supabase schema.
2. **Deployment URL.** Served at `internal.unicron.systems`, a vanity subdomain aliased to the `/internal` route (Section 9).
3. **Adjacency seed data.** Real data, gated. The adjacency-mapper is built but its activation depends on Unicron delivering a real seed handoff: customer list, CRM contact export, and trade-association membership records. See Section 10, decision 5.
4. **Geographic scope.** National. Anywhere in the US. State-specific feeds expand by accessible-state priority; the qualifier applies no geographic exclusion inside the US.

The new instance is unusual: it is Pathfinder pointed inward. Unicron runs Pathfinder on itself to fill the Pathfinder new-business pipeline. The buyer, the operator, and the deploying party are all Unicron.

---

## 2. What the Internal instance is

Unicron Internal is a self-deployment of Pathfinder. Its target lead is a construction-vertical B2B service provider (site-services companies: equipment rental, temporary fencing and power, traffic control, modular site offices, commercial roofing, industrial cleaning, waste management, crane rental, jobsite connectivity, on-site safety services, and specialty trades) that shows an active outbound sales motion, multi-region operations, and revenue tied to new construction starts. These are the companies Unicron sells the Pathfinder product to.

The deliverable: every morning the Unicron sales team receives a ranked list of the day's best-fit target companies. Each company carries headquarters location, operating footprint, sales-team evidence, and a warm-intro note where one exists. Each company carries three pre-written outreach drafts: a cold email, a LinkedIn message, and an internal HubSpot note. The top leads land in a daily Slack digest and are loaded into the Pathfinder pipeline kanban at the New / Outreach Ready stage.

The problem it solves: Unicron's reps currently prospect by hand into a fragmented market of tens of thousands of construction-vertical firms, the same pain the Pathfinder product solves for its customers. This deployment turns the product on its own go-to-market, so Unicron reaches the right companies before competitors do, with a message that names the pain those companies already feel.

The `/internal` dashboard is the internal review surface for the Unicron sales team and operators. The **daily Slack digest plus the kanban load is the working deliverable**.

---

## 3. The model: onboarding, not forking

The April handoff doc describes Pathfinder as single-tenant, where a new customer is a fork. That is out of date. The kickoff prompt repeats the fork framing and flags it: "If this becomes the third or fourth Pathfinder instance, raise the multi-tenancy question." This is the fourth. Phases 2A through 2E plus the Build-Out Pass were specified and built, and the Funder blueprint (organization #3) already established the platform onboards a customer as a configured organization.

**Onboarding path (Phase 2E state machine):**

POST /api/organizations with the architecture JSON and status setting_up emits the Inngest event pathfinder/org.created. orgCreated flips setting_up to first_run. ingestAllOrgsCron dispatches the org's source adapters. The ranker and verifier crons score and gate. checkReadyToViewCron advances to ready_to_view once the verified count clears the threshold. verifyBuildOut renders /internal, asserts, and lands build_out_complete. Operators then open https://internal.unicron.systems.

**Why this beats a fork.** A fork is throwaway work plus a second codebase to maintain. Onboarding org #4 spends effort on the architecture JSON and the six vertical-specific source adapters, with most agent behavior expressed as config. The Funder build (org #3) closes the same generic platform gaps this instance needs (generic-org rationale, KPI queries, the source adapter pattern). If Funder merges to main first, org #4 inherits those closed gaps and is a materially smaller build. The platform pays back: org #5 is nearly free.

**Sequencing dependency on Funder.** Funder (org #3) is an autonomous build in progress. Its Stage 1 platform audit is committed (docs/PLAN-funder-onboarding.md); its build report may not yet be present. The Internal build's Stage 1 audit must re-check the live platform state and confirm whether Funder's gap-closes have merged. Preferred sequencing: branch the Internal build off main after Funder merges, so org #4 inherits the generic-org Sonnet rationale and the populated KPI query layer rather than rebuilding them. If Funder has not merged when the Internal build starts, Stage 1 resizes the plan to close those gaps itself, additively.

---

## 4. Platform state: what exists, what is a gap

Honest inventory, carried forward from the Funder Stage 1 audit (docs/PLAN-funder-onboarding.md, evidence-cited against the live codebase). The Internal build's plan-first checkpoint must re-verify each line, because Funder's build may have changed several since.

- 2A slug routing plus operator auth: Shipped. app/[slug]/page.tsx, app/[slug]/layout.tsx. /internal routes for free.
- 2B tenant config layer: Shipped. organizations table, OrgArchitecture type, resolveArchitecture, BASE_ARCHITECTURE. The architecture JSON in Section 5 conforms to lib/types/architecture.ts.
- 2C per-org dispatch (ranker plus ingestor): Shipped. Non-Zedcor orgs route to scoreGenericProject. ingest-all-orgs-cron dispatches per org. Internal rides both.
- 2C generic-scorer extractors: Stub-heavy, construction-shaped. Real: geography_match, asset_class_match, trigger_strength. Stub (return 0): basis_fit, unit_count_fit. The existing extractors were built construction-shaped, so trigger_strength and asset_class_match are partially reusable. The six Internal signal extractors are net-new.
- 2C generic-org Sonnet rationale: Gap, or closed by Funder. Non-Zedcor orgs get a debug-string rationale today. Funder's build closes this. Re-verify at Stage 1.
- 2D / Build-Out renderer: Shipped. /[slug] renders KPI strip, filter sidebar, chart grid, lead-card list from ui_plan. Internal's ui_plan is config.
- KPI metric query layer: Stub, or closed by Funder. kpiQueryByMetricId is an empty map; KPIs resolve to null until real queries land. Funder's build populates it. Internal adds its own metric_id queries additively.
- 2E onboarding state machine: Shipped end-to-end. POST /api/organizations, org.created, orgCreated, checkReadyToViewCron, verifyBuildOut.
- Source adapter registry: Kind-keyed, not source-id-keyed. ADAPTERS keyed by adapter kind (socrata, rest, rss, json-dump, custom). Live sources inlined in lib/ingestor.ts. Funder's build may introduce a source-id registry (SOURCE_ADAPTERS); re-verify at Stage 1.
- Lead table: pathfinder.projects. There is no pathfinder.leads table. Internal rides projects, scoped by organization_id. Vocabulary (lead to company) is UI config only. No migration.
- Score scale: 0-100 stored, thresholds times 100 at read. scoreGenericProject returns 0-100. Architecture thresholds are 0-1. Reconcile at the read site, generic path only.
- sam-gov, usaspending adapters: Shipped, Zedcor-tuned. Registered and live. Internal reuses both, reconfigured for construction NAICS and recipient-side filtering. See Section 8.

---

## 5. Internal architecture JSON

This is the core artifact. It is the value persisted as pathfinder.organizations.architecture for Internal. The canonical copy is Pathfinder-Internal-Architecture.json (materialized from APPENDIX B of the build prompt). Weights, taxonomy, and vocabulary are drafts for Kyle and the Architect to tune. The full JSON is APPENDIX B of the build prompt; it is not re-printed here to keep a single source of truth.

---

## 6. Component plan

Categories: Config (expressed entirely in the architecture JSON, no code), Reuse (platform component Internal uses as-is), Reconfigure (existing component, tuned through prompt or config), Platform gap (a generic path that must be completed, likely closed by the Funder build, re-verify at Stage 1), Net-new (Internal-specific code with no analog).

- Org record plus architecture JSON: Config. Section 5. Persisted via POST /api/organizations.
- Slug routing plus operator auth: Reuse. /internal route, operator allowlist.
- Vanity domain internal.unicron.systems: Net-new wiring. Vercel domain on the pathfinder project, plus a rewrite or middleware mapping that subdomain to the /internal route. Section 9.
- Lead/company table: Reuse. pathfinder.projects, scoped by organization_id. Vocabulary maps lead to company. No migration.
- Ingestor plus per-org dispatch: Reuse pattern. ingest-all-orgs dispatch. Internal rides the pattern.
- sam-gov source adapter: Reconfigure. Switch to the SAM Entity Management (registration) endpoint, filter to construction NAICS 236, 237, 238, 532412. Section 8.
- usaspending source adapter: Reconfigure. Filter to recipients (awardees) under construction NAICS, not opportunities. Section 8.
- 4 custom source adapters: Net-new. Contractor licenses, construction sales job postings, trade-association directories, SOS business registrations. Section 8.
- Qualifier (L3): Net-new. Per-org qualifier gating raw company records to genuine active-sales-motion construction-vertical companies. The Pathfinder Haiku classifier is Zedcor-shaped.
- Enricher (L3): Reconfigure. lib/agents/enricher.ts exists. Internal use: company website, LinkedIn profile, employee count, service category, primary contacts. Contact resolution folds into the enricher for this instance (the decomposition lists no separate contact-resolver).
- Geo-mapper (L3): Reconfigure. lib/agents/geo.ts exists. Internal use: map each company to its own footprint (HQ plus operating states). No Unicron branches, no coverage radius. Geography is not a scoring dimension.
- Adjacency-mapper (L3): Reconfigure, gated. lib/agents/adjacency.ts exists. Internal use: warm intro via shared trade-association membership or existing-customer connection. Built, but activation gated on the real Unicron seed handoff (Section 10, decision 5).
- Ranker dispatch: Reuse. scoreGenericProject already routes non-Zedcor orgs.
- Internal feature extractors: Net-new. sales_motion_strength, operational_footprint, federal_signal, project_driven_fit, recency, association_presence. Added additively to the generic scorer. trigger_strength and asset_class_match are partially reusable as inputs.
- Generic-org Sonnet rationale: Platform gap. Closed by the Funder build. If not merged, Internal closes it. Serves every generic org.
- Verifier: Reconfigure. Thresholds from architecture.scoring.thresholds. Internal checks: company exists in public record, active sales motion corroborates, footprint and licensure claims check out.
- Briefer / daily digest: Reconfigure plus net-new. lib/briefing.ts exists. Net-new: daily cadence (not weekly), the morning Slack digest, and the kanban load at New / Outreach Ready. This is the working deliverable.
- Outreach Drafter: Reconfigure. Persona, tone, value_prop from architecture. Channel set is cold email, LinkedIn message, internal HubSpot note (not email/LinkedIn/voicemail).
- Pipeline kanban load: Reuse plus reconfigure. lib/kanban-writer.ts and the HubSpot deal sync exist. Internal writes verified outreach-ready companies into the Pathfinder pipeline kanban at the New / Outreach Ready stage.
- /[slug] dashboard renderer: Reuse plus config. Renderer is shipped. Internal's ui_plan is config. KPI metric_id queries are added additively.
- HubSpot plus Slack integrations: Net-new wiring. Unicron's own HubSpot portal and Slack workspace. Degrade gracefully without credentials.
- Deployment: Config plus net-new domain. No new Vercel project, no new schema. Section 9.

---

## 7. Agent pipeline: decomposition mapped to platform agents

The Metacron decomposition's L2/L3/L4 layers map onto the existing agent fleet. "L2 watcher per source" is the Architect's vocabulary; the platform implements it as one Ingestor with pluggable source adapters.

- L2 watchers (6): Ingestor plus source adapters. Reconfigure sam-gov and usaspending; build 4 net-new adapters.
- L3 qualifier: new per-org qualifier step. Net-new. Gates to active-sales-motion construction-vertical companies.
- L3 enricher: lib/agents/enricher.ts. Reconfigure: website, LinkedIn, size, service category, contacts.
- L3 geo-mapper: lib/agents/geo.ts. Reconfigure: map company to its own footprint. No branches.
- L3 adjacency-mapper: lib/agents/adjacency.ts. Reconfigure: trade-association and existing-customer warm intros. Gated on real seed data.
- L4 ranker: generic scorer plus Internal extractors. Net-new extractors; generic-org Sonnet rationale (platform gap).
- L4 verifier: Verifier route. Reconfigure: Internal checks plus architecture thresholds.
- L4 outreach-drafter: Outreach Drafter. Reconfigure: email, LinkedIn message, internal HubSpot note.
- L4 briefer: lib/briefing.ts. Reconfigure: daily morning Slack digest plus kanban load.

Pathfinder's Adjacent Discovery agent (next-customer research) is not part of the Internal pipeline and is out of scope here. The decomposition lists no contact-resolver; contact resolution folds into the enricher.

**Rejected source.** The Metacron decomposition rejected harris-county-permits: permit-level data identifies individual projects, not the companies this deployment targets. The blueprint honors that rejection. Permit feeds belong in a downstream Pathfinder instance sold to these companies, not in Unicron's own prospecting pipeline.

---

## 8. Data sources

Six sources. Two are reused and reconfigured; four are net-new adapters. Recommended build order favors clean APIs first, fragile scraping last.

- sam-gov. SAM Entity Management (registration) API, filtered to construction NAICS 236, 237, 238, 532412. Reconfigure of the existing adapter. Key: SAM_GOV_API_KEY (set). Build priority 1 (clean API, exists).
- usaspending. USASpending recipient/awardee search, construction NAICS. Reconfigure of the existing adapter. No key. Build priority 1 (clean API, exists).
- custom-construction-sales-job-postings. Job-posting signal for BD and sales hiring at construction-vertical firms. Build against keyless and low-cost sources first (company career pages, aggregator RSS, structured job data). Paid Indeed or LinkedIn job APIs are a later upgrade. No key for v1. Build priority 2.
- custom-trade-association-directories. AGC, ABC, NECA, AED and similar member directories. Semi-public. Slow-refresh enrichment, not a timely trigger. Some portals may need a token. Build priority 3.
- custom-sos-business-registrations. Secretary-of-State new-business filings. Mostly Socrata and per-state open-data portals. Ship accessible states first, register the rest pending or tier-2-human-assist. Some portals need a Socrata app token. Build priority 4.
- custom-state-contractor-licenses. State contractor-license boards. No single national source. Build state-pluggable; ship the states with accessible data first (CA, TX, FL have the best access), expand by priority. Fragile boards register tier-2-human-assist. Some boards need scraping. Build priority 4.

National coverage note: sam-gov, usaspending, the job-postings feed, and the trade-association directories are nationwide by nature. The two state-specific feeds (contractor licenses, SOS registrations) become multi-state aggregators. National scope is achieved by phased adapter coverage: each state's adapter stays pending until it ships, and the org shows "X sources in setup" until then. The platform tolerates this by design.

---

## 9. Deployment plan

- Vercel: no new project. Internal rides the existing pathfinder Vercel project. Multi-Vercel verification rule still applies: pathfinder and unicron-platform are separate projects; verify each independently after any deploy.
- Vanity domain: add internal.unicron.systems as a domain on the pathfinder Vercel project. Map it to the /internal route with a rewrite (Vercel rewrites in next.config.js or vercel.json, or a host-aware rewrite in middleware.ts, matching the existing unicron.systems/pathfinder reverse-proxy pattern). Confirm DNS control of unicron.systems and that the subdomain does not collide with existing records. This is the one net-new piece of deployment wiring; every other org reaches its dashboard through the path-based /[slug] URL.
- Supabase: no new schema. Internal data lives in the shared pathfinder schema, scoped by organization_id, isolated by RLS. The kickoff's "schema per instance" convention belonged to the fork model and does not apply.
- Org row: insert into pathfinder.organizations with name "Unicron Internal", slug "internal", customer_org_id "unicron-internal", architecture (Section 5), status "setting_up".
- Env vars: Unicron's own HubSpot API key and Slack webhook URL. SAM_GOV_API_KEY already set. Resend already configured. A Socrata app token may be needed for some SOS and license portals. The PERPLEXITY_API_KEY is still unprovisioned; research-tier source adapters (license-board and directory scraping) degrade gracefully without it, the same pattern Pathfinder already uses.
- Operator access: operators open https://internal.unicron.systems directly. Because Unicron is both operator and customer here, there is no Metacron customer-side deep-link to wire.
- Kanban: Internal build work is tracked on the Pathfinder Features Kanban. Cards move In Process at sprint start, then Deployed / Bug Fixes per outcome. Verified is human-only.

---

## 10. Open decisions

Carried from the Metacron decomposition's seven open questions and surfaced during this blueprint. None block starting the build. Each carries a default so an autonomous build does not stall; Kyle can redline any of them.

1. Display name. "Unicron Internal" is a working placeholder. The real name swaps into branding.display_name and the doc filenames before launch. slug (internal) and customer_org_id (unicron-internal) are fixed by the URL decision.
2. Job-feed API access. Indeed and LinkedIn job-search APIs have paid access tiers. Default: build the job-postings adapter against keyless and low-cost sources first (company career pages, aggregator RSS, structured job data). Paid API access is a later upgrade, flagged as a cost decision for Kyle, not a v1 blocker.
3. Trade-association data freshness. AGC, ABC, NECA, AED directories are semi-public and may need scraping. Default: treat them as slow-refresh enrichment, not a timely trigger. A directory that proves fragile registers tier-2-human-assist.
4. SAM.gov endpoint. Resolved: use the SAM Entity Management (registration) API, the company-registration feed, not the Opportunities feed. Company-targeting requires the entity feed; opportunities are project-level and out of scope here.
5. Adjacency seed data. Resolved by Kyle: real data, gated. The adjacency-mapper code is built, but its activation depends on Unicron delivering a real seed handoff: customer list, CRM contact export, and trade-association membership records. Until that lands, companies ship without warm-intro notes and the adjacency stage is built last. This is an explicit external dependency.
6. Ranker threshold calibration. The verified gate is 0.65 (score 65 on the stored 0-100 scale). Default: ship at 0.65, instrument accept and reject behavior from the first weeks of operation, and recalibrate. A Pulse-style tuning pass is a later addition.
7. Daily volume confidence. Four of six sources are custom adapters not yet built; the decomposition's per-source volume figures are estimates. Default: ship, instrument actual ingest volume per source, and adjust cron cadence and per-cycle queue limits from real numbers.
8. Geographic scope. Resolved by Kyle: national, anywhere in the US. State-specific feeds expand by accessible-state priority (Section 8). The qualifier and geo-mapper apply no geographic exclusion inside the US.
9. Score scale. Match the Funder resolution: store 0-100 integer scores, scale architecture thresholds by 100 at the read site. Generic path only. The Zedcor kernel is untouched.
10. Funder platform-gap overlap. The generic-org Sonnet rationale and the KPI query layer are gaps the Funder build closes. Sequencing: branch the Internal build off main after Funder merges, so org #4 inherits them. If Funder has not merged, Stage 1 resizes the plan to close them additively. Either way, no Zedcor-owned path is touched.

---

## 11. Build sequencing

Ordered for the build prompt. No time estimates. Each stage is a Claude Code sprint with a plan-first checkpoint, worktree isolation, and the existing-customer regression check. The build prompt expands this into Stage 0 (bootstrap) plus Stages 1 through 11.

1. Plan-first platform audit. Verify Section 4 against the live codebase. Confirm whether the Funder build merged and which generic gaps it closed. Resolve projects vs leads, the score scale, the source adapter registry shape. Output a corrected platform-state note. No code.
2. Org record. Author and persist Internal's architecture JSON via POST /api/organizations. Insert the organizations row. Confirm resolveArchitecture round-trips it and /internal routes.
3. Vanity domain. Wire internal.unicron.systems to the /internal route, host routing in middleware accounting for basePath /pathfinder, operator-allowlist auth.
4. Source adapters. Reconfigure sam-gov and usaspending. Build the 4 net-new adapters in priority order (Section 8). Keep fragile ones behind pending or tier-2-human-assist.
5. Qualifier plus enrichment. Build the net-new per-org qualifier. Reconfigure the Enricher and the Geo-mapper. Build the Adjacency-mapper; leave it inactive pending the real seed handoff.
6. Ranker. Add the six Internal feature extractors to the generic scorer, additively. Close or inherit the generic-org Sonnet rationale. Reconcile the score scale.
7. Verifier. Internal verification checks; thresholds from the architecture.
8. Daily digest. Reconfigure the Briefer to a daily morning Slack digest plus the kanban load at New / Outreach Ready. The working deliverable.
9. Outreach plus integrations. Outreach Drafter channels (email, LinkedIn message, internal HubSpot note). Wire Unicron's HubSpot and Slack. Degrade gracefully without credentials.
10. Dashboard. Confirm the /internal ui_plan render. Add Internal's KPI metric_id queries additively. Run the headless build-out verification.
11. End-to-end. Run the Phase 2E onboarding state machine on real public data. Confirm ready_to_view and build_out_complete. Verify internal.unicron.systems is live. Run the existing-customer regression check (Zedcor, Realberry, Funder).

**Adjacency activation (post-build, gated).** When Unicron delivers the real seed handoff, load it for organization_id=internal, activate the adjacency-mapper, and re-run it across the existing verified company set. The opportunity feed itself is real public data and needs no swap.

---

## 12. Approval

This blueprint was the Step 3 control point and is approved. The build prompt (Pathfinder-Internal-Claude-Code-Kickoff.md) carries it as APPENDIX A and the architecture JSON as APPENDIX B, materializes both to disk at Stage 0, and executes the build: worktree-based, plan-first checkpoint, CLAUDE.md coordination protocol, no self-merge, kanban hygiene, referencing the existing Pathfinder codebase as the platform base.

Redline candidates if revisited: the Section 10 decisions, the architecture JSON weights and taxonomy, the display name.
