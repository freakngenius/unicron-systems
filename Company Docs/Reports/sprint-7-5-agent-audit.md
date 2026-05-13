# Sprint 7.5 — Agent Reification Audit

**Date:** 2026-05-13
**Sprint:** 7.5 — Agent Cockpit + Reify Stub Agents
**Scope:** Phase 2 of the sprint. For every row in `nervous_system.agents`, classify the implementation as **real**, **stub-missing-handler**, or **stub-synthetic-output**, and define a reification plan for any stub.

## Method

1. Enumerate every row in `nervous_system.agents` (production Supabase project `anfihcusvekpovcchpoh`).
2. For each agent, locate the Inngest handler in `unicron-platform/lib/agents/inngest-fns.ts` by `archetype` and `event:` declaration.
3. Read the handler body and its delegated module under `unicron-platform/lib/agents/*.ts`.
4. Classify against the stub-detection rubric:
   - **stub-missing-handler** — no Inngest function or module file exists.
   - **stub-synthetic-output** — output is hardcoded, contains TODO comments, returns sample data, or short-circuits before consuming declared data sources.
   - **real** — handler consumes declared data sources, produces output to its declared sink, matches its registered role.

## Population

```sql
SELECT id, name, archetype FROM nervous_system.agents ORDER BY name;
```

| Name         | Archetype     | id (uuid)                              |
|--------------|---------------|----------------------------------------|
| Analyst      | analyst       | `c02f1193-5bf5-4629-9179-302079095917` |
| Elder        | elder         | `7ca4baa7-f6bb-47bd-a0b4-9ad25e3b6b5c` |
| Orchestrator | orchestrator  | `9696088f-b3c5-4536-a4c6-c7a40312ad6b` |
| Taboo Keeper | taboo_keeper  | `f42936af-a572-40b7-b327-ab428e3b6fd8` |

The fleet has four registered agents. The eight design-fiction agents rendered in the Atrium Galaxy (`src/atrium/system/AgentsGalaxy.tsx:39-48`) are explicitly demo-flagged and not registered in `nervous_system.agents`; they are out of scope for reification.

## Per-agent verdict

### 1. Orchestrator — REAL

- **Handler:** `inngest-fns.ts:30` `orchestratorRun` on event `orchestrator/run`.
- **Module:** `lib/agents/orchestrator.ts` (787 lines).
- **Evidence of real behavior:**
  - Full Anthropic tool-use loop (`Anthropic.messages.create` with 10 tool definitions: `semantic_search`, `get_team_member`, `list_action_items`, `create_action_item`, `get_recent_calls`, `query_ledger`, `reassign_dri`, `get_kanban_cards`, `send_slack_message`, `dispatch_claude_code`). Iterates up to 5 turns per turn (`orchestrator.ts:88` `MAX_TOOL_ITERATIONS = 5`).
  - Consumes declared data sources: real Supabase queries against `nervous_system.action_items`, `nervous_system.ledger`, `nervous_system.customers`, `nervous_system.sprint_runs`, `nervous_system.audit_log`.
  - Writes to declared sinks: `writeAgentMemory()` against `nervous_system.ledger`; `send_slack_message` against the Slack Web API; `logToolDispatch()` against `nervous_system.autonomous_dispatch_log`.
  - Pre-validates every state-mutating tool through the Taboo Keeper (system prompt §4 + `SAFE_AUTONOMOUS_TOOLS` whitelist at `orchestrator.ts:28`).
- **Verdict:** real. No reification needed.

### 2. Analyst — REAL

- **Handlers:** `analystRun` on event `analyst/run` (`inngest-fns.ts:62`), plus four cron variants (`analyst-nightly` 05:00 ET, `analyst-weekly`, `analyst-monthly`, `analyst-quarterly` per recent retiming in Sprint 7 Stream A and the usefulness pass).
- **Module:** `lib/agents/analyst.ts` (1,088 lines).
- **Evidence of real behavior:**
  - Reads from real upstream data: `nervous_system.signals`, `ledger`, `action_items`, `agents`, `audit_log` (per file header §3-7).
  - Writes to vault via GitHub Contents API: `vaultRead`/`vaultWrite` against `freakngenius/unicron-knowledge` (`analyst.ts:46-93`). Produces `wiki/memory/analyst/YYYY-MM-DD.md`, `wiki/retros/YYYY-WW.md`, etc.
  - Posts to Slack via `chat.postMessage` (`analyst.ts:27-44`, requires `SLACK_ORCHESTRATOR_BOT_TOKEN`). Channel `#orchestrator-feed` per the Sprint 3 seed-skills `outputs_schema`.
  - Decay tick + daily/weekly/monthly/quarterly digests are real implementations, not TODOs.
