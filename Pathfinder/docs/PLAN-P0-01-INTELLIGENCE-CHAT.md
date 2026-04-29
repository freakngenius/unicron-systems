# PLAN — P0-01 Intelligence Chat

**Branch:** `feat/p0-01-intelligence-chat`
**Spec:** `Pathfinder/Pathfinder-Feature-Specs.md` § "P0 Feature 1 — Intelligence Chat"
**Status:** Approved 2026-04-28. Decisions on Q1, Q2, Q3 locked (see § 0).

This plan covers everything that will be built on this branch. Read top to bottom before approving — anything you cut here saves rework later.

---

## 0. Locked decisions (post-approval)

**Q1 — Action persistence:** Take the chat_messages.payload approach for the four deferred actions (HubSpot push, schedule, add note, accept lead). Migration scope stays at chat tables only. `outreach_drafts` and `lead_actions` will be created by P0-02 (Outreach Drafter) and P0-03 (HubSpot Sync) respectively.

**UI honesty rule:** Deferred-action replies must say "Queued. Will sync when HubSpot integration lands." (or analogous) — never a generic success state. The 501 surface in `app/api/chat/actions/route.ts` is fine; the UI string surfaced to the user is what matters. § 8 specifies the exact strings per action.

**Q2 — PERPLEXITY_API_KEY missing (will not be set yet):** Build the graceful degradation path. Classes A, C, D, F, G work today. When the classifier routes to class B (research expansion) or class E (competitive Q&A) and the key is absent, the assistant replies with the exact sentence:

> "This question requires Perplexity Sonar research, which is not yet configured. Available now: ask me anything about the dashboard's existing data, or use me to draft and refine outreach."

When the key is later added, those classes light up automatically — no code change required. § 6 and § 9 reflect this.

**Q3 — Per-user, view-aware sub-threads:** Confirmed. Thread keying is `(user_email, contextKey)`.

**UX rule for thread surfacing:**
- Opening a project the user has discussed before → surface the relevant prior sub-thread by default, with a "view full history" affordance to see all sub-threads
- Opening the chat without a specific context (no project open, no branch focused) → surface the most recent sub-thread regardless of its context
- Switching context with chat already open → animate to the relevant sub-thread (or empty thread if none exists for that context)

§ 5.1 (`IntelligenceChat.tsx`) and § 9 (the GET `/api/chat` route) reflect this surfacing logic.

---

## 1. Goal in one sentence

Embed a context-aware chat panel in the Pathfinder dashboard that handles the seven interaction classes from the spec (A through G), uses Perplexity Sonar for web-grounded research, uses Anthropic Claude for tone and structural rewrites, persists per-user threads in `pathfinder.chat_threads` / `pathfinder.chat_messages`, and produces outreach drafts that obey the length and tone rules.

---

## 2. Scoped files (declared up front, will not silently expand)

New files:

- `app/components/IntelligenceChat.tsx` — main right-rail panel
- `app/components/ChatMessage.tsx` — single message rendering (user / assistant / system / outreach-draft)
- `app/components/ChatInput.tsx` — input box + suggested-prompt chips
- `app/components/ChatContextIndicator.tsx` — top-of-panel context display
- `app/api/chat/route.ts` — chat backend (POST: send message; GET: list/load thread)
- `app/api/chat/actions/route.ts` — action endpoints (copy/save/regenerate/export/etc.)
- `lib/chat/context.ts` — builds chat context payload from current dashboard state
- `lib/chat/sonar.ts` — Perplexity Sonar API wrapper
- `lib/chat/outreach-drafter.ts` — outreach generation with length/tone rules + verifier loop
- `supabase/migrations/0009_chat.sql` — `pathfinder.chat_threads`, `pathfinder.chat_messages`

Touched files (additive only — three-way merge friendly):

