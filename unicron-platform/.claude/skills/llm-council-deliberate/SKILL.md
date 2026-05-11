---
name: llm-council-deliberate
description: Proxy to Atrium's council-deliberate endpoint — runs a multi-LLM deliberation on a question against a criteria rubric
domain: research
type: manual
inputs:
  - name: question
    type: string
    required: true
    description: The question or decision to deliberate
  - name: criteria
    type: string
    required: false
    description: Rubric or constraints the council should weigh
outputs:
  - type: api_response
    location: Council deliberation payload (per-model takes, synthesis, recommendation)
refusal_gate: no
budget_usd_per_run: 0.20
---

# llm-council-deliberate

Atrium-side proxy that forwards a deliberation request to `/api/atrium/council-deliberate`. The council endpoint fans out the question across multiple LLMs (Claude / GPT / Gemini / etc.), collects their independent takes, then runs a synthesis pass that returns a recommendation with cited reasoning from each council member.

## Execution

1. Resolve `base_url`:
   - If `VERCEL_URL` is set → `https://{VERCEL_URL}`.
   - Otherwise → `http://localhost:5173`.
2. POST `{base_url}/api/atrium/council-deliberate` with body `{ question, criteria }`, headers `Content-Type: application/json` and `x-unicron-api-key: {UNICRON_INTERNAL_API_KEY}`.
3. If response not OK → throw `"council-deliberate upstream error {status}: {body}"`.
4. Return the upstream JSON merged into the standard envelope.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "llm-council-deliberate", "question": "...", "criteria": "..." }`.
- Use cases: bet-the-company calls, taboo-edge questions, multi-stakeholder tradeoffs.

## Refusal gate

None at this proxy layer. Refusal enforced inside the council endpoint via Taboo Keeper before fan-out.

## Side effects

- Audit ledger row via `ns_append_ledger_signal`.
- The council endpoint writes per-model take rows to its own audit trail.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runLlmCouncilDeliberate()`.
- The proxy uses the internal API key for auth so the council endpoint can validate origin even when the call comes from another internal handler.
