# PLAN-AGENTS — Pathfinder 8-Agent Expansion

**Status:** Live · architecture pivoted 2026-04-28
**Date:** 2026-04-28
**Pairs with:** `agent-specs/01..08-*.md`, `docs/RUNTIME-ARCHITECTURE.md`, `Pathfinder-Build-Brief-Claude-Code.md`
**Build window:** 5 working days, layer-gated

> **Runtime split (locked 2026-04-28):** 5 Perplexity research agents (Ingestor, Adjacent, Outreach, Customer Intel, Competitive) + 5 Vercel cron deterministic agents (Ranker, Verifier, Pulse, Eval, Briefing). See `docs/RUNTIME-ARCHITECTURE.md` for the full per-agent table and rationale. Original v1 plan assumed all agents were Perplexity Spaces; sections below referencing "Perplexity Space" for Ranker/Verifier/Pulse/Eval/Briefing should be read in light of the runtime pivot — those 5 agents are now Vercel cron functions with behavioral specs at `docs/specs/<agent>.md`.

This plan turns the existing 3-agent Pathfinder fleet (Ingestor + Ranker live; Adjacent silent) into the 8-agent fleet defined in `agent-specs/`. It is layered so each layer is verified end-to-end before the next dispatches. No code or Computer prompts get written until Kyle approves this plan.

---

## 1. Inventory — what exists, what changes

**Already in tree (do not rebuild):**

- `pathfinder` schema with 6 tables: `branches`, `customers`, `projects`, `agent_log`, `agent_runs`, `adjacent_targets` (`supabase/migrations/0001..0004`)
- 3 Computer prompts: `prompts/computer-ingestor.md`, `prompts/computer-ranker.md`, `prompts/computer-adjacent.md`
- Read-side API: `app/api/{activity,agents,branches,customers,projects,rationale,refresh,stats}`
- Dashboard with `AgentStatusRow`, `ActivityRail`, agent-tinted activity log
- `lib/agent-tints.ts` — only 3 agents registered (`ingestor`, `ranker`, `adjacent`)
- `lib/types.ts` `AgentName` union — only 3 names

**Two structural blockers — fix in Layer 1's first migration before anything else:**

1. `agent_log.agent_name` and `agent_runs.agent_name` both have CHECK constraints scoped to `('ingestor','ranker','adjacent')`. Adding 5 new agents requires dropping/replacing those CHECKs.
2. `lib/agent-tints.ts` `AgentName` union and `AGENTS` map are 3-wide. Must expand to 8.

---

## 2. Schema migrations (consolidated, one per layer)

All migrations live in `pathfinder` schema. New tables follow the existing convention (text or bigserial PK, `*_at` timestamptz with default `now()`, jsonb for flexible payloads, `created_at` on append-only rows).

### `0005_agent_expansion_layer1.sql` (Layer 1)

```sql
-- Relax agent_name CHECKs to a wider whitelist so Layer-2/3 migrations
-- don't have to re-touch this constraint.
alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval'
  ));

alter table pathfinder.agent_runs drop constraint agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval'
  ));

-- Verifier output columns on existing projects table.
alter table pathfinder.projects
  add column verified boolean,
  add column verifier_notes text,
  add column verifier_pass_count integer not null default 0;

create index projects_verified_null_idx on pathfinder.projects(ranked_at desc)
  where verified is null;
```

Rationale: a single CHECK that names all 8 future agents is one migration instead of three. The Verifier columns are nullable so existing rows don't break.

### `0006_agent_expansion_layer2.sql` (Layer 2)

