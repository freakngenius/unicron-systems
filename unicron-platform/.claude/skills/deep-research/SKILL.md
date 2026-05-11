---
name: deep-research
description: Proxy to Pathfinder's deep-research endpoint — runs a multi-source research synthesis on a topic
domain: research
type: manual
inputs:
  - name: topic
    type: string
    required: true
    description: Research topic or question
  - name: depth
    type: string
    required: false
    description: '"standard" | "deep". Default "standard".'
outputs:
  - type: api_response
    location: Pathfinder deep-research JSON payload (citations, synthesis, source list)
refusal_gate: no
budget_usd_per_run: 0.40
---

# deep-research

Atrium-side proxy that forwards a research request to Pathfinder's `/api/skills/deep-research` endpoint. Pathfinder owns the actual synthesis (Perplexity + LLM citation merge); this skill is the cross-product bridge so Atrium operators can invoke the same intelligence path that Pathfinder uses.

## Execution

1. Read `VITE_PATHFINDER_INTERNAL_URL` from env. If unset → error `"VITE_PATHFINDER_INTERNAL_URL is not configured — cannot proxy to deep-research endpoint."`.
2. POST `{pathfinder_base}/api/skills/deep-research` with body `{ topic, depth: depth ?? "standard" }`, `Content-Type: application/json`.
3. If response not OK → throw `"deep-research upstream error {status}: {body}"`.
4. Return the upstream JSON as-is, merged into the standard `{ ok: true, skill_slug, ... }` envelope.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "deep-research", "topic": "...", "depth": "deep" }`.

## Refusal gate

None at this proxy layer. Refusal enforced upstream by Pathfinder's deep-research pipeline (which itself runs through the LLM gateway with Taboo Keeper).

## Side effects

- Audit ledger row via `ns_append_ledger_signal` recording `{ topic }`.
- All cost accounting happens on the Pathfinder side via the LLM gateway.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runDeepResearch()`.
- This skill will fail in any Vercel env that doesn't have Pathfinder reachable at `VITE_PATHFINDER_INTERNAL_URL`. In local dev, point it at `http://localhost:3000` (Pathfinder dev server).
