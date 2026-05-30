# PLAN: Stream H, Lead Chat Agent (Internal)

Branch: feat/stream-h-lead-chat (off origin/main aa9794a). Operator pre-approved per the Stream H light-launch prompt; no pause for confirmation.

## Intent

Ship an Internal-only pop-up chat that lets a salesperson talk to the Internal companies dataset: ask data questions about scores, the six signals, enriched fields, and rationale; draft outreach; and run live Perplexity Sonar research. Mirror the existing Pathfinder chat at components/chat/; never modify it. New persistence table pathfinder.lead_chat_messages. Additive, Internal-scoped. Self-merge on AUTO-MERGE GATE pass.

## File scope (worktree)

New files (the build):
- Pathfinder/supabase/migrations/20260530_lead_chat_messages.sql, new history table + indexes + RLS.
- Pathfinder/lib/chat/lead-chat-types.ts, types for LeadChatScope, LeadChatMessageRow, LeadChatSse.
- Pathfinder/lib/chat/lead-chat-context.ts, helpers to build the system prompt from a real Internal lead row (reuses lib/agents/internal/companyLeadView.ts).
- Pathfinder/lib/chat/lead-chat-persist.ts, thin Supabase wrappers around pathfinder.lead_chat_messages (append, list-by-scope, list-by-thread).
- Pathfinder/app/api/internal/chat/route.ts, Internal-scoped POST (streaming) + GET (history). Reuses lib/chat/sonar.ts streamSonar and lib/chat/lead-chat-context for the system prompt. Persists to lead_chat_messages.
- Pathfinder/components/internal/lead-chat/LeadChatLauncher.tsx, floating bottom-right launcher.
- Pathfinder/components/internal/lead-chat/LeadChatPanel.tsx, slide-in panel mirroring IntelligenceChat behavior (420px, slide, Escape close, copy on assistant messages, streaming, ChatContextIndicator).
- Pathfinder/components/internal/lead-chat/index.ts, exports.
- Pathfinder/__tests__/internal-chat/lead-chat-route.test.ts, API tests (data Q/A, Sonar tool path mocked, history round-trip).
- Pathfinder/__tests__/internal-chat/lead-chat-panel.test.tsx, UI smoke (panel opens scoped, posts message, renders streamed content, copy button writes to clipboard).
- Pathfinder/docs/PLAN-stream-h.md, this file.