```sql
-- Outreach drafts
create table pathfinder.outreach_drafts (
  id bigserial primary key,
  project_id text not null references pathfinder.projects(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin','voicemail')),
  recipient_name text,
  recipient_title text,
  recipient_contact text,
  draft_subject text,
  draft_body text not null,
  warm_intro_via text references pathfinder.customers(id) on delete set null,
  sent_status text not null default 'draft'
    check (sent_status in ('draft','sent','dismissed')),
  draft_at timestamptz not null default now()
);
create index outreach_drafts_project_idx on pathfinder.outreach_drafts(project_id);
create index outreach_drafts_status_idx  on pathfinder.outreach_drafts(sent_status, draft_at desc);

-- Ranker config (read by Ranker, written by Pulse on approval)
create table pathfinder.ranking_config (
  id bigserial primary key,
  config jsonb not null,
  effective_at timestamptz not null default now(),
  applied_by text,
  proposal_id bigint
);
-- Seed row: see scripts/seed.ts
create index ranking_config_effective_idx on pathfinder.ranking_config(effective_at desc);

-- Pulse proposals
create table pathfinder.tuning_proposals (
  id bigserial primary key,
  pattern_observed text not null,
  evidence jsonb not null,
  proposed_change jsonb not null,
  expected_impact text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','superseded','expired')),
  proposed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  decided_at timestamptz,
  decided_by text
);
create index tuning_proposals_status_idx on pathfinder.tuning_proposals(status, proposed_at desc);

-- Competitive signals
create table pathfinder.competitive_signals (
  id bigserial primary key,
  competitor_name text not null,
  geography text not null,
  contract_count integer,
  contract_value_total numeric(14,2),
  trend text check (trend in ('up','flat','down')),
  trend_pct numeric(6,2),
  source_evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index competitive_signals_observed_idx on pathfinder.competitive_signals(observed_at desc);
create index competitive_signals_geo_idx      on pathfinder.competitive_signals(geography, observed_at desc);
```

### `0007_agent_expansion_layer3.sql` (Layer 3)

```sql
-- Briefings
create table pathfinder.briefings (
  id bigserial primary key,
  scope text not null check (scope in ('org','branch')),
  branch_id text references pathfinder.branches(id) on delete set null,
  brief_markdown text not null,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  delivered_at timestamptz,
  recipients text[] not null default '{}'
);
create index briefings_generated_idx on pathfinder.briefings(generated_at desc);
create index briefings_scope_idx     on pathfinder.briefings(scope, generated_at desc);

-- Customer intel signals
create table pathfinder.customer_signals (
  id bigserial primary key,
  customer_id text not null references pathfinder.customers(id) on delete cascade,
  signal_type text not null
    check (signal_type in ('expansion','m_and_a','hiring','incident','filing','press')),
  signal_data jsonb not null,
  inferred_opportunity text,
  opportunity_window text,
  source_url text,
  observed_at timestamptz not null default now()
);
create index customer_signals_customer_idx on pathfinder.customer_signals(customer_id, observed_at desc);
create unique index customer_signals_dedupe_idx
  on pathfinder.customer_signals(customer_id, signal_type, date_trunc('week', observed_at));

-- Eval — ground-truth seeds and weekly retrospective runs
create table pathfinder.eval_ground_truth (
  id bigserial primary key,
  label text not null,
  description text not null,
  rfp_date date not null,
  geography text,
  project_value numeric(14,2),
  expected_signals jsonb not null,
  source text not null check (source in ('doenz','synthetic')),
  created_at timestamptz not null default now()
);

create table pathfinder.eval_runs (
  id bigserial primary key,
  ground_truth_id bigint not null references pathfinder.eval_ground_truth(id) on delete cascade,
  would_have_caught boolean not null,
  days_before_rfp integer,
  score_at_detection integer,
  confidence text check (confidence in ('high','med','low')),
  notes text,
  run_at timestamptz not null default now()
);
create index eval_runs_run_idx on pathfinder.eval_runs(run_at desc);
create index eval_runs_gt_idx  on pathfinder.eval_runs(ground_truth_id, run_at desc);
```

Apply via Supabase MCP `apply_migration` per layer; no PostgREST schema reload race because `pathfinder` is already exposed.

---

## 3. Per-agent Computer prompt structure

All 5 new prompts follow the existing `computer-ingestor.md` / `computer-adjacent.md` template (proven in production). Each prompt file has these sections in order:

