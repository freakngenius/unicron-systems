---
name: inbox-triage
description: Score the unresolved inbox ledger rows by recency + strength + source-type weight and return the top N
domain: productivity
type: manual
inputs:
  - name: limit
    type: number
    required: false
    description: Number of items to return. Clamped to [1, 20]. Default 5.
outputs:
  - type: api_response
    location: '{ items: Array<{ id, source_type, content_summary, strength, created_at, status, score }>, message?: string }'
refusal_gate: no
budget_usd_per_run: 0.01
---

# inbox-triage

Rank the operator's unresolved inbox of ledger rows by a composite triage score. Pulls up to 50 candidate rows from `ns_list_inbox_ledger(p_limit: 50)`, scores each, returns the top `limit` (default 5, max 20).

## Scoring

For each row:

```
recency_score   = 1 / (1 + hours_since_created)
source_weight   = SOURCE_TYPE_WEIGHT[source_type]   // call 1.0, voice_memo 0.9, slack 0.8,
                                                    // email 0.7, cowork_session 0.6,
                                                    // apple_note 0.5, manual 0.4, default 0.3
strength        = row.strength ?? 0.5

score = 0.4 * recency_score + 0.4 * strength + 0.2 * source_weight
```

Rounded to 4 decimal places. Sorted descending.

## Execution

1. RPC `ns_list_inbox_ledger(p_limit: 50)` → candidate rows.
2. If empty: return `{ items: [], message: "Inbox is empty" }`.
3. Score each row per formula above.
4. Sort by `score` desc; slice to `limit`.
5. Return `{ items }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "inbox-triage", "limit": 5 }`.
- UI: Atrium Now tab inbox panel.

## Refusal gate

None. Read-only ranking; no state mutation.

## Side effects

- Audit ledger row via `ns_append_ledger_signal`.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runInboxTriage()`.
- The composite weights (0.4 / 0.4 / 0.2) are intentionally tuned to surface fresh-AND-strong items over decayed-but-strong or fresh-but-weak ones.
