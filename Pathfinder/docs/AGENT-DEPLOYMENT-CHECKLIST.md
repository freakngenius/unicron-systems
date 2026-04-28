# Pathfinder Agent Deployment Checklist

**Audience:** Kyle (operator). Paste-and-click runbook for deploying each Computer prompt into a Perplexity Space.
**Pairs with:** `prompts/computer-*.md` (one prompt file per agent), `docs/PLAN-AGENTS.md`.
**Updated:** 2026-04-28.

The full Pathfinder fleet is 10 agents. Two are already live (Ingestor, Ranker). One is deployed but silent until Layer 1 verifies the dashboard wiring (Adjacent). Seven are authored and deployed by Layers 1–3.

This checklist is two parts. Part A is the generic 7-step flow Kyle runs once per prompt. Part B is the per-agent specifics (schedule, MCPs, output tables, model) so Kyle doesn't have to re-read every prompt to wire each Space.

---

## Part A — Generic 7-step deployment flow

For each agent, run these in order. Each step is a single click or a paste action.

### Step 1 — Create the Perplexity Space

1. Open Perplexity Computer → Spaces → **New Space**.
2. Name it exactly: `Pathfinder · <Agent Name>` (e.g. `Pathfinder · Adjacent Discovery`). Naming convention is shared across the fleet so Spaces sort together.
3. Description: copy the first paragraph of the prompt's `## Frame` section.

### Step 2 — Paste the system prompt

1. Open `prompts/computer-<agent>.md` in the Pathfinder repo.
2. Copy the **entire file contents** (including the `# <Agent Name> — Perplexity Computer System Prompt` header — the model uses it for self-identification).
3. Paste into the Space's **System Prompt** field. Save.

### Step 3 — Set the schedule

1. Space settings → **Schedule** → set to the cron value listed in the prompt's `## Schedule` section.
2. Confirm timezone is **UTC** (Perplexity defaults to UTC; verify the cell shows "UTC" not your local TZ).
3. The dashboard reads the schedule from the prompt and renders `next run <day> <time> utc` on the Agent Status cell — if the cron in Perplexity differs from the cron in the prompt, the dashboard label will lie. Keep them in sync.

### Step 4 — Grant MCP scopes

Per agent, grant the MCPs listed in Part B. For every agent, **Supabase MCP scope must be `schema = pathfinder`** (not `public`, not `*`). The Supabase project ID is `anfihcusvekpovcchpoh`.

For each MCP grant:

1. Space settings → **MCPs** → **+ Add**.
2. Pick the MCP from the dropdown. Authorize if prompted.
3. **Scope** field: enter the table list from Part B (e.g. `pathfinder.adjacent_targets, pathfinder.agent_log, pathfinder.agent_runs`).
4. Save.

If an MCP is unavailable in your tier, the prompt's Error Handling section names a fallback (browser automation or alt MCP). Fall back rather than skipping the grant — the prompt expects the MCP to be present.

### Step 5 — Pin the model

1. Space settings → **Models**.
2. Set the **default model** to the one listed in Part B (Sonnet for most, Opus only for Briefing).
3. The prompt may invoke other tiers internally (e.g. Ranker triages with `gpt-oss-20b` then routes to Sonnet) — this is the prompt's job, not yours. The default-model setting is just the fallback.

### Step 6 — Run once manually

1. Space → **Run now** button.
2. Watch the run log. Confirm:
   - The agent reads its inputs without an MCP-scope error.
   - It writes at least one row to its primary output table.
   - It closes the `pathfinder.agent_runs` row with `status = 'success'` (run `select * from pathfinder.agent_runs where agent_name='<agent>' order by started_at desc limit 1` in Supabase SQL editor — `status` should be `success`, not `running`).
3. If the run fails, the failure mode is in the prompt's `## Error Handling` section. Read the `error_message` from `agent_runs` and the latest `error` row in `pathfinder.agent_log` for that agent — they spell out the cause.

