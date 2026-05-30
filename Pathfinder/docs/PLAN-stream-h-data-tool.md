# PLAN: Stream H, Lead Chat Agent — data tool pass

Branch: feat/stream-h-data-tool (off origin/main adeec4e). Operator pre-approved per the dispatched prompt; no pause.

## Intent

Stream H v1 shipped a Sonar-only chat. The agent could only see one focal company or a filtered list passed in the system prompt; "across every lead" questions and aggregations were impossible. This pass turns the chat into a two-tool agent grounded in the org's full Pathfinder dataset:

1. PRIMARY tool: `query_internal_leads`, scoped server-side to organization_id of slug='internal'. Lookups, filters, aggregations across the entire dataset.
2. SECONDARY tool: `perplexity_research`, the existing Sonar wrapper, called only when external context (news, leadership, hiring) is needed. Visible "Researching with Perplexity" state, source citations.

The orchestrator is Claude (claude-sonnet-4-6) via tool_use, streamed back to the panel. The system prompt instructs the model to ground in Pathfinder data first.

Architecture changes:
- `lib/chat/sonar.ts` stays as is and remains the Sonar surface.
- The API route swaps `streamSonar(...)` for `runInternalChatAgent(...)`, the new orchestrator that loops Claude with tool_use.
- The panel renders a new `tool_start` chip ("Looking up leads" / "Researching with Perplexity") in addition to the existing streaming text.

No new migration. The existing `pathfinder.lead_chat_messages` table already has `tool_name` and `payload` columns sufficient to record tool-call rows alongside user / assistant turns.

## File scope (worktree)

New files:
- `Pathfinder/lib/chat/internal-lead-tool.ts`, the data tool. Scoped Supabase queries on `pathfinder.projects` joined with `pathfinder.deals` for pipeline_stage. Exposes `runLeadTool(input, ctx)` returning a JSON-safe payload.
- `Pathfinder/lib/chat/internal-chat-agent.ts`, the orchestrator. Anthropic SDK with tool_use streaming. Registers both tools; emits SSE events through a passed-in `emit` callback.
- `Pathfinder/__tests__/internal-chat/internal-lead-tool.test.ts`, unit tests for the data tool. Mocks supabaseAdmin with seed rows.
- `Pathfinder/__tests__/internal-chat/internal-chat-agent.test.ts`, agent loop tests. Mocks the Anthropic client + the Sonar wrapper. Asserts the event sequence for (a) data-only question, (b) Sonar question, (c) interleaved.

Modified files:
- `Pathfinder/lib/chat/lead-chat-types.ts`, extend `LeadChatSseEvent` to include `tool_start` and `tool_done` events with `name: 'pathfinder_leads' | 'perplexity_sonar'`.
- `Pathfinder/app/api/internal/chat/route.ts`, replace the streamSonar block with `runInternalChatAgent({ emit, ... })`. Persistence still goes to `pathfinder.lead_chat_messages`; tool calls write rows with role='tool'.
- `Pathfinder/components/internal/lead-chat/LeadChatPanel.tsx`, render a chip on `tool_start` and clear it on `delta`. Researching chip survives until a delta arrives, exactly like today.
- `Pathfinder/__tests__/internal-chat/lead-chat-route.test.ts`, update source-grep guardrails: now asserts `runInternalChatAgent` is invoked, the route does not call `streamSonar` directly (Sonar is reached through the agent tool), and the route still refuses non-internal slugs with 403.
- `Pathfinder/__tests__/internal-chat/lead-chat-panel.test.tsx`, extend the JSDOM smoke to render the `tool_start` chip.
- `Pathfinder/MEMORY/spec-references.md`, append entries for new lib/ files.

Out of scope (do not touch):
- `Pathfinder/lib/chat/sonar.ts`, `lib/llm/run.ts`, `app/api/chat/route.ts`, `components/chat/*`, Stream E / F / G code.

## Data tool contract

```ts
type LeadToolInput =
  | { op: 'list'; filter?: LeadFilter; order?: 'score_desc' | 'recent' | 'name'; limit?: number }
  | { op: 'get'; id: string }
  | { op: 'search'; name_contains: string; limit?: number }
  | { op: 'aggregate'; group_by: 'pipeline_stage' | 'service_category' | 'sales_motion' | 'federal_registration' | 'verified'; filter?: LeadFilter };

interface LeadFilter {
  federal_registration?: 'sam-registered' | 'federal-awardee' | 'both' | 'none';
  sales_motion?: 'active-outbound' | 'hiring-bd' | 'inbound-only' | 'unknown';
  service_category?: string;
  pipeline_stage?: InternalPipelineStage; // mapped to DealPipelineStage via internalStageMap
  min_score?: number;
  max_score?: number;
  verified?: boolean;
}
```

Output shape:
- `list`: `{ count, rows: CompanyLeadView[] }`, rows are the projected view (real values, human labels, never raw keys).
- `get`: `CompanyLeadView` plus `signals: InternalSignal[]` (the six qualitative signals).
- `search`: `{ count, rows }`, same shape as list.
- `aggregate`: `{ groups: { key, count }[] }`. For `pipeline_stage`, the keys are mapped back to the Internal stage labels.

