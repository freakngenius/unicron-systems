# SPEC — Definition of Done: Metacron End-to-End Operational

**Pinned truth. Master Conductor reads this on every cycle. Even if context compacts, this definition stands.**

## What "production-ready" means for Metacron

Metacron is NOT complete until ALL of the following are true for ANY new customer onboarded through the Architect, not just Zedcor:

### 1. Architect blueprint → fully developed operational build

The Architect's output JSON is not a plan, it's an executable specification. Approve & Deploy materializes the blueprint into a running system. Every element of the blueprint is instantiated as a live, running, observable component:

- Every agent named in `architecture.sources` and `architecture.agents` is **actually deployed and running** for that organization, not stubbed, not mocked.
- Every source declared in `architecture.sources` is **actually connected** to a real data feed producing real rows in `pathfinder.leads` scoped to that organization_id.
- Every interconnection between agents (ingestion → ranker → verifier → enricher → outreach drafter → briefer) is **actually wired** and runs end-to-end for that org.
- Every agent's instructions are **literally what the Architect described** — persona, tone, thresholds, scoring weights, geography filters, compliance constraints — read at runtime from `architecture.*` JSON, not hardcoded.
- The Architect's blueprint is **the runtime contract**. If the Architect says "verifier threshold 0.85 for high priority," the verifier reads 0.85 from architecture.scoring.thresholds.high_priority at runtime, not from a constant.

### 2. Per-customer Pathfinder dashboard with unique URL

Every customer organization has a unique, accessible Pathfinder URL:

- Route: `pathfinder.unicron.systems/[slug]` (or equivalent slug-based path)
- URL is operator-accessible immediately after org persistence
- Dashboard renders org-tailored content: lead schema from architecture.lead_unit, pipeline stages from architecture.pipeline, scoring from architecture.scoring, geography from architecture.geography, vocabulary from architecture.vocabulary, branding from architecture.branding, business summary from architecture.business_summary, ui_plan from architecture.ui_plan
- Real verified leads visible, scoped to that org via organization_id + RLS
- Real metrics (lead volume, high score rate, outreach delivery, error rate) computed from live queries against that org's data
- Real time-series charts from real per-day data, not random or fixture data
- Real source list reflecting that org's active adapters with last-run timestamps
- Real recent errors filtered to that org

### 3. Connected end-to-end

- **Metacron → Pathfinder bridge:** Operator Verify in Metacron → cross-schema dual-write → Pathfinder activity surface (Phase 1F bridge, already live)
- **Architect → Pathfinder spawn:** Approve in Metacron Architect → org persisted → Inngest org.created → first ingestion run dispatches every agent from architecture.sources/agents → leads land in pathfinder.leads → status flips ready_to_view → operator deep-links to Pathfinder
- **Build-out verification:** After ready_to_view, headless verification of /[slug] route (see Pathfinder Build-Out Pass SPEC). Status flips build_out_complete on pass.
- **All connectors operational:** HubSpot OAuth bidirectional, Slack notifications, Microsoft Teams (if configured) — each roundtrip works for at least the test org
- **All data sources operational:** Every source declared by Architect for any org is one of three states only — live (real adapter producing rows), tier-2-queued (declared, awaits operator), or voice-agent (Phase 3+); never silent failure, never mock fallback

### 4. Zero mock fixtures anywhere customer-facing

- Grep clean: no `customersMock`, `KNOWN_ORGS`, `FAKE_`, `MOCK_`, hardcoded customer lists, fixture imports in customer-facing components or operator-facing dashboards
- Empty states render real "no data yet" copy, not stub data
- Every list view, every metric, every chart reads from live queries

### 5. RLS isolation verified end-to-end

- Every customer-data table has organization_id column + RLS policy
- Operator allowlist auth grants cross-org read; non-allowlisted sessions blocked
- SQL probe confirms org A's queries cannot return org B's rows
- Service role bypasses RLS only for system-level operations (cron jobs, agent dispatch)

### 6. 11-step synthetic smoke test for fresh org

