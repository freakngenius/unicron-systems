# SPEC — Unicron Nervous System

**Status:** Draft v0.1
**Owner:** Kyle Kesterson (Internal Org Cowork chat)
**Reviewers:** Keenan Hock
**Date:** 2026-05-05

---

## 1. Purpose

Define the multi-tenant operating substrate that runs Unicron Systems internally. Replaces the current Kyle-resident, Cowork-bounded operating pattern with a shared nervous system that any team member, any agent, and any scheduled job reads and writes as a peer.

Specifically this SPEC defines:

- The state layers of the company and what owns each
- The identity model for humans and agents
- The Supabase ledger schema for company-wide signal capture
- The Knowledge vault on git for prose-shaped knowledge
- The ingest pipeline for every conversation surface (calls, Slack, email, voice memos, Apple Notes)
- The persistent agent layer (Orchestrator, Analyst, Elder, Taboo Keeper, Specialists)
- The Slack interface for the Orchestrator
- The refusal gate (Taboo Keeper validation step)
- The continuity log (Elder)
- Scheduled jobs on shared infrastructure
- The kanban writer behavior
- The verify gate rules
- The action item schema with break-off resolution
- Bounded peer attention rules between Cowork instances
- The multi-fork sprint contract (slime mold pruning)
- Multi-tenant access control
- Honest container tensions
- Migration plan from current state
- Steady-state weekly cadence

This is the foundation SPEC for the Internal Org Cowork chat. After it ships, the chat returns to its five design deliverables (target-state map, gap map, boundary decision, migration plan, weekly cadence) with a real architecture to design against.

## 2. Scope and non-goals

**In scope:**
- All internal-org operations: how Unicron itself runs as an AI-native company
- Shared infrastructure for ingest, ledger, vault, scheduling, refusal gate
- Multi-tenant access for Kyle, Keenan, Curtis, future team members, and any agent

**Out of scope (handled by other Cowork chats):**
- Pathfinder customer-facing product features
- Metacron customer-facing operator features
- Customer onboarding workflows for Zedcor or any other tenant
- Cap-table mechanics for R3 contributor share (separate Kyle and Keenan conversation; SPEC notes the architectural hooks but does not design the equity flow)
- Restorative vertical filter for Pathfinder customer selection (routes to Pathfinder Cowork)
- Open-source-the-substrate decision for R5 commons (founder strategy, not architecture)

## 3. State layers and ownership

Each tool gets one role. No tool owns two roles.

| Layer | Tool | Owns | Read/write by |
|-------|------|------|---------------|
| Real-time human comms + ingest source | Slack | Conversational state | Humans, ingest agent, Orchestrator bot |
| Meeting capture | Plaud, Fathom | Raw audio + transcript | Recorder devices, ingest agent |
| Mobile quick-capture | Apple Notes, voice memos | Raw text + audio | Per-user devices, ingest agent |
| Email | Gmail | Async external comms | Humans, ingest agent (later sprint) |
| Knowledge graph and prose | Knowledge vault on git (markdown; Obsidian optional viewer) | Decisions, calls, vision, manifestos, retros, tribal knowledge | Humans, Cowork, Claude Code, Elder agent |
| Structured queryable state | Supabase + pgvector | Ledger, action items, agents table, team_members, signals | Cowork, agents, scheduled jobs, kanban writer |
| Human kanban UI | Notion | Work-in-flight rendered view | Humans (drag, view), kanban writer (creates and moves cards) |
| Strategic orchestration and judgment | Cowork | Per-user thinking surface | Per human |
| Code execution | Claude Code | Production diffs | Dispatched by Cowork via prompts |
| Code merge gate | GitHub | PRs, repo state | Humans, Claude Code, Analyst agent |
| Deploy | Vercel | Production builds | GitHub triggers |
| Durable workflow runtime | Inngest | Scheduled jobs, ingest pipeline, agent runs | Cron + agent dispatchers |
| LLM gateway | Existing gateway | Cost tracking, model routing | All agents |

**Source-of-truth rules:**
- Decisions and prose: Knowledge vault on git
- Structured state: Supabase
- Work-in-flight: Notion (rendered from Supabase action items)
- Human voice: Slack
- Production code: GitHub

If two tools disagree, the source above wins. Notion is downstream of Supabase; if a card is missing from Notion, the writer reconciles.

## 4. Identity model

### 4.1 team_members table

```
team_members (
  id uuid primary key,
  name text not null,
  email text not null unique,
  slack_user_id text,
  github_username text,
  role text check (role in ('founder', 'cofounder', 'advisor', 'contractor')),
  active boolean default true,
  joined_at timestamptz default now(),
  default_kanban_surface text check (default_kanban_surface in ('pathfinder', 'metacron', 'internal', 'sales', 'discovery')),
  reciprocity_hooks jsonb default '{}'::jsonb
)
```

Initial seed:
- Kyle Kesterson, founder, default surface: pathfinder
- Keenan Hock, cofounder, default surface: discovery
- Curtis Smith, advisor, default surface: discovery, active=true (advisory; ingest captured but no auto-DRI)

