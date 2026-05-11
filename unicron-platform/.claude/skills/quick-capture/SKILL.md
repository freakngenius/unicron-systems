---
name: quick-capture
description: UI-only trigger that opens the QuickCapture modal client-side; the API endpoint deliberately rejects calls
domain: productivity
type: manual
inputs: []
outputs:
  - type: ui_action
    location: client-side modal open
refusal_gate: no
budget_usd_per_run: 0.00
---

# quick-capture

UI trigger skill. Invoking `quick-capture` from the Atrium Now surface opens the QuickCapture modal, which lets the operator paste a thought, link, or snippet directly into the ledger via the standard ingest path.

This skill has NO server-side execution. The API endpoint `/api/atrium/skills/run` deliberately returns HTTP 400 with the body:

```json
{
  "ok": false,
  "error": "quick-capture is a UI trigger skill — it opens the QuickCapture modal client-side and does not call this endpoint."
}
```

## Execution

Client-side only:

1. Operator clicks the QuickCapture trigger in the Atrium UI (or runs the `quick-capture` skill from the skills runner).
2. The skill runner detects `slug === 'quick-capture'`, opens the modal instead of POSTing.
3. Operator drafts and submits. The modal posts to the normal ingest path (`ns_append_ledger_signal` via the standard write RPC), not to `/api/atrium/skills/run`.

## Trigger

- UI button in Atrium Now header.
- Keyboard shortcut (TBD).

## Refusal gate

None at the skill level. Refusal is enforced downstream by Taboo Keeper on the ingest RPC when the submitted content matches a refusal pattern.

## Side effects

None until the user submits the modal. Submission writes one ledger row via the standard ingest path.

## Notes

- Implementation surface: client-side modal in `src/components/now/QuickCapture.tsx` (or equivalent). Skill row exists in the DB so it appears in the skills catalog UI; it is intentionally inert at the API.
- Do NOT add a server-side handler for this slug. The 400 response is contract.
