---
name: draft-follow-up-email
description: Scaffolded — draft a follow-up email to a contact pulling context from their customer record, last call, and open commitments. Returns 202 until the drafter ships.
domain: sales
type: manual
status: scaffolded
inputs:
  - name: customer_id
    type: uuid
    required: true
    description: Target customer
  - name: tone
    type: string
    required: false
    description: '"warm" | "direct" | "executive". Default "direct".'
  - name: focus
    type: string
    required: false
    description: What the follow-up should center on. If omitted, uses the most recent open commitment from action_items.
outputs:
  - type: api_response_when_implemented
    location: '{ subject: string, body: string, references: Array<{ kind, id, excerpt }> }'
refusal_gate: no
budget_usd_per_run: 0.06
---

# draft-follow-up-email (SCAFFOLDED)

Planned: context-aware follow-up email drafter. Reads the customer's recent call transcripts, open action items, and pipeline stage; outputs a subject + body draft for the operator to review and send.

**Status**: scaffolded. Returns HTTP 202.

## Planned implementation

1. Pull customer record + last 3 ledger rows where `source_id LIKE 'customers/{id}'`.
2. Pull open action items where `assignee_customer_id = {id}` OR linked via signals.
3. Pull recent call transcripts (from the calls ingestion pipeline) if any.
4. Compose subject + body in the requested tone, referencing specific commitments.
5. Return draft + `references` array so the operator can verify citations before sending.

## Refusal gate

None at this skill layer. Drafts are for human review before send.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`.
- Output is a draft, NOT a send. Sending an email is a separate gated action (Gmail MCP `create_draft` is the expected next step so the operator can edit + send from their client).
- Pairs naturally with `transcript` skill output to close the call → commitment → follow-up loop.