The acceptance gate is a fully-executed end-to-end test for a NEW org created from scratch via the Architect — not Zedcor (pre-existing) and not Realberry (existing partial state). A fictional org "TestCorp-<timestamp>" (timestamp keeps the slug unique across runs) must:

**Step 1:** Receive a real Architect plan via the onboarding modal. Plan includes real business_summary, real decomposition (sources, agents, scoring, pipeline, vocabulary, branding), and real ui_plan (KPIs, charts, lead_card_layout, filters, dashboard_emphasis).

**Step 2:** Persist via Approve & Deploy with full architecture JSON to `pathfinder.organizations`. Status starts at `setting_up`.

**Step 3:** Trigger Inngest `org.created` event automatically on persistence. No manual operator action between Approve and ingestion start.

**Step 4:** `ingestOrgFunction` runs with every adapter declared in `architecture.sources`. Each adapter resolves to one of (live, tier-2-queued, voice-agent, pending). Status moves to `first_run`.

**Step 5:** Produce real ranked + verified leads in `pathfinder.leads` with organization_id = TestCorp's UUID. At minimum 3 leads or status moves to `awaiting_threshold` with operator-actionable controls. Status moves through `ranking` → `ready_to_view`.

**Step 6:** Build-out verification fires after `ready_to_view`. Headless browser visits `/[slug]`, captures screenshot, asserts: KPI strip rendered, ≥3 lead cards visible, charts rendered, no console errors, no error states. Status moves to `build_out_complete` on pass. On fail, fix loop runs (max 5 attempts) before flipping `build_out_failed` with diagnostic.

**Step 7:** Operator opens Atrium → Metacron → Customers → TestCorp → Pathfinder deep-link button enabled.

**Step 8:** Click → tailored Pathfinder at `/testcorp-<timestamp>` renders with TestCorp's vocabulary, pipeline stages, lead schema, branding, and the ui_plan layout (KPIs, charts, lead cards arranged per architecture.ui_plan).

**Step 9:** Real verified leads visible matching the Architect's defined criteria. Lead cards show fields from architecture.lead_unit.schema. No fixture data anywhere.

**Step 10:** Operator verifies a lead → cross-schema bridge writes to pathfinder.agent_verifications → Pathfinder activity surface updates within ~1s (Phase 1F bridge wiring).

**Step 11:** SQL probe confirms RLS isolation: a non-operator authenticated session OR a query scoped to a different org's user cannot read TestCorp's leads or any related per-org row. Cross-org leakage blocks the gate.

If all 11 pass: Metacron is end-to-end operational. Promote relevant kanban cards to Deployed; human (Kyle) moves cards to Verified after personal walkthrough.

If any fail: file Bug Fix cards for each failure point. Continue cycling. Re-run smoke test after fixes.

### 7. Cleanup before declaring done

- Test org (TestCorp-<timestamp>) deleted from production after smoke test passes
- All mock fixture files archived to `_archive/` (not deleted, per HARD CONSTRAINT)
- All in-flight worktrees cleaned via `git worktree remove`
- Final status report: every kanban card in Not Yet Started / In Process / Bug Fixes is shipped or has a clear blocker note

## What does NOT count as done

- Architect generates plan + persists org, but no agents actually run for the new org → NOT DONE
- Per-customer Pathfinder URL routes but shows mock/fixture data → NOT DONE
- Some agents wired but not all from the architecture → NOT DONE
- Bridge writes happen but UI doesn't reflect them → NOT DONE
- RLS partial; some tables expose cross-org data → NOT DONE
- Smoke test passes for Zedcor (preexisting) but not a fresh synthetic org → NOT DONE
- All cards in Deployed but the synthetic end-to-end test fails → NOT DONE
- Build-out verification step 6 fails or never runs → NOT DONE

## Authoritative reference

This document is the **single source of truth** for what "Metacron complete" means. Master Conductor reads this at the start of every cycle. If any other doc, prompt, or instruction contradicts this, this document wins. Update this document only when Kyle explicitly directs.

End.
