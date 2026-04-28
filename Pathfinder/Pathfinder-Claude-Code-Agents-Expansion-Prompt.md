# Pathfinder — Claude Code Prompt: Agent Expansion (8 Agents End-to-End)

Paste the block below into Claude Code in the Pathfinder working directory.

---

Expand Pathfinder from 2 visibly-active Computer agents (Ingestor, Ranker) to 8. The 8 agents are spec'd individually in `/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder/agent-specs/`. Read all 8 specs in full before writing any code or prompts.

**Specs to read:**

1. `agent-specs/01-computer-adjacent.md` — Update existing (currently silent)
2. `agent-specs/02-computer-verifier.md` — New, Generator-Verifier pattern
3. `agent-specs/03-computer-outreach.md` — New
4. `agent-specs/04-computer-pulse.md` — New, self-tuning
5. `agent-specs/05-computer-competitive.md` — New
6. `agent-specs/06-computer-briefing.md` — New
7. `agent-specs/07-computer-customer-intel.md` — New
8. `agent-specs/08-computer-eval.md` — New

**For each agent, your deliverable is:**

- A Computer system prompt in `prompts/computer-<name>.md` (this is what Kyle deploys into a Perplexity Space)
- All required Supabase tables created via migration in the `pathfinder` schema (schemas in the specs)
- Read-side API routes if the dashboard needs to surface this agent's output (e.g., `/api/agents/outreach`, `/api/agents/competitive`, `/api/briefings`)
- Dashboard surfacing: each agent's activity appears in the activity log strip with its own color tint per the existing convention; agents with structured outputs (Outreach drafts, Briefings, Competitive signals, Tuning proposals) get their own panel or detail view as appropriate
- Tests where applicable (see Testing section below)

**Phased rollout — verify each layer before moving to next:**

**Layer 1 (do first, ship before Layer 2):**
- `01-computer-adjacent` (audit + activate the existing one — likely a Perplexity Space configuration issue, possibly a missing schedule or tool grant)
- `02-computer-verifier` (new agent, gates the Ranker's output)

Verification gate: Adjacent writes 4-8 rows to `adjacent_targets` weekly. Verifier reviews every newly-ranked project, sets `verified=true|false`, returns failures to Ranker. Both visible in the activity log with distinct color tints. STOP here and confirm with Kyle before Layer 2.

**Layer 2 (after Layer 1 is verified):**
- `03-computer-outreach`
- `04-computer-pulse`
- `05-computer-competitive`

Verification gate: Outreach drafts are produced for every high-priority verified project. Pulse runs daily and produces at least one tuning proposal in the first week. Competitive signals appear weekly. All three visible on the dashboard with new panels or detail views. STOP and confirm before Layer 3.

**Layer 3 (after Layer 2 is verified):**
- `06-computer-briefing`
- `07-computer-customer-intel`
- `08-computer-eval`

Verification gate: Briefing produces 1 org + 5 branch briefs every Friday. Customer Intel signals appear at expected cadence. Eval runs weekly with retrospective ground-truth analysis (note: Eval requires the 5 ground-truth examples from Kyle Doenz to be loaded into `pathfinder.eval_ground_truth`; if that data is not yet available, generate 3-5 synthetic ground-truth examples for the demo and flag this in the agent log).

**Skills to invoke:**

- `using-superpowers` — establish skills system at start
- `writing-plans` — produce a written plan in `docs/PLAN-AGENTS.md` with day-by-day checkpoints and the layer-gating logic before any code or prompts. Confirm with Kyle before dispatching subagents.
- `subagent-driven-development` — dispatch 8 parallel subagent streams (one per agent), grouped by Layer for the verification gate. Within a layer, subagents can run in parallel because the agents are independent at the data-flow level (each writes to its own table; cross-agent reads are eventually-consistent).
- `test-driven-development` — light, applied to: any new pure-function logic in `lib/`, any new scoring/tuning math, schema validation for agent outputs. Do not full-TDD across the 8 agents.
- `verification-before-completion` — verify each agent's output end-to-end (Computer prompt deployed manually by Kyle, but the agent's expected output table populated by a manual test invocation) before claiming the agent is done.
- `requesting-code-review` — once each layer ships, run a self-review pass.
- `dispatching-parallel-agents` — applicable for the within-layer parallelism.

**MCPs to use:**