1. **Frame** — identity, place in fleet, what dashboard surface it drives
2. **Schedule** — exact cron (or "event-driven" with the trigger condition spelled out)
3. **Inputs / Data Sources** — Supabase reads (with schema-prefixed table names) + external APIs/web sources
4. **Tools / MCP** — Supabase MCP scope, browser/web search, Anthropic API model, any MCP fallbacks; abort behavior on scope drop
5. **Output Schema** — exact column-by-column mapping to the destination Supabase table; matches the TypeScript interface in `lib/types.ts`
6. **Logging** — `agent_name` value, every allowed `event_type` with sample `event_data` shapes, dashboard-visible sample lines
7. **Cycle Bookkeeping** — `agent_runs` open/close, what `records_processed` and `records_new` count
8. **Error Handling** — each failure mode + retry/escalation rule
9. **Constraints / Stop Conditions** — schema-isolation hard rules, max iteration loops, timeouts
10. **Operating Principles** — voice/tone/quality bar where relevant

Layer-1 also includes `prompts/computer-adjacent.md` — **audit existing**, do not rewrite. The current prompt is comprehensive (130 lines, all 10 sections present). Audit checks:

- Is it actually deployed in a Perplexity Space? (Operator answer — Kyle to confirm.)
- Is the schedule active? (Cron `0 9 * * 5` — Kyle confirms in Perplexity UI.)
- Is the Supabase MCP grant scoped to `pathfinder` schema with write to `adjacent_targets`, `agent_log`, `agent_runs`? (Kyle to verify in Perplexity Space settings.)
- Does the prompt reference `pathfinder.adjacent_targets` exactly? ✅ verified.
- Is the dashboard rendering its tint correctly? (Currently `tintKey: null` — adjacent stays mono ink. Confirmed in `lib/agent-tints.ts:52`.)

If audit finds the prompt is fine and the issue is purely operational, the Layer-1 fix is "Kyle wires it up in Perplexity" + a `scripts/test-adjacent.ts` smoke test that simulates a write so we verify the dashboard renders Adjacent activity end-to-end before declaring Layer 1 done.

**New prompt files to author (Layer 2 + 3):**

- `prompts/computer-verifier.md` (Layer 1 — new)
- `prompts/computer-outreach.md` (Layer 2)
- `prompts/computer-pulse.md` (Layer 2)
- `prompts/computer-competitive.md` (Layer 2)
- `prompts/computer-briefing.md` (Layer 3)
- `prompts/computer-customer-intel.md` (Layer 3)
- `prompts/computer-eval.md` (Layer 3)

Each prompt is one file Kyle pastes into a Perplexity Space. Claude Code does not run them.

---

## 4. Dashboard surfacing per agent

### 4.1 Activity log strip — agent name + tint

Constraint from prompt: "Pull tints from existing palette; do not add new colors." Existing palette has `hi` (cyan), `warm` (lime), and `ink` (mono). To distinguish 8 agents without inventing colors, expand `agent-tints.ts` like this:

| Agent | tintKey | render strategy |
|---|---|---|
| ingestor | `hi` | solid cyan (existing) |
| ranker | `warm` | solid lime (existing) |
| adjacent | `null` | mono ink (existing) |
| verifier | `warm` + `ringOnly: true` | lime ring around mono text — visually paired with Ranker (Generator-Verifier) |
| outreach | `hi` + `softFill: true` | cyan-soft fill, ink text — paired with Ranker output flow |
| pulse | `null` + `dimItalic: true` | mono ink, italic, dim — system-tuning agent reads as "background" |
| competitive | `hi` + `dim: true` | cyan-dim — research agent like Ingestor but desaturated |
| briefing | `null` + `bold: true` | mono ink, bold — synthesis agent, weight signals importance |
| customer-intel | `warm` + `dim: true` | lime-dim — pipeline-adjacent like Ranker, lower-volume |
| eval | `null` + `mono: true` | mono ink, monospace tag prefix `[eval]` — system-meta |

This stays inside the existing 3-color palette. If Kyle dislikes the tint mapping in review, it's a 5-line change.

### 4.2 Agent Status row — 8 cells

Current row shows 3 agents. Two layout options:

- **Option A (preferred):** 2-row grid, 4 cells per row. Layer 1+2 in top row (ingestor, ranker, adjacent, verifier), Layer 3 + tuning in bottom (outreach, pulse, competitive, briefing, customer-intel, eval — 6 cells, so make bottom row 6 narrower cells).
- **Option B:** single row, 8 cells, horizontal scroll on viewports < 1280px.

