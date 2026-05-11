---
name: generate-proposal
description: Scaffolded — generate a customer proposal document (scope, pricing, terms) from discovery notes and pipeline context. Returns 202 until the generator ships. Refusal gate required.
domain: sales
type: manual
status: scaffolded
inputs:
  - name: customer_id
    type: uuid
    required: true
    description: Target customer
  - name: scope_summary
    type: string
    required: true
    description: One-paragraph operator-written scope (becomes the proposal's executive summary anchor)
  - name: pricing_model
    type: string
    required: true
    description: '"pilot" | "annual" | "monthly" | "custom"'
  - name: pricing_amount_usd
    type: number
    required: true
    description: Total dollar amount for the proposal
outputs:
  - type: api_response_when_implemented
    location: '{ proposal_md: string, customer_id, pricing_model, pricing_amount_usd }'
  - type: vault_doc_when_implemented
    location: wiki/proposals/{YYYY-MM-DD}-{customer-slug}.md
refusal_gate: yes
budget_usd_per_run: 0.30
---

# generate-proposal (SCAFFOLDED)

Planned: structured proposal generator that produces a customer-ready Markdown proposal pulling scope, pricing, and customer-fit context. Refusal-gated because the output represents an external commitment.

**Status**: scaffolded. Returns HTTP 202.

## Refusal gate (planned)

Will require explicit operator approval before generation runs, with a confirmation prompt naming the customer, pricing model, and dollar amount. Taboo Keeper additionally screens for:
- pricing below the floor for the configured pricing_model,
- scope language committing to features outside the current product surface,
- contractual language ("agreement", "binding") that should live in the contract template, not the proposal draft.

## Planned implementation

1. Refusal-gate confirmation. If declined → 403.
2. Pull customer record, recent ledger context, and the vertical profile.
3. Compose proposal sections: Executive Summary → Scope → Approach → Timeline → Pricing → Terms → Next Steps.
4. Write `wiki/proposals/{YYYY-MM-DD}-{customer-slug}.md` with the full doc.
5. Update customer stage → `'proposal'` if currently earlier in the pipeline.
6. Return Markdown + path.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`. Refusal gate already declared in the skills table (`refusal_gate=true`) so the catalog UI surfaces the warning before implementation lands.
- Output is a draft for human signature; legal review is a separate gated step that is intentionally not automated.
- Pairs with `track-pipeline-stage` (stage transition will be triggered automatically by this skill once it ships).