### 4.2 agents table

```
agents (
  id uuid primary key,
  name text not null,
  archetype text not null check (archetype in ('orchestrator', 'analyst', 'elder', 'taboo_keeper', 'specialist')),
  specialty text,
  config jsonb,
  active boolean default true,
  budget jsonb,
  reciprocity_hooks jsonb default '{}'::jsonb,
  created_at timestamptz default now()
)
```

`budget` shape: `{"limit_usd_per_period": 50, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-12T00:00:00Z"}`. Agent refuses work when `current_spent_usd >= limit_usd_per_period`. Resets on schedule. Implements R4 (agent budget and decay) at the operational level; cap-table reciprocity remains a separate conversation.

`reciprocity_hooks` shape (R3 architectural placeholder, not active mechanics): `{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}`. Empty by default. Lets the schema carry contributor-share intent without committing cap-table mechanics. When Kyle and Keenan decide R3, the hooks fill in without a migration.

Initial seed:
- Orchestrator (one instance, per archetype)
- Analyst (one instance)
- Elder (one instance)
- Taboo Keeper (one instance)
- Specialists: Ingestor (call/Slack/email), Ranker, Verifier, Enricher, AdjacencyMapper, GeoMapper, Outreach Drafter, Briefer, Cross-Pollinator, Architect, Source Onboarder, Coverage Expansion (already shipped per project state, registered here)

### 4.3 AI archetype contracts

**Orchestrator**
- Inputs: Slack DM, Slack mention, scheduled directive
- Outputs: dispatched Claude Code prompt, kanban card, ledger entry, Slack reply
- Memory: `MEMORY/orchestrator/YYYY-MM-DD.md`
- Refusal: passes every dispatch through Taboo Keeper before execution

**Analyst**
- Inputs: nightly schedule, request
- Outputs: deep-review report (Obsidian vault entry), proposed schema or skill changes (PR), drift flags (Slack to Orchestrator)
- Memory: `MEMORY/analyst/YYYY-MM-DD.md`
- Owns: ledger schema integrity, ingest skill library, decay job health, MEMORY/ consolidation

**Elder**
- Inputs: any non-trivial sprint planning request, any decision flagged irreversible
- Outputs: continuity advisory (markdown frontmatter or structured response) referencing prior commitments, public statements, architectural decisions
- Memory: `MEMORY/elder/continuity.md` (append-only) + `MEMORY/seven_generations.md` (versioned)
- Behavior: non-blocking but loud. Returns a list of relevant prior commitments and a flag (`compatible`, `conflict`, `requires_explicit_override`)

**Taboo Keeper**
- Inputs: every invocation before dispatch, every outbound artifact before send
- Outputs: `pass`, `bounce(reason)`, `escalate(reason)`
- Memory: `MEMORY/taboos.md` (human-edited, source of truth; never auto-modified by agents)
- Behavior: blocking. If the action violates the register, returns `bounce(reason)` and the caller cannot proceed. Escalation routes to Kyle and Keenan in `#orchestrator-escalations`.

**Specialists**
- Per-surface builder-operators (Pathfinder Ranker, Metacron Architect, etc.)
- Each has one DRI scope (one outcome, no hiding per principle 6)
- Read and write the ledger; subscribe to a bounded set of peers
- Refusal: respect Taboo Keeper bounces; emit `NO_SIGNAL` or `ABSTAIN` when confidence is insufficient

## 5. Supabase ledger schema

### 5.1 ledger table

```
ledger (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  created_by_human uuid references team_members(id),
  created_by_agent uuid references agents(id),
  source_type text not null check (source_type in (
    'call', 'slack', 'email', 'voice_memo', 'apple_note',
    'cowork_session', 'agent_run', 'manual'
  )),
  source_id text,
  source_url text,
  participants uuid[],
  content_summary text,
  content_full text,
  embedding vector(1536),
  decisions jsonb default '[]'::jsonb,
  action_items jsonb default '[]'::jsonb,
  insights jsonb default '[]'::jsonb,
  strength float default 1.0,
  ttl_days integer default 30,
  last_touched timestamptz default now(),
  status text default 'active' check (status in ('active', 'archived'))
)
```

`decisions`: array of `{text, evidence_ids[], confidence}`
`action_items`: array of `{action_item_id}` references to action_items table
`insights`: array of `{text, confidence, candidate_for_memory_promotion}`

### 5.2 action_items table

```
action_items (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  ledger_id uuid references ledger(id),
  title text not null,
  description text,
  requested_by jsonb not null,
  requested_of jsonb not null,
  dri uuid references team_members(id),
  due_at timestamptz,
  kanban_card_id text,
  kanban_workspace text check (kanban_workspace in ('pathfinder', 'metacron', 'internal', 'sales')),
  status text default 'open' check (status in ('open', 'in_progress', 'done', 'blocked', 'broken_off')),
  break_off_reason text,
  break_off_signal_id uuid references break_off_signals(id),
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'irreversible')),
  strength float default 1.0,
  ttl_days integer default 90,
  last_touched timestamptz default now()
)
```