- Supabase MCP — schema migrations (creating new tables in `pathfinder`), RLS policies, seed data
- Vercel MCP — deploy each layer
- GitHub MCP — branches per agent (`feat/agent-verifier`, `feat/agent-outreach`, etc.), PRs, merges
- Notion MCP — read agent specs, also read Zedcor lead notes (`347785c67e72809a86f3de8a9c4dfd7c`) and Zedcor PoC (`34d785c67e72803c9686ca3db173b049`) for prompt context
- HubSpot MCP — for the Pulse and Briefing agents to read pipeline data
- Slack MCP if available — for the Briefing agent's delivery surface (fallback: email via Resend)
- LinkedIn MCP if available — for the Outreach agent's contact lookup (fallback: Computer browser automation)

**New tables required (added to `pathfinder` schema):**

- `pathfinder.outreach_drafts` (Outreach agent)
- `pathfinder.tuning_proposals` (Pulse agent)
- `pathfinder.ranking_config` (Pulse agent — the config the Ranker reads)
- `pathfinder.competitive_signals` (Competitive agent)
- `pathfinder.briefings` (Briefing agent)
- `pathfinder.customer_signals` (Customer Intel agent)
- `pathfinder.eval_ground_truth` (Eval agent — seed)
- `pathfinder.eval_runs` (Eval agent)

Also: extend `pathfinder.projects` with `verified (bool nullable)`, `verifier_notes (text)`, `verifier_pass_count (int default 0)`.

**Dashboard updates required:**

- Activity log already streams from `agent_log` — confirm new agent names render with distinct color tints (verifier, outreach, pulse, competitive, briefing, customer-intel, eval). Pull tints from existing palette; do not add new colors.
- Agent Status row currently shows 3 agents. Expand to show all 8. If 8 cells doesn't fit horizontally, group into a 2-row layout (Layer 1+2 top, Layer 3 bottom) or add horizontal scroll.
- New panels: Outreach drafts panel (per project, expandable), Tuning proposals panel (with approve/reject buttons), Competitive signals panel, Briefings archive, Customer signals overlay on map (toggleable), Eval health indicator (small status pill).
- Multi-model strip already exists — confirm new agents' model usage is reflected (Verifier and Pulse use Sonnet; Briefing uses Opus; others use Sonnet).

**Testing approach:**

For each agent:
1. **Schema validation test:** the agent's output table accepts the expected shape; rejects malformed inputs.
2. **Smoke test (manual + scripted):** invoke the agent's expected behavior against a small fixture; verify it writes the expected row(s) to the expected table within the expected time window.
3. **End-to-end check:** Computer system prompt deployed in a test Perplexity Space, agent runs once on schedule (or triggered manually), output observed in Supabase. This is operator-verified, not Claude-Code-verified — flag this clearly to Kyle when an agent is ready for Perplexity deployment.

For pure-function logic (e.g., new scoring weights from Pulse, retrospective reasoning from Eval): unit tests in `__tests__/` covering edge cases.

**Hard constraints (carry over from main Build Brief):**

- All work in `pathfinder` schema, never `public`
- `lib/scoring.ts` stays pure-function only — Phase 2 transplants it onto Zedcor's L4s
- No OpenAI in the stack — Anthropic + Perplexity only
- Computer agents write directly to Supabase via MCP, never via push endpoints

**Build sequence:**

- Day 1: Plan written and approved. Layer 1 dispatch — Adjacent fix + Verifier.
- Day 2: Layer 1 verification gate. Layer 2 dispatch — Outreach + Pulse + Competitive in parallel.
- Day 3: Layer 2 verification gate. Layer 3 dispatch — Briefing + Customer Intel + Eval in parallel.
- Day 4: Layer 3 verification gate. Full system end-to-end shakedown.
- Day 5: Buffer + demo dry-run with all 8 agents producing visible activity.

**Start by:**

Reading all 8 spec files in `agent-specs/`. Reading `Pathfinder-Build-Brief-Claude-Code.md` for context on existing architecture. Reading the Zedcor lead notes and PoC docs from Notion for Computer agent prompt context. Writing the plan to `docs/PLAN-AGENTS.md` covering: per-agent migrations, per-agent Computer prompt structure, per-agent dashboard surfacing, the layer verification gates, the testing approach, and the subagent stream definitions.

Confirm the plan with me before dispatching subagents. No code or Computer prompts until the plan is approved.
