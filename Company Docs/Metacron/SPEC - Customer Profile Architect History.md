# SPEC — Customer Profile Architect History

Every customer profile in Metacron has a permanent, always-available record of every Architect blueprint generated for that customer. The data is already persisted at the DB level (`architect_sessions`, `architect_proposals` tables exist in production). The gap is the UI surface — it is not visible or browsable per customer.

## Why

When the Architect generates the blueprint output (problem statement, business summary, decomposition, ui_plan) and the operator moves off that screen, the information disappears from view. It is in the database but there is no way to get back to it. Each customer needs a permanent log in their profile.

## Current state

- `pathfinder.architect_sessions` — 26 rows in production
- `pathfinder.architect_proposals` — 13 rows in production
- The Architect output IS being saved. It is NOT surfaced in Customer Detail.

## What ships

1. **Architect History tab/section on Metacron Customer Detail.** For the selected customer org, list every Architect run/proposal tied to that org, newest first.

2. **Per-run row shows:** date, input intent (the prompt), confidence, status (pending/approved/deployed), a one-line summary.

3. **Click a run → full detail view:**
   - Input intent (the full prompt the operator entered)
   - Business summary (lead_type, business_area, problem_solved, what_they_get)
   - Decomposition (sources, agents, scoring, pipeline, vocabulary, branding)
   - ui_plan (KPIs, charts, lead_card_layout, filters, dashboard_emphasis)
   - Which version was deployed (if any) and when
   - Operator edits applied at deploy (diff vs Architect original, if captured)

4. **Diff between runs.** If a customer has multiple Architect runs (re-architected over time), allow viewing the diff between consecutive versions.

5. **"Re-run Architect" action** from the Customer Detail — fires a new decomposition with the current org context, presents in the Approve/Deploy flow, on confirm appends a new history entry. Existing leads are preserved across re-runs.

## Data model

The data exists. Confirm the linkage:
- `architect_sessions` and `architect_proposals` must be queryable by `organization_id` (or by customer_org_id). If they aren't org-scoped yet, add the column + backfill.
- If a cleaner dedicated table is warranted, `pathfinder.architect_runs` (organization_id, version, input_intent, business_summary jsonb, decomposition jsonb, ui_plan jsonb, deployed_architecture jsonb, deployed_at, deployed_by, created_at). But first check whether architect_sessions + architect_proposals already carry everything — do not duplicate storage if the existing tables suffice. Prefer surfacing existing data over a new table.

## API

- `GET /api/orgs/:slug/architect-history` → list of runs for that org
- `GET /api/orgs/:slug/architect-history/:id` → full run detail
- `POST /api/orgs/:slug/architect-history/rerun` → trigger new decomposition

## UI

`unicron-platform/src/...` Customer Detail gets a new "Architect History" tab alongside the existing detail view. v3 light tokens. Run list as rows, click → side panel or modal with full blueprint detail. Reuse the Business Summary panel component for the business_summary section. Reuse the Architect Canvas Flowchart component (see that SPEC) to render the decomposition visually inside the detail view.

## Acceptance criteria

- Customer Detail has an Architect History tab.
- It lists every Architect run for that org, newest first, with date + intent + status.
- Clicking a run shows the full blueprint: intent, business summary, decomposition, ui_plan, deployed version.
- The data is real — pulled from architect_sessions / architect_proposals (or architect_runs) scoped to the org.
- "Re-run Architect" works and appends a new history entry.
- No data loss: moving off the Architect screen no longer loses the blueprint — it's permanently in the customer's profile.
- v3 light styling.
- Verified by headless click-through.

## Out of scope

- Customer-facing version history (operators only).
- Auto-rollback to a prior version (operator manually re-runs with prior intent).

End.
