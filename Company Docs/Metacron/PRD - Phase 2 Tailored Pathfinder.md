# PRD — Phase 2: Tailored Pathfinder

Authored 2026-05-04. Owner: Cowork (Metacron chat). Execution: Claude Code in coordination with Pathfinder peer 6mz1zgdf.

## Vision

Every customer gets their own Pathfinder dashboard. Same agent engine underneath, tailored sources/scoring/UI/vocabulary on top, driven by the Architect plan they approved during onboarding.

## Why now

Pathfinder is single-tenant Zedcor today. Architect can decompose intent into a tailored plan, Customers tab persists a customer record (PR #156), but no per-customer dashboard exists. Onboarding is a dead-end UX.

Realberry/Chad demo gate: Chad needs to log into a Realberry-branded Pathfinder showing real estate acquisition leads — not Zedcor's construction security feed.

## Success criteria (Chad demo)

Chad receives magic link → lands on `pathfinder.unicron.systems/realberry` → sees within 10s:

- Realberry branding in header
- Vocabulary: "acquisition opportunities" / "deals" / "properties"
- Pipeline: Sourced → IOI → LOI → Under Contract → Closed
- Lead cards with: address, asset class, units/keys, geography, trigger signal, score, broker contact
- ≥5 verified opportunities matching Realberry profile
- Geography defaulted to Mountain West + Southeast
- Scoring weights from Realberry's underwriting criteria
- Activity feed (Phase 1F) showing operator verifications

Operator verifies a Realberry lead → ticker updates within 1s.

## Architecture: base template + modular adaptive layer

Base "what a Pathfinder is" — always present, configurable per org:

- Lead unit (schema fields, vocab)
- Pipeline stages
- Score (weights, thresholds)
- Geography filter
- Source mix
- Ranker, Verifier, Enricher, Outreach drafter, Cross-pollination, Briefer
- Activity timeline (Phase 1F)
- Dashboard layout

Modular adaptive layer = `pathfinder.organizations.architecture` JSONB:

```json
{
  "vertical": "real-estate-investment",
  "lead_unit": { "name": "acquisition opportunity", "plural": "acquisition opportunities", "schema": {...} },
  "pipeline": { "stages": ["sourced","ioi","loi","under-contract","closed"], "stage_labels": {...} },
  "scoring": { "weights": {...}, "thresholds": { "verified": 0.7, "high_priority": 0.85 } },
  "geography": { "scope": "metros", "defaults": [...] },
  "sources": [{ "id": "sec-edgar", "type": "registered" }, ...],
  "outreach": { "persona": "...", "tone": "...", "value_prop": "..." },
  "vocabulary": { "lead": "deal", "leads": "deals" },
  "branding": { "display_name": "Realberry", "accent_color": "#1a4d3a" },
  "compliance": ["SEC", "accredited-investor", "ESG"],
  "integrations": ["salesforce", "hubspot"],
  "business_summary": { "lead_type": "...", "business_area": "...", "problem_solved": "...", "what_they_get": "..." }
}
```

Missing fields fall back to BASE_ARCHITECTURE.

## Scope

In: Streams 2A (routing+auth), 2B (config layer), 2C (agent dispatch), 2D (UI rendering), 2E (completion loop).

Out: subdomain routing, plugin marketplace, multi-user-per-org RBAC, white-labeling, custom branded subdomains, customer self-service signup.

## Dependencies

Hard:
- `pathfinder.organizations` table + endpoints (peer 6mz1zgdf — operator-todo `MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md`)
- Phase 1F bridge (additive, lands activity feed)

Soft (already shipped): Source Onboarder, Coverage Expansion, Cross-pollination engine, Architect tuning agent.

## Stream sequencing

```
Phase 2A (Streams 2A+2B foundation) ── SEQUENTIAL FIRST
                                             │
                  ┌────── Phase 2C ──────┐    │
After 2A merges:  ├────── PARALLEL ──────┤◄───┘
                  └────── Phase 2D ──────┘
                                             │
After 2C+2D merge:                Phase 2E ── SEQUENTIAL LAST
                                             │
                                       CHAD DEMO GATE
```

## Acceptance gate

Phase 2 ships when: Architect prompt → approve → Realberry persisted with full architecture JSON → magic link emailed to Chad → click → lands on tailored Pathfinder → ≥5 verified leads visible within 5 min → operator-Verify-to-ticker round trip works → no Zedcor leakage in Realberry view → both Vercels green.

## Linked

- SPEC 2A: `Company Docs/Specs/SPEC - Phase 2A Multi-tenant Routing & Auth.md`
- SPEC 2B: `Company Docs/Specs/SPEC - Phase 2B Tenant Config Layer.md`
- SPEC 2C: `Company Docs/Specs/SPEC - Phase 2C Dynamic Agent Dispatch.md`
- SPEC 2D: `Company Docs/Specs/SPEC - Phase 2D Dynamic UI Rendering.md`
- SPEC 2E: `Company Docs/Specs/SPEC - Phase 2E Onboarding Completion Loop.md`
- Kickoff prompts: `Company Docs/Prompts/PROMPT - Phase 2{A,C,D,E} - Kickoff.md`
- Multi-clustomer persistence operator-todo: `MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md`

End.