Recommend A for desktop demo (no hidden chrome). Liveness Subagent owns this in Layer 1 (the row needs to be wider before any new agent renders into it).

### 4.3 New panels (one panel per structured-output agent)

| Agent | New surface | Where it lives | Read endpoint |
|---|---|---|---|
| Verifier | Inline badge on each project list row + verifier notes inside ProjectModal | Existing components | `/api/projects` augmented |
| Outreach | "Outreach drafts" expandable section in ProjectModal (3 channel tabs: email/LinkedIn/voicemail) | New `OutreachDraftsPanel` | `/api/agents/outreach?project_id=…` |
| Pulse | "Tuning proposals" floating panel, opens from a TopBar pill (badge count of pending) | New `TuningProposalsPanel` | `/api/agents/pulse` (GET pending, POST decision) |
| Competitive | "Competitive signals" panel toggleable from BranchDock | New `CompetitiveSignalsPanel` | `/api/agents/competitive` |
| Briefing | "Briefings archive" — list view with full markdown reader | New `/briefings` route or modal | `/api/briefings` |
| Customer-Intel | Map overlay: small icon adjacent to customer markers when there's a recent signal; tooltip shows signal_type + opportunity_window | New `CustomerSignalLayer` map child | `/api/agents/customer-intel` |
| Eval | Small "Eval Health" pill in TopBar showing current ground-truth catch rate (e.g. `EVAL: 4/5 · 78d avg`) | TopBar addition | `/api/agents/eval` |

Each new endpoint follows the existing convention (`app/api/agents/<name>/route.ts`, GET/POST as needed, basePath-aware, returns JSON).

### 4.4 Multi-model strip

Existing surface already reads `agent_log.model_used`. New agents' model usage will surface automatically. Models per spec:

- Verifier: `claude-sonnet`
- Outreach: `claude-sonnet`
- Pulse: `claude-sonnet`
- Competitive: `claude-sonnet`
- Briefing: `claude-opus` ← only Opus user; visible cost differentiation in the strip
- Customer-Intel: `claude-sonnet`
- Eval: `claude-sonnet`

No code change needed for the strip. Confirm visually in Layer 3 verification.

---

## 5. Testing approach (per-agent)

Each agent gets these three test surfaces — light TDD, focused on schema and pure-function logic, not the LLM call path.

### Tier 1 — schema validation tests (Jest, `__tests__/schema/`)

For each agent's output table, write a test that:

- Inserts a valid row matching the agent's documented output schema → succeeds
- Inserts a row with missing required fields → rejected
- Inserts a row with an out-of-range enum (e.g. `signal_type='nonsense'`) → rejected

Runs against a Supabase test branch (Supabase MCP `create_branch`).

### Tier 2 — smoke tests (`scripts/test-<agent>.ts`)

For each agent, write a script that simulates the agent's expected behavior by writing a fixture row to the agent's output table + a corresponding `agent_log` entry, then queries the dashboard's read endpoint and asserts the data renders. This is the "dashboard wiring works" test, and it doesn't depend on Computer being deployed — Claude Code can run it standalone.

Example: `scripts/test-verifier.ts` writes a project with `verified=true` and `verifier_notes='passed all 4 checks'`, then GETs `/api/projects/<id>` and asserts the response includes the verifier fields.

### Tier 3 — pure-function unit tests (`__tests__/lib/`)

Where new logic lands in `lib/`:

- `lib/scoring.ts` — Pulse may extend with config-driven weights. Test that `score(project, branch, customer, config)` produces expected outputs across the existing 5-branch fixture.
- `lib/eval-retrospective.ts` (new) — pure function that takes a ground-truth record + a snapshot of historical signals and returns `{ would_have_caught, days_before_rfp, score_at_detection, confidence }`. Test edge cases: no signal, signal but below threshold, multiple signals, signal after RFP.
- `lib/pulse-pattern-detect.ts` (new) — pure function detecting statistical patterns in rep behavior. Test sample-size floor (≥10), deviation floor (≥20%), risk cap (≤25% of historical rankings affected).

### Tier 4 — operator-verified end-to-end (manual, flagged to Kyle)