`requested_by` and `requested_of` shape: `{"type": "human" | "agent", "id": "<uuid>", "name": "<display>"}`. Agents can request work from humans (the Feltsense agentic-delegator inversion). Humans can request work from agents. All four combinations are valid.

### 5.3 break_off_signals table

```
break_off_signals (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  emitted_by jsonb not null,
  source_action_item_id uuid references action_items(id),
  reason text not null,
  proposed_resolution text,
  routed_to jsonb,
  status text default 'open' check (status in ('open', 'acknowledged', 'reassigned', 'resolved'))
)
```

Captures the murmuration governance property. Any human or agent participating in a workflow can peel off mid-run with a structured dissent. The signal routes back to the requester, who acknowledges and either reassigns, drops, or resolves.

### 5.4 signals table (mycelium primitives)

```
signals (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  source_agent uuid references agents(id),
  topic text not null,
  signal_type text not null check (signal_type in ('FACT', 'QUESTION', 'PATTERN', 'RISK')),
  content text not null,
  evidence_ledger_ids uuid[],
  strength float default 1.0,
  ttl_days integer default 30,
  last_touched timestamptz default now(),
  status text default 'active' check (status in ('active', 'archived'))
)
```

Atomic typed signals dropped by agents into the substrate. Decay nightly. Strong signals reinforce on read. The mycelium primitive from manifesto Pages II and VI made operational.

### 5.5 pgvector indexing

- `ledger.embedding` indexed via ivfflat or hnsw
- Embedding generated on insert via Supabase trigger calling Anthropic embeddings
- RPC function `semantic_search(query_text, surface, limit)` returns ranked ledger rows
- Cowork queries via existing postgres MCP; persistent agents query via direct Supabase client

### 5.6 Row-level security

- All tables have RLS enabled
- `service_role` bypasses RLS for ingest pipeline and persistent agents
- `authenticated` users can read all rows in their workspace, write their own rows
- Per-user Cowork authenticates as themselves; persistent agents use service role

## 6. Knowledge vault on git

The vault is a folder of markdown files in a shared GitHub repo. Obsidian, VS Code, any markdown editor, or the GitHub web UI can edit it. Claude Code reads and writes it directly via the Read/Write/Edit tools. Cowork queries it via the file system or via grep over the cloned copy. The vault is the artifact; the editor choice is per-user and optional.

### 6.1 Repo and structure

- New GitHub repo: `unicron-knowledge` (separate from product repos)
- Subsumes existing `Company Docs/` content
- Vault directories:
  - `Context/` — context briefs for Cowork chats (existing)
  - `Vision/` — manifesto, paradigm map, philosophy (existing)
  - `PRD/` — product requirements (existing)
  - `Specs/` — technical specifications (existing, including this SPEC)
  - `Plans/` — execution playbooks (existing)
  - `Reports/` — build reports, retrospectives (existing)
  - `Prompts/` — paste-ready Claude Code launch prompts (existing)
  - `Misc Docs/` — operational artifacts (existing)
  - `Decisions/` — append-only decision log entries (NEW)
  - `Calls/` — call ingest output, organized by date (NEW)
  - `Retros/` — sprint and weekly retros (NEW)
  - `Memory/` — agent memory (NEW; mirrors current MEMORY/ structure with sub-dirs per agent)
  - `Inbox/` — quick capture from any source; Analyst sweeps to correct folder nightly (NEW)
- Sync model: Kyle, Keenan, and any future team member clone the repo. Edits commit and push. The repo is the source of truth.
- Conflict resolution: standard git merge. Most edits are append-only daily files so conflicts are rare.

### 6.2 Optional viewers

- **Obsidian** (Kyle and Keenan, optional): point Obsidian at the cloned vault folder. Get graph view, backlinks, Dataview queries over frontmatter. Skip if it feels like overkill; the markdown files are the artifact.
- **VS Code or any markdown editor**: edit directly.
- **GitHub web UI**: edit, view, search.
- **Cowork and Claude Code**: read/write the markdown files directly via tool access; no special editor needed.

### 6.3 Frontmatter standard

Every doc in the vault carries frontmatter:

```yaml
---
type: decision | call | retro | spec | prd | vision | memory | seven_generations | taboo
date: YYYY-MM-DD
dri: <team_member_name or agent_name>
status: draft | active | archived | superseded
ttl_days: <integer or 'permanent'>
last_touched: YYYY-MM-DD
links: [[other_doc]] [[another_doc]]
evidence_ledger_ids: [<uuid>, <uuid>]
priority: low | medium | high | irreversible
---
```

If Obsidian is installed, Dataview queries operate against frontmatter. If not, grep over frontmatter via Cowork or Claude Code does the same job.

### 6.4 Mobile capture

Primary path: DM the Orchestrator on Slack from your phone. The Orchestrator runs the ingest pipeline, creates a vault entry in `Inbox/`, posts a confirmation back. No git client on the phone required.