- `components/dashboard.tsx` — mount the chat panel, pass current context, wire toggle state
- `components/TopBar.tsx` — add chat toggle button (icon + active-state pill)
- `lib/types.ts` — add `ChatThread`, `ChatMessage`, `ChatContextSnapshot` types and extend `PathfinderDatabase`
- `tailwind.config.ts` — only if a new design token is required (not anticipated; we will reuse `pf-*` classes and the inline `PF` token object)

Out of scope (will not be touched on this branch):

- HubSpot integration (P0 #3)
- Slack bot (P0 #4)
- Settings page (P0 #5; lives at `app/settings`)
- Any change to the map, BranchDock, ProjectList, ProjectModal layout beyond reflowing for the chat panel
- New top-level migrations beyond `0009_chat.sql`

Note: spec mentions write access to `pathfinder.outreach_drafts` and `pathfinder.lead_actions`. Neither table exists today (verified by grep). The user has scoped this branch's migration to chat tables only. **Action endpoints that would persist to those tables will instead write structured rows to `chat_messages` (with a `kind` discriminator), so the audit trail still lands in Supabase.** Real action persistence is sequenced for whichever branch creates `outreach_drafts` and `lead_actions` (likely P0 #3 HubSpot bidirectional sync). This is called out as Open Question #1 below.

---

## 3. Architecture and data flow

```
                ┌───────────────────────────────────────┐
                │        dashboard.tsx (client)         │
                │                                       │
                │  state: chatOpen, openProjectId,      │
                │         selectedBranchId, source,     │
                │         crossPoll, filteredProjects   │
                │                                       │
                │  passes ChatContextSnapshot           │
                │      ↓ as prop                        │
                │  <IntelligenceChat                    │
                │      open=… onClose=…                 │
                │      context=…                        │
                │      branches=… customers=…           │
                │      projects=… />                    │
                └───────────────────────────────────────┘
                                │
                  fetch('/pathfinder/api/chat', POST)
                                ↓
        ┌───────────────────────────────────────────────┐
        │              app/api/chat/route.ts            │
        │                                               │
        │  1. Identify user via Basic-Auth header       │
        │  2. Load/upsert thread for (user, contextKey) │
        │  3. Append user message to chat_messages      │
        │  4. Build augmented prompt:                   │
        │       - system prompt (chat persona)          │
        │       - context block (from req.context)      │
        │       - tool/data context (Supabase reads)    │
        │       - last N messages from thread           │
        │  5. Decide path:                              │
        │       a) needs_web_research → Sonar           │
        │       b) outreach_draft → outreach-drafter    │
        │       c) workflow_action → actions/dispatch   │
        │       d) default → Claude Sonnet 4.6 SSE      │
        │  6. Stream assistant deltas back via SSE      │
        │  7. On done: persist assistant msg + sources  │
        └───────────────────────────────────────────────┘
                                │
            ┌───────────────────┼────────────────────┐
            ↓                   ↓                    ↓
      lib/chat/sonar.ts   lib/anthropic.ts   lib/chat/outreach-drafter.ts
       (web-grounded)       (Sonnet 4.6        (length/tone rules
                            tool-use loop)      + verifier retry)
```

### 3.1 Routing decision (which back-end path runs)

The chat backend uses Claude Sonnet 4.6 with **structured output / tool-use** to classify the incoming user turn into one of:

- `read_only_internal` (classes A, D — `pathfinder.*` reads only)
- `web_research` (classes B, E — Sonar call required)
- `outreach_draft` (class C — outreach drafter pipeline)
- `workflow_action` (class F — dispatch to actions endpoint)
- `forecast_or_summary` (class G — internal data assembly + Sonnet narration)

The classifier is a single Sonnet call with `tool_choice: any` over five named tools, each tool's input schema describing the params for that path. Output of the classifier goes straight into the dispatcher. This avoids the brittle prompt-pattern matching and gives us a clean audit row per turn.

### 3.2 Data flow for the streaming response

We reuse the existing SSE pattern from `app/api/rationale/[projectId]/route.ts`:

```
data: {"type":"meta","threadId":"...","kind":"outreach_draft"}\n\n
data: {"type":"delta","text":"..."}\n\n
...
data: {"type":"sources","items":[{"url":"...","title":"..."}]}\n\n
data: {"type":"actions","items":[{"id":"copy","label":"Copy"},{"id":"save","label":"Save draft"},...]}\n\n
data: {"type":"done"}\n\n
```

The client renders deltas progressively, then on `sources` paints the provenance footer, on `actions` renders inline action buttons, on `done` enables the input again.

### 3.3 Context snapshot — what the chat actually knows

`ChatContextSnapshot` (defined in `lib/chat/context.ts` and `lib/types.ts`):

```ts
interface ChatContextSnapshot {
  view: 'dashboard';                        // future: 'project_modal' | 'settings'
  selectedBranchId: string | null;
  openProjectId: string | null;
  sourceFilter: SourceKey;
  crossPoll: boolean;
  filteredProjectIds: string[];             // top 50 only — keeps payload small
  totalProjects: number;
  hiddenProjectIds: string[];
  timestamp: string;                        // ISO
}
```

The dashboard recomputes this snapshot on every navigation/filter change and passes it down. The chat backend re-fetches the underlying rows from Supabase using the IDs in the snapshot — we never trust client-supplied row data.

A short, human-readable rendering of the snapshot is shown in `ChatContextIndicator` (e.g., "Viewing: all projects · Houston branch · Cross-poll OFF"). When `openProjectId` is set, indicator switches to "Viewing: Hines VA Hospital · Houston branch".

---

## 4. Migration — `supabase/migrations/0009_chat.sql`

```sql
-- Chat threads + messages for the Intelligence Chat panel.
-- One thread per (user_email, context_key). context_key is a stable hash of
-- the dashboard view (e.g., "dashboard:branch=hou:project=null") so users
-- see continuity when they re-open the same view, but a fresh thread when
-- they navigate to a different project.

create table pathfinder.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  user_email      text not null,
  context_key     text not null,
  context_label   text not null,           -- human-readable, used in UI
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (user_email, context_key)
);

create index chat_threads_user_idx on pathfinder.chat_threads(user_email, last_message_at desc);

create type pathfinder.chat_message_role as enum ('user', 'assistant', 'system');
create type pathfinder.chat_message_kind as enum (
  'text',
  'outreach_draft',     -- email/linkedin/voicemail bundle
  'action_result',      -- structured payload from /api/chat/actions
  'error'
);

create table pathfinder.chat_messages (
  id              bigserial primary key,
  thread_id       uuid not null references pathfinder.chat_threads(id) on delete cascade,
  role            pathfinder.chat_message_role not null,
  kind            pathfinder.chat_message_kind not null default 'text',
  content         text not null,                              -- markdown for display
  payload         jsonb not null default '{}'::jsonb,         -- structured (sources, draft fields, action params)
  model_used      text,
  latency_ms      integer,
  created_at      timestamptz not null default now()
);

create index chat_messages_thread_idx on pathfinder.chat_messages(thread_id, created_at);
```

RLS: existing migrations (`0004_rls.sql`) appear to use service-role for writes from server routes. Chat will follow the same pattern — server routes use `supabaseAdmin()`, the browser never reads chat tables directly. No RLS policies needed beyond the existing schema-level grants.

`lib/types.ts` is extended with the matching TS types and the `PathfinderDatabase` table bag picks up `chat_threads` + `chat_messages`.

---

## 5. Component breakdown

### 5.1 `IntelligenceChat.tsx`

Right-rail panel, 420px wide, full height, slides in/out via CSS transform. Mounted in `dashboard.tsx` as a sibling to `ProjectList`. When open:

- Map and other chrome **don't reflow** by repositioning — instead the `ProjectList` width clamps and `ZoomControl` shifts left by 420px. This matches the existing `branchMin`/`listMin` pattern in `dashboard.tsx`.
- Closes on Escape, on backdrop tap (mobile only), or via the X button in the header.
- Shows: header (context indicator + close), scrollable message list, input + suggested-prompt chips, status footer (model used, latency hint).

Internal state:

- `messages: ChatMessage[]` — local, hydrated from `/api/chat?contextKey=…&fallback=recent` on first open
- `streaming: boolean` — disables input while streaming
- `pendingAssistantText: string` — accumulator for current SSE
- `pendingSources: SourceCitation[]`
- `pendingActions: ChatAction[]`
- `historyOpen: boolean` — toggles the "view full history" affordance (lists all sub-threads for this user)

Thread surfacing on open (Q3 UX rule):

1. If `openProjectId` set → request `GET /api/chat?contextKey=project:{id}` → if exists, surface that thread; else create empty thread for that key.
2. If no project but a branch focused → request `GET /api/chat?contextKey=branch:{id}` → same fallback logic.
3. If no project and no branch → request `GET /api/chat?fallback=recent` → server returns the user's most recently active thread regardless of context. Indicator displays the resurrected thread's `context_label` and an inline "Resumed from: …" pill.
4. On context change while panel is open → fetch the new contextKey's thread, fade out current messages, fade in the new ones (180ms — matches the existing card-fade convention).

The "view full history" affordance is a small `pf-pill` in the panel header that toggles a thread switcher overlay (left-side drawer, 280px wide) listing all of the user's sub-threads ordered by `last_message_at desc`. Clicking a row selects that thread; the panel re-renders. Out of scope V1: thread search, thread renaming, thread deletion. The data model supports them; the UI for them ships in a follow-up branch.

### 5.2 `ChatMessage.tsx`

Renders a single message keyed by `kind`:

- `text` (user or assistant) — simple bubble, mono label for role, prose body
- `outreach_draft` — three sub-cards (Email, LinkedIn DM, Voicemail) each with copy/edit/save/regenerate buttons. Word/char counters show under each. Subject line and body render separately for the email card.
- `action_result` — compact summary line + optional payload preview (e.g., CSV row count)
- `error` — muted red border, retry button

Provenance footer renders below assistant messages when `payload.sources` is non-empty: a single-line `pf-meta` strip listing source URLs and tables queried (e.g., "Sources: 3 web · 2 tables"). Clicking expands the full list inline.

### 5.3 `ChatInput.tsx`

- Single-line textarea that auto-grows up to 6 lines
- Submit on Enter (Shift+Enter for newline)
- Disabled while `streaming`
- Below the input: a row of 3-5 suggested-prompt chips that **rotate based on context**:
  - Default (no project): "Show me top leads in TX", "What's my Houston branch's accept rate?", "Summarize this week's pipeline"
  - When project open: "Tell me more about this prime contractor", "Draft outreach for this lead", "What other projects has this contractor led?"
  - When cross-poll on: "Which warm-intro paths look strongest?"
  - When branch selected: "Compare this branch to the rest of the network"
- Suggested prompts come from `lib/chat/context.ts:suggestedPrompts(snapshot)`

### 5.4 `ChatContextIndicator.tsx`

Top-of-panel strip. `pf-label` style. Shows "Viewing: <label>" where label is computed from the snapshot. Fades when context changes (200ms transition matching dashboard convention). When the underlying view changes (user navigates), indicator updates and a small toast-strip says "Context updated" for 2s.

### 5.5 `TopBar.tsx` (additive change)

Add a chat-toggle pill to the right cluster, between the existing `EscalationPill` and the `LiveStat` block. Pill has a chat-bubble SVG icon + "Chat" label. When `chatOpen`, pill renders with `pf-pill-active` style. When the chat backend has an unread assistant message (model finished while panel was closed), a small `PF.warm` dot appears on the icon corner.

---

## 6. Sonar wrapper — `lib/chat/sonar.ts`

Per the Q2 decision, this module must work even when `PERPLEXITY_API_KEY` is unset — the wrapper exposes a typed `isConfigured()` check that the chat route consults before dispatching to Sonar. When unconfigured, classes B and E reply with the exact spec-locked sentence (see § 9.2).

Mirrors the shape of `lib/anthropic.ts`:

```ts
export const SONAR_MODEL = process.env.PF_SONAR_MODEL ?? 'sonar';

interface SonarRequest {
  query: string;
  systemPrompt?: string;
  recencyDays?: number;            // bias toward recent results
  domains?: string[];              // optional allowlist
  maxTokens?: number;
}

interface SonarResponse {
  text: string;
  citations: { url: string; title: string }[];
  model: string;
  latencyMs: number;
}

export function isSonarConfigured(): boolean;            // returns false when PERPLEXITY_API_KEY is unset
export async function* streamSonar(req: SonarRequest): AsyncGenerator<...>
export async function completeSonar(req: SonarRequest): Promise<SonarResponse>
```

Implementation details:

- HTTP POST to `https://api.perplexity.ai/chat/completions` with `Authorization: Bearer ${PERPLEXITY_API_KEY}`
- Request body: `{ model, messages, return_citations: true, search_recency_filter: 'month' (configurable) }`
- For streaming responses: parse SSE, yield text deltas, accumulate citations, return the full citation list at end
- Errors map to a typed `SonarError` so the route can render a clean assistant-side error message

Env var: `PERPLEXITY_API_KEY`. The plan assumes this is already set in the Vercel project; if not, see Open Question #2.

---

## 7. Outreach drafter — `lib/chat/outreach-drafter.ts`

This is the most spec-bound module. Spec rules (verbatim, all enforced):

- Email: 60-90 words. Subject under 60 chars. One specific reference. One soft CTA.
- LinkedIn DM: under 200 chars. Conversational. One signal.
- Voicemail: 25 sec spoken (~70 words). Natural pauses. One ask.
- All channels: no em-dashes, no en-dashes.
- All channels: never claim relationships not in `pathfinder.*` data.
- Goal: book a 20-minute call before competitors.

### 7.1 Pipeline

```
draftOutreach(project, branch, customer | null, intent, instructions[])
  ↓
1. Build context block from project + branch + warm customer (if any)
2. Single Anthropic call (Sonnet 4.6) with system prompt encoding all rules
   and `response_format: json` requesting:
     {
       email: { subject, body },
       linkedin: { body },
       voicemail: { body },
       provenance: ["projects:{id}", "branches:{id}", ...]
     }
3. Run verifier:
     - regex check: no em-dash (—), no en-dash (–)
     - word counts: email 60-90, voicemail 60-80
     - char counts: email subject < 60, linkedin < 200
     - hallucination check: any company/customer named must appear in the
       provided context — if a name shows up that wasn't in input, fail
4. If verifier fails: re-prompt with the specific failure reason. Max 2 retries.
5. After 2 failures: return the best draft + a flag `verifierWarnings` so the
   UI can show "Rules not all met — review before sending"
```

### 7.2 Iteration intents (class C)

The chat agent maps user phrasing to a typed `iterationIntent`:

- `tighten` → re-prompt with "reduce word count by ~30%, preserve specific reference"
- `less_salesy` → re-prompt with tone constraint
- `add_warm_intro` → re-prompt injecting customer relationship
- `open_with_question` → re-prompt with structural constraint
- `add_time_slot` → re-prompt with calendar-availability constraint (uses a generic two-slot pattern; real calendar integration is out of scope)
- `audience_pivot` → re-prompt with new addressee (VP Facilities vs. project owner)

Each intent is a discrete branch in the drafter so the prompts stay small and auditable.

### 7.3 Em-dash purge rule

The codebase already has em-dashes purged from outreach copy (commit `d9ab182`). Outreach drafter applies the same rule via:

1. System prompt explicitly forbids `—` and `–`
2. Verifier regex post-check — fail-and-retry on detection
3. Final-pass character substitution as a safety net (`—` → `, `, `–` → ` to `) before returning, with a `verifierWarnings.dashSubstituted: true` flag

---

## 8. Action endpoints — `app/api/chat/actions/route.ts`

POST body: `{ threadId, messageId, action: ActionId, params: object }`

Supported actions (this branch):

| Action ID | What it does | Persistence |
|---|---|---|
| `copy_draft` | No-op server-side; client copies to clipboard. Logged for analytics. | `chat_messages` row, kind=`action_result` |
| `save_draft` | Persists outreach draft as a chat_messages row with kind=`outreach_draft` and a `saved: true` flag in payload | `chat_messages` |
| `regenerate_draft` | Re-runs outreach drafter with same intent | streams via `/api/chat` |
| `export_csv` | Builds CSV from project IDs in params, returns text/csv response | `chat_messages` row noting export count |
| `summarize_pipeline` | Builds summary from `pathfinder.projects` + `agent_runs`, returns markdown | `chat_messages` |

Deferred — return HTTP 501 with a structured payload + audit row + the exact user-facing reply string:

| Action ID | User-facing reply (rendered in chat) |
|---|---|
| `accept_lead_to_hubspot` | "Queued. This lead will sync to HubSpot when the HubSpot integration ships (P0-03)." |
| `push_to_pipeline` | "Queued. Pipeline push will run when the HubSpot integration ships (P0-03)." |
| `schedule_followup` | "Saved for sync. Follow-up reminders will activate when the scheduler ships." |
| `add_note` | "Saved for sync. Custom notes will move to the lead record when the notes table ships." |

Deferred actions write a `chat_messages` row with kind=`action_result` and payload:

```json
{
  "status": "deferred",
  "action": "<action_id>",
  "params": { ... },
  "blocking_branch": "P0-03-hubspot-sync" | "P0-future" | …,
  "queued_at": "2026-04-28T…Z",
  "user_facing_reply": "<exact string above>"
}
```

When the dependent infra ships, a backfill job can replay these rows into the real action stores — the queued_at timestamp preserves user intent ordering.

---

## 9. Backend route — `app/api/chat/route.ts`

```
POST /api/chat
  body: { contextKey, contextLabel, contextSnapshot, message }
  → SSE stream (see § 3.2)

GET /api/chat?contextKey=…&fallback=recent
  → { thread, messages: ChatMessage[], resumed?: { fromContextKey, fromContextLabel } }
  Surfacing logic (Q3):
    - If contextKey matches an existing thread → return that thread + last 50 messages.
    - If contextKey has no thread AND fallback=recent → return the user's most recent
      thread regardless of contextKey, with a `resumed` block so the UI can render
      the "Resumed from: …" pill.
    - If no threads at all → return { thread: null, messages: [] } → UI shows the
      empty state with suggested-prompt chips.

GET /api/chat/threads
  → { threads: { contextKey, contextLabel, lastMessageAt, messageCount }[] }
  (powers the "view full history" affordance — § 5.1.)
```

### 9.2 Sonar-unconfigured graceful path (Q2 lock)

When the classifier returns `web_research` or `competitive_strategic` AND `isSonarConfigured() === false`, the route MUST emit (in order):

```
data: {"type":"meta","threadId":"...","kind":"sonar_unconfigured"}\n\n
data: {"type":"delta","text":"This question requires Perplexity Sonar research, which is not yet configured. Available now: ask me anything about the dashboard's existing data, or use me to draft and refine outreach."}\n\n
data: {"type":"done"}\n\n
```

The exact sentence is locked verbatim — UI components do not paraphrase, do not soft-wrap with surrounding chrome that changes the meaning. The assistant message persisted to `chat_messages` carries `payload: { degraded: true, reason: "sonar_not_configured", classified_as: "<class>" }` so when the key is later set, an analytics query can replay these turns.

User identity: read from the `Authorization: Basic …` header that middleware has already validated. The username portion is the `user_email` for thread keying. No new auth surface.

Latency targets (from spec acceptance criteria):

- Read-only internal: < 4s typical (single Sonnet pass over small context)
- Outreach drafts: < 10s typical (1-3 Sonnet passes through the verifier)
- Web research: < 8s typical (Sonar call + a Sonnet narration pass)

The route emits a `meta` event with `kind` immediately after classification so the UI can show a kind-specific loading state ("Drafting outreach…", "Researching the web…", etc.).

---

## 10. Test plan — 7 interaction classes × 3 prompts each

Each prompt below will be exercised manually against the local dev server before pushing. The intent is not unit coverage (we'll have unit tests for `outreach-drafter` rules and `sonar` request shape) but **end-to-end behavioral verification** that maps directly to the spec's acceptance criteria.

### A. Project-specific Q&A (read-only)

Open a project with prime contractor in `raw_payload`. Send each prompt:

1. "Tell me more about this project's prime contractor."
2. "What stage is this project actually in, beyond what the rationale says?"
3. "What's our distance to nearest customer, and is there a warm-intro path I'm not seeing?"

Pass: response cites the project row, no Sonar call, latency under 4s, no hallucinated facts.

### B. Research expansion (Sonar-grounded)

1. "What other projects has this prime contractor been the lead on in the past 12 months?"
2. "Pull the latest news on this project."
3. "Has this customer signaled expansion plans publicly recently?"

Pass: Sonar invoked, citations rendered, response stays grounded in the citations.

### C. Outreach drafting and iteration

1. "Draft outreach for this lead."
2. (After 1) "Make it tighter."
3. (After 2) "Reference our Lyondell relationship as the warm-intro path."

Pass: V1 returns 3-channel bundle; V2 hits 60-90 word range with ~30% reduction; V3 mentions Lyondell; all three free of em-dashes; verifier passes within 2 retries.

### D. Cross-record context-pull

1. "What other Zedcor leads has this prime contractor been on in our pipeline?"
2. "Show me all leads in TX with score > 80, sorted by RFP window."
3. "Which branches have the highest unverified queue right now?"

Pass: queries hit `pathfinder.projects` / `branches`, response renders as a small markdown table or list with project IDs that link back to the dashboard.

### E. Competitive and strategic Q&A

1. "Who else is bidding on similar projects in this geography?"
2. "Should I pursue this lead given Houston branch capacity?"
3. "What's the historical win rate for projects in the $2M-$5M range with our team?"

Pass: hybrid Sonar + internal data response; if internal data is insufficient (e.g., no win-rate yet), the agent says so and offers a next step. No fabrication.

### F. Workflow assistance

1. "Export this branch's top 10 leads as a CSV." → CSV downloads
2. "Summarize this week's pipeline activity for me." → markdown summary streamed
3. "Mark this as accepted and push to HubSpot." → returns deferred message with explanation; row written for future replay

Pass: actions 1 and 2 succeed end-to-end; action 3 returns a clear deferred-reason and persists the audit row.

### G. Forecasting and reporting

1. "What does next quarter's pipeline look like at current trajectory?"
2. "Generate the Friday brief for me right now (don't wait for Friday)."
3. "Compare this branch's performance to the rest of the network."

Pass: response assembled from `pathfinder.projects`, `agent_runs`, `briefings`. For prompt 2, calls into `lib/briefing.ts` (existing) to reuse the brief generator — no duplicate logic.

---

## 11. Build sequence (waves)

Each wave is a logical commit checkpoint. Push at the end of each wave.

**Wave 1 — Foundation**
- `0009_chat.sql` migration (apply via Supabase MCP)
- `lib/types.ts` extension
- Smoke-test: connect from a scratch client, write+read a thread

**Wave 2 — Backends in parallel**
- `lib/chat/sonar.ts`
- `lib/chat/context.ts`
- `lib/chat/outreach-drafter.ts` (with vitest unit tests for the verifier rules)

**Wave 3 — Routes**
- `app/api/chat/route.ts` (POST + GET)
- `app/api/chat/actions/route.ts`

**Wave 4 — UI**
- `app/components/ChatMessage.tsx`
- `app/components/ChatContextIndicator.tsx`
- `app/components/ChatInput.tsx`
- `app/components/IntelligenceChat.tsx`

**Wave 5 — Integration**
- `components/TopBar.tsx` toggle
- `components/dashboard.tsx` mount + context wiring
- Layout reflow check (ProjectList width clamp, ZoomControl offset)

**Wave 6 — Verification**
- All 21 prompts from § 10 run against local dev
- Screenshots / GIF of each interaction class
- Run `npm run typecheck`, `npm run lint`, `npm test`
- Push, open PR with the spec's "P0 Feature 1" excerpt as the body

---

## 12. Open questions (need answers before or during build)

1. **`outreach_drafts` and `lead_actions` tables don't exist.** This branch persists action audit to `chat_messages.payload` instead. Confirm this is acceptable for V1, with the understanding that the HubSpot branch (P0 #3) will create the real action tables.
2. **`PERPLEXITY_API_KEY` env var.** Is it already set in the Vercel project? If not, the chat will hard-fail on classes B and E. Plan: at the top of `lib/chat/sonar.ts`, use the same deferred-throw pattern as `lib/anthropic.ts` so build doesn't break, and surface a clean "web research unavailable" assistant message at runtime if the key is missing.
3. **Thread keying granularity.** Plan keys threads by `(user_email, contextKey)` where contextKey reflects the dashboard view. That gives users continuity per-view but separate threads when they navigate. Alternative: one thread per user, ever. The spec says "persistent thread per user" — singular — but also says context indicator updates. Plan reads spec as "per-user persistence with view-aware sub-threads". Confirm.
4. **Suggested-prompt rotation.** Plan generates the chips client-side from the snapshot. Alternative: server-side, learned from past usage. V1 ships static-by-context; the data shape supports learning later.
5. **Latency budget for the classifier turn.** The Sonnet classifier adds ~1s before the real work starts. Plan accepts this for V1; if it pushes outreach drafts past the 10s target, we'll inline the classifier into the drafter for outreach-only paths.

---

## 13. Verification before merge

Per project rule (`verification-before-completion`), the PR will only open when:

- All 21 manual prompts in § 10 produce passing behavior, evidenced by screenshots or recorded interaction
- `npm run typecheck` clean
- `npm run lint` clean
- `npm test` green (new vitest suites: outreach drafter rules, context builder, sonar request shape)
- Local dev server runs the dashboard with chat panel open/closed/streaming with no console errors
- Provenance footer renders on every assistant response (manually verified across 5 sample interactions)
- No em-dashes or en-dashes in any rendered outreach draft (regex-grepped against test transcripts)
- Chat panel toggles open/closed without breaking the map / project list layout at 1280px and 1440px

---

## 14. Risk register

| Risk | Mitigation |
|---|---|
| Sonar API rate-limited or down | Surface clean "web research unavailable" message; route falls back to internal-only response with a note |
| Outreach drafter hits verifier-fail loop | Hard cap at 2 retries; return best-of-three with `verifierWarnings` so user sees the issue |
| Long Supabase query in classes D/G blocks SSE | Use `Promise.race` with a 6s timeout; on timeout, stream a "still loading…" delta and fall through to an internal-only summary |
| Chat panel width breaks layout on smaller viewports | Plan only targets ≥1280px; mobile is P0 #8 (separate branch). Add explicit `min-width: 1280px` guard around the panel mount |
| Costs balloon (Sonar + Sonnet on every turn) | Classifier picks the cheapest path; Sonar gated behind explicit web_research class; outreach uses a single-pass-with-verify pattern instead of loops |
| User-shaped prompts not in any of A-G | Default-path Sonnet response with internal data; classifier's tool_choice still picks `read_only_internal` as fallback |

---

**End of plan. Ready for approval before any code is written.**