For each agent, after schema + dashboard wiring is verified, the prompt file is ready for Kyle to deploy into a Perplexity Space. This step is **not** Claude-Code-verifiable — Kyle pastes the prompt, configures schedule, grants MCP scope, runs once manually. Claude Code's verification gate ends at "operator can deploy this." A `docs/AGENT-DEPLOYMENT-CHECKLIST.md` (Layer 1 deliverable) gives Kyle a copy-paste runbook for each agent's Perplexity Space setup.

---

## 6. Subagent stream definitions

Within a layer, subagents run in parallel via `dispatching-parallel-agents`. Across layers, dispatch is gated.

### Layer 1 — 2 subagents in parallel

**1A · Adjacent Activation Subagent**
- Audit `prompts/computer-adjacent.md` (no rewrite expected)
- Author `docs/AGENT-DEPLOYMENT-CHECKLIST.md` with the Perplexity-side runbook (Spaces config, schedule, MCP scope grants)
- Author `scripts/test-adjacent.ts` smoke test
- Verify dashboard renders an Adjacent log line with mono-ink tint
- Owns: `prompts/computer-adjacent.md` audit notes, `docs/AGENT-DEPLOYMENT-CHECKLIST.md`, `scripts/test-adjacent.ts`

**1B · Verifier Subagent**
- Apply migration `0005_agent_expansion_layer1.sql` (relax CHECK + add verifier columns)
- Expand `lib/agent-tints.ts` to register all 8 agents (full registry, not just verifier — single edit)
- Expand `lib/types.ts` `AgentName` union to all 8
- Author `prompts/computer-verifier.md`
- Add `verified` badge + verifier_notes to `ProjectList` row + `ProjectModal`
- Update `app/api/projects/route.ts` and `[id]/route.ts` to return verifier fields
- Author `__tests__/schema/verifier.test.ts` and `scripts/test-verifier.ts`
- Owns: migration `0005`, `lib/agent-tints.ts`, `lib/types.ts`, `prompts/computer-verifier.md`, ProjectList/ProjectModal verifier UI, projects API verifier surfacing, verifier tests

**Layer 1 verification gate** (Claude Code runs):
- Migration applied; CHECKs accept all 8 names; verifier columns present
- `lib/agent-tints.ts` has 8 entries; dashboard activity log can render all 8 tints (assert via component snapshot)
- `scripts/test-adjacent.ts` writes a row → dashboard `/api/activity` returns it → `npx tsx scripts/test-adjacent.ts` passes
- `scripts/test-verifier.ts` writes a verified project → ProjectModal shows verifier badge → headless smoke test passes
- `prompts/computer-verifier.md` exists, follows the 10-section template
- Vercel deploy is green
- **Operator-side gate:** Kyle confirms Adjacent is actually running on schedule in Perplexity (or commits to wiring it before Layer 2 dispatch)

**STOP. Confirm with Kyle before Layer 2.**

### Layer 2 — 3 subagents in parallel (after gate)

**2A · Outreach Subagent**
- Author `prompts/computer-outreach.md`
- Build `OutreachDraftsPanel` (channel tabs, copy-as-draft buttons, sent_status toggle)
- Build `app/api/agents/outreach/route.ts` (GET by project_id; POST status update)
- Tests: `__tests__/schema/outreach.test.ts`, `scripts/test-outreach.ts`
- Owns: outreach prompt, panel, API, tests

**2B · Pulse Subagent**
- Author `prompts/computer-pulse.md`
- Build `lib/pulse-pattern-detect.ts` (pure function) + unit tests
- Build `TuningProposalsPanel` with approve/reject buttons (POST writes decision + applies config to `ranking_config` on approve)
- Build `app/api/agents/pulse/route.ts`
- Seed initial `ranking_config` row in `scripts/seed.ts`
- Tests: `__tests__/lib/pulse-pattern-detect.test.ts`, `__tests__/schema/tuning_proposals.test.ts`, `scripts/test-pulse.ts`
- Owns: pulse prompt, pattern-detect lib, panel, API, ranking_config seed, tests

**2C · Competitive Subagent**
- Author `prompts/computer-competitive.md`
- Build `CompetitiveSignalsPanel` (BranchDock-anchored, filterable by geography)
- Build `app/api/agents/competitive/route.ts`
- Tests: `__tests__/schema/competitive.test.ts`, `scripts/test-competitive.ts`
- Owns: competitive prompt, panel, API, tests

