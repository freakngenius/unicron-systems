# SPEC Addendum 1 — Kanban Surface Routing Rules

**Status:** Active
**Parent SPEC:** SPEC - Unicron Nervous System.md
**Date:** 2026-05-05
**Owner:** Kyle Kesterson (Internal Org Cowork chat)

This addendum extends SPEC section 13.4 (Surface routing) with explicit rules for the kanban writer. Sprint 1 (call ingest pipeline) consumes these rules when assigning `kanban_workspace` to action items.

Merge into main SPEC at v0.2 after Sprint 0 stabilizes.

---

## The three kanbans

| Kanban | Workspace value | Owns |
|--------|-----------------|------|
| Pathfinder Features Kanban | `pathfinder` | Pathfinder customer-facing product work, customer-specific data flows, customer enrichment, Zedcor product usage |
| Metacron Features Kanban | `metacron` | Metacron operator-facing product work, agent console, customer onboarding configurator |
| Internal Org Kanban | `internal` | Everything else: company-wide infrastructure, discovery, sales pipeline pre-tenant, operations, marketing, architecture |

## Internal Org Kanban — what lives here

Six surfaces (matches the `Surface` Notion property):

### Architecture

- Nervous System sprints (Sprint 0 through 5 from parent SPEC)
- Ingest pipeline work, including infrastructure that lives in Pathfinder repo code (e.g., `/api/ingest` route)
- Persistent agent runtime: Orchestrator, Analyst, Elder, Taboo Keeper
- Slack Orchestrator app
- Knowledge vault repo work
- Cross-cutting schema decisions touching both `pathfinder.*` and `unicron.*` schemas
- LLM gateway changes
- MCP layer changes that span both products

### Discovery

- Warm-network calls scheduled and completed
- Discovery call follow-ups not yet tied to a product
- Vertical hunting and validation
- Customer conversations pre-contract
- Action items the ingest pipeline files from discovery calls

### Sales

- Contract negotiations in flight (Zedcor pilot expansion, Realberry, future tenants)
- Onboarding steps for new customers before they hit Pathfinder or Metacron kanbans
- Outreach campaigns
- Demo prep that is not a Pathfinder or Metacron feature

### Operations

- Vendor and tooling decisions (Plaud, Fathom, Slack app review)
- Contracts with advisors and contractors
- R3 reciprocity conversations as cards until cap-table is decided
- Billing, finance, accounting setup
- Legal and compliance items
- Hiring decisions

### Marketing

- Manifesto, paradigm map, vision deck updates
- Positioning work
- Content (blog, social, public statements)
- Brand asset management

### Other

Catch-all for items that don't fit the above five.

## What does NOT live on the Internal Org Kanban

- Pathfinder customer-facing feature work → Pathfinder Features Kanban
- Metacron operator-facing feature work → Metacron Features Kanban
- Customer-specific data ingestion or enrichment for an active Pathfinder tenant → Pathfinder kanban
- Customer onboarding once they are a tenant in Pathfinder or Metacron → respective product kanban
- Bugs in Pathfinder or Metacron code → respective product kanban (even if discovered by an internal-org agent)

## Kanban writer routing algorithm (consumed by Sprint 1)

Given an action item from ingest, the writer assigns `kanban_workspace` using this decision sequence:

1. **Explicit override.** If the ingest payload includes `kanban_workspace_override`, use it. Logged in `audit_log`.

2. **Customer-tenant signal.** If the action item references a current Pathfinder or Metacron tenant by name AND the action requires product code change for that tenant, route to the product kanban for that surface (Pathfinder or Metacron). Tenant list maintained in `team_members` adjacent table or hardcoded in the writer's config until a `tenants` table exists.

3. **Product-code signal.** If the action item description matches any of these terms in product context, route to the product kanban: feature, bug, deploy, PR, schema change scoped to product schema, UI change. Pathfinder vs. Metacron decided by which surface is referenced.

4. **Architecture signal.** If the action item touches infrastructure shared by both products (LLM gateway, ingest pipeline, Inngest, Supabase root, vault, agent runtime), route to Internal Org with `Surface=Architecture`.

5. **Conversation source.** If the action item came from a discovery call, sales call, or vendor call and does not match the above, route to Internal Org with `Surface` matching the conversation type.

6. **Default.** Internal Org with `Surface=Other`. Surfaces to `#orchestrator-escalations` for human triage.

## Edge cases

- **Action items that span both products.** Route to Internal Org `Surface=Architecture`. Create linked cards on the product kanbans referencing the Internal Org card. The Internal Org card is the primary; product cards are children.

- **Bugs found during ingest of a customer call.** Route to the product kanban (Pathfinder or Metacron) with `Source=Call`. The originating call record stays referenced in ledger; the bug is product-owned.

- **Discovery calls about a vertical Pathfinder serves.** Route to Internal Org `Surface=Discovery`. Once the vertical is locked and a customer signs, conversion to a product kanban card happens manually by Kyle or Keenan (not automated).

- **Marketing decisions that produce product copy.** Route to Internal Org `Surface=Marketing`. If the copy ships in product, a product card is created downstream by the product team picking up the marketing handoff.

## Consequences for existing kanbans

No changes required to the Pathfinder or Metacron kanbans. Their existing column structure stays. The Internal Org Kanban schema (Notion AI prompt delivered separately) carries the same column structure for consistency, except `Zedcor Demo` is omitted (not relevant to internal-org work) and `Broken Off` is added (per parent SPEC section 5.3).

End Addendum 1.
