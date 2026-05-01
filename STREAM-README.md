# STREAM-README — Stream C: Operator UI (unicron-platform) Wired to Real Backend

You are executing Stream C of Phase 2 of the Unicron Systems build. This is **evolution** work on `unicron-platform/`, the Vite + React 19 operator UI. The audit found it's ~25-30% built and 100% mocked. Stream C replaces mocks with real Supabase queries, wires the visualizer to live data via Realtime, and resolves the two-coexisting-visualizers issue.

Worktree: `Phase2-worktrees/unicron-stream-c-platform`. Branch: `stream/c-platform`. Created off `main@e215f14` (post-Phase-1-G2).

## Read these documents in order

1. `STREAM-README.md` (this file)
2. `../../00 - START HERE - Product & Build Plan.md`
3. `../../00 - SKILLS & DISCIPLINES.md`
4. `../../00 - PARALLEL BUILD MAP.md`
5. `../../MEMORY/progress.md`
6. `../../MEMORY/decisions.md`
7. `../../MEMORY/gap-analysis.md`
8. **`../../MEMORY/audit-unicron-platform.md` — read in full. This is your canonical source-of-truth for what already exists.**
9. `../../MEMORY/audit-pathfinder.md` — read the migration list + the LLM gateway / observability sections so you understand the read-only contract.
10. `../../SPEC - Living Intelligence FINAL (Claude Code).md`
11. `../../SPEC - Living Intelligence Visual System.md`
12. `../../SPEC - Pathfinder Customer Dashboard.md` (for the boundary between operator UI and customer dashboard)
13. `../../MEMORY/spec-references.md`
14. `../../MEMORY/learnings.md`

## Hard constraints

- **Cost cap:** $25 across all gates. Stop and report at $20.
- **Time cap:** 2 to 3 weeks of human-supervised bursts.
- Stay in this worktree. Do not modify code in main, in other worktrees, in `_demo-snapshot-2026-04-30/`, or in any other `Phase2-worktrees/` directory.
- Do not modify any `.md` spec file at workspace root. Treat them as read-only canonical sources.
- **Do not modify Pathfinder/.** Stream C reads from the same Supabase project Pathfinder writes to, but the schema and the cron pipeline are owned by Streams A + B. Treat `pathfinder.*` tables as read-only contracts.
- **Do not write to `pathfinder.llm_calls`.** That's owned by Phase 1 G1's gateway path; recorder uses `supabaseAdmin` (service role). Stream C reads aggregated cost data via `app/api/cost-summary/` already published by Pathfinder.
- Update `MEMORY/spec-references.md` (in main, via PR) for every file you create or significantly modify.
- Follow all four disciplines from `00 - SKILLS & DISCIPLINES.md`.

## Audit before building

Re-read `MEMORY/audit-unicron-platform.md` in full. Confirm:

- The SystemContext + 8 mutators structure exists and is documented.
- The Canvas-2D React port AND iframe Pixi version both coexist. **Resolve this.** Recommendation per Phase 2 spawn prompt: keep the Canvas-2D React port driven by SystemConfig (visualizer-as-component), retire the iframe Pixi version (decorative and confusing). Document the decision in `MEMORY/decisions.md` before deleting.
- The Architect Inbox UI exists but the "thinking" is fully scripted. Stream D ships the real Architect API.
- Source Onboarder UI exists but the onboarding is fully mocked. Stream E ships the real Source Onboarder.

## Gate C1 — Real Supabase wiring

- Replace ALL mock data sources in `unicron-platform/` with real Supabase queries.
- Activity feed reads from real `pathfinder.agent_log` and `pathfinder.agent_runs` tables.
- Settings drawer wires to real Settings table (create one in `unicron.*` schema if it doesn't exist; don't pollute `pathfinder.*`).
- Authentication flow wires to real Supabase auth.
- Use the **anon** Supabase client for reads (RLS allows `anon, authenticated` SELECT on the read-public tables); never use service-role keys in browser code.

Tests: component-level smoke tests against a Supabase test project (or mocked client). End-to-end smoke against the live Supabase project for at least Activity Feed.

**STOP. REPORT.**

## Gate C2 — Visualizer driven by real data

- Pick the Canvas-2D React port. Retire the iframe Pixi version (commit deletion with explicit reasoning in commit message).
- Visualizer subscribes to Supabase Realtime on `pathfinder.agent_runs` (and any other real activity tables) — every new run becomes a node in the visualizer.
- HUD counters tick from real cost data via the existing `app/api/cost-summary/` endpoint Pathfinder publishes (read-only contract).
- Note: counters will read 0 until Stream A's Gate A0 work resumes ingestion; coordinate timing.

Tests: visualizer renders correctly with empty state, single event, burst of events. Realtime subscription teardown on unmount.

**STOP. REPORT.**

## Gate C3 — Architect Inbox + Add Source/Edit Node panels

- When Stream D ships its Architect API, replace the mock decomposition flow with real Architect calls. Until D ships, keep the mock but mark every TODO with the file:line and the expected D contract.
- When Stream E ships its Source Onboarder, replace the mock Add Source flow with real onboarding. Same pattern: mark TODOs explicitly, do not invent contract.
- Do NOT block this gate on D/E being done. Ship the C-side wiring with mocks behind a feature flag or environment-gated swap so the swap is one-line when D/E land.

Tests: contract-level tests for the C↔D boundary and the C↔E boundary, using mocked API responses that match the published contracts in D/E's READMEs.

**STOP. REPORT.**

## Coordination with other streams

- **Stream A** owns `pathfinder.agent_runs`, `pathfinder.agent_log`, the cron pipeline. C reads from these. If A migrates a table, C's queries break — A's PRs must call out schema changes in the description; C subscribes to A's PR titles.
- **Stream B** owns the customer dashboard. No direct conflict — C is operator-facing, B is customer-facing. They share a Supabase project but not a UI.
- **Stream D** publishes the Architect API contract early. C builds against the published contract. D's STREAM-README.md will surface the API URL + payload shapes.
- **Stream E** publishes the Source Onboarder contract early. Same pattern.
- **Phase 1 G1 LLM gateway** is read-only. C never calls Anthropic / Perplexity directly — it reads aggregates from `pathfinder.llm_calls` (via the cost-summary endpoint).

## Out of scope (defer)

- Daily Intelligence Loop expansion (post-Phase-2 stretch).
- Multi-tenant operator UI (Phase 2 is single-tenant for Unicron itself).
- Mobile responsive (operator UI is desktop-first).
- Native auth via Pathfinder accounts (operator accounts live in `unicron.*` schema; customer accounts live in `pathfinder.*`).

## Done criteria — "Stream C complete"

1. Activity feed shows live agent runs from `pathfinder.agent_runs` updating in real time.
2. Visualizer (Canvas-2D React port) renders real events. Pixi iframe version deleted.
3. HUD counters tick on real cost data from `pathfinder.llm_calls` aggregates.
4. Architect Inbox swappable to D's real API with one config flip.
5. Add Source flow swappable to E's real onboarder with one config flip.
6. Settings drawer + auth wired to real Supabase.
7. `MEMORY/spec-references.md` updated for every file touched.
8. Cost-to-date documented vs $25 cap.