Migration `0006_agent_expansion_layer2.sql` is applied as the first step of Layer 2 dispatch (single-shot, before subagents fan out — they all need the new tables).

**Layer 2 verification gate:**
- Migration `0006` applied
- All 3 prompts exist and follow template
- All 3 panels render against fixture data; smoke tests pass
- Dashboard Agent Status row shows all 6 active agents (Layer 1 + 2)
- Vercel deploy green

**STOP. Confirm with Kyle before Layer 3.**

### Layer 3 — 3 subagents in parallel (after gate)

**3A · Briefing Subagent**
- Author `prompts/computer-briefing.md`
- Build briefings list/reader (likely `/briefings` route + reuse Markdown rendering)
- Build `app/api/briefings/route.ts` and `[id]/route.ts`
- Tests: `__tests__/schema/briefings.test.ts`, `scripts/test-briefing.ts` (writes one org + one branch brief)
- Owns: briefing prompt, briefings UI, API, tests

**3B · Customer-Intel Subagent**
- Author `prompts/computer-customer-intel.md`
- Build `CustomerSignalLayer` map child (icon + tooltip on customers with recent signals)
- Build `app/api/agents/customer-intel/route.ts`
- Tests: `__tests__/schema/customer_signals.test.ts`, `scripts/test-customer-intel.ts`
- Owns: customer-intel prompt, map layer, API, tests

**3C · Eval Subagent**
- Author `prompts/computer-eval.md`
- Build `lib/eval-retrospective.ts` (pure function) + unit tests
- Build "Eval Health" pill in TopBar
- Build `app/api/agents/eval/route.ts`
- Seed `pathfinder.eval_ground_truth` from one of:
  - Kyle Doenz's 5 missed-project examples (preferred — Kyle to provide before Layer 3 dispatch)
  - 3-5 synthetic ground truths if Doenz examples not yet provided (`source='synthetic'` in seed). Logged as `agent_log` warning so this is visible in the demo.
- Tests: `__tests__/lib/eval-retrospective.test.ts`, `__tests__/schema/eval.test.ts`, `scripts/test-eval.ts`
- Owns: eval prompt, retrospective lib, eval pill, API, ground-truth seed, tests

Migration `0007_agent_expansion_layer3.sql` applied as the first step of Layer 3 dispatch.

**Layer 3 verification gate:**
- Migration `0007` applied; ground-truth seed loaded (Doenz or synthetic)
- All 3 prompts exist and follow template
- All 3 surfaces render against fixture data; smoke tests pass
- Dashboard Agent Status row shows all 8 active agents
- Briefing → Eval pipeline test: eval run produces a row → briefing test fixture pulls it into the org brief
- Vercel deploy green

---

## 7. MCP usage

| MCP | Used by | For |
|---|---|---|
| Supabase MCP | All schema migrations, all API endpoints | `apply_migration`, `execute_sql` for verification, `generate_typescript_types` post-migration |
| Vercel MCP | Deploys per layer | `deploy_to_vercel`, `get_deployment_build_logs` |
| GitHub MCP | Branch + PR per layer (not per agent — too noisy) | `feat/agents-layer-1`, `feat/agents-layer-2`, `feat/agents-layer-3` |
| Notion MCP | Read Zedcor lead notes (`347785c67e72809a86f3de8a9c4dfd7c`) and Zedcor PoC (`34d785c67e72803c9686ca3db173b049`) for prompt context | One-time read, embed key facts into prompt files |
| HubSpot MCP | Pulse and Briefing (Computer-side, not Claude Code) | Read pipeline data — Kyle wires this in Perplexity Space MCP grants |
| Slack MCP | Briefing delivery (Computer-side) | If unavailable: fallback to email via Resend — flagged in briefing prompt |
| LinkedIn MCP | Outreach contact lookup (Computer-side) | If unavailable: Computer browser automation fallback — both paths in prompt |

Branch strategy: one branch per layer keeps PR review tractable. Within-layer subagents commit to the same branch; final layer PR bundles everything.

---

## 8. Day-by-day checkpoints

