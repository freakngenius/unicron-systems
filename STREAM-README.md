# STREAM-README — Stream D: Architect Agent (real Claude Agent SDK)

You are executing Stream D of Phase 2 of the Unicron Systems build. This is **new build** work. There is no existing Architect implementation. The Architect is a Claude Agent SDK runtime, not a one-shot LLM call. You ship three session types per spec: Decomposition, Tuning, Discovery.

Worktree: `Phase2-worktrees/unicron-stream-d-architect`. Branch: `stream/d-architect`. Created off `main@e215f14` (post-Phase-1-G2).

## Read these documents in order

1. `STREAM-README.md` (this file)
2. `../../00 - START HERE - Product & Build Plan.md`
3. `../../00 - SKILLS & DISCIPLINES.md`
4. `../../00 - PARALLEL BUILD MAP.md`
5. `../../MEMORY/progress.md`
6. `../../MEMORY/decisions.md`
7. `../../MEMORY/gap-analysis.md`
8. **`../../SPEC - Architect Agent.md` — the canonical spec. Read it twice.** Section 3 (decomposition), Section 4 (tuning), Section 5 (discovery), Section 6 (tools layer).
9. `../../SPEC - Conductor Agent.md` (sibling agent context)
10. `../../SPEC - Backend Architecture.md`
11. `../../MEMORY/audit-pathfinder.md` (LLM gateway contract from Phase 1 G1)
12. `../../MEMORY/spec-references.md`
13. `../../MEMORY/learnings.md`

## Hard constraints

- **Cost cap:** $25 across all gates. Stop and report at $20. Architect is the most expensive stream because Claude Agent SDK runs are multi-turn.
- **Time cap:** 2 to 3 weeks of human-supervised bursts.
- Stay in this worktree. Do not modify code in main, in other worktrees, in `_demo-snapshot-2026-04-30/`, or in any other `Phase2-worktrees/` directory.
- Do not modify any `.md` spec file at workspace root. Treat them as read-only canonical sources.
- **Use the Claude Agent SDK**, not the bare Anthropic Messages API. Pathfinder's existing `lib/llm/` gateway is for one-shot calls and streams; the Architect needs an agent runtime with tool-use loops, system prompts, and persisted session state.
- Update `MEMORY/spec-references.md` (in main, via PR) for every file you create or significantly modify.
- Follow all four disciplines from `00 - SKILLS & DISCIPLINES.md`.

## Read the spec twice before any code

`SPEC - Architect Agent.md` is your canonical source. Read it once, sketch the system prompts and tool surfaces in your own words, then read it again before writing code. Misunderstandings here are expensive — Architect's outputs feed Stream C's UI and Stream A's tuning loop.

## Gate D1 — Decomposition session

- Build per Section 3 of the spec.
- Tools layer in `services/architect/tools/` (location per D1 monorepo decision — confirm with `MEMORY/decisions.md` before placing).
- System prompt as defined in the spec; do not paraphrase.
- API endpoint that Stream C consumes. Publish the contract (URL + request/response shape) in this README + `MEMORY/spec-references.md` early so C can mock against it.
- Eval: 30 hand-graded buyer-pain prompts with expected architecture outputs. Eval set lives in `services/architect/eval/decomposition.jsonl` (or equivalent format chosen by D1's monorepo decision).

Tests: agent-runtime smoke test (does the agent stay in scope?), tool-call mock tests, end-to-end test against eval set with pass-rate baseline.

**STOP. REPORT.** Publish the API contract before C starts mocking against it.

## Gate D2 — Tuning session

- Build per Section 4 of the spec.
- Weekly Inngest cron that runs the tuning session against each vertical. Coordinate with Stream A on the Inngest function registration (A owns the Inngest scaffolding from Gate A1).
- Surfaces proposals to an `architect_inbox` table (new — migration `0070_architect_inbox.sql`). Stream C reads this for its Architect Inbox UI.
- Reads from Stream A's eval data and Stream B's reinforcement-loop data (`outreach_edits` from B's Gate B2). Read-only contract.

Eval: 20 hand-graded feedback patterns with expected proposals.

Tests: tool-call mocks for the read-eval / read-edits / write-proposal flow.

**STOP. REPORT.**

## Gate D3 — Discovery session

- Build per Section 5 of the spec.
- Triggered by AdjacencyMapper signals (from Stream A's Gate A2) OR operator action (from Stream C's UI).
- Surfaces source-discovery proposals to `architect_inbox` (same table as D2).

Eval: 20 hand-graded discovery scenarios.

Tests: scenario eval with pass-rate baseline.

**STOP. REPORT.**

## Coordination with other streams

- **Stream C** depends on the API contract from Gate D1. **Publish it early** — even a draft contract in this README's "API contract" section is enough for C to start mocking.
- **Stream A** owns Inngest scaffolding. D2's tuning cron registers as an Inngest function — D's PR should add the registration; A's PR review confirms it doesn't collide with A's own functions.
- **Stream A** also owns AdjacencyMapper. D3's discovery trigger reads from AdjacencyMapper's output. Define the read contract in `MEMORY/spec-references.md`.
- **Stream B** owns `outreach_edits`. D2 reads from it. Ensure B's Gate B2 ships before D2 verifies, OR mock B's data shape until it lands.
- **Phase 1 G1 LLM gateway** is for one-shot calls. The Architect uses Claude Agent SDK directly. Document why in `MEMORY/decisions.md` so future readers don't ask "why two LLM paths."
- Migrations: use `0070+` to avoid collision with B (0050+) and A (which doesn't claim a range yet — coordinate via PR).

## API contract draft (publish early, refine in Gate D1)

```
POST /api/architect/decompose
Request: { buyer_pain: string, vertical?: string, constraints?: string[] }
Response: { proposal_id: string, architecture: {...}, reasoning: string[], cost_usd: number }
Stream C consumes: proposal_id + architecture for the Inbox detail view.
```

Refine in Gate D1; publish the final shape there.

## Out of scope (defer)

- Multi-architect parallel runs (single Architect per request for Phase 2).
- Architect-to-architect dialog (post-Phase-2).
- Architect over-the-wire to external customers (Phase 2 is internal-only).
- Custom model fine-tuning (use stock Claude models with strong prompts).

## Done criteria — "Stream D complete"

1. Decomposition session runs end-to-end through Claude Agent SDK with passing eval.
2. Tuning session runs weekly via Inngest, surfaces proposals to `architect_inbox`.
3. Discovery session runs on trigger, surfaces proposals to `architect_inbox`.
4. API contract published; Stream C swapped from mock to real with single config flip.
5. Cost-per-run baselines documented in `MEMORY/spec-references.md`.
6. Cost-to-date documented vs $25 cap.