Hard cap: `limit` defaults 20, max 100. Server-side filtering on organization_id only; the route enforces `org.slug === 'internal'` before reaching the tool.

## Orchestrator contract

`runInternalChatAgent({ org, focal, scopeLabel, threadId, userEmail, message, emit, sonarStub?, anthropicStub? })`

- Builds a system prompt that:
  - Names the org and scope.
  - Lists the data tool's ops and shape.
  - States the grounding rule (always use data tool first when the answer is in Pathfinder; only call Sonar for external news / leadership / hiring).
  - Forbids em-dashes and en-dashes.
- Calls `client.messages.stream({ model, tools, ... })`.
- For each event:
  - text delta → `emit({ type: 'delta', text })`.
  - tool_use block start → `emit({ type: 'tool_start', name })`. For Sonar, also `emit({ type: 'researching', provider: 'perplexity-sonar' })`.
- On `message_stop` with `stop_reason: 'tool_use'`:
  - For each tool_use, run the local handler (queryInternalLeads or callSonar). Sonar yields citations; the orchestrator merges them into a `sources` event after the next delta cycle.
  - Append assistant message + tool_result content to the message list. Loop the stream again.
- Hard loop guard: at most 4 tool-call rounds per turn.
- On final stop_reason `end_turn`: collect the assistant content, persist as the assistant row in `lead_chat_messages` (kind=text, model_used='claude-sonnet-4-6', sources optional, latency_ms).
- Tool rows are also persisted (role='tool', tool_name, payload, kind='tool_result').
- Errors are converted to a delta + assistant row with kind='error'.

## SSE event union additions

Add to `LeadChatSseEvent`:
- `{ type: 'tool_start'; name: 'pathfinder_leads' | 'perplexity_sonar'; summary?: string }`
- `{ type: 'tool_done'; name: string; ok: boolean }`

`researching` stays, fires only when `name === 'perplexity_sonar'`.

## Test plan

- `internal-lead-tool.test.ts`: 5 tests
  1. list with default order returns rows projected to display labels (no raw keys).
  2. aggregate(group_by='pipeline_stage') returns the seven Internal stages with counts; empty stages drop to 0 not absent.
  3. filter(federal_registration='federal-awardee') only returns matching rows.
  4. search(name_contains='Manson') returns Manson when seeded; case-insensitive.
  5. cap honoured: limit > 100 silently clamps to 100.

- `internal-chat-agent.test.ts`: 4 tests, all with stubbed Anthropic + stubbed Sonar
  1. Data-only path: model emits one tool_use for `pathfinder_leads`, gets results, emits final text. Asserts `tool_start` SSE fires before `delta`; no `researching` event.
  2. Sonar path: model emits one tool_use for `perplexity_research`, agent emits `researching` then runs Sonar stub, then folds text + sources. Asserts `sources` event includes the stubbed citations.
  3. Mixed: data tool first, then Sonar. Both `tool_start` events fire in order, both followed by deltas.
  4. Loop guard: if model loops indefinitely on tool_use, agent halts at round 4 with a fallback text and an error log; final `done` still fires.

- `lead-chat-route.test.ts`: replace the prior streamSonar guardrails with:
  1. Route imports `runInternalChatAgent` from `lib/chat/internal-chat-agent`.
  2. Route still refuses `org_slug !== 'internal'` with 403.
  3. Route still refuses 401 without basic-auth.
  4. Route does NOT touch `chat_threads` / `chat_messages`.
  5. Route persists the user turn before calling the agent.
  6. No em-dashes anywhere in the route source.

- `lead-chat-panel.test.tsx`: extend the existing smoke. Add a test that synthesizes a `tool_start` SSE event and asserts the "Looking up leads" chip renders.

Regression: existing 23 Stream H tests stay green where still relevant (context.test.ts is unchanged; panel & route tests are updated).

## Gate evidence

- pnpm typecheck PASS.
- pnpm lint PASS.
- pnpm test PASS on Stream H suites; other pre-existing jsdom 27 failures unchanged.
- pnpm build PASS.
- scripts/verify-orgs-byte-unchanged.ts PASS.
- Live verification on internal.unicron.systems:
  1. Lookup: "how many companies have confirmed federal awards?" → data tool, no Sonar.
  2. Drill-down: "why did Thalle score 55?" → data tool, qualitative signals.
  3. Sonar: "what's the most recent news on Manson Construction?" → research tool, sources.
  4. History persistence: reload, prior turns hydrate.
- Pathfinder Vercel preview green; unicron-systems Vercel green.
- Confirm prod query: `SELECT count(*), array_agg(distinct role) FROM pathfinder.lead_chat_messages WHERE thread_id = '<live-test>'` shows the live test rows including role='tool'.

## AUTO-MERGE GATE

Merge feat/stream-h-data-tool to main when:
- Build, lint, typecheck, Stream H tests green.
- Pathfinder Vercel preview green.
- verify-orgs PASS.
- Live two-tool verification recorded.
- Existing chat at `/api/chat` still returns 200 for a Zedcor-shape probe (regression check captured pre-merge).

On merge: append a note to the Stream H card with the new commit sha + ISO timestamp; do NOT move column (already Deployed).

Hard-halt: any change that would alter Zedcor / Realberry / Funder, or that touches the existing `/api/chat` route source.
