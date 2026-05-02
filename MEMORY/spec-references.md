# Spec References

The anti-drift map. For non-trivial source files, this records:
- Which spec section the file implements
- When it was last verified
- Whether the implementation has drifted

Note: this file lives untracked in the workspace MEMORY/ dir. Earlier-session content (G0/G1/G2/Phase 2 Streams A–E) was cleared before 2026-05-01 17:00 UTC; it survives in git history at PR #37 and earlier squash-merges if recovery is needed. From 2026-05-01 forward this file rebuilds incrementally as files are touched/verified.

---

## Stream D — Architect Agent

**State:** PR #37 squash-merged at `68f7bd7` on main (2026-05-01). Verified post-merge 2026-05-01 17:50 UTC.

### Migrations

#### Pathfinder/supabase/migrations/0070_architect_sessions.sql
**Implements:** SPEC - Architect Agent.md §3, §6, §7 + SPEC - Backend Architecture.md §3.
**Last verified against spec:** 2026-05-01.
**Drift:** **minor, justified.** `vertical_id` + `customer_org_id` ship as `text`, not `uuid` FK to `vertical_configurations` / `users` (neither table exists in Pathfinder schema per D3 in decisions.md). Defaults to `'pathfinder-default'` for single-vertical Phase 2.
**Live state:** applied 2026-05-01. Confirmed via Supabase MCP `execute_sql`: `architect_sessions` has 15 columns matching types.ts; `architect_proposals` has 14 columns matching types.ts. RLS enabled on both. 0 rows.

### Runtime + tools

#### Pathfinder/services/architect/runtime/agent-loop.ts
**Implements:** SPEC - Architect Agent.md §2 (agent runtime, tool-use, system prompt, persisted session state).
**Last verified against spec:** 2026-05-01.
**Drift:** **major, justified, documented in decisions.md.** Hand-rolled Anthropic Messages API tool-use loop instead of `@anthropic-ai/claude-agent-sdk` — the SDK package spawns Claude Code as a subprocess (`pathToClaudeCodeExecutable`), incompatible with Vercel serverless. Same multi-turn tool-use semantics via `client.messages.create({ tools })`.

#### Pathfinder/services/architect/{prompts,tools,sessions}/*
**Implements:** SPEC - Architect Agent.md §3 (decomposition, 8 tools), §4 (tuning, 7 tools), §5 (discovery, 6 tools).
**Last verified against spec:** 2026-05-01.
**Drift:** **minor, additive.**
- `finalizeProposal` / `finalizeTuningRun` / `finalizeDiscoveryRun` tools added to terminate sessions with structured input (drift-free vs text-JSON parsing).
- WORKFLOW glue blocks appended to verbatim system prompts to tie them to the actual tool names.
- Tuning's `runShadowTest` is a **model-introspective estimator** (`method='model_introspective_estimate'`), not a real per-sample re-run — documented in decisions.md as Phase 2.5 deferral.

#### Pathfinder/services/architect/tools/feedback-store.ts
**Implements:** SPEC - Architect Agent.md §4 — feedback adapter.
**Last verified against spec:** 2026-05-01.
**Drift:** **minor.** Reads from `lead_actions` (live), `slack_messages.resolved_action` (live), and `outreach_edits` (Stream B B2 contract — table doesn't exist live yet). Verified 2026-05-01: querying missing `outreach_edits` returns Postgres `42P01`; the supabase wrapper's `if (!error && data)` + try-catch makes this non-fatal. Tuning sessions fall back to lead_actions + slack_messages alone.

### API endpoints (Pathfinder/app/api/architect/)

| Route | Spec | Status |
|---|---|---|
| `POST /decompose` | §3 | shipped, bearer auth via `ARCHITECT_API_TOKEN`, 300s maxDuration |
| `POST /tune` | §4 manual trigger | shipped, 1800s maxDuration |
| `POST /discover` | §5 manual + adjacency-callable | shipped, 900s maxDuration |
| Approve / dismiss endpoints | §7 (Architect Inbox UI) | **not yet shipped** — Stream C writes `architect_proposals.status` via supabase; documented in `MEMORY/audit-unicron-platform.md` |

### Inngest registration

| Function ID | Cron | Status |
|---|---|---|
| `pathfinder-architect-tuning-weekly` | `TZ=UTC 0 2 * * 0` (Sun 02:00 UTC) | registered |
| `pathfinder-architect-discovery-weekly` | `TZ=UTC 0 4 * * 0` (Sun 04:00 UTC) | registered |

Verified 2026-05-01 17:49 UTC: 10 unique IDs across the function set; only the two Stream D crons are time-triggered; 2-hour offset; no collisions.

### Tests + eval

#### Pathfinder/__tests__/architect/*.test.ts (mocked)
**Implements:** Disciplines §Layer 1 — unit tests with mocked Anthropic + SessionStore + FeedbackStore + SignalStore.
**Verified:** 2026-05-01 — 73 architect tests pass / 0 fail / 100% pass rate. Full Pathfinder suite: 451 / 0 / 23 (passed/failed/skipped).
- `agent-loop.test.ts` — 9 tests (loop semantics, cost cap, timeout, finalize)
- `decomposition-tools.test.ts` — 23 tests (catalog grounding, schema validation, structural rubric)
- `decomposition-session.test.ts` — 4 tests (orchestrator + session row create/update)
- `tuning-tools.test.ts` — 12 tests (clustering, draft revision, shadow-test gates)
- `tuning-session.test.ts` — 4 tests (multi-proposal capture + gate enforcement)
- `discovery-tools.test.ts` — 9 tests (jurisdiction-mining + portal lookup + impact estimator)
- `discovery-session.test.ts` — 5 tests (dedupe + 5-cap + gate enforcement)
- `eval-score.test.ts` — 7 tests (rubric scoring on synthetic proposals)

#### Pathfinder/services/architect/eval/*.jsonl (real-LLM fixtures)
**Implements:** SPEC - Architect Agent.md §3 (30 cases), §4 (20 cases), §5 (20 cases) eval coverage.
**Last verified against spec:** 2026-05-01.
**Mocked rubric baseline:** N/A — `eval-score.test.ts` validates the scoring code on synthetic proposals (7/7 pass), not on the 70 fixtures.
**Real-LLM pass-rate baseline:** pending. Scheduled remote agent `trig_015ZCGczmMBPHAmSzF5mGXmR` runs 2026-05-08 14:00 UTC against `--slice 5` decomposition + `--slice 3` tuning + `--slice 3` discovery (cost-bounded to $10).

### Cost discipline

Stream D total cost-to-date: **$0** of $25 cap. All tests use mocked Anthropic clients; no real-LLM calls fired by Stream D code in this session or prior.

The 2026-05-08 smoke is the first real-LLM exercise; expected cost $1.50–$5 across the three slices.
