# Architect service

Owner: Stream D. Spec: `SPEC - Architect Agent.md`. Phase: 2.

The Architect is a Claude Agent runtime that produces three classes of proposal:

- **Decomposition** (Gate D1): turn a buyer-pain prompt into a `vertical_configuration` proposal. Surfaces in the Architect Inbox.
- **Tuning** (Gate D2): weekly Inngest job that scans feedback patterns and proposes prompt revisions to production agents.
- **Discovery** (Gate D3): triggered by AdjacencyMapper signals or operator action. Proposes new data sources to onboard.

All three persist to `pathfinder.architect_sessions` and `pathfinder.architect_proposals` (migration `0070_architect_sessions.sql`).

---

## Why a hand-rolled Anthropic tool-use loop, not `@anthropic-ai/claude-agent-sdk`?

The Stream D README directs us to use the Claude Agent SDK over the bare Messages API to get tool-use loops, system prompts, and persisted session state. The literal `@anthropic-ai/claude-agent-sdk` package, however, spawns Claude Code as a subprocess (`pathToClaudeCodeExecutable`) — that does not deploy to Vercel serverless functions. We get the same semantic surface (multi-turn tool use, system prompt, session-scoped state) by calling Anthropic's Messages API with `tools[]` directly inside `services/architect/runtime/agent-loop.ts`.

This is documented as justified drift in `MEMORY/decisions.md` (2026-05-01 — Architect runtime: Messages API tool-use loop, not Claude Agent SDK subprocess).

---

## Layout

```
services/architect/
├── runtime/
│   ├── agent-loop.ts        # Anthropic tool-use loop. Cost cap, timeout, finalize.
│   └── session-store.ts     # Persistence: architect_sessions + architect_proposals.
├── prompts/
│   └── decomposition.ts     # Verbatim system prompt from SPEC §3.
├── tools/
│   ├── source-catalog.ts    # Static SOURCE_CATALOG (15 sources) + AGENT_TEMPLATES.
│   └── decomposition.ts     # 8 ToolDefs: search/propose/estimate/validate/finalize.
├── sessions/
│   └── decomposition.ts     # Orchestrator. Wraps loop with persistence + validation.
├── eval/
│   ├── decomposition.jsonl  # 30 hand-graded cases.
│   ├── score.ts             # Pure scoring rubric (no LLM).
│   └── runner.ts            # Eval runner: real LLM calls, writes last-run.json.
└── types.ts                 # Public types — DecompositionInput/Response, etc.
```

API route: `app/api/architect/decompose/route.ts`.

---

## API contract — Stream C consumes this

### `POST /api/architect/decompose`

**Auth.** Bearer token via `ARCHITECT_API_TOKEN` env var. The middleware exempts `/api/architect/*` from basic-auth so Stream C's operator UI can call this from a different origin.

```http
POST /api/architect/decompose
Authorization: Bearer <ARCHITECT_API_TOKEN>
Content-Type: application/json

{
  "buyer_pain_prompt": "I want to find construction sites that need security",
  "vertical_id": "pathfinder-default",      // optional; default 'pathfinder-default'
  "customer_org_id": null,                  // optional
  "existing_vertical_id": null,             // optional; when extending an existing config
  "constraints": ["must use HubSpot delivery"],  // optional
  "trigger": "manual"                       // optional; default 'manual'
}
```

**Success (200)**:
```jsonc
{
  "proposal_id": "<uuid>",          // architect_proposals.id; pass to Inbox detail view
  "session_id": "<uuid>",           // architect_sessions.id; reasoning_log lives here
  "architecture": {
    "buyer": "...",
    "buying_signal": "...",
    "data_sources_proposed": [
      { "type": "harris-county-permits", "jurisdictions": ["TX-Harris"], "expected_daily_volume": 80 }
    ],
    "data_sources_rejected": [
      { "type": "sec-edgar", "reason": "not relevant to construction-site security" }
    ],
    "layer_2_watchers": [
      { "source_type": "harris-county-permits", "instruction": "..." }
    ],
    "layer_3_agents": [
      { "role": "qualifier", "instruction": "..." }
    ],
    "layer_4_agents": [
      { "role": "ranker", "instruction": "..." }
    ],
    "estimates": {
      "daily_qualified_volume": 12,
      "cost_per_lead_usd": 0.04,
      "architecture_confidence": "high"        // 'low' | 'medium' | 'high'
    },
    "open_questions": []
  },
  "reasoning": ["assistant-turn-1 first-line", "assistant-turn-2 first-line", "..."],
  "cost_usd": 0.43,                 // wall-clock $; respects per-session cap of $1.50
  "duration_ms": 14200,
  "status": "completed"             // 'completed' | 'failed' | 'timed_out'
}
```

