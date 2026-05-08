---
name: promote-insight-to-memory
description: Promote a ledger insight to long-term memory — creates a wiki entry from a ledger row insight
domain: memory
type: manual
inputs:
  - name: ledger_id
    type: uuid
    required: true
    description: The ID of the ledger row containing the insight to promote
  - name: insight_index
    type: number
    required: false
    description: Which insight in the insights array to promote (default 0 — first insight)
outputs:
  - type: vault_doc
    location: wiki/memory/analyst/insights/YYYY-MM-DD-<slug>.md
refusal_gate: no
budget_usd_per_run: 0.05
---

# promote-insight-to-memory

Promote a specific insight from a `nervous_system.ledger` row into long-term memory by creating a dedicated wiki entry. This transfers volatile ledger knowledge into durable vault storage.

## Execution

1. Fetch the ledger row by `ledger_id` from `nervous_system.ledger`.
2. Extract `insights[insight_index]` from the row's `insights` JSONB array (default index 0).
3. If `insights` is null or empty, abort with error: "Ledger row has no insights."
4. Generate a slug from the insight text: lowercase, first 6 words, kebab-cased.
5. Compose the wiki entry with frontmatter:
   ```yaml
   ---
   title: [Insight title or first sentence]
   source_ledger_id: [ledger_id]
   promoted_at: YYYY-MM-DD
   domain: memory
   tags: [auto-generated from insight content]
   strength: [ledger row's strength value]
   ---
   ```
6. Write the wiki file to `wiki/memory/analyst/insights/YYYY-MM-DD-<slug>.md`.
7. Update the ledger row: set `promoted_to_wiki = true`, `wiki_path = <path>`.
8. Update `nervous_system.signals` if the insight links to a signal: increment strength by 0.1.

## Notes

- Cost ceiling: $0.05/run. May use a fast LLM call to generate tags and polish the entry.
- No refusal gate — promotion is reversible (the ledger row and wiki entry can both be deleted).
- If the same ledger row is promoted twice: check `promoted_to_wiki` flag and abort with a notice.