### Step 7 — Verify on the dashboard

1. Open `https://<deployed-host>/pathfinder` (or `localhost:3000/pathfinder` for local dev).
2. The **Agent Status row** should show the agent's cell with a recent `started_at` and `next run` label.
3. The **Activity Rail** (bottom-right tail) should show new lines tagged `computer/<agent> → ...` matching the sample lines in the prompt's `## Logging` section.
4. For agents with a dedicated panel (Outreach, Pulse, Competitive, Briefing, Customer-Intel, Eval), open the panel and confirm at least one row renders.

If steps 1–6 succeed but step 7 fails, the bug is in the dashboard wiring (Subagent territory), not in Perplexity. File it.

---

## Part B — Per-agent specifics

All 10 agents in the fleet. Schedules, MCP scopes, output tables, and pinned models. **Bold** rows are not yet deployed at the time of writing (`computer-verifier.md` exists per Layer 1; the rest land in Layers 2–3).

### 1. Ingestor (LIVE)

- **Prompt file:** `prompts/computer-ingestor.md`
- **Schedule:** every 6 hours · cron `0 */6 * * *` UTC
- **MCPs:**
  - **Supabase** · scope `pathfinder.branches, pathfinder.customers, pathfinder.projects, pathfinder.agent_log, pathfinder.agent_runs`
  - **HTTP fetch** (built-in) · for USAspending and SAM.gov APIs
  - **Web search + RSS** (built-in) · for Google News
  - **Browser automation** (built-in) · for Harris County permits portal
  - **Geocoder:** local default; Mapbox fallback