**Errors:**
- `400` — invalid body (missing/short `buyer_pain_prompt`, exceeds 4000 chars).
- `401` — bearer token missing or wrong.
- `503` — `ARCHITECT_API_TOKEN` env var not set in production.
- `500` — agent loop failed terminally (model timed out, ANTHROPIC_API_KEY unset, validation cycle exhausted, etc.).

**URLs:**
- Local dev: `http://localhost:3000/api/architect/decompose` (or whatever port Pathfinder Next dev uses)
- Production: `https://www.unicron.systems/pathfinder/api/architect/decompose`

The `/pathfinder/` prefix exists because Pathfinder uses `basePath: '/pathfinder'` in `next.config.js` and is served via a server-side rewrite from the parent unicron-systems Next.js project.

### Reading the Architect Inbox

Stream C's Architect Inbox UI reads `pathfinder.architect_proposals` directly via Supabase:

```sql
select id, type, headline, body, details, confidence, source_input_summary, created_at
from pathfinder.architect_proposals
where status = 'pending'
  and vertical_id = 'pathfinder-default'    -- or omit for cross-vertical view
order by created_at desc;
```

Filter pills (`All`, `Sources`, `Agents`, `Tuning`) map to:
- `All`: no `type` filter.
- `Sources`: `type = 'source_discovery'`.
- `Agents`: `type in ('agent_proposal','vertical_configuration')`.
- `Tuning`: `type = 'tuning_suggestion'`.

---

## Cost discipline

Per spec §8:

| Session | Cap per run | Model |
|---|---|---|
| Decomposition | $1.50 | claude-sonnet-4-6 (configurable via `PF_ARCHITECT_DECOMPOSITION_MODEL`) |
| Tuning | $3.00 | claude-sonnet-4-6 |
| Discovery | $2.00 | claude-sonnet-4-6 |

The agent loop caps cost in two places:

1. **Per-turn**: each Anthropic call's USD cost is computed from `lib/llm/pricing.ts` and added to a running total.
2. **Pre-turn check**: before issuing the next call, the loop returns `failed` with `cost cap` reason if the running total exceeds the cap.

Per-call rows are written to `pathfinder.llm_calls` with `surface='architect'` and `agent_name='architect-<session_type>'`, so the existing cost-summary endpoint and daily cost-alert cron see Architect spend without changes.

---

## Eval set

`eval/decomposition.jsonl` has 30 cases, each shaped:

```json
{
  "id": "d-001",
  "buyer_pain_prompt": "...",
  "expected": {
    "acceptable_source_types": [["harris-county-permits"]],
    "required_layer3_roles": ["qualifier","enricher","geo-mapper"],
    "required_layer4_roles": ["ranker","outreach-drafter"],
    "min_confidence": "medium",
    "forbidden_source_types": ["pacer-bankruptcy","sec-edgar"]
  }
}
```

Run a slice:

```sh
pnpm tsx services/architect/eval/runner.ts --slice 5
```

Or specific ids:

```sh
pnpm tsx services/architect/eval/runner.ts --ids d-001,d-007,d-011
```

Pass criteria per spec §3:
- 80%+ on right data sources (`avg_sources >= 0.8`)
- 90%+ on right agent set (`avg_agents >= 0.9`)
- No hallucinated source types (`hallucination_rate == 0`)

The runner exits 1 if any threshold is missed.

**Cost note.** A full 30-case run costs ~$15-30 in real Anthropic charges (within stream cap of $25 if alone, but coordinate with other Architect spend). Use `--slice 5` for sub-$5 smoke runs.

---

## Tools surface (decomposition)

| Tool | Purpose |
|---|---|
| `searchSourceTypes(industry)` | Look up SOURCE_CATALOG entries by industry/pain tag. |
| `searchAgentTemplates(role)` | Look up AGENT_TEMPLATES by role/capability. |
| `proposeAgent(role, layer, instruction, inputs, outputs)` | Normalize a proposed agent. |
| `proposeSource(type, jurisdictions, endpoint?)` | Normalize a proposed source; flag known-vs-custom. |
| `estimateVolume(sourceTypes, geos)` | Daily events + qualified rate from catalog. |
| `estimateCost(agentCount, llmCallsPerLead)` | Cost-per-lead with mixed Haiku/Sonnet model. |
| `validateArchitecture(config)` | Structural rules: known sources, watchers, synthesis role, instruction min-length, estimate bounds. |
| `finalizeProposal(...)` | Submit final proposal. Calling this terminates the session. |

Catalog: 15 source types (federal contracting, county/municipal permits, FEMA, SEC EDGAR, court filings, business licenses, news, public adjuster lists, mold remediation permits) plus 11 agent templates spanning Layers 2/3/4 and the center delivery dispatcher.

---

## Open work

- Gate D1: ✓ runtime, decomposition session, API endpoint, eval scaffold, 30 cases, mocked tests.
- Gate D2: pending — tuning session, weekly Inngest cron, 20 cases.
- Gate D3: pending — discovery session, AdjacencyMapper trigger, 20 cases.
