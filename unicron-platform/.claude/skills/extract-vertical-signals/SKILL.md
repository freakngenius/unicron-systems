---
name: extract-vertical-signals
description: Scaffolded — extract structured signals from a freeform discovery note or call transcript, scored against a vertical profile. Returns 202 until the extractor ships.
domain: sales
type: manual
status: scaffolded
inputs:
  - name: source_text
    type: string
    required: true
    description: Raw discovery notes or transcript content
  - name: vertical_slug
    type: string
    required: false
    description: Vertical profile to score against. Default "construction-surveillance".
outputs:
  - type: api_response_when_implemented
    location: '{ signals: Array<{ kind, text, confidence, vertical_match_score }>, summary }'
refusal_gate: no
budget_usd_per_run: 0.10
---

# extract-vertical-signals (SCAFFOLDED)

Planned: structured extractor that turns freeform discovery notes into typed signals (pain point, budget signal, urgency signal, decision-maker signal, technical constraint) scored against a vertical profile.

**Status**: scaffolded. Returns HTTP 202.

## Planned implementation

1. Load the vertical profile (`nervous_system.verticals` row by slug) — includes the canonical pain-point taxonomy and scoring rubric.
2. LLM-extract signals from `source_text` into typed records.
3. Score each signal against the vertical's rubric.
4. Persist signals to `nervous_system.signals` linked to the originating ledger row (if a `source_id` is provided via `params`).
5. Return the structured list + a one-paragraph summary.

## Refusal gate

None. Extraction is read-only synthesis.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`.
- The `nervous_system.verticals` profiles need seeding before this is useful. Zedcor-derived "construction-surveillance" is the seed candidate.
- Designed to be called automatically by the `transcript` skill on call ingestion.
