---
name: light-rag-query
description: Scaffolded — lightweight RAG query over a curated subset of the vault. Returns 202 until the LightRAG indexer ships.
domain: research
type: manual
status: scaffolded
inputs:
  - name: query
    type: string
    required: true
    description: Natural-language question
  - name: corpus
    type: string
    required: false
    description: '"vault" | "ledger" | "decisions" | "all". Default "vault".'
outputs:
  - type: api_response_when_implemented
    location: '{ answer: string, citations: Array<{ path, excerpt, score }> }'
refusal_gate: no
budget_usd_per_run: 0.05
---

# light-rag-query (SCAFFOLDED)

Planned: a lightweight RAG path against an indexed subset of the vault. Different from `vault-search` in that this synthesizes an answer with inline citations instead of returning ranked docs.

**Status**: scaffolded. The API endpoint returns HTTP 202 with the body:

```json
{
  "ok": true,
  "status": "scaffolded",
  "skill_slug": "light-rag-query",
  "message": "Full implementation coming in a future sprint"
}
```

## Planned implementation

1. Index the vault on a nightly cron into a vector store (pgvector on `nervous_system.signals_embeddings` + LightRAG knowledge graph nodes/edges).
2. Query path: embed `query` → top-k retrieve → graph-walk one hop → LLM synthesis with citations.
3. Output an answer with inline `[wiki/path:line]` citations and a sources array.

## Refusal gate

None planned at the skill layer; refusal flows through the LLM gateway.

## Notes

- Tracked in `SCAFFOLDED_SLUGS` set inside `unicron-platform/api/atrium/skills/run.ts`.
- Removing this skill from `SCAFFOLDED_SLUGS` requires implementing the indexer + retriever; otherwise the default 404 takes over.
- Until shipped, prefer `vault-search` (returns ranked docs without synthesis) for vault Q&A.
