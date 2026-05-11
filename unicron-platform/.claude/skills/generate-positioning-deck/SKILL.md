---
name: generate-positioning-deck
description: Generate a 6–8 slide positioning deck outline for Pathfinder or Metacron targeting a specific audience
domain: marketing
type: manual
inputs:
  - name: audience
    type: string
    required: true
    description: Target audience description (e.g., "construction VPs of Sales")
  - name: product
    type: string
    required: false
    description: '"pathfinder" | "metacron". Default "pathfinder".'
outputs:
  - type: api_response
    location: '{ slides: Array<{ title, bullet_points }>, product, audience }'
refusal_gate: no
budget_usd_per_run: 0.15
---

# generate-positioning-deck

Generate a slide-by-slide positioning deck outline as a JSON array. Each slide has `title` and `bullet_points` (3 bullets). Covers opening hook → problem → solution → proof → differentiation → business case → CTA. Returns JSON only — rendering to slides is a separate step (the pptx skill on a future sprint, or Subframe export).

## Output shape

```json
{
  "slides": [
    { "title": "Slide Title", "bullet_points": ["point 1", "point 2", "point 3"] }
  ],
  "product": "Pathfinder",
  "audience": "construction VPs of Sales"
}
```

## Execution

1. Normalize `resolvedProduct`: `"Metacron"` if `product?.toLowerCase() === "metacron"`, else `"Pathfinder"`.
2. Compose prompt requesting a JSON array of 6–8 slides; "Return ONLY the JSON array, no markdown wrapper."
3. `callClaudeOrMock(prompt, JSON.stringify(mockSlides))`.
4. Strip ` ```json ` and ` ``` ` wrappers if present.
5. `JSON.parse` the cleaned response. If parsing fails OR not an array OR empty → keep the hard-coded mock slides.
6. RPC `ns_append_ledger_signal` with `source_id='skill/generate-positioning-deck'`, `insights: { product, audience }`.
7. Return `{ slides, product: resolvedProduct, audience }`.

## Mock fallback

A 7-slide mock deck is embedded for local dev / API-key-less environments. It uses the Zedcor pilot proof point and points at `unicron.systems` as the CTA.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "generate-positioning-deck", "audience": "...", "product": "pathfinder" }`.

## Refusal gate

None. The deck outline is a draft for human review.

## Side effects

- Audit ledger row.
- LLM gateway cost row when Anthropic key is set.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runGeneratePositioningDeck()`.
- Downstream consumer can pipe these slides into the `pptx` skill (Skill tool) to produce a real .pptx artifact.
