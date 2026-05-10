# PRD — Phase 3: Voice-Agent Swarm

Authored 2026-05-04. Owner: Cowork (Metacron chat). Execution: Cross-product (Pathfinder + Metacron) + external legal review.

## Vision

Automate Tier 2. Source Onboarder builds digital adapters today; phone-only sources go to a human queue forever. Voice-agent swarm handles them — AI that calls county clerks, state licensing boards, brokers, trade associations on a structured brief, extracts the data, drops it into the same ingestion pipeline as digital sources.

## Why now

Phase 2 ships multi-tenant Pathfinder. The remaining bottleneck is data coverage — every customer's pipeline is gated on whether sources have public APIs. The long tail of phone-only sources (small county portals, local government, single-operator data) is large and untouched. Voice agents close that gap and convert it into compounding moat.

## Success criteria

A Zedcor-side proof: voice-agent calls a small Texas county clerk that has no usable online portal, asks for recent commercial property recordings matching a date range, extracts the data, structures it into `pathfinder.leads` with `customer_org_id=zedcor`. Operator reviews the call transcript and confirms accuracy. Repeat for 5 calls with ≥80% extraction accuracy. Zero compliance incidents.

Then expand: Realberry uses the same voice-agent swarm to call the same county clerk for deed transfers (different question, same source, parsed for Realberry's lead schema). One call, two customers benefiting.

## What this unlocks

Every county clerk, state agency, trade association, small operator with a phone but no API. Estimated TAM expansion: 5-10x the addressable data sources for any vertical. The killer demo: customer adds a phone-only source through Architect chat → within hours the voice-agent dials, gets data, leads flow. Zero engineering work per source.

## Architecture

New `SourceRef.type` enum value: `voice-agent`. Architecture JSON:

```json
{
  "sources": [
    { "id": "harris-county-clerk-deeds", "type": "voice-agent" }
  ]
}
```

When Architect or Source Onboarder classifies a source as `voice-agent`, the dispatch resolver routes to the voice-agent service instead of a digital adapter or human queue. Service generates a structured call brief, dials via Vapi/Retell, runs LLM-driven dialogue, extracts structured data, returns it through the same ingestion pipeline (ranker → verifier → enricher) as any other source. Customer sees just another lead.

## Scope

### In scope (Phase 3)

- Phase 3-PRE: Legal deep-research + vendor benchmarking (gates everything; no code)
- Phase 3A: Voice-Agent Source Type extension (Architect + Source Onboarder integration)
- Phase 3B: Voice Agent Service MVP (single source, Harris County clerk for Zedcor)
- Phase 3C: Operator Review Workflow (Metacron UI for transcript review + escalation queue)
- Phase 3D: Compliance & Audit Layer (disclosure scripts, transcript storage, two-party consent flags, jurisdiction routing)

### Deferred (Phase 4)

- Phase 3E: Cross-customer call reuse (one call, multiple customer outputs)
- Phase 3F: Voice-agent script auto-tuning (institutional knowledge that compounds)
- Custom voice cloning per customer (consistency across calls)
- Multi-leg conversations (transfer to specialist, callback)
- Outbound voicemail strategies

## Dependencies

Hard:
- Phase 2 multi-tenant Pathfinder fully shipped (per-org architecture, source registry, ingestion routing)
- Legal review complete and documented (Phase 3-PRE)
- Vendor selected (Phase 3-PRE benchmarking)

Soft:
- Source Onboarder framework already in place (Phase 1 Tier 2 queue infrastructure)
- Operator review queue UI primitives exist in Metacron (extending, not building from scratch)

## Sequencing

```
Phase 3-PRE (Legal + Vendor) ── GATING, runs in parallel with Phase 2
                                      ↓
Phase 3A (Source Type Extension) ── after Phase 2 + 3-PRE complete
                                      ↓
        ┌──── Phase 3B (Voice Service MVP) ────┐
        ├──── PARALLEL ───────────────────────┤
        └──── Phase 3C (Operator Review UI)──┘
                                      ↓
Phase 3D (Compliance & Audit Layer) ── partial through 3B/3C, completes here
                                      ↓
                              MVP DEMO GATE
                                      ↓
        Phase 3E (Cross-customer reuse) — Phase 4
        Phase 3F (Auto-tuning) — Phase 4
```

## Acceptance gate (MVP)

Phase 3 MVP ships when:

- Legal review documented and counsel-approved
- Vendor selected with benchmarked latency, IVR success rate, transcription accuracy
- Architect can list a source as `voice-agent` and the system dispatches correctly
- Voice-agent service makes 5 successful calls to a target source with ≥80% extraction accuracy
- Operator review UI shows transcripts, allows edge-case escalation, surfaces failure modes
- Disclosure script + jurisdiction-aware routing in place
- Zero compliance incidents during pilot
- Both Vercels green

## Non-goals (explicit)

- Not impersonating a specific human (always discloses as AI)
- Not making telemarketing/sales calls (informational only)
- Not bypassing source TOS that prohibits AI calls (compliance audits source by source)
- Not handling consumer data calls (B2B research only in MVP)
- Not running calls in jurisdictions without legal review

## Linked

- SPEC 3-PRE: `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3-PRE Legal Research & Vendor Eval.md`
- SPEC 3A: `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3A Voice-Agent Source Type Extension.md`
- SPEC 3B: `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3B Voice Agent Service MVP.md`
- SPEC 3C: `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3C Operator Review Workflow.md`
- SPEC 3D: `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3D Compliance & Audit Layer.md`
- Kickoff prompts: `Company Docs/Phase 3 - Voice Agent Swarm/PROMPT - Phase 3-PRE - Kickoff.md`, `Company Docs/Phase 3 - Voice Agent Swarm/PROMPT - Phase 3A - Kickoff.md`, `Company Docs/Phase 3 - Voice Agent Swarm/PROMPT - Phase 3B - Kickoff.md`

End.