| Day | Date (rel) | What ships | Gate |
|---|---|---|---|
| 0 | today | This plan; Kyle approves | Plan approval |
| 1 | +1 | Layer 1 dispatch (1A + 1B parallel). Migration `0005` applied. Verifier prompt + UI + tests. Adjacent audit + deployment checklist. | Layer 1 gate (Section 6) |
| 2 | +2 | Layer 1 verification + Kyle confirms Adjacent runs in Perplexity. Layer 2 dispatch (2A + 2B + 2C parallel). Migration `0006`. | Layer 2 gate |
| 3 | +3 | Layer 2 verification. Layer 3 dispatch (3A + 3B + 3C parallel). Migration `0007`. Eval ground-truth seed (Doenz or synthetic). | Layer 3 gate |
| 4 | +4 | Layer 3 verification. Full system end-to-end shakedown. Operator-side: Kyle deploys all 5 new prompts into Perplexity Spaces. | E2E demo run |
| 5 | +5 | Buffer. Demo dry-run with all 8 agents producing visible activity. Code review pass per layer. Final PR merge. | Contest-ready |

If Kyle Doenz's 5 ground-truth examples arrive late, Layer 3 ships with synthetic seeds and a `TODO-DOENZ-GROUND-TRUTH.md` flagging the swap-in.

---

## 9. Hard constraints (carry over)