Optional path: any iOS markdown editor (1Writer, iA Writer, etc.) plus a git client (Working Copy) for power users who want to edit vault docs directly. Not required for the system to work.

### 6.2 Frontmatter standard

Every doc in the vault carries frontmatter:

```yaml
---
type: decision | call | retro | spec | prd | vision | memory | seven_generations | taboo
date: YYYY-MM-DD
dri: <team_member_name or agent_name>
status: draft | active | archived | superseded
ttl_days: <integer or 'permanent'>
last_touched: YYYY-MM-DD
links: [[other_doc]] [[another_doc]]
evidence_ledger_ids: [<uuid>, <uuid>]
priority: low | medium | high | irreversible
---
```

Dataview queries operate against frontmatter. Example: list all decisions made this week with status=active and priority=irreversible.

### 6.3 Mobile capture path

- iOS Obsidian app pointed at the cloned vault on Working Copy or Obsidian Sync
- Quick capture template `.obsidian/templates/quick-capture.md` creates a stub with frontmatter prefilled
- File lands in `Inbox/` directory; Analyst nightly sweep moves to correct folder
- Voice memos and Apple Notes route through the ingest pipeline (section 7) and emit a vault doc as one of their outputs

## 7. Ingest pipeline

### 7.1 Architecture

```
[capture surfaces] → [shared ingest endpoint] → [ingest skill] → [ledger row + vault doc + action items]
```

Shared ingest endpoint: a Vercel route (`/api/ingest`) backed by Inngest. Authenticated via per-user API key or Slack app token. Posts a typed payload, returns a job id.

### 7.2 Capture surface configurations

| Surface | Trigger | Identity attached |
|---------|---------|-------------------|
| Plaud | Webhook on recording complete | Per-user account id mapped to team_member |
| Fathom | Webhook on recording complete | Per-user account id mapped to team_member |
| Slack | Daily scan via Slack MCP, plus mention webhook | Slack user id mapped to team_member |
| Gmail | Daily scan via Gmail skill (later sprint) | Email address mapped to team_member |
| Apple Notes | iOS shortcut posts to ingest endpoint | Per-user API key |
| Voice memos | iOS shortcut runs Whisper, posts transcript | Per-user API key |
| Manual | Cowork posts via MCP | Authenticated user |

### 7.3 Ingest skill contract

Input schema:
```
{
  source_type: 'call' | 'slack' | 'email' | 'voice_memo' | 'apple_note' | 'manual',
  source_id: string,
  source_url: string | null,
  raw_content: string,
  participants: { team_member_id?: string, name?: string, email?: string }[],
  captured_at: ISO timestamp,
  captured_by: { type: 'human' | 'agent', id: uuid }
}
```

Output schema (typed handoff contract per beehive primitive):
```
{
  status: 'records' | 'NO_SIGNAL' | 'ABSTAIN',
  reason?: string,  // required if NO_SIGNAL or ABSTAIN
  ledger_row?: { id: uuid, ... },
  vault_doc?: { path: string, content: string },
  action_items?: { ...action_items_row }[],
  signals?: { ...signals_row }[]
}
```

`NO_SIGNAL` and `ABSTAIN` are first-class outputs. The pipeline never invents content to fill silence. Verify gate respects these and does not promote false positives downstream.

### 7.4 Refusal gate integration

Every ingest run posts the proposed output to the Taboo Keeper before persisting. If Taboo Keeper bounces, the run halts and posts a `bounced` status to `#orchestrator-escalations`. No ledger row, no vault doc, no kanban card created.

### 7.5 Skill files

The ingest skill lives in the skills plugin system. Initial implementations:
- `unicron-internal:ingest-call` — calls (Plaud, Fathom)
- `unicron-internal:ingest-slack-thread` — Slack
- `unicron-internal:ingest-voice-memo` — voice memos
- `unicron-internal:ingest-apple-note` — Apple Notes
- `unicron-internal:ingest-email` — email (sprint two)

All inherit a shared `ingest-base` library that handles ledger writes, vault writes, action item creation, kanban writer dispatch, and Taboo Keeper validation.

## 8. Persistent agent layer

### 8.1 Runtime

- Inngest functions for event-driven agent runs
- Vercel cron for scheduled triggers
- Each persistent agent is a function that loads its memory, runs its loop, writes its memory, and returns
- Memory: `MEMORY/<agent_name>/YYYY-MM-DD.md` daily logs + `MEMORY/<agent_name>/index.md` long-term index
- Memory committed to git nightly by Analyst (or directly by the agent function via service-role git push)

### 8.2 Triggers

- Orchestrator: triggered by Slack DM, Slack mention, or scheduled briefing time
- Analyst: nightly cron (00:00 PT), plus on-demand
- Elder: triggered by any planning Cowork session via MCP RPC, or by Orchestrator before dispatching irreversible work
- Taboo Keeper: triggered synchronously inline with every dispatch and every outbound artifact
- Specialists: triggered by their existing per-surface schedules (already shipped)

