# STREAM-README — Stream E: Source Onboarder + Coverage Expansion Agent

You are executing Stream E of Phase 2 of the Unicron Systems build. This is **new build** work. Pathfinder has inlined fetch logic for two sources (USAspending, SAM.gov) — that is NOT a Source Onboarder, that's a fixed ingestor. You build the autonomous loop: Source Onboarder (Tier 1 sources first) and Coverage Expansion Agent (goal-driven, dispatches Source Onboarder).

Worktree: `Phase2-worktrees/unicron-stream-e-source-onboarder`. Branch: `stream/e-source-onboarder`. Created off `main@e215f14` (post-Phase-1-G2).

## Read these documents in order

1. `STREAM-README.md` (this file)
2. `../../00 - START HERE - Product & Build Plan.md`
3. `../../00 - SKILLS & DISCIPLINES.md`
4. `../../00 - PARALLEL BUILD MAP.md`
5. `../../MEMORY/progress.md`
6. `../../MEMORY/decisions.md`
7. `../../MEMORY/gap-analysis.md`
8. **`../../SPEC - Source Onboarder Agent.md` — canonical for E1.**
9. **`../../SPEC - Coverage Expansion Agent.md` — canonical for E2.**
10. `../../SPEC - Backend Architecture.md`
11. `../../MEMORY/audit-pathfinder.md` (existing ingestor patterns + LLM gateway contract)
12. `../../MEMORY/spec-references.md`
13. `../../MEMORY/learnings.md`

## Hard constraints

- **Cost cap:** $25 across all gates. Stop and report at $20.
- **Time cap:** 2 to 3 weeks of human-supervised bursts.
- Stay in this worktree. Do not modify code in main, in other worktrees, in `_demo-snapshot-2026-04-30/`, or in any other `Phase2-worktrees/` directory.
- Do not modify any `.md` spec file at workspace root. Treat them as read-only canonical sources.
- The two existing inlined fetchers in Pathfinder (USAspending, SAM.gov) are **read-only references** for Stream E. Do not delete or refactor them; once your adapter library is mature, Stream A may migrate them in a future sprint.
- Update `MEMORY/spec-references.md` (in main, via PR) for every file you create or significantly modify.
- Follow all four disciplines from `00 - SKILLS & DISCIPLINES.md`.

## Read the specs twice before any code

`SPEC - Source Onboarder Agent.md` Sections 4-7 are your build map for E1. `SPEC - Coverage Expansion Agent.md` is for E2. Read both fully, sketch the tool surfaces, then re-read. The autonomy budget here is real — operator should be able to type a Socrata URL and watch the system investigate, generate an adapter, deploy, and produce its first event in under 90 seconds.

## Gate E1 — Source Onboarder for Tier 1 sources

- Build per spec Sections 4 to 7. **Tier 1 only:** Socrata, REST APIs (JSON-paginated), RSS feeds, JSON dumps. No HTML scraping, no JS-rendered pages, no auth-walled sources in Tier 1.
- Tools layer in `services/source-onboarder/tools/` (location per D1 monorepo decision — confirm with `MEMORY/decisions.md`).
- Adapter library at `lib/adapters/` (location per D1). This is the shared surface that Pathfinder's existing ingestor will eventually migrate to.
- Operator-driven entry point: API + UI hook (Stream C wires the UI; E publishes the API contract early).

Live demo path (the bar for "E1 complete"):
1. Operator types a Socrata URL.
2. Source Onboarder fetches, classifies (Socrata adapter), introspects schema.
3. Generates an adapter instance config.
4. Deploys (writes to `pathfinder.sources` or equivalent — coordinate with A on schema).
5. First event flows downstream within 90 seconds.

Eval: 30 candidate URLs across Tier 1 source types. Document pass rates per type.

Tests: per-tool unit tests, end-to-end against eval set, a smoke test that exercises the live demo path against a real Socrata endpoint (e.g., NYC Open Data) in a staging environment.

**STOP. REPORT.** Publish the API contract before Stream C starts mocking against it.

## Gate E2 — Coverage Expansion Agent

- Build per spec. Goal-driven (operator: "I want Texas property records"), dispatches Source Onboarder against candidate URLs, tracks progress.
- Pre-flight estimation flow: before dispatching, estimate cost + time + likely-completeness. Surfaces estimate to operator UI (Stream C).
- Operator UI integration: Stream C surfaces the goal-input + estimate + progress. Define the contract in this README early.

Eval: 5 multi-source coverage goals run end-to-end (e.g., "all California building permits", "all Florida public adjuster licenses").

Tests: dispatch-tree unit tests, end-to-end against eval goals.

**STOP. REPORT.**

## Gate E3 — Tier 2 human-assist queue

- For sources Source Onboarder cannot handle autonomously (auth-walled, JS-rendered, anti-bot), build the human-assist ticket flow.
- Surface tickets in `architect_inbox` (same table as Stream D's proposals — extend the schema if needed, coordinate with D).
- Operator picks up the ticket, supplies the missing piece (auth token, rendered HTML, etc.), Source Onboarder resumes.

Tests: ticket lifecycle, resume-from-checkpoint behavior.

**STOP. REPORT.**

## Coordination with other streams

- **Stream A** owns the cron pipeline and (per their A2) the new agents. The adapter library at `lib/adapters/` is shared with Pathfinder's existing ingestor. Coordinate with A on the migration path: E builds the library, A's existing ingestor stays inlined for Phase 2 unless A explicitly opts to migrate.
- **Stream A** also owns Inngest scaffolding. E2's Coverage Expansion Agent registers as an Inngest function for goal-tracking. A's PR review confirms no function-name collision.
- **Stream C** depends on E1's API contract (for Add Source UI) and E2's contract (for goal-input + progress UI). Publish both contracts in this README's "API contract" section early.
- **Stream D** owns `architect_inbox`. E3's tickets land in the same table — coordinate the schema if extending.
- **Phase 1 G1 LLM gateway** (`lib/llm/`) is read-only contract. Source Onboarder uses gateway calls for source classification + adapter generation. Use `run` / `runStream`, not the bare SDK.
- Migrations: use `0080+` to avoid collision with B (0050+) and D (0070+).

## API contract draft (publish early, refine in Gate E1)

```
POST /api/sources/onboard
Request: { url: string, hint?: 'socrata'|'rest'|'rss'|'json-dump' }
Response: { source_id: string, adapter_kind: string, schema: {...}, status: 'live'|'queued'|'human-assist', first_event_at?: string }
Stream C consumes: source_id + status for the Add Source flow.
```

Refine in Gate E1; publish final shape there.

## Out of scope (defer)

- Tier 3 sources (proprietary APIs, partner data feeds) — post-Phase-2.
- Multi-region adapter deployment (single-region for Phase 2).
- Automatic schema-drift detection on already-onboarded sources (post-Phase-2).
- Per-source rate-limiting (use a global rate limiter from Phase 1 if it exists; defer per-source).

## Done criteria — "Stream E complete"

1. Source Onboarder live for all four Tier 1 source types, eval pass rate ≥80%.
2. Coverage Expansion Agent runs end-to-end on 5 multi-source goals.
3. Tier 2 human-assist queue working, surfacing in `architect_inbox`.
4. API contracts published; Stream C swapped from mock to real with single config flip.
5. Adapter library at `lib/adapters/` documented for future Pathfinder ingestor migration.
6. Cost-to-date documented vs $25 cap.