- All work in `pathfinder` schema, never `public`
- `lib/scoring.ts` stays pure-function (Phase-2 transplant target onto Zedcor's L4s)
- No OpenAI in the stack — Anthropic + Perplexity only
- Computer agents write directly to Supabase via MCP; never via push endpoints
- No new colors in the dashboard palette — reuse `hi`/`warm`/`ink` with render-strategy variations
- Customer-Intel never logs customer names to `agent_log.event_data` (privacy — `customer_id` only, per spec)

---

## 10. Decisions (locked 2026-04-28 by Kyle)

1. **Adjacent audit** — Already deployed and running in a Perplexity Space. 1A is a 30-min audit + smoke test, not a deployment session.
2. **Doenz ground-truth examples** — Seed 3-5 synthetic ground truths in Layer 3 (`source='synthetic'`). Swap to Doenz examples later when available.
3. **Briefing delivery** — Both channels: Slack to `#unicronsystems` channel `C0B07HEK6M9` (https://unicronsystems.slack.com/archives/C0B07HEK6M9) AND email to `kyle@demystified.ai`. Briefing prompt writes to both.
4. **Agent Status row** — 2-row grid (Layer 1+2 top, Layer 3 + system-meta bottom).
5. **Tint mapping** — Tint modifier system (Section 4.1) approved as proposed.
6. **Branching** — One branch per layer: `feat/agents-layer-1`, `feat/agents-layer-2`, `feat/agents-layer-3`. Bundled PR per layer.

---

## 11. What this plan does NOT cover

- Operator-side Perplexity Space deployment (Kyle does this manually per agent, using `docs/AGENT-DEPLOYMENT-CHECKLIST.md`)
- HubSpot data wiring beyond what already exists (Pulse and Briefing read HubSpot via Computer's MCP grant — Claude Code does not touch HubSpot)
- Production rate limiting on the Computer side (handled by Perplexity Space throttles + per-spec stop conditions)
- Demo script / pitch narrative for the contest submission (separate workstream)

---

**Awaiting approval. No code, no Computer prompts, no migrations until you sign off — particularly on the open questions in Section 10.**

---

## 12. Adjacent audit (2026-04-28)

Auditor: Subagent 1A. Subject: `prompts/computer-adjacent.md` (130 lines). Recommendation: **READY** — no edits required to ship Layer 1.

### 12.1 Section template coverage (Section 3)

All 10 template sections present. Order matches the canonical Ingestor/Ranker prompt structure.

| # | Section | Status | Lines |
|---|---|---|---|
| 1 | Frame | present | 3–5 |
| 2 | Schedule | present | 7–9 |
| 3 | Inputs / Data Sources | present | 11–26 |
| 4 | Tools / MCP | present | 28–32 |
| 5 | Output Schema | present | 38–48 |
| 6 | Logging | present | 78–94 |
| 7 | Cycle Bookkeeping | present | 96–100 |
| 8 | Error Handling | present | 103–107 |
| 9 | Constraints / Stop Conditions | present | 119–123 |
| 10 | Operating Principles | present | 125–131 |

Three additional sections that exceed the template: `Output Quantity` (5–15 floor/ceiling), `Outreach Drafting (Sonnet)` (structured payload + reject-and-regenerate rules), and `Dedup Rules`. All three add value and do not conflict with the template — keep.

### 12.2 Schema-prefix correctness

Every Supabase table reference is fully qualified with the `pathfinder.` prefix:

- `pathfinder.adjacent_targets` — read (dedup), write (line 30, 38, 40, 42, 112)
- `pathfinder.agent_log` — write (line 30, 79)
- `pathfinder.agent_runs` — write (line 30, 97)
- `pathfinder.branches` — read (line 13, 30)
- `pathfinder.projects` — explicitly forbidden (line 131)

No bare `adjacent_targets` / `agent_log` references. The MCP grant directive (`scoped to schema 'pathfinder' only`, `search_path = pathfinder, public`) is on line 30 and matches the Ingestor/Ranker convention.

### 12.3 Output schema match against `lib/types.ts`

`AdjacentTarget` interface (lib/types.ts:78–86):

```ts
{ id, company_name, geography, branch_count_estimate, shape_match_reason, outreach_draft, surfaced_at }
```

Prompt's Output Schema (lines 42–48) populates: `company_name`, `geography`, `branch_count_estimate`, `shape_match_reason`, `outreach_draft`. Leaves `id` (bigserial) and `surfaced_at` (default `now()`) for the schema. **Exact match.** No drift.

The migration in `supabase/migrations/0002_tables.sql` confirms the same column set with `id bigserial primary key`, `surfaced_at timestamptz default now()` — no unique constraint on `company_name`, so the prompt's dedup-before-insert is the only guard against duplicates (correct).

### 12.4 Allowed `event_type` values vs. dashboard render

Prompt declares 6 allowed values for `agent_log.event_type`:

`ingest_start`, `discovery_run`, `target_surface`, `model_route`, `write_success`, `error`.

Dashboard render path (`components/live/ActivityRail.tsx:25–41`): `logLineText()` reads `event_data.text` first, then falls back to `event_type + JSON tail`. The prompt populates `event_data.message` (not `.text`) — same convention as Ingestor and Ranker prompts, so this is fleet-wide, not an Adjacent-specific defect. The fallback path renders cleanly for all six event types.

`ModelRoutingStrip` (referenced in components/live/) aggregates `model_route` events with `model_used` set — Adjacent's `model_route` event for the Sonnet outreach call satisfies this. No blocker.

The activity API (`app/api/activity/route.ts`) is `event_type`-agnostic — it returns the most-recent `LOG_CAP=120` rows regardless of type. All six values surface.

### 12.5 Other notes

- **Spec drift (informational, not 1A's territory):** `agent-specs/01-computer-adjacent.md` line 7 says schedule is "Monday 06:00 UTC". The deployed prompt and Kyle's confirmation say `0 9 * * 5` (Friday 09:00 UTC). The prompt is canonical (it's what's running). Spec file is stale and should be updated in a future cleanup pass — not part of Layer 1 1A scope.
- **Tint behavior:** `lib/agent-tints.ts:52` has `adjacent: { tintKey: null }`. ActivityRail handles `null` tintKey by falling back to `inkSub` (line 182). Verified: Adjacent log lines render in mono ink with the agent prefix dimmed — matches the design intent ("research, not pipeline").
- **Realism check:** Sample log lines on prompt lines 89–94 are dashboard-shaped and read identically to the Ingestor/Ranker examples. The Sonnet-driven `outreach_draft` rule (90–140 words, banned-buzzword reject loop, 1-regen budget) is robust.

### 12.6 Recommendation

**READY.** No edits required to `prompts/computer-adjacent.md`. The Layer 1 1A deliverables are the deployment checklist (`docs/AGENT-DEPLOYMENT-CHECKLIST.md`) and the smoke test (`scripts/test-adjacent.ts`) — both authored as separate files. Kyle's existing Perplexity Space deployment of this prompt requires no changes.