### 8.3 Inter-agent messaging

claude-peers MCP handles request-response. For real-time observation, agents subscribe to ledger inserts via Supabase Realtime (bounded peer attention per starling primitive: each agent declares which peer agent_ids and which signal topics to watch).

## 9. Slack interface for the Orchestrator

### 9.1 Bot setup

- Slack app `Unicron Orchestrator` installed in the team workspace
- Bot user appears in DMs and can be `@mentioned` in shared channels
- Permissions: `chat:write`, `app_mentions:read`, `im:read`, `im:write`, `channels:history` for designated channels, `users:read`

### 9.2 Channel topology

- `#orchestrator-feed` — daily digests, weekly retros, decay reports (Analyst posts here)
- `#orchestrator-escalations` — Taboo Keeper bounces, action items missing DRI, verify gate failures (Orchestrator routes here)
- `#pathfinder-action-items`, `#metacron-action-items`, `#internal-action-items`, `#sales-action-items` — kanban writer posts new action item summaries here
- Existing `#general`, `#discovery`, etc. — humans converse, ingest scans for decisions

### 9.3 DM behavior

DM Orchestrator with a directive. Orchestrator parses, decides:
1. Run through Taboo Keeper. If bounced, reply with reason, halt.
2. If passes, dispatch: build a ledger row, create action items, generate paste-ready Claude Code prompt if code work, post the prompt to the user's DM as the relay output (Kyle stays in the loop to paste, but the framing and kanban hygiene are pre-baked).
3. Reply with summary + list of created action items + Notion card links.

### 9.4 Mention behavior

`@Orchestrator` in a channel: same flow, but reply posts in the channel so the team sees it.

### 9.5 Slash commands (optional v1)

- `/orchestrator status` — show active sprints across all surfaces
- `/orchestrator escalations` — list open Taboo Keeper bounces
- `/orchestrator memory <query>` — semantic search over the ledger
- `/orchestrator dri <action_item_id> <team_member>` — reassign DRI

## 10. Refusal gate (Taboo Keeper)

### 10.1 Register file

`MEMORY/taboos.md` carries the explicit "will not do" list. Format:

```markdown
---
type: taboo
status: active
last_reviewed: 2026-05-05
reviewers: [Kyle, Keenan]
---

# Unicron Taboos

## Domain refusals
- We will not build for industries that deepen extraction of human attention, labor, or dignity.
- We will not optimize for time-on-site, engagement loops, or attention capture.
- We will not take contracts with militaries, weapons systems, or autonomous targeting.
- We will not enable training on or output of content that harms children.

## Operational refusals
- We will not enclose commons we benefit from.
- We will not take actions on behalf of a user without their ability to veto.
- We will not deploy agents without time-horizon review on irreversible decisions.
- We will not hide the refusal layer from users or competitors.

## Process refusals
- We will not promote work to Verified without a human reviewer.
- We will not auto-merge PRs without verbatim evidence in the PR description.
- We will not write production code from Cowork chats.
- We will not delete uncommitted work or run `git clean`, `git reset --hard`, or `rm -rf` on workspace folders.
```

This file is human-edited only. Agents read it; agents never write it. PRs to this file require explicit Kyle or Keenan approval and a continuity log entry from the Elder.

### 10.2 Validation algorithm

Taboo Keeper is a small Anthropic call:
1. Load `MEMORY/taboos.md` into context (cached, refreshed when file mtime changes)
2. Receive proposed action: `{action_type, target, payload, requested_by}`
3. Return `{verdict: 'pass' | 'bounce', reason: string, matched_taboo: string?}`
4. Latency budget: under 2 seconds; otherwise pass-with-warning to avoid blocking the pipeline

### 10.3 Bounce routing

Bounced actions post to `#orchestrator-escalations` with:
- The action that was bounced
- The matched taboo
- The Taboo Keeper's reason
- A button to override (Kyle or Keenan only; logged in Elder continuity)

Override is rare and always logged. Three overrides for the same taboo within 30 days triggers an Analyst review proposing taboo edits.

## 11. Elder continuity and seven-generations

### 11.1 Continuity log

`MEMORY/elder/continuity.md` is append-only (each entry is a new section). Schema per entry:

```markdown
## 2026-05-05 — <commitment_title>
- **Type:** customer_promise | architectural_decision | public_statement | partnership | regulatory
- **Made_by:** Kyle | Keenan | both
- **Made_to:** <party>
- **Substance:** <one paragraph>
- **Evidence:** ledger://<uuid> | github://<commit> | slack://<thread> | obsidian://<doc>
- **Active_until:** YYYY-MM-DD | indefinite
- **Supersedes:** <prior_entry_anchor or none>
```

The Elder agent indexes this file in pgvector and queries on demand.

### 11.2 Seven-generations file

`MEMORY/seven_generations.md` is versioned (edited via PR, like taboos). Names:
- What we will not break (commitments to existing customers, contributors, teammates)
- Who is downstream of our decisions (named or categorical)
- What flows back (R3 contributor share architectural hooks, even before cap-table is decided)