Modified files (mount points, Internal-only):
- Pathfinder/app/[slug]/InternalDashboard.tsx, mount LeadChatLauncher at the bottom of the page (no behavior change for any other org because this component is only routed to for Internal-shaped orgs by app/[slug]/page.tsx's shouldUseInternalDashboard gate).
- Pathfinder/components/lead/CompanyDetailContents.tsx, mount LeadChatLauncher scoped to the open company. CompanyDetailContents is the Internal-only contents component for /[slug]/leads/[projectId]; FunderDetailContents stays untouched.
- Pathfinder/MEMORY/spec-references.md, append entries for changed lib/ files (lib/chat/lead-chat-types.ts, lib/chat/lead-chat-context.ts, lib/chat/lead-chat-persist.ts).

Out of scope (DO NOT TOUCH):
- Pathfinder/app/api/chat/route.ts, the existing Zedcor chat. Must keep working.
- Pathfinder/components/chat/IntelligenceChat.tsx and its siblings. Reused as a primitive (ChatInput, ChatMessage, ChatContextIndicator) but not modified.
- Pathfinder/lib/chat/sonar.ts, reused as-is.
- Pathfinder/lib/llm/run.ts, reused as-is.
- Funder, Realberry, Zedcor pages, components, and architectures.

## Data model

Migration 20260530_lead_chat_messages.sql:

```sql
create table if not exists pathfinder.lead_chat_messages (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references pathfinder.organizations(id) on delete cascade,
  company_id      uuid null references pathfinder.projects(id) on delete cascade,
  thread_id       text not null,
  user_email      text not null,
  role            text not null check (role in ('user','assistant','system','tool')),
  kind            text not null default 'text',
  content         text not null,
  payload         jsonb not null default '{}'::jsonb,
  sources         jsonb null,
  tool_name       text null,
  model_used      text null,
  latency_ms      integer null,
  created_at      timestamptz not null default now(),
  cleared_at      timestamptz null
);

create index if not exists lead_chat_messages_org_company_idx
  on pathfinder.lead_chat_messages (org_id, company_id, created_at desc);
create index if not exists lead_chat_messages_thread_idx
  on pathfinder.lead_chat_messages (thread_id, created_at);
create index if not exists lead_chat_messages_user_idx
  on pathfinder.lead_chat_messages (user_email, created_at desc);

alter table pathfinder.lead_chat_messages enable row level security;
create policy lead_chat_service_all on pathfinder.lead_chat_messages
  to service_role using (true) with check (true);
```

Scope keying: (org_id, company_id, thread_id). company_id null means "list scope" (filtered companies); company_id set means "detail scope". thread_id is a stable client-generated string per (scope, user) so reloads continue a thread. user_email gates per-user retrieval.

## API route

POST /api/internal/chat
- Body: { org_slug: string, company_id?: string|null, filtered_company_ids?: string[], thread_id: string, message: string, scope_label: string }
- Auth: basic-auth userEmail (same as existing chat).
- 1. Load org row by slug, fail 404 if missing or org.slug !== 'internal'.
- 2. Load focal company by company_id if provided; load filtered_company_ids (cap 50) for list scope. Project rows through projectToCompanyLeadView from lib/agents/internal/companyLeadView.
- 3. Persist user message: insert into lead_chat_messages (org_id, company_id, thread_id, user_email, role='user', content=message).
- 4. Build Sonar system prompt: agent voice, no em-dashes, ground in real Internal data (focal company fields, six-signal labels + qualitative evidence, filtered list summary).
- 5. streamSonar({ systemPrompt, query: message, recencyDays: 30 }) emits delta + citations.
- 6. SSE event stream:
  - { type: 'meta', threadId, scope } once.
  - { type: 'researching' } when the Sonar stream opens, so the panel can show "Researching with Perplexity".
  - { type: 'delta', text } for each Sonar delta.
  - { type: 'sources', items } when citations arrive.
  - { type: 'done', latencyMs } final.
  - { type: 'error', message } on failure.
- 7. Persist assistant message with full text + sources.

GET /api/internal/chat?org_slug=internal&company_id=...&thread_id=...
- Returns { thread_id, messages: [...] } from lead_chat_messages, ordered created_at asc, cleared_at is null, cap 100.
- Optional ?list_threads=1 returns recent thread_ids in scope.

## UI

LeadChatLauncher:
- Floating button, position fixed, right: 24, bottom: 24, z-index 70.
- Click toggles open. Minimize collapses to the launcher pip while preserving in-memory messages.
- Renders <LeadChatPanel> when open.

LeadChatPanel:
- Mirrors IntelligenceChat sizing and slide motion. 420px wide, full height, slide via translateX.
- Props: { orgSlug, orgId, companyId?, companyName?, filteredCompanyIds?, scopeLabel } + onClose, onMinimize.
- Hydrates GET /api/internal/chat on mount.
- Sends POST /api/internal/chat with thread_id (stable per scope, stored in localStorage as pf-internal-thread-<orgSlug>-<companyId or 'list'>).
- Renders ChatContextIndicator with scope_label.
- Streams via the same SSE protocol the existing chat uses (delta accumulation, sources). When 'researching' arrives, sets a "Researching with Perplexity..." chip on the assistant placeholder.
- Each assistant message has a "Copy" button (writes content to clipboard).
- Prior-threads chip row above ChatInput (optional, when ?list_threads=1 returns >1 thread).

## Mount points (Internal-only)

- app/[slug]/InternalDashboard.tsx: append <LeadChatLauncher orgSlug={org.slug} orgId={org.id} scopeLabel={"All " + org.name + " companies"} /> at the end of the dashboard.
- components/lead/CompanyDetailContents.tsx: append <LeadChatLauncher orgSlug={orgSlug} orgId={orgId} companyId={view.id} companyName={view.company_name} scopeLabel={view.company_name} />. This component already receives org context; minimal additions.

No mount on FunderDetailContents or any Zedcor surface. No edits to FunderDetailContents at all.

## Tests

__tests__/internal-chat/lead-chat-route.test.ts:
1. POST with focal company returns SSE stream that includes the company name and at least one numeric score from the projected view (real data, not invented).
2. POST stubs Sonar via setSonarForTesting to emit a known answer + citations; SSE emits 'researching' before any delta and 'sources' with the stubbed citations.
3. POST persists one user + one assistant row to lead_chat_messages with org_id, company_id, thread_id matching the request; GET with same thread_id returns the pair ordered by created_at.
4. Unauthorized (no basic-auth) returns 401.

__tests__/internal-chat/lead-chat-panel.test.tsx:
1. Renders launcher; click opens the panel; pressing Escape closes it; minimize collapses to the launcher pip.
2. Type and submit a message: posts to /pathfinder/api/internal/chat, renders the streamed assistant text, shows the Researching chip then sources.
3. Copy button on an assistant message calls navigator.clipboard.writeText with the message content.

Regression coverage:
- Existing app/api/chat tests stay green (route untouched).
- Existing components/chat tests stay green (untouched primitives).

## Gate evidence checklist

- pnpm typecheck output captured verbatim.
- pnpm lint output captured verbatim.
- pnpm test output captured verbatim (new + regression).
- pnpm build output captured verbatim.
- scripts/verify-orgs-byte-unchanged.ts PASS captured.
- Supabase migration applied to project ref anfihcusvekpovcchpoh; \\d pathfinder.lead_chat_messages output captured.
- Pathfinder Vercel preview URL captured (green).
- internal.unicron.systems live verification: launcher visible, real answer for a real Internal company, Sonar research call with sources, history persists across reload. Notes captured for PR.

## AUTO-MERGE GATE

Merge feat/stream-h-lead-chat to main when ALL hold:
- pnpm typecheck, pnpm lint, pnpm test, pnpm build green in the worktree.
- pnpm exec verify-orgs-byte-unchanged passes (Zedcor / Realberry / Funder unchanged).
- Pathfinder Vercel preview build green.
- pathfinder.lead_chat_messages exists in prod (Supabase ref anfihcusvekpovcchpoh), confirmed by execute_sql.
- The existing Pathfinder chat route still returns 200 for a Zedcor-shaped request (regression test green).

On merge: move the Kanban card "Stream H: lead chat agent" to Deployed with commit sha and ISO timestamp. Never Verified (human-only).

## Auto-revert

`git revert` on:
- Any post-merge Pathfinder deploy failure.
- Any sign Zedcor / Realberry / Funder rendering changed.
- Any sign the existing Pathfinder chat broke.

## Hard-halt

- Any destructive-git situation (worktree dirty in main, accidental main commit).
- An unresolvable failing test after honest iteration.
- A change that would alter Zedcor / Realberry / Funder.

Never fabricate data, never weaken a test.
