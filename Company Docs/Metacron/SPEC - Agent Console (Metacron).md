# SPEC — Agent Console (Metacron)

Status: Draft v0.1 (rewritten 2026-05-02 after data loss)
Owner: Kyle (Kēkā)
Authored by: Pathfinder Cowork chat
For execution by: Metacron Cowork chat
Related: `SPEC - Cross-Pollination Engine.md`, `MEMORY/audit-unicron-platform.md`

---

## 1. Why this exists

Dodge Construction Network has 636K+ projects tracked annually because they employ 400+ field specialists who physically call planning offices, scrape portals, maintain industry contacts. Their moat is human labor at scale.

Pathfinder's moat is doing that with agents. We've already shipped: Architect, Source Onboarder, Coverage Expansion, Enricher, Verifier, Ranker, Cross-Pollination, Outreach Drafter, Briefer. What we don't yet have is the operator-facing surface that makes these agents:

- Easy to dispatch with a goal
- Transparent in their work (live reasoning, intermediate results, tool calls visible)
- Reviewable on completion (operator marks verified before output flows to customer)
- Queryable historically (tile-based work log per agent)
- Composable (one agent's verified output feeds the next)

The Agent Console is that surface. It lives in Metacron. It's the operator's command center for running the system that runs Pathfinder.

Strategic framing: this is what replaces Dodge. Customers see Pathfinder; operators see this. Both are required for the "we don't need 400 people" pitch.

## 2. Vision

Each agent is a first-class citizen in Metacron with its own modal interface tuned to that agent's role:

1. **Per-agent identity.** Each agent has a name, role description, icon/avatar, and personality reflected in the UX. Architect's modal feels like a planning desk; Source Onboarder's like an investigation board; Coverage Expansion's like a goal-setting dashboard.

2. **Live execution transparency.** When an agent is running, the operator sees its reasoning chain, current tool call, partial outputs, and decision points in real time. Streamed via Supabase Realtime.

3. **Verified completion handoff.** Agent execution always ends in a "review and verify" state. Operator inspects, marks verified (or rejects with feedback), and the verified output is committed to the production-data path that customer Pathfinder reads.

## 3. Agents in scope

**Phase 1** (most operator-touched):
- Coverage Expansion Agent — goal-driven source discovery. Highest demo value.
- Source Onboarder — adapter generation. Tier 1 autonomous; Tier 2 surfaces for operator help.
- Architect — decomposition (new vertical), tuning (weekly per-org), discovery (new sources).
- Cross-Pollination Engine — match leads to existing customer relationships.

**Phase 2** (background agents that benefit from console for debugging):
- Enricher — Perplexity-based research per top lead.
- Verifier — multi-pass quality gates.
- Ranker — scoring weights tuning.
- Outreach Drafter — draft generation.
- Briefer — Friday weekly brief.

**Phase 3** (later):
- AdjacencyMapper, GeoMapper
- Conductor (when productized, becomes meta-agent supervisor)

## 4. Common UX pattern

Every agent modal follows this shape:

### Header
- Agent icon + name + one-line role description
- Status pill: idle / running / awaiting-review / completed / failed
- Cost-to-date counter (per-agent llm_calls aggregation)
- Recent runs count (last 7d)

### Input panel (top)
Role-specific input form per agent.

### Live execution panel (middle, when running)
- Streaming activity log: tool calls, intermediate outputs, reasoning steps
- Current step indicator
- Cost ticker
- Cancel button

### Result panel (bottom, when completed)
- Structured output specific to the agent
- Verify / Reject buttons
- "Verify with edits" path for partial accept
- Diff against previous run

### Tile-based history grid (right or below modal)
- Each completed run is a tile (timestamp, summary, status, cost, verification state)
- Click tile → reload that run for inspection or replay
- Sort/filter by date, status, cost, verification

## 5. Per-agent UX specifics

### 5.1 Coverage Expansion Agent — "the goal-setting desk"

**Input:** vertical, geography (map picker + radius slider), target lead count, signal keywords, lookback window, budget cap.

**Live:** Architect's discovery output streaming as candidate sources with name/type (Tier 1/2)/confidence/expected lift/status. Map visualization showing where candidates sit geographically.

**Result:** final source list. Tier 1 onboarded auto-verified by Source Onboarder. Tier 2 queued for operator review. Lead pool delta shown. Commit-to-production button.

### 5.2 Source Onboarder — "the investigation board"

**Input:** source URL or candidate description, source type hint, owner/jurisdiction, test flag.

**Live:** investigation steps streamed ("Fetching robots.txt → identifying schema → generating adapter → testing first event → committing"). Adapter code preview live. First sample event preview.

**Result:** generated adapter code (read-only with edit option), first-N sample events, onboarded vs Tier-2 escalated decision with reasoning, commit button.

### 5.3 Architect — "the planning desk" (three sub-modes)

**Mode A: Decomposition** (new vertical/customer)
- Input: buyer pain prompt
- Live: Architect's reasoning chain visible
- Result: structured architecture proposal (agents needed, sources, scoring weights, success criteria)
- Verify spawns dependent jobs

**Mode B: Tuning** (weekly per-org)
- Input: org_id, lookback window
- Result: list of proposed weight updates with confidence
- Verify approves each individually or batch

**Mode C: Discovery** (continuous source finding)
- Input: vertical_id, geographic focus
- Result: ranked source candidates feeding Coverage Expansion or operator inbox

### 5.4 Cross-Pollination Engine — "the relationship matcher"

**Input:** lead ID(s), match confidence threshold, customer corpus.

**Live:** each candidate match — entity, layer, confidence, existing relationship metadata.

**Result:** matches sorted by confidence. Operator reviews ambiguous (0.7-0.9). High-confidence auto-verified.

### 5.5 Enricher — "the researcher"

**Input:** lead ID(s), enrichment scope.
**Live:** Perplexity search progress, citations gathering.
**Result:** enriched data structured by category, citations linked, operator approves before overwriting.

### 5.6 Verifier — "the quality gate"

**Input:** lead ID/batch, which checks to run.
**Live:** each check streaming pass/fail with reasoning.
**Result:** N-of-4 status, per-check rationale, operator override option.

### 5.7 Ranker — "the scoring desk"

**Input:** lead ID/batch, override scoring weights.
**Live:** component scores calculated live.
**Result:** score breakdown, compare to previous run, adjust weights inline + re-run.

### 5.8 Outreach Drafter — "the writer"

**Input:** lead ID, voice override, length/tone sliders.
**Live:** draft generation streaming token-by-token.
**Result:** draft with edit-in-place, save as customer voice template, send via connector or save draft.

### 5.9 Briefer — "the editor"

**Input:** org_id, time window.
**Live:** draft assembling.
**Result:** full brief preview, edit before send, approve → email/Slack/Teams dispatch.

## 6. Verified completion handoff

Three states:

**Auto-verified** — agent's confidence high, no review needed (e.g., Tier 1 onboard with all tests passing). Commits to production with audit log.

**Operator-verified** — operator clicks Verify. Commits to production. Operator identity captured.

**Rejected** — operator rejects with feedback. Queued for next dispatch with rejection as input. Architect tuning reads rejection feedback to refine.

The Verify button is the explicit Living System bridge: operator's verified work IS what flows to Pathfinder customer view. Without verification, results sit in Metacron staging only.

## 7. Living System integration with Pathfinder

Customer-facing Pathfinder UI shows:
- Agent activity ticker (live, anonymized): "Coverage Expansion just added 3 new sources for your region..."
- Agent attribution per lead: "Score 92 — verified by Architect's tuning, last updated 2026-05-08"
- Operator-curated content distinct from auto-generated content (badge)

When operator marks Verified in Metacron, `pathfinder.agent_verifications` row written. Pathfinder customer dashboard subscribes via Supabase Realtime to surface the verification.

Demo moment: open Metacron + Pathfinder side by side. Run Coverage Expansion goal in Metacron. Watch Pathfinder's activity ticker reflect it.

## 8. Schema additions

```sql
create table unicron.agent_dispatches (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  customer_org_id text not null,
  dispatched_by_user_id uuid references auth.users(id),
  input_payload jsonb not null,
  status text not null check (status in ('queued', 'running', 'awaiting_review', 'verified', 'rejected', 'failed')),
  result_payload jsonb,
  rejection_reason text,
  verified_by_user_id uuid references auth.users(id),
  verified_at timestamptz,
  cost_usd numeric(10,6),
  duration_ms integer,
  agent_run_id uuid references pathfinder.agent_runs(id),
  parent_dispatch_id uuid references unicron.agent_dispatches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table unicron.agent_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid references unicron.agent_dispatches(id) on delete cascade,
  event_type text not null check (event_type in ('reasoning', 'tool_call', 'tool_result', 'partial_output', 'decision', 'error')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table pathfinder.agent_verifications (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null,
  customer_org_id text not null,
  agent_name text not null,
  affected_entity_type text,
  affected_entity_id uuid,
  verified_by_user_id uuid references auth.users(id),
  verified_at timestamptz not null default now(),
  summary text
);
```

## 9. UI architecture

Metacron route: `/agents` (or `/console`)

```
/agents
├── /agents/coverage-expansion
├── /agents/source-onboarder
├── /agents/architect
├── /agents/cross-pollination
├── /agents/enricher
├── /agents/verifier
├── /agents/ranker
├── /agents/outreach-drafter
└── /agents/briefer
```

Each route renders a modal with role-specific UI. Modal can also open as drawer on the existing Living Intelligence visualizer via deep link.

Components:
- `AgentModalShell` — common header/footer
- `AgentInputForm` — role-specific input
- `AgentLiveExecution` — Supabase Realtime subscription on `agent_dispatch_events`
- `AgentResult` — role-specific result rendering with verify/reject
- `AgentHistoryGrid` — tile-based history with filter/sort
- `AgentTile` — individual history tile

## 10. Build sequence

**Phase 1** (foundation + first 4 agents):
- Schema migrations
- Common modal shell + history grid components
- Coverage Expansion modal
- Source Onboarder modal
- Architect modal (3 sub-modes)
- Cross-Pollination modal
- Living System bridge

**Phase 2** (remaining agents + polish):
- Enricher, Verifier, Ranker, Outreach Drafter, Briefer modals
- Per-agent personality (icons, color, copy)
- Agent-to-agent composition

**Phase 3** (advanced):
- Conductor agent modal
- Custom agent definition UI
- Agent marketplace

## 11. Open questions

- Verified results emit Slack/Teams pings to customer's connector? Lean: yes, opt-in per agent.
- Verification expiry for stale results? Lean: yes, configurable per agent.
- Multi-operator coordination on simultaneous dispatch? Lean: queue with visible "X is currently running this".
- Cron-driven agent runs auto-show in console? Lean: yes, with "auto-dispatched" flag.
- Cost-cap UX for operators? Lean: visible to operator, adjustable by admin only.

## 12. Demo moment for Tuesday

If Phase 1 ships in time:

Open Metacron + Pathfinder side by side.

In Metacron `/agents/coverage-expansion`:
- Input: Pittsburgh, 50 leads, construction-security
- Click Dispatch
- Watch live: Architect discovers 8 sources, Source Onboarder onboards 2 in 90 seconds, 6 queued for Tier 2

In Pathfinder (Zedcor view):
- Activity ticker: "Pathfinder is expanding coverage in Pittsburgh — 2 new sources connected, 6 under review"
- After 90 seconds, new leads appear in Pittsburgh branch view

Operator (Kyle) clicks Verify in Metacron → audit log → Pathfinder activity ticker confirms.

That's the "we don't need 400 people" moment.

## 13. Next steps

1. Sister Metacron Cowork chat picks up this spec
2. Triages against current Metacron Kanban (likely adds 9-12 new feature cards)
3. Generates a Phase 1 implementation prompt for Claude Code
4. Coordinates with Pathfinder chat on the cross-schema verification bridge

Coordination request to Pathfinder chat: when Metacron implements `pathfinder.agent_verifications` migration + activity ticker, Pathfinder chat reviews and ships the customer-facing surface. Surface as `MEMORY/operator-todos/2026-05-XX-pathfinder-needs-verification-ticker.md`.