### 11.3 Elder advisory contract

Inputs: `{decision_type, scope, summary}`
Outputs: `{flag: 'compatible' | 'conflict' | 'requires_explicit_override', relevant_commitments: [...], notes: string}`

Non-blocking. The Orchestrator and Cowork chats receive the advisory and proceed. If `requires_explicit_override`, the action is logged to continuity and Slack-notified.

### 11.4 Time-horizon checkpoint (lighter than the manifesto's full agent)

Any decision with `priority='irreversible'` triggers an explicit human review checkpoint in the verify gate (section 14). The Elder surfaces relevant prior commitments. No new dedicated time-horizon agent; the work is split between the Elder (continuity) and the verify gate (checkpoint).

## 12. Scheduled jobs on shared infrastructure

All schedules run on Vercel cron and Inngest. None run on per-user Cowork.

| Job | Schedule | Owner agent | Action |
|-----|----------|-------------|--------|
| Decay tick | Nightly 02:00 PT | Analyst | Decrement strength on signals and ledger rows; archive below threshold; mark `last_touched` if re-read in last 24h |
| Daily digest | Nightly 06:00 PT | Analyst | Yesterday across all surfaces (calls, Slack, email, commits, kanban moves) into Obsidian vault doc + post to `#orchestrator-feed` |
| Weekly memory consolidation | Sunday 22:00 PT | Analyst | Run productivity:memory-management consolidation skill across all `MEMORY/` directories; PR results |
| Daily Slack scan | 09:00 PT | Ingestor | Scan target channels for decisions, action items, blockers; ingest to ledger |
| Weekly retro | Friday 17:00 PT | Analyst | Sprint retro into Obsidian + post summary to `#orchestrator-feed` |
| Continuity audit | Monthly 1st | Elder | Re-read continuity log, flag commitments approaching `active_until`, propose updates |
| Taboo review | Quarterly | Analyst | Surface taboo overrides from prior 90 days, propose edits to register |
| Budget reset | Per agent budget period | Analyst | Reset agent budgets per agents.budget.period_days |

## 13. Kanban writer behavior

### 13.1 Trigger

When an action item lands in `action_items` table with `kanban_workspace` set, the kanban writer (an Inngest function) creates a Notion card in the corresponding kanban.

### 13.2 Mapping

| action_items field | Notion property |
|---------------------|-----------------|
| title | Card title |
| description | Card body |
| dri | Assignee (Notion person property) |
| due_at | Due date |
| priority | Priority select |
| status | Column (Not Yet Started, In Process, etc.) |
| break_off_reason | Comment thread on card |
| ledger_id | Card body link |

### 13.3 Status sync

- Action item `status` changes propagate to Notion column
- Notion column changes propagate back to action_items via Notion webhook
- Conflict: action_items wins (Supabase is source of truth)
- Verified column moves are human-only per existing kanban hygiene rules

### 13.4 Surface routing