- **Output tables:** writes `pathfinder.projects`, `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** classifier-cheap default (Computer routes; no pinned model required)

### 2. Ranker (LIVE)

- **Prompt file:** `prompts/computer-ranker.md`
- **Schedule:** every 30 min · cron `*/30 * * * *` UTC · also realtime-triggered on `pathfinder.projects` insert with `score IS NULL`
- **MCPs:**
  - **Supabase** · scope `pathfinder.projects, pathfinder.branches, pathfinder.customers, pathfinder.agent_log, pathfinder.agent_runs, pathfinder.ranking_config` (the last is added in Layer 2 migration `0006`)
  - **Anthropic API** · for Claude Sonnet rationale calls
  - **Multi-model router** (built-in) · for triage (`gpt-oss-20b` or `claude-haiku`) and rationale (`claude-sonnet`)
- **Output tables:** updates `pathfinder.projects` (UPDATE only), writes `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet` (rationale step); `gpt-oss-20b` / `claude-haiku` (triage)
- **Inner prompt:** `prompts/claude-ranking-rationale.md` — Computer loads this verbatim as the inner system message for Sonnet calls

### 3. Adjacent (DEPLOYED, LAYER 1 AUDIT)

- **Prompt file:** `prompts/computer-adjacent.md`
- **Schedule:** weekly, Friday 09:00 UTC · cron `0 9 * * 5`
- **MCPs:**
  - **Supabase** · scope `pathfinder.adjacent_targets, pathfinder.branches, pathfinder.agent_log, pathfinder.agent_runs`
  - **Web search + browse** (built-in) · for company discovery
  - **Anthropic API** · for Claude Sonnet outreach drafting
- **Output tables:** writes `pathfinder.adjacent_targets`, `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet` (outreach drafting only); cheapest viable default for bulk research

### 4. Verifier (LAYER 1 — NEW)

- **Prompt file:** `prompts/computer-verifier.md`
- **Schedule:** every 15 min · cron `*/15 * * * *` UTC · realtime-triggered on `pathfinder.projects` update where `score IS NOT NULL AND verified IS NULL`
- **MCPs:**
  - **Supabase** · scope `pathfinder.projects, pathfinder.branches, pathfinder.customers, pathfinder.agent_log, pathfinder.agent_runs`
  - **Anthropic API** · for Claude Sonnet verification pass
- **Output tables:** updates `pathfinder.projects` (`verified`, `verifier_notes`, `verifier_pass_count` columns added in Layer 1 migration `0005`); writes `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet`

### 5. Outreach (LAYER 2 — NEW)

- **Prompt file:** `prompts/computer-outreach.md`
- **Schedule:** event-driven on `pathfinder.projects` rows where `verified = true AND id NOT IN outreach_drafts.project_id`
- **MCPs:**
  - **Supabase** · scope `pathfinder.projects, pathfinder.customers, pathfinder.outreach_drafts, pathfinder.agent_log, pathfinder.agent_runs`
  - **LinkedIn MCP** · contact lookup; fallback to **browser automation** if LinkedIn MCP unavailable
  - **Anthropic API** · for Claude Sonnet draft generation
- **Output tables:** writes `pathfinder.outreach_drafts`, `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet`

### 6. Pulse (LAYER 2 — NEW)

- **Prompt file:** `prompts/computer-pulse.md`
- **Schedule:** weekly, Sunday 12:00 UTC · cron `0 12 * * 0`
- **MCPs:**
  - **Supabase** · scope `pathfinder.projects, pathfinder.agent_log, pathfinder.agent_runs, pathfinder.ranking_config, pathfinder.tuning_proposals`
  - **HubSpot MCP** · pipeline outcome data (rep activity, deal close/loss); fallback: skip pipeline check, log `error` with `event_data.reason = 'hubspot_unavailable'`
  - **Anthropic API** · Claude Sonnet for proposal drafting
- **Output tables:** writes `pathfinder.tuning_proposals`, `pathfinder.agent_log`, `pathfinder.agent_runs`. Reads `pathfinder.ranking_config` for current weights. Approval (POST from dashboard) writes a new `ranking_config` row.
- **Model:** `claude-sonnet`

### 7. Competitive (LAYER 2 — NEW)

- **Prompt file:** `prompts/computer-competitive.md`
- **Schedule:** weekly, Wednesday 14:00 UTC · cron `0 14 * * 3`
- **MCPs:**
  - **Supabase** · scope `pathfinder.competitive_signals, pathfinder.branches, pathfinder.agent_log, pathfinder.agent_runs`
  - **Web search + browse** (built-in) · public RFP awards, news, contractor board filings
  - **Anthropic API** · Claude Sonnet for trend synthesis
- **Output tables:** writes `pathfinder.competitive_signals`, `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet`

### 8. Briefing (LAYER 3 — NEW)

- **Prompt file:** `prompts/computer-briefing.md`
- **Schedule:** weekdays, 06:00 UTC · cron `0 6 * * 1-5` (org brief Monday; branch briefs Tue–Fri rotating)
- **MCPs:**
  - **Supabase** · scope `pathfinder.briefings, pathfinder.projects, pathfinder.outreach_drafts, pathfinder.competitive_signals, pathfinder.customer_signals, pathfinder.eval_runs, pathfinder.branches, pathfinder.customers, pathfinder.agent_log, pathfinder.agent_runs`
  - **HubSpot MCP** · pipeline state; fallback: brief omits pipeline section, logs warning
  - **Slack MCP** · post to channel `C0B07HEK6M9` (https://unicronsystems.slack.com/archives/C0B07HEK6M9). Fallback: email via Resend if Slack MCP unavailable.
  - **Email MCP** (Gmail/Resend) · send to `kyle@demystified.ai`
  - **Anthropic API** · Claude **Opus** for the synthesis pass
- **Output tables:** writes `pathfinder.briefings` (with `delivered_at`, `recipients`), `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-opus` ← only Opus user in the fleet; the visible cost differentiation in `ModelRoutingStrip` is intentional
- **Delivery:** **both channels every run** — Slack `C0B07HEK6M9` AND email `kyle@demystified.ai`. Per Decision 10.3 in PLAN-AGENTS.md, both are required, not a fallback chain.

### 9. Customer-Intel (LAYER 3 — NEW)

- **Prompt file:** `prompts/computer-customer-intel.md`
- **Schedule:** daily, 11:00 UTC · cron `0 11 * * *`
- **MCPs:**
  - **Supabase** · scope `pathfinder.customer_signals, pathfinder.customers, pathfinder.agent_log, pathfinder.agent_runs`
  - **Web search + browse** (built-in) · for press, filings, hiring boards
  - **Anthropic API** · Claude Sonnet for opportunity inference
- **Output tables:** writes `pathfinder.customer_signals`, `pathfinder.agent_log`, `pathfinder.agent_runs`
- **Model:** `claude-sonnet`
- **Privacy:** customer names must NOT appear in `agent_log.event_data` — log `customer_id` only. The dashboard joins on `customer_id` to render the name client-side.

### 10. Eval (LAYER 3 — NEW)

- **Prompt file:** `prompts/computer-eval.md`
- **Schedule:** weekly, Saturday 02:00 UTC · cron `0 2 * * 6`
- **MCPs:**
  - **Supabase** · scope `pathfinder.eval_ground_truth, pathfinder.eval_runs, pathfinder.projects, pathfinder.agent_log, pathfinder.agent_runs`
  - **Anthropic API** · Claude Sonnet for retrospective reasoning
- **Output tables:** writes `pathfinder.eval_runs`, `pathfinder.agent_log`, `pathfinder.agent_runs`. Reads `pathfinder.eval_ground_truth` (seeded by `scripts/seed.ts` from Doenz examples or synthetic).
- **Model:** `claude-sonnet`

---

## Quick reference card

| # | Agent | Cron | Pinned model | Primary output table |
|---|---|---|---|---|
| 1 | Ingestor | `0 */6 * * *` | router default | `pathfinder.projects` |
| 2 | Ranker | `*/30 * * * *` + realtime | `claude-sonnet` | `pathfinder.projects` (UPDATE) |
| 3 | Adjacent | `0 9 * * 5` | `claude-sonnet` | `pathfinder.adjacent_targets` |
| 4 | Verifier | `*/15 * * * *` + realtime | `claude-sonnet` | `pathfinder.projects` (UPDATE) |
| 5 | Outreach | event-driven | `claude-sonnet` | `pathfinder.outreach_drafts` |
| 6 | Pulse | `0 12 * * 0` | `claude-sonnet` | `pathfinder.tuning_proposals` |
| 7 | Competitive | `0 14 * * 3` | `claude-sonnet` | `pathfinder.competitive_signals` |
| 8 | Briefing | `0 6 * * 1-5` | `claude-opus` | `pathfinder.briefings` (Slack `C0B07HEK6M9` + email `kyle@demystified.ai`) |
| 9 | Customer-Intel | `0 11 * * *` | `claude-sonnet` | `pathfinder.customer_signals` |
| 10 | Eval | `0 2 * * 6` | `claude-sonnet` | `pathfinder.eval_runs` |

---

## Troubleshooting

- **`mcp_scope_violation` in `agent_log`:** the Supabase MCP grant is wider than `pathfinder` schema, or narrower than the table list in Part B. Re-grant with the exact scope string from this doc.
- **`agent_runs` row stuck in `running` for >2× the schedule interval:** the Space crashed mid-run. Manually update the row to `status = 'failed'` so the next cycle fires (the prompt's overlap guard refuses to start while a `running` row exists).
- **Dashboard cell stays grey after a successful manual run:** check the `next run` label. If it shows the wrong time, the cron in the Space disagrees with the cron in the prompt — sync them.
- **Briefing not delivering to Slack or email:** check Slack MCP grant (channel `C0B07HEK6M9`) and email MCP (auth to `kyle@demystified.ai`). Both must be present every run; one missing means the brief writes to `pathfinder.briefings` but `delivered_at` stays null.
