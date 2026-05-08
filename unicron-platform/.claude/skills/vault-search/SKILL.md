---
name: vault-search
description: Semantic search across the knowledge vault — returns ranked docs by relevance
domain: memory
type: manual
inputs:
  - name: query
    type: string
    required: true
    description: Search query in natural language
  - name: limit
    type: number
    required: false
    description: Maximum number of results to return (default 10)
outputs:
  - type: vault_doc
    location: ranked list with relevance scores
refusal_gate: no
budget_usd_per_run: 0.05
---

# vault-search

Semantic search across the Unicron knowledge vault. Returns ranked documents by relevance to the query.

## Execution

1. Embed the `query` using the configured embedding model.
2. Run cosine similarity against `nervous_system.signals` with `embedding` column populated.
3. Also run full-text search against wiki docs in `freakngenius/unicron-knowledge` GitHub repo.
4. Merge and deduplicate results, ranking by combined semantic + keyword score.
5. Return up to `limit` results (default 10).

## Output format

```json
[
  {
    "title": "...",
    "path": "wiki/...",
    "relevance": 0.92,
    "excerpt": "...",
    "source": "vault | ledger | signal"
  }
]
```

## Notes

- Cost ceiling: $0.05/run. Use a fast embedding model (text-embedding-3-small or equivalent).
- If embedding infrastructure is not yet provisioned, fall back to full-text search only and note degradation.
- No refusal gate — this is a read-only operation.