- **Verdict:** real. No reification needed.

### 3. Elder — REAL

- **Handler:** `elderRun` on event `elder/run` (`inngest-fns.ts:172-183`), invokes `elderAdvise()` from `lib/agents/elder.ts`.
- **Module:** `lib/agents/elder.ts` (178 lines).
- **Live evidence:** A production smoke earlier in this session (Sprint 3 unblock — see `audit_log` row `cb5902ca-3415-4d89-b27b-cb7fd9b73f52`) called `POST https://atrium.unicron.systems/api/atrium/elder-advise` with body `{"decision_type":"tactical","scope":"test","summary":"test"}` and received HTTP 200 with body `{"flag":"compatible","relevant_commitments":[],"notes":"…"}`.
- **Evidence of real behavior:**
  - Reads continuity log + seven-generations file from the vault (`elder.ts:65-68`, repo `freakngenius/unicron-knowledge`, paths `wiki/memory/elder/continuity.md` and `wiki/memory/elder/seven-generations.md`).
  - Invokes Anthropic with a real system prompt that includes the fetched continuity context (`elder.ts:70+`).
  - Returns `{ flag, relevant_commitments, notes }` derived from the LLM JSON output — not hardcoded.
- **Verdict:** real. No reification needed.

### 4. Taboo Keeper — REAL

- **Handlers (two paths):**
  - **Rule-table path (primary, used by every API write):** `public.ns_check_taboo(p_action, p_target, p_actor, p_context)` SECURITY DEFINER function. Backed by `nervous_system.taboo_rules`. Migration `20260512054759_create_ns_check_taboo_and_taboo_rules.sql` + `20260512054838_fix_ns_check_taboo_unconditional_block.sql`. Confirmed via Sprint 3 unblock (`audit_log` row `cb5902ca-3415-4d89-b27b-cb7fd9b73f52`).
  - **Anthropic-Haiku-fallback path (auxiliary, used by free-text intents):** `tabooKeeperRun` on event `taboo-keeper/validate` (`inngest-fns.ts:200-225`). Invokes `claude-haiku-4-5` with intent + taboos strings, returns `{verdict, reason}` JSON.
- **Evidence of real behavior:**
  - Multiple production endpoints route through `ns_check_taboo` before mutating state: `api/atrium/decay-heatmap.ts:71-94` (POST topic.archive) and `api/atrium/agents/[id].ts:84-126` (this sprint's PATCH agent.cockpit.patch).
  - Refusals append to `nervous_system.audit_log` via the `ns_log_agent_refusal` RPC introduced this sprint.
- **Verdict:** real. No reification needed.

## Summary

```text
Total agents in nervous_system.agents : 4
Real                                  : 4 (Orchestrator, Analyst, Elder, Taboo Keeper)
Stub — missing handler                : 0
Stub — synthetic output               : 0
```

**Reification work needed this sprint: zero.**

## Recommendation

Phase 2 ships as-is. The audit confirms every registered agent has a real Inngest handler that consumes declared data sources and produces output to declared sinks. The eight design-fiction agents rendered in the Galaxy as `demo=true` (Pathfinder, Curator, Researcher, Trend Scout, Pipe Hunter, Architect, Boundary, Janitor) are scheduled for Sprints 6 and 7 per `AgentsGalaxy.tsx:39-48` and become reification candidates only after they are seeded into `nervous_system.agents` as live rows.

When that happens, this audit script should be re-run with the same rubric. Until then, the reification queue is empty.

## Audit script (for re-run)

```bash
# Snapshot the agents table
psql "$DATABASE_URL" -c "SELECT id, name, archetype, last_run_synthetic FROM nervous_system.agents ORDER BY name;"

# For each agent, grep inngest-fns.ts for archetype-matching handler
grep -n "createFunction" unicron-platform/lib/agents/inngest-fns.ts

# Inspect handler body in unicron-platform/lib/agents/<archetype>.ts
# Apply the rubric: TODO / hardcoded / sample data / short-circuit → stub.
```
