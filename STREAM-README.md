# STREAM-README — Stream A: Production Agent Pipeline + Inngest

You are executing Stream A of Phase 2 of the Unicron Systems build. This is **evolution + new** work: Pathfinder already runs 6 in-repo agents (Ingestor, Ranker, Verifier, OutreachDrafter, Briefer, SlackAlerts) on Vercel cron; you fold them into Inngest event-driven orchestration AND ship the missing agents per spec (Enricher, GeoMapper, AdjacencyMapper, CompetitiveIntel).

Worktree: `Phase2-worktrees/unicron-stream-a-agents`. Branch: `stream/a-agents`. Created off `main@e215f14` (post-Phase-1-G2).

## Read these documents in order

1. `STREAM-README.md` (this file)
2. `../../00 - START HERE - Product & Build Plan.md`
3. `../../00 - SKILLS & DISCIPLINES.md`
4. `../../00 - PARALLEL BUILD MAP.md`
5. `../../MEMORY/progress.md` — confirm Phase 1 marked COMPLETE before starting
6. `../../MEMORY/decisions.md` — D1 (monorepo shape), D2 (Inngest hybrid), D6 (GeoMapper folded into scoring), D7 (CompetitiveIntel as Computer Space agent)
7. `../../MEMORY/gap-analysis.md`
8. **`../../MEMORY/audit-pathfinder.md` — read in full, then re-read the "Phase 1 close-out findings" appendix at the bottom. Stream A inherits Findings A and B as its first action (see Gate A0 below).**
9. `../../SPEC - Backend Architecture.md` Section 4 (production agents)
10. `../../SPEC - Daily Intelligence Loop.md`
11. `../../MEMORY/spec-references.md`
12. `../../MEMORY/learnings.md`

## Hard constraints

- **Cost cap:** $25 across all gates. Stop and report at $20.
- **Time cap:** 2 to 3 weeks of human-supervised bursts.
- Stay in this worktree. Do not modify code in main, in other worktrees, in `_demo-snapshot-2026-04-30/`, or in any other `Phase2-worktrees/` directory.
- Do not modify any `.md` spec file at workspace root. Treat them as read-only canonical sources.
- Update `MEMORY/spec-references.md` (in main, via PR) for every file you create or significantly modify.
- Follow all four disciplines from `00 - SKILLS & DISCIPLINES.md` (memory, testing, delegation, spec adherence).
- Pathfinder/CLAUDE.md protocol applies — never push to main, never merge your own PR, deploy chain is feature branch → PR → human merge → Vercel.

## Gate A0 — Inherited Phase 1 close-out findings (do this BEFORE anything else)

`MEMORY/audit-pathfinder.md` "Phase 1 close-out findings" appendix lists three issues that block Stream A's natural verification path. Resolve A and B before any Inngest work; document outcomes back to the audit:

### Finding A — Outreach cron 504 (id=191 stuck `running`)

- `app/api/cron/outreach/route.ts:34` declares `maxDuration = 60`. `route.ts:37` declares `CYCLE_TIMEOUT_MS = 12 * 60 * 1_000` (720s). Vercel terminates ~660s before internal cleanup; rows leak `status='running'`.
- Fix: raise `maxDuration` to ≥180s OR shrink `CYCLE_TIMEOUT_MS` to ~50_000ms with QUEUE_LIMIT adjustment so the 60s ceiling is comfortable. Add a stuck-run cleaner mirroring Ranker's pattern at `app/api/cron/ranker/route.ts:438`.
- Operator-side: mark `pathfinder.agent_runs.id=191` as `failed` once you confirm it isn't actually running (it isn't — function instance was killed at 14:15 UTC + 60s).

### Finding B — Ingestor stalled (no new projects in ~2.5 days)

- `pathfinder.projects.max(ingested_at) = 2026-04-29 00:04 UTC`. `pathfinder.agent_runs` shows ingestor's last success `2026-04-30 23:51 UTC`, last failure `2026-04-28 23:53 UTC`.
- Without resuming ingestion, downstream queues stay empty: ranker/verifier early-return on `queue.length === 0` and never invoke Anthropic. Phase 1 G2 wrapper instrumentation has nothing to instrument naturally.
- Fix: investigate Vercel cron schedule, source API health (USAspending, SAM.gov), ingestor auth. Resume ingestion and verify a new run lands a row in both `pathfinder.projects` AND (downstream) `pathfinder.llm_calls` once Ranker fires.

### Finding C — Telemetry observability

- `recordLLMCall` is fire-and-forget with `.catch(console.error)`. Two real bugs (RLS + CHECK constraint) silently dropped writes through Phase 1 G1 + G2 because the error never surfaced anywhere. PR #29 (RLS) + PR #30 (CHECK) fixed those, but the silent-failure mode persists.
- Action item for Stream A: route recorder errors through Axiom (logAxiom is already imported in `lib/llm/recorder.ts`). When `writeRow` rejects, fire an Axiom event at level=error with the rejection so operator dashboards see telemetry-write failures immediately.

