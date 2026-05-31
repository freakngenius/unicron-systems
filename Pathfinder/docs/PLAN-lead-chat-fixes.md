# PLAN: Lead chat agent fixes (Internal)

Branch: `lead-chat-fixes`
Worktree: `/private/tmp/lead-chat-fixes`
Base: `origin/main` @ `23b8f1f` (Stream H v2 merged).

## Diagnosis

Reading the post-Stream-H-v2 code:

1. **Context** — `lib/chat/internal-chat-agent.ts` registers `pathfinder_leads` and `perplexity_research` tools and a system prompt that tells the model to "try this first when the question is about leads in the dataset". The prompt does NOT forbid the "I don't have enough context" reply, does NOT explicitly resolve vague references ("which one", "the top ones") to the dataset, and does NOT tell the model what to do for "which one to focus on" requests. The fix is in the system prompt.

2. **WYSIWYG** — `components/internal/lead-chat/LeadChatPanel.tsx` line 542 renders `message.content` directly inside a `whiteSpace: 'pre-wrap'` div, so `**` and `-` show raw. Meanwhile `components/chat/ChatMessage.tsx:111` uses `MarkdownRenderer` for the Zedcor / Pathfinder chat. The fix is to mirror that import in the LeadChatPanel bubble.

3. **Lead cards** — when `pathfinder_leads` returns `list` / `search` / `get` results, those rows are dropped onto the model as `tool_result` JSON and re-narrated as a markdown list. No structured signal flows to the UI, so the panel cannot render real cards. The fix is to (a) track lead views returned by tool calls in the agent loop, (b) emit a new SSE event `referenced_leads` with those views, (c) render them as `CompanyLeadCard`s in the panel bubble.

## Scope

Touched paths:
- `Pathfinder/lib/chat/internal-chat-agent.ts` (system prompt rewrite; track referenced leads; emit `referenced_leads` before `done`)
- `Pathfinder/lib/chat/lead-chat-types.ts` (new SSE event variant; new `referenced_leads` field on `LeadChatMessageRow.payload`)
- `Pathfinder/lib/chat/internal-lead-tool.ts` (helper to extract the `CompanyLeadView[]` rows from a `LeadToolResult`)
- `Pathfinder/app/api/internal/chat/route.ts` (route the new SSE event from the agent through; persist referenced leads in payload)
- `Pathfinder/components/internal/lead-chat/LeadChatPanel.tsx` (Bubble: MarkdownRenderer for assistant prose; render `CompanyLeadCard` list under prose when `referencedLeads` is set; accept `schema` prop)
- `Pathfinder/components/internal/lead-chat/LeadChatLauncher.tsx` (accept and thread the `schema` prop)
- `Pathfinder/app/[slug]/InternalDashboard.tsx` (pass `schema` to `LeadChatLauncher`)
- `Pathfinder/app/[slug]/leads/[projectId]/page.tsx` (pass `schema` to `LeadChatLauncher`)
- `Pathfinder/__tests__/internal-chat/lead-chat-panel.test.tsx` (test assertions for MarkdownRenderer-rendered content and the referenced-leads card list)
- `Pathfinder/__tests__/internal-chat/internal-chat-agent.test.ts` if present (assert the new system prompt language and the `referenced_leads` emission)
- `MEMORY/spec-references.md` (Lead chat fixes section)
- `Pathfinder/docs/PLAN-lead-chat-fixes.md` (this file)

Not touched: the existing Pathfinder chat at `app/api/chat/route.ts`, `components/chat/IntelligenceChat.tsx`, `components/chat/ChatMessage.tsx`, the markdown renderer subtree, any non-Internal org component, `package.json`, any Supabase migration.

## The agent system prompt change

Tighten the existing prompt with these additional rules at the top of the Rules block:

> - ALWAYS-AVAILABLE DATASET. You always have access to the Internal lead dataset via pathfinder_leads. Never reply that you lack context about "which list" or ask the user which list. The full Internal lead set is the implicit subject of every question.
> - Resolve vague references. When the user says "which one", "these", "them", "this list", or "the top ones", treat the in-view list as the subject (the scope_label tells you what is in view). If no narrower view applies, the subject is the full Internal set.
> - "Which one to focus on" and similar. Call pathfinder_leads op=list order=score_desc limit=5 (or limit=10 for broader recommendations), read the rows, and recommend three to five specific companies by name with a one-line why each. Offer one or two follow-ups (refine by category, federal registration, stage). Do not ask "which list" as a default.
> - Clarifying questions are a last resort. Only ask a clarifying question when a request is genuinely unresolvable from the data, and never with the phrase "I don't have enough context".

## The lead-view emission

`runInternalChatAgent` accumulates rows when the `pathfinder_leads` tool returns `list` / `search` / `get`. After the tool loop ends, the agent emits `{ type: 'referenced_leads', items: CompanyLeadView[] }` deduplicated by `view.id`. The route persists the list on the assistant row's `payload.referenced_leads` so the panel rehydrates the cards on reload.

## The panel render

`Bubble` becomes:

1. Eyebrow ("Agent" / "You").
2. Prose box: `MarkdownRenderer` (assistant) or raw `pre-wrap` (user, exact mirror of `ChatMessage.tsx`).
3. Referenced-leads card list (assistant only): a column of `CompanyLeadCard mode="link" schema={schema}` items under the prose, capped at 8 for any one message; each `Link` opens `/[slug]/leads/[id]` via `buildOrgPath`.
4. Sources footer (existing path; unchanged).
5. Copy pill (existing path; unchanged).

The schema is supplied by the launcher's caller (the two server routes that already have `architecture.lead_unit.schema` in scope).

## Test plan

- `pnpm lint && pnpm typecheck` clean.
- `npx vitest run __tests__/internal-chat __tests__/api/chat __tests__/catalog/modules/pipeline-kanban.test.tsx` green. The existing Zedcor chat tests must still pass (no regression in `app/api/chat`).
- `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` passes against prod.

## Live verify

Per the SPEC, on `internal.unicron.systems`:
1. Ask "which one to focus on" — expect the agent to recommend three to five specific top leads by name without asking for clarification.
2. Ask "pull top scored in dataset" — expect inline `CompanyLeadCard`s under the prose, each clicking through to the lead detail.
3. Confirm assistant prose renders with bold, bullets, and links formatted, no raw `**` or `-` syntax.

## Gate and rollback

GATE: build, lint, type-check, tests green; CI matches; Pathfinder Vercel green; verify-orgs passes. Then merge and move the kanban card to Deployed. ROLLBACK: `git revert` on the merge commit. No DB or env change.