- `kanban_workspace='pathfinder'` → Pathfinder Features Kanban
- `kanban_workspace='metacron'` → Metacron Features Kanban
- `kanban_workspace='internal'` → new Internal Org Kanban (created as part of this SPEC's first sprint)
- `kanban_workspace='sales'` → new Sales Kanban (or merge into Internal for now)

## 14. Verify gate

### 14.1 Promotion criteria

A card moves from `In Process` to `Deployed` only if:
1. Linked PR is merged
2. Multi-Vercel verification passes (Pathfinder and unicron-systems verified independently per existing rule)
3. Verbatim evidence section exists in PR description
4. Success metric defined before card entered In Process (Feltsense-derived rule)
5. Taboo Keeper passed on the diff
6. If `priority='irreversible'`, Elder advisory attached and human reviewer (Kyle or Keenan) has signed off

### 14.2 Promotion to Verified

Human-only. Kyle moves cards to Verified. No agent, no automation, no exception.

### 14.3 Bounce path

If criteria fail, card moves to Bug Fixes (not back to In Process) with the failure reason in card body. Analyst tracks bounce frequency per agent and surfaces drift weekly.

## 15. Action item schema with break-off

Already defined in section 5.2. Operational rules:

- DRI assignment: defaults to `default_kanban_surface` owner. Curtis never auto-assigned (advisory role). Ambiguous routes to Slack `#orchestrator-escalations` for human triage.
- Break-off: any participant can emit a `break_off_signal`. Status flips to `broken_off`. Routed to `requested_by`.
- TTL: 90 days default. After TTL, status flips to `archived` if not closed; ledger continues to reference it.
- Strength: re-touch on every status change extends TTL; perpetual touch implies the work is real and ongoing.

## 16. Bounded peer attention

### 16.1 Subscription rules

Each Cowork chat declares its peer subscriptions in its session-start memory load:

| Cowork chat | Watches |
|-------------|---------|
| Internal Org | Pathfinder, Metacron, Sales |
| Pathfinder | Internal Org, Metacron |
| Metacron | Internal Org, Pathfinder |
| Sales | Internal Org, Pathfinder |

Persistent agents declare similarly via `agents.config`:

```json
{
  "watches_agents": ["<agent_id>", "<agent_id>"],
  "watches_signal_topics": ["pathfinder.demo_polish", "metacron.architect"]
}
```

### 16.2 Implementation

- Cowork: at session start, read peer Cowork's last session-end summary from `MEMORY/cowork/<chat_name>/latest.md`
- Persistent agents: subscribe to Supabase Realtime channel filtered by `agents.config.watches_*`
- No global broadcast. No firehose. Each subscriber declares scope.

## 17. Multi-fork sprint contract

When a problem has multiple plausible approaches:

1. Sprint declares the scoring function before launch (success metric, judgment criteria, scoring agent or hard metric)
2. Cowork generates N parallel Claude Code prompts (default N=3)
3. Each prompt runs in its own worktree (per existing using-git-worktrees skill)
4. Each produces a candidate diff and a self-evaluation against the scoring function
5. Scoring agent (or hard metric) ranks candidates
6. Pruning rule: keep top K (default K=1), archive losers with reasons in `MEMORY/sprint_forks/`
7. Reinforcement: winning approach's pattern logged as a signal of type `PATTERN` in the signals table for future use

Slime mold pruning made operational. Default kicked in only when Cowork explicitly requests it; not every sprint forks.

## 18. Multi-tenant access control

### 18.1 Per-user identity

- Each team member has a Supabase user (auth.users) linked to their team_members.id
- Per-user Cowork authenticates via personal Supabase API key
- Persistent agents use service role
- Slack app uses bot token

### 18.2 RLS policies

- `ledger`, `action_items`, `signals`, `break_off_signals`: authenticated users can read all rows; can write rows where `created_by_human = auth.uid()`
- `team_members`, `agents`, `taboos`: read-all, write requires admin role (Kyle, Keenan)
- Service role bypasses RLS

### 18.3 Audit log

- `audit_log` table records every write to `agents`, `team_members`, `taboos`, and any RLS bypass
- Reviewed monthly by Analyst

## 19. Container tensions

The Unicron architecture imports parts of the seven-generations ethic and knowingly violates parts because of the venture-scale container Unicron is also operating in. This section names both lists honestly. It is not removed before publication.

### 19.1 Imports (built into structure)

- Decay on every artifact (memory, signals, action items)
- Refusal layer (Taboo Keeper) public and structural
- Continuity log (Elder) preserves prior commitments
- Break-off as structural consent for any participant
- Abstain and NO_SIGNAL as first-class outputs
- Bounded peer attention; no global broadcast
- Agent budgets that decay (R4)
- Architectural hooks for R3 (contributor share) even before cap-table is decided

### 19.2 Knowingly violated (because of the container)

- Rapid concentration of ownership (founder equity, exit-oriented growth)
- Network effects that may enclose commons (Pathfinder customer data, cross-pollination intelligence)
- 8-week and quarterly horizons that compress decision-making below the seven-generations band
- Per-customer data feeds that compound competitive moat rather than reverting to substrate

### 19.3 Open decisions (route to Kyle and Keenan, not this SPEC)

- R3 contributor share mechanics (cap-table, revenue share, smart contracts)
- R5 commons reversion (open-source the substrate decision)
- Restorative vertical filter (Pathfinder customer selection criterion)

## 20. Migration plan

Sequenced sprints, each shippable as one Claude Code dispatch. No time estimates per project memory.

### 20.1 Sprint 0 — Foundation

- Create `unicron-knowledge` GitHub repo, initialize as Obsidian vault, sync `Company Docs/` content
- Provision Supabase tables (ledger, action_items, signals, break_off_signals, team_members, agents, audit_log)
- Seed team_members and agents
- Write `MEMORY/taboos.md`, `MEMORY/seven_generations.md`, `MEMORY/elder/continuity.md` initial entries
- Wire Vercel `/api/ingest` endpoint and Inngest functions
- Done criteria: Cowork can write to ledger via MCP; vault is a working Obsidian project

### 20.2 Sprint 1 — Call ingest pipeline

- Implement `unicron-internal:ingest-call` skill
- Wire Plaud and Fathom webhooks to `/api/ingest`
- Implement Taboo Keeper validation step
- Wire kanban writer for action items into existing Pathfinder and Metacron kanbans plus a new Internal kanban
- Done criteria: a real Plaud recording results in a ledger row, vault doc, action items, and Notion cards without Kyle touching anything

### 20.3 Sprint 2 — Slack ingest and Orchestrator bot

- Implement `unicron-internal:ingest-slack-thread` skill on daily cron
- Build Orchestrator Slack app with DM and mention handlers
- Wire `#orchestrator-escalations`, `#orchestrator-feed`, per-surface action item channels
- Done criteria: DM the Orchestrator, get a parsed action item with kanban card and Slack reply

### 20.4 Sprint 3 — Persistent Analyst and Elder

- Build Analyst nightly cron (decay tick, digest, memory consolidation)
- Build Elder MCP RPC for continuity advisory
- Wire verify gate to consult Elder on irreversible cards
- Done criteria: nightly digest in `#orchestrator-feed`; Elder responds to a planning Cowork session with continuity advisory

### 20.5 Sprint 4 — Voice memo, Apple Notes, mobile capture

- iOS Shortcuts for voice memo (Whisper) and Apple Notes posting to `/api/ingest`
- Working Copy or Obsidian Sync setup for vault on iOS
- Done criteria: idea captured on iPhone shows up in vault and ledger within 5 minutes

### 20.6 Sprint 5 — Email ingest, multi-fork sprint contract, full bounded peer attention

- Implement `unicron-internal:ingest-email`
- Formalize multi-fork sprint pattern as a Cowork skill
- Wire all Cowork peer subscriptions per section 16
- Done criteria: full nervous system operational; every Cowork session starts with peer state load and ends with substrate write

## 21. Steady-state weekly cadence (preview of design deliverable 5)

A representative week once the system is operational:

**Monday morning.** Kyle DM's Orchestrator: "Frame the Realberry discovery call this Wednesday." Orchestrator runs through Taboo Keeper (pass), pulls last week's ledger entries on Realberry from semantic search, queries Elder for prior commitments (none), generates a discovery prep doc in vault, files an action item with DRI=Kyle and due=Wednesday morning, posts summary in DM.

**Monday afternoon.** Keenan has a discovery call with a warm contact. Plaud records. Webhook fires `/api/ingest`. Ingest skill produces ledger row, vault doc, three action items (one for Keenan to follow up, two for Kyle to evaluate). Taboo Keeper passes. Notion cards land in Internal kanban with DRIs. Slack summary posts in `#discovery`.

**Tuesday.** Pathfinder Cowork chat starts. Reads its peer subscriptions (Internal Org's session-end summary, Metacron's). Sees Keenan's call from yesterday surfaced an opportunity. Drafts a paste-ready Claude Code prompt for a Pathfinder feature. Generates the prompt, Kyle pastes, Claude Code runs, PR opens. Kanban auto-updates In Process to Deployed when PR merges and verify gate passes. Card sits in Deployed awaiting Kyle's Verified review.

**Wednesday.** Realberry call happens. Same ingest path. Two action items for Kyle. One for Keenan.

**Thursday.** Analyst nightly job posted yesterday's digest in `#orchestrator-feed`. Kyle reads on his phone, sees three open action items missing DRIs flagged. He DM's Orchestrator: "Reassign these three: A to Keenan, B drop, C to me." Done.

**Friday.** Weekly retro from Analyst lands in vault and `#orchestrator-feed`. Includes: which signals reinforced, which decayed, which taboo overrides happened (zero this week), which DRIs are over-allocated, which action items broke off and where they routed.

**Sunday night.** Memory consolidation runs. PRs land for review Monday morning. Analyst proposes one taboo edit based on three overrides observed the prior month.

Human work that happened: discovery calls, judgment on Verified promotion, two reassignments via Slack, taboo edit review.

Human work that didn't happen: pasting Plaud transcripts into Notion, manually creating kanban cards, hand-curating memory, deciding which Cowork chat needs to know what.

## 22. Done criteria for the SPEC build

This SPEC is considered shipped when:

1. All seven sprint sections (20.1 through 20.6 plus this SPEC itself) are complete
2. A real meeting recording results in zero manual Kyle hand-offs from raw audio to kanban card
3. Two team members can both write to and read from the ledger via their personal Cowork instances
4. The Orchestrator answers a Slack DM with a generated paste-ready Claude Code prompt that includes kanban hygiene
5. Taboo Keeper has bounced at least one real action and routed correctly to escalations
6. Elder has produced at least one continuity advisory on a real planning session
7. Decay tick has archived at least one stale signal
8. Container tensions section is read and acknowledged by both Kyle and Keenan, in writing in the Elder continuity log

## 23. Resolved decisions

1. **Curtis Smith** seeded as advisor in `team_members`. Email TBD; SPEC will not block sprint 0 on this.
2. **Internal kanban**: new Notion database created at the existing "Nervous System" page (https://www.notion.so/futuroso/Nervous-System-358785c67e72801a823ac7860c420af8). Schema delivered as a separate Notion AI prompt; Kyle pastes to provision.
3. **iOS path**: Slack DM to Orchestrator is the primary mobile capture. No git client required on phone. Power-user iOS markdown editing is optional and not in critical path.
4. **Slack app**: custom workspace app (not MCP-with-bot-user). Polished surface for the Orchestrator. Sprint 2 builds it.
5. **R3 architectural hooks**: `reciprocity_hooks jsonb default '{}'::jsonb` column on both `team_members` and `agents`. Empty by default. Carries placeholder shape `{contributor_share_pct, share_target, share_basis, active}` so the schema is forward-compatible without committing cap-table mechanics today.

End SPEC v0.1.
