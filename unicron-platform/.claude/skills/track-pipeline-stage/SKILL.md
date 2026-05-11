---
name: track-pipeline-stage
description: Update a customer's pipeline stage with optional note; appends a ledger signal recording the transition
domain: sales
type: manual
inputs:
  - name: customer_id
    type: uuid
    required: true
    description: nervous_system.customers id
  - name: new_stage
    type: string
    required: true
    description: One of lead | qualified | proposal | negotiation | closed_won | closed_lost
  - name: note
    type: string
    required: false
    description: Free-text annotation appended to the ledger summary
outputs:
  - type: api_response
    location: '{ updated: true, customer_id, stage }'
  - type: ledger_row
    location: nervous_system.ledger via ns_append_ledger_signal
refusal_gate: no
budget_usd_per_run: 0.01
---

# track-pipeline-stage

Move a customer through the sales pipeline and leave a ledger trail. Validates stage against the allowlist before writing. Always emits a ledger signal so the Analyst sees the transition in the next digest.

## Allowed stages

```
lead → qualified → proposal → negotiation → closed_won
                                          ↘ closed_lost
```

The allowlist is a Set: `{ lead, qualified, proposal, negotiation, closed_won, closed_lost }`. Invalid stages → HTTP 400 with the valid list inline.

## Execution

1. Validate `new_stage` ∈ VALID_PIPELINE_STAGES. If not → throw `"Invalid pipeline stage '{x}'. Valid stages: ..."`.
2. RPC `ns_update_customer_stage(p_id: customer_id, p_stage: new_stage)`. On error → throw.
3. RPC `ns_append_ledger_signal` with:
   - `source_type: 'manual'`
   - `source_id: 'customers/{customer_id}'`
   - `summary: "Pipeline stage updated: customer {customer_id} → {new_stage}[ · {note}]"`
   - `insights: { customer_id, new_stage, note: note ?? null }`
4. Return `{ updated: true, customer_id, stage: new_stage }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "track-pipeline-stage", "customer_id": "<uuid>", "new_stage": "proposal", "note": "Sent v1 deck" }`.
- UI: customer detail panel stage dropdown in Atrium Pathfinder or Money tabs.

## Refusal gate

None. Stage transitions are reversible; the ledger trail is the audit. Taboo Keeper does not block normal CRM transitions.

## Side effects

- Customer row's `stage` and `updated_at` change.
- One ledger row per call.
- Audit ledger row via `ns_append_ledger_signal` with `{ customer_id, new_stage }`.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runTrackPipelineStage()`.
- Pipeline retros aggregate by transition count and dwell-time per stage; keep notes tight and signal-bearing.
