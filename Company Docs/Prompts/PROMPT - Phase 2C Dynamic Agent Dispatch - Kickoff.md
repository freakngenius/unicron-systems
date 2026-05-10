# PROMPT — Phase 2C Dynamic Agent Dispatch Kickoff (paste-ready)

Paste into a fresh Claude Code session AFTER Phase 2A merges. This stream is independent of Phase 2D and can run in parallel — use a separate worktree.

---

## Pre-read

1. `Company Docs/PRD/PRD - Phase 2 Tailored Pathfinder.md`
2. `Company Docs/Specs/SPEC - Phase 2C Dynamic Agent Dispatch.md` — full scope.
3. `Company Docs/Specs/SPEC - Phase 2B Tenant Config Layer.md` — architecture JSON shape.
4. Confirm Phase 2A is merged: `pathfinder.organizations` exists, `org_memberships` exists, all customer-data tables have `organization_id` + RLS.
5. Existing Pathfinder agent code: `Pathfinder/agents/`, `Pathfinder/inngest/`, `Pathfinder/api/`.
6. Existing source adapters in `Pathfinder/agents/sources/` (or equivalent path).
7. Existing ranker, verifier, outreach drafter logic — note hardcoded Zedcor weights and personas.

## Hard constraints

- No deletes, no time estimates, no cost caps, multi-Vercel verification, no auto-promotion to Verified.
- Verbatim evidence in PR description (paste actual logs, schema queries, test output).
- Use a fresh worktree: `git worktree add .claude/worktrees/phase-2c-dynamic-dispatch feat/phase-2c-dynamic-dispatch`.
- Work fully isolated; do not touch any code Phase 2D might also touch (UI components in `Pathfinder/components/` or `app/[slug]/`).

## Phase A — Investigation (Explore sub-agent)

```
Investigate Pathfinder backend to scope Stream 2C work:

1. Map current agent code structure: ingestor, ranker, verifier, enricher, outreach drafter, briefer.
2. For each agent, identify hardcoded Zedcor-specific values: scoring weights, geography defaults, persona/tone, value prop, source IDs.
3. List all source adapters present. For each, note its trigger mechanism (cron, on-demand, both) and current Inngest function ID.
4. Identify the entry point that takes a single lead candidate and runs scoring → verification → enrichment → drafter → output. Is this orchestrated in Inngest or directly in API routes?
5. Find every direct write to pathfinder customer-data tables (leads, agent_dispatches, etc.) and verify each writes organization_id (post-2A).
6. Check Inngest cron schedules — list every function and its cadence.
7. Pull a sample agent run log from Inngest dashboard (use search_docs MCP if needed) showing the full flow for a single Zedcor lead from ingestion through outreach.
8. Identify where compliance filters (if any) are applied to outreach drafts.
9. Confirm Source Onboarder agent's current invocation API: how is a new source registered and which queue does it land in?

Report findings with file paths + line numbers + verbatim code snippets. Do not modify code yet.
```

## Phase B — Generalize agent inputs

For each agent, refactor entry point to take `{ organization_id, architecture: OrgArchitecture, ...payload }`:

1. Ranker: replace hardcoded weights with `architecture.scoring.weights`. Add `geography_match`, `asset_class_match`, `trigger_strength`, `basis_fit`, `unit_count_fit` feature extractors (real-estate-aware). Keep existing extractors. Tests verify: same Zedcor inputs + Zedcor weights produce same outputs (regression baseline).

2. Verifier: replace hardcoded thresholds with `architecture.scoring.thresholds.verified` and `.high_priority`.

3. Outreach drafter: extract hardcoded prompt template into a function that injects `architecture.outreach.persona`, `.tone`, `.value_prop`, plus compliance clause from `architecture.compliance`. Keep existing Generator-Verifier loop on outputs.

4. Briefer: same pattern — persona/tone from architecture.

5. Enricher: enrichment fields driven by `architecture.lead_unit.schema` (skip fields the schema doesn't include).

## Phase C — Source adapter registry

1. Create `Pathfinder/agents/sources/registry.ts` per spec.
2. Move existing adapters to be entries in the registry (sam-gov, usaspending, harris-county, etc).
3. Add stubs for Realberry sources: sec-edgar, rentcafe, loopnet-feed (simplified — fetch + parse + emit candidates). Mark adapters as `tier-2-human-assist` if not yet implementable in this PR.
4. Implement `resolveSource(sourceRef)` per spec.
5. For unknown source IDs, route to Source Onboarder queue (existing).

## Phase D — Per-org dispatch

1. Refactor Inngest cron `ingest-all-orgs` per spec: lists active orgs, invokes `ingestOrgFunction` per org.
2. `ingestOrgFunction` reads `org.architecture.sources`, dispatches each via registry.
3. Geography filtering applied at adapter level where possible, falls through to ranker.
4. All outputs land in org-scoped rows (organization_id from input).

## Phase E — Compliance filter on outreach

1. Add `complianceClause()` helper per spec.
2. Inject into outreach drafter prompt.
3. Add Generator-Verifier check: rejects drafts containing retail-investor solicitation language for SEC-flagged orgs.

## Phase F — Cross-pollination wiring (light)

1. Existing cross-pollination engine: confirm it produces signal records.
2. Add minimal wiring: when verified lead is created for org A, query cross-pollination signals from other orgs that match (same metro, same trigger event window, same broker). Surface as `lead.cross_customer_signals` array on the lead row (without exposing source org).
3. UI rendering of this badge is in Stream 2D — just produce the data here.

## Phase G — Tests

- Unit: each agent function with mock architecture (Zedcor + Realberry shapes).
- Integration: end-to-end run for a sample Realberry org with stubbed source adapters; verify scored leads in pathfinder.leads with correct organization_id.
- Regression: existing Zedcor tests pass unchanged.
- RLS probe: SQL query as Realberry user JWT cannot read Zedcor leads; vice versa.

## Phase H — PR open + verification

1. Open PR titled `Phase 2C: Dynamic Agent Dispatch — per-org architecture-driven backend`.
2. PR body includes: what ships, agent-by-agent diff summary, regression test results, RLS probe output (verbatim), Inngest dashboard screenshot of new per-org function structure.
3. Multi-Vercel: Pathfinder green; Metacron green (no regression — Metacron does not depend on agent backend changes).
4. Worktree cleanup via `git worktree remove`.

## Failure modes — halt + report

- Phase 2A not merged at branch time.
- Existing Zedcor test regressions.
- RLS probe shows leakage.
- Source adapter refactor breaks an adapter that's currently in production cron.

## Kanban hygiene

- At Phase A start: Cowork moves Phase 2C card from Not Yet Started → In Process. (Cowork creates this card; CC expects it to exist.)
- At PR merge: Cowork moves card → Deployed. CC reports merge SHA + ISO timestamp.

End.