### Cleanup PR — synthetic wrapper-probe

- `app/api/dev/wrapper-probe/route.ts` shipped in PR #28 to prove the wrapper writes `llm_calls`. Verified passing in PR #30 deploy. **Remove the route + the `api/dev/` exemption in `Pathfinder/middleware.ts`** in your first cleanup commit on this branch (or as a small standalone PR if you prefer to ship it before the rest of Stream A's gates). Mark the cleanup PR title `chore(g2): remove temporary wrapper-probe`.

**STOP. REPORT. Confirm A0 outcomes (PRs merged, ingestor running, llm_calls writing through cron) before Gate A1.**

## Gate A1 — Inngest scaffolding

Wire the existing agent pipeline through Inngest events per D2:

- `raw_event.created` → qualifier (currently folded into scoring per D6 — split if D6 says so)
- `signal.qualified` → enricher, geo, adjacency, competitive (some new — those land in A2)
- `signal.enriched` → ranker → verifier → drafter → briefer (existing)
- `decision.synthesized` → delivery dispatchers (existing)

Vercel cron continues polling source APIs (Ingestor stays cron-only). Inngest takes over orchestration for stages downstream of ingest. Reference: `docs/PLAN-AGENTS.md` and `lib/inngest/` (already scaffolded in Phase 1 G1 — 5 functions, only `slack-alert-on-verified` is full).

Tests: integration test that exercises the full pipeline through Inngest from a synthetic raw_event.

**STOP. REPORT.**

## Gate A2 — Missing agents

Build per `SPEC - Backend Architecture.md` Section 4:

- **Enricher** (research-tier, Perplexity Sonar). Hits the LLM gateway through `runStream`/`run` from `lib/llm/run.ts` — read-only contract from Phase 1 G1.
- **GeoMapper** (deterministic). Currently folded into scoring per D6 — only split if D6 documents the split rationale; otherwise add a thin shim that exposes geo metadata cleanly.
- **AdjacencyMapper** (research-tier).
- **CompetitiveIntel** (research-tier per spec; D7 may say keep as Computer Space agent — consult D7 before building).

Each new agent: implementation + unit tests + eval scaffolding (5 to 10 cases for this gate, full sets in a follow-up sprint).

**STOP. REPORT.**

## Gate A3 — Eval gate quality

Run each agent's eval set. Document baseline pass rates in `MEMORY/spec-references.md` per agent file. Capture cost-per-run baselines from `pathfinder.llm_calls` aggregates so the cost-alert cron from G2 has real reference data.

**STOP. REPORT.**

## Coordination with other streams

- **Stream B** also touches `Pathfinder/lib/`. Coordinate via PR review on shared files. Likely friction surfaces: `lib/types.ts`, `lib/notifications.ts`, `lib/ingest/index.ts`. Per Pathfinder/CLAUDE.md: append entries, never replace.
- **Stream D** (Architect) may invoke Stream A's agents from its tuning session. Define a clean API surface in `lib/agents/index.ts` (or wherever D1 placed shared code) and publish it via `MEMORY/spec-references.md` so D can build against a stable contract.
- **Phase 1 G1 LLM gateway** (`lib/llm/`) is read-only contract. Do not modify. Use `run` / `runStream` for Anthropic/Perplexity calls; do NOT call `anthropic()` factory inline (that's the legacy path the G2 wrapper instruments).
- Migrations: use numbers `0050+` to avoid collision with B/C/D/E.

## Out of scope (defer)

- Sales Agent Counterpart — post-Phase-2 stretch.
- Daily Intelligence Loop expansion beyond what currently exists in cron.
- Cost-alert dashboard UI (current cron + Slack/email is sufficient).
- Multi-region ingestor (Pathfinder ships single-region per Phase 1).

## Done criteria — "Stream A complete"

1. All four Gate A0 close-out items resolved and verified in production (outreach 504 fixed + stuck cleaner shipped, ingestor resuming and producing new projects, telemetry errors routed through Axiom, wrapper-probe cleaned up).
2. Inngest pipeline orchestrates `signal.qualified` → `decision.synthesized` flow with passing integration test.
3. Enricher / AdjacencyMapper shipped (and GeoMapper / CompetitiveIntel per their D-decisions). Unit tests pass. Eval scaffolds exist.
4. Eval baselines recorded in `MEMORY/spec-references.md`.
5. `pathfinder.llm_calls` shows real cron-driven rows from at least Ranker + Verifier + Enricher within the trailing 24h before reporting "complete".
6. Cost-to-date documented vs $25 cap.

Begin with Gate A0. The Phase 1 close-out findings are the single biggest blocker to Stream A's verification path.
