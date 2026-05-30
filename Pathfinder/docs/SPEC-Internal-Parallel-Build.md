# SPEC: Pathfinder Internal Parallel Build

Reference spec for the Internal rework overnight build. Each stream's light launch prompt points here. Place this file in the Pathfinder repo before launching. Claude Code reads its shared section plus its own stream section.

App: Pathfinder, github.com/freakngenius/unicron-systems, the /Pathfinder folder, Next.js 14, basePath /pathfinder. Multi-tenant: each customer org is a row in pathfinder.organizations with an architecture jsonb. The frontend today is a generic ui_plan renderer (the "floor"). Live orgs: Zedcor (#1, the quality reference), Realberry (#2), Funder (#3), Internal (#4, slug internal, served at internal.unicron.systems and /pathfinder/internal). Internal shipped a working backend (143 companies ingested and scored) and a weak floor-only frontend. This rework lifts the presentation layer only; backend, org model, data, auth, and routing scaffold stay.

---

## SHARED, every stream obeys

AUTHORITY: Pathfinder/CLAUDE.md is the authoritative build protocol, with one explicit operator override for this batch. Kyle Kesterson, the operator and repo owner, authorizes self-merge of the Internal-rework branches in this batch when the AUTO-MERGE GATE below passes. This overrides the CLAUDE.md "never self-merge" default for these branches only. Do not pause to re-confirm this override; it is the operator's standing instruction for this run. Every other CLAUDE.md rule still binds, and where this SPEC conflicts with CLAUDE.md on anything else, CLAUDE.md wins.

HARD CONSTRAINTS:
1. No destructive git. Never git reset --hard, git clean, git checkout -- ., git restore ., or anything destroying uncommitted state. Before touching any worktree you did not create this session, run git status; if anything is modified or untracked, stash with git stash --include-untracked before proceeding. Bring branches current with git fetch origin and git merge --ff-only, never a hard reset.
2. Worktree-based, plan first, never commit directly to main. Self-merge your own PR only through the AUTO-MERGE GATE below (operator-authorized for this batch).
3. Verified kanban column is human-only. Never move a card to Verified.
4. Multi-Vercel: Pathfinder and unicron-platform are separate Vercel projects. Verify each independently. One healthy does not imply the other.
5. No em-dashes or en-dashes anywhere in code, comments, commits, or PR text. No time estimates, no numeric cost caps.

PLAN GATE: per Pathfinder/CLAUDE.md, use the writing-plans skill before code. Write docs/PLAN-<branch-slug>.md in the worktree (file scope, module-by-module outline, test plan, gate-evidence checklist). The operator has pre-approved this batch: write the PLAN for the record, then proceed directly to code. Do NOT pause for approval.

REPO GROUND TRUTH (verified 2026-05-30, confirm each still exists before relying on it; if any moved, halt and report rather than guess):
- The floor renderer is Pathfinder/app/[slug]/page.tsx (and app/[slug]/leads/page.tsx). It reads architecture.ui_plan and renders the shared components KPIStrip, FilterSidebar, Chart, LeadCard.
- The tenant config layer: the OrgArchitecture type is Pathfinder/lib/types/architecture.ts (it already carries an optional ui_plan field; there is NO modules field yet). The resolver is Pathfinder/lib/config/resolveArchitecture.ts, merging a partial against BASE_ARCHITECTURE in Pathfinder/lib/config/baseTemplate.ts.
- KPI and chart queries: Pathfinder/lib/metrics/kpiQueries.ts (getKpiValue) and chartQueries.ts (getChartSeries).
- Internal backend agents already exist and ship: Pathfinder/lib/agents/internal/companyLeadView.ts (the per-org lead projection, analogous to lib/agents/funder/leadView.ts), outreachDrafter.ts, plus internal-* enrichment in lib/inngest/functions. Internal agent tests live in Pathfinder/__tests__/agents/internal-*.
- Shared components KPIStrip, LeadCard, FilterSidebar, Chart are used by Zedcor and Funder too. Treat them as live-org surface: do not alter their default behavior.

SAFETY RULE, non-negotiable: the catalog is additive. Orgs without a modules block render exactly as today through the existing floor path. Modules are NEW components the registry routes to only for orgs that enable them. Never modify the default rendering of a shared component (KPIStrip, LeadCard, FilterSidebar, Chart) in a way that changes Zedcor or Funder output. If a module needs different behavior, it is a new component, not an edit to the shared one.

DISCOVERY, confirm the ground truth above, the per-org Inngest dispatch, and Zedcor's bespoke components (the quality reference). Report real paths in the PR with verbatim evidence per change. No hypothesis-driven edits.

KANBAN (Pathfinder Features Kanban): move your stream's cards to In Process at start. On merge move them to Deployed and append "Implemented at <commit-sha> · merged at <ISO timestamp>". Bug Fixes if halted unresolved. Never Verified (human-only).

AUTO-MERGE GATE (operator-authorized for this batch), merge your own PR to main when ALL hold: build, lint, type-check, all stream tests green; CI matches the repo exactly (pnpm, frozen lockfile, MEMORY/spec-references.md entries for any changed lib/ file, numeric cron day-of-week if a cron is touched); the Pathfinder Vercel preview builds green; and the ZEDCOR-UNCHANGED HARD GATE passes (Zedcor, Realberry, Funder render byte-identically to before; their architecture rows are untouched; their surfaces are visually unchanged). The PR body carries verbatim evidence per change and the test output. Then merge and move the cards to Deployed.
AUTO-REVERT TRIGGERS: any post-merge Pathfinder deploy failure, or any sign that Zedcor, Realberry, or Funder changed, reverts the merge immediately (git revert, never a destructive reset) and moves the cards to Bug Fixes with the evidence. The Zedcor-unchanged gate is the safety net that makes unattended merge safe; treat any doubt about it as a revert.
HARD-HALT (do not merge, do not work around): a destructive-git situation, any backend or schema change beyond what your stream explicitly allows, or an unresolved failing test after honest iteration. Halt, leave cards In Process, report. Halting is correct behavior; never fabricate data or weaken a test to force a green.

QUALITY BAR (surface streams B, C, D): Zedcor's Pathfinder is the reference. Read Zedcor's components in the repo and match that depth and polish for Internal, using the design primitives Stream A exports. Internal data, Zedcor-grade presentation. The surface failed before because it rendered raw schema keys with blank values; the bar now is real values with human labels. Always render the schema display_label, never the field key.

INTERNAL SCHEMA (labels): company_name (Company), service_category (Service category, enum), sales_motion (Sales motion, enum), footprint (Operating footprint), hq_location (Headquarters), licensure (Contractor licensure), federal_registration (Federal registration, enum), association_memberships (Trade associations), company_size (Size), warm_intro (Warm intro), first_step (Recommended first step), score (Score), source (Source).

LAUNCH ORDER (single-session sequential, set-and-forget): one session runs the whole chain. Do Stream A fully and merge it through the gate. Then, on the post-A main, do Stream B and merge, then Stream C and merge, then Stream D and merge. Sequential, not parallel, so there are no cross-stream merge races and the operator does not need to relaunch anything. Each stream branches a fresh worktree from the current main (which now includes the prior merged streams). If a stream hard-halts, complete the streams that can still proceed independently, and report the halted one.

SCORE-COMPONENTS NOTE (resolved, do not re-ask): the ranker computes the six weighted signals to produce row.score but does NOT persist per-signal contributions, and they are not faithfully re-derivable. Do NOT fabricate them or apply a calibration scalar. company-detail renders the six signals qualitatively: each signal with its architecture weight (for example "Federal signal, weight 15%") and the real stored evidence that fired it (SAM registration, federal awardee, association membership, sales-motion evidence, footprint), plus the real total score prominently. No fabricated point contributions, so there is nothing to reconcile. The sum-to-total requirement and its revert trigger are dropped for this build.

---

## STREAM A, Foundation

Shared scaffold. Branch from current main. Five parts, all additive.

PART 1, catalog contract and registry:
- Types in a new file Pathfinder/lib/catalog/types.ts: ModuleDefinition, Slot, Dependency, OrgModuleEntry.
  Slot = "dashboard.hero" | "dashboard.kpi" | "dashboard.charts" | "dashboard.filters" | "detail.body" | "detail.outreach" | "detail.relationships" | "pipeline.board" | "delivery.digest"
  Dependency = { kind: "schema_field" | "integration" | "agent" | "data_signal", ref: string, gate: "hard" | "soft" }
  ModuleDefinition = { id, version, slot, title, component (lazy ref), agent?, dependencies: Dependency[], configSchema, fallback: "floor" | "inactive" | "hidden" }
  OrgModuleEntry = { enabled: boolean, version?: string, config?: object }
- Extend the existing config layer, do NOT build a parallel one: add an optional `modules?: Record<string, OrgModuleEntry>` field to OrgArchitecture in lib/types/architecture.ts (mirror how the optional ui_plan field was added). Resolve it in lib/config/resolveArchitecture.ts with the existing merge semantics (a map field, replaced wholesale when the partial provides it), and add a default (empty / no modules) to BASE_ARCHITECTURE in lib/config/baseTemplate.ts so existing orgs are unaffected.
- Pathfinder/lib/catalog/registry.ts exporting MODULE_REGISTRY with eleven modules. Component refs are lazy stubs that render the current floor output for now (later streams replace them). Dependency declarations are REAL (id, slot, agent, deps as kind/ref/gate, fallback):
  ranked-feed, dashboard.hero, no agent, [schema_field/score/hard, data_signal/verified/hard], floor.
  company-detail, detail.body, no agent, [data_signal/enriched_record/hard, data_signal/sources/soft], floor. (score_components is NOT a dependency; per the SCORE-COMPONENTS NOTE the signals panel uses stored evidence and weights, not persisted contributions.)
  outreach-composer, detail.outreach, agent outreach-drafter, [data_signal/outreach_drafts/soft, integration/resend/hard], inactive.
  hubspot-sync, detail.outreach (action area only, see collision note), no agent, [integration/hubspot/hard], floor.
  pipeline-kanban, pipeline.board, no agent, [data_signal/pipeline_stages/hard], floor.
  filter-rail, dashboard.filters, no agent, [schema_field per configured filter/soft], floor.
  warm-intro-panel, detail.relationships, agent adjacency-mapper, [data_signal/adjacency_graph/soft], inactive.
  kpi-strip, dashboard.kpi, no agent, [data_signal per metric/soft], inactive.
  analytics-charts, dashboard.charts, no agent, [data_signal/aggregate_queries/soft], inactive.
  daily-digest, delivery.digest, agent briefer, [data_signal/verified_companies/hard, integration/slack/hard], hidden.
  geo-map, detail.body, agent geo-mapper, [data_signal/geocoded_coords/hard], hidden. Registered, enabled by no org.
- Slot-collision rule: one module, one slot. hubspot-sync must NOT be a second claim on detail.outreach; expose it as an action affordance inside the outreach slot that outreach-composer owns. Document the resolution in the PR.

PART 2, validation and gating:
- validateOrgModules(org): every enabled id exists; no two enabled modules claim the same slot; pinned version exists; org config validates against the module configSchema. Refuse (config-time) any hard-gated module whose dependency is unmet. Return structured errors.
- resolveGate(dep, org): schema_field -> org lead_unit schema has the key; integration -> org.architecture.integrations includes ref; agent -> org active agents includes ref; data_signal -> query real pipeline output for non-empty.
- Renderer slot resolution, wired into the EXISTING floor renderer app/[slug]/page.tsx (and app/[slug]/leads/page.tsx), not a parallel renderer: for each slot, enabled and all gates met -> render the module; enabled and a soft dep unmet -> module inactive fallback; enabled and a hard dep unmet, or no module claims the slot, or the org has no modules block -> the current floor output for that slot (the existing KPIStrip / LeadCard / FilterSidebar / Chart path). Never blank; log a misconfiguration and fall back, do not crash. An org with no modules block must render byte-identically to today.

PART 3, additive modules block, write to Internal's (#4, slug internal) architecture jsonb via a migration:
  ranked-feed, company-detail, outreach-composer, hubspot-sync, pipeline-kanban, filter-rail, warm-intro-panel, daily-digest: { "enabled": true }
  kpi-strip: { "enabled": true, "config": { "metrics": ["verified_count_1d", "active_motion_pct", "avg_score", "sources_live"] } }
  analytics-charts: { "enabled": true, "config": { "emphasis": "secondary" } }
  geo-map: { "enabled": false }
  Do NOT add a modules block to Zedcor, Realberry, or Funder. Confirm by query their architecture rows are byte-unchanged.

PART 4, Phase 0 bug fixes (confirm landed, fix any that did not): the dashboard scrolls; the Companies route loads (no 404); a sub-page back-link returns to /pathfinder/internal not /pathfinder; dashboard and pipeline tiles open a detail view. Provide and export an org-context-preserving navigation helper every surface uses so links never drop the org slug.

PART 5, design primitives calibrated to the Zedcor bar, as NEW files (for example under Pathfinder/components/catalog/primitives/), not edits to the shared KPIStrip / LeadCard / FilterSidebar / Chart. Read Zedcor's components as the reference and export: design tokens, a card shell, a score badge, a one-line "why" element, a designed empty-state, and a section header. This is the visual floor the surface streams build on. Leaving the existing shared components untouched is what keeps Zedcor and Funder byte-identical.

TESTS (before the gate): unit for validateOrgModules (slot collision rejected, missing id rejected, hard-gate refusal, config-schema failure) and resolveGate (each kind, met and unmet) with Internal's block as fixture; renderer falls back to the floor for every slot with stubs in place; a query asserting the three other org rows are unchanged; the Phase 0 fixes verified with evidence.
PR BLOCKER (do not move to Review; fix or mark Bug Fixes): the three non-Internal orgs render differently than before.
PR: real paths, verbatim evidence, the hubspot-sync collision resolution, test output, the byte-unchanged confirmation.

---

## STREAM B, Dashboard

Branch from post-A main. Read the catalog contract, registry, floor renderer, nav helper, and design primitives that A merged; do not redefine them. Scope: the dashboard route for Internal (/pathfinder/internal). Replace four floor stubs with real components. Do not touch the detail route, the pipeline route, or the digest cron.

ranked-feed (dashboard.hero): the hero is the ranked company feed, best-fit companies ordered by score descending. Each card shows real values with human labels (company, service category, footprint, sales motion, score top-right) plus a one-line "why" from the rationale, scannable without a click, Zedcor-dense. Clicking a card opens the company detail route via the nav helper (do not build detail; that is Stream C). The page scrolls.

filter-rail (dashboard.filters): filters on service_category, sales_motion, federal_registration, source. Per-element soft gate: drop a filter whose backing field is absent, render the rest. Filtering updates the feed.

kpi-strip (dashboard.kpi), redesigned: slim and secondary. Metrics verified_count_1d, active_motion_pct, avg_score, sources_live. CRITICAL: every metric reconciles to a real query; a metric that cannot resolve is DROPPED, never shown as a misleading zero. Eliminate the "Active outbound motion 0%" red flag (broken extractor or mis-defined metric). Document what each metric resolves to in the PR.

analytics-charts (dashboard.charts): present but demoted secondary, below the feed. Companies by service category (bar), verified companies over time (line). Soft-gated; render the designed empty-state if a query is empty, not a broken chart.

DONE: hero is the ranked feed, scannable, real values with human labels and the "why"; filters work and drop unmet fields; KPIs each reconcile to a real query with no false zero; charts secondary; page scrolls; cards open detail with org context. No slot renders raw keys or blanks.
TESTS: each kpi metric maps to a query and a null result drops it (assert no zero-placeholder); filter-rail drops an absent field; ranked-feed orders by score desc and renders display_labels; dashboard mounts for Internal, feed is hero, scrolls, card click navigates to detail with org slug intact.
PR BLOCKER (do not move to Review; fix or mark Bug Fixes): a KPI rendering a placeholder zero, or any card rendering a raw schema key. Regression: Zedcor dashboard unaffected.

---

## STREAM C, Detail

Branch from post-A main. Read A's merged contract, registry, floor renderer, nav helper, design primitives; do not redefine. Scope: the company detail route for Internal (/pathfinder/internal/companies/[id] or discovered equivalent). Replace four floor stubs. Do not touch the dashboard route, the pipeline route, or the digest cron.

Scoring weights for the breakdown: sales_motion_strength 0.25, operational_footprint 0.20, federal_signal 0.15, project_driven_fit 0.15, recency 0.15, association_presence 0.10. Thresholds: verified 0.65, high_priority 0.80.

company-detail (detail.body): the deep view. Header with company name and the real total score. A signals panel (NOT a fabricated point breakdown, see the SCORE-COMPONENTS NOTE in the shared section): the six weighted signals, each with its architecture weight and the real stored evidence that fired it. Rationale prose. Qualifying signals (the concrete evidence). All enriched data: website, LinkedIn, size, HQ, footprint, licensure, federal registration, associations. Source records. A timeline. Hard-gated on enriched_record; soft on sources (empty-state if absent). This is the centerpiece; Zedcor-grade density and hierarchy.

outreach-composer (detail.outreach): three drafts (email, LinkedIn message, internal HubSpot note) from the org outreach config (persona, tone, value prop). One-click copy each. A send action hard-gated on the email integration (resend): sends when ungated, shows the disabled affordance with reason when gated. Soft on outreach_drafts; inactive state if absent.

hubspot-sync (action area inside the outreach slot, per the collision rule; not a second detail.outreach claim): a push-to-HubSpot action creating the deal and loading the pipeline. Hard-gated on hubspot; gated affordance with reason when unmet.

warm-intro-panel (detail.relationships): the cross-pollination panel. Soft-gated on adjacency_graph; the Unicron seed data has not landed, so render the designed inactive pending state now and build the active layout too so activation needs no later code change.

DONE: detail view deep and complete, real values with human labels throughout; the signals panel shows the six weighted signals with their weights and the real evidence, plus the real total score; rationale, qualifying signals, enriched data, sources, timeline render; outreach drafts copy and send (send gated on email); HubSpot push works and is gated; warm-intro shows pending and is ready to activate; back-link returns to /pathfinder/internal via the nav helper.
TESTS: the signals panel renders each of the six signals with its weight and evidence and never displays a fabricated point contribution; gating renders the correct active/inactive state for outreach send (resend), hubspot-sync (hubspot), warm-intro-panel (adjacency_graph) with present and absent deps; view renders display_labels not keys; detail route mounts for a real Internal company (for example Thalle Construction Co Inc, score 55), shows the signals panel and enriched data, back-link target is /pathfinder/internal.
PR BLOCKER (do not merge; fix or mark Bug Fixes): any fabricated score contribution displayed, or any field rendering a raw key. Regression: Zedcor detail unaffected.

---

## STREAM D, Pipeline and Delivery

Branch from post-A main. Read A's merged contract, registry, floor renderer, nav helper, design primitives; do not redefine. Scope: the pipeline route for Internal (/pathfinder/internal/pipeline or discovered equivalent) and the daily digest cron. Replace two floor stubs. Link to the detail route via the nav helper but do not build it (Stream C).

Pipeline stages and labels: new-outreach-ready (New / Outreach Ready), contacted (Contacted), in-conversation (In conversation), demo-scheduled (Demo scheduled), proposal (Proposal), won (Won), lost (Lost).

pipeline-kanban (pipeline.board): the deal board across the seven stages with real company cards. Cards drag between stages and the move persists. A card opens the company detail route via the nav helper, org slug intact. Hard-gated on pipeline_stages. Use the design primitives so a card matches the ranked-feed card visual language.

daily-digest (delivery.digest, non-visual): a morning cron composing a Slack digest of the top verified companies for Internal and posting it, hard-gated on the slack integration and on verified_companies being non-empty. It also loads newly verified companies into the kanban at New / Outreach Ready. Reuse the existing briefer and Slack-alert pipeline rather than rebuilding; wire this module's data contract to it. If a cron schedule is touched, use a numeric day-of-week.

DONE: the kanban renders all seven stages with real cards; drag-and-drop moves a card and persists; a card opens detail with org context; the digest cron composes and posts the Slack digest (gated) and loads new verified companies into New / Outreach Ready.
TESTS: a drag persists the stage change; the digest selects the correct top verified set and is gated off when slack is absent or verified_companies empty; the new-verified loader targets new-outreach-ready; the pipeline route mounts for Internal with cards in stages, a card opens detail with the org slug intact.
PR BLOCKER (do not move to Review; fix or mark Bug Fixes): a drag that does not persist, or the digest posting for the wrong org. Regression: Zedcor pipeline and digest unaffected.
