# Coverage Expansion — post-Tuesday queue

Source: `MEMORY/demo-prep/2026-05-04-coverage-expansion-results.md`. These follow-ups were surfaced by the 2026-05-02 estimate-only dispatch for Nashville/Pittsburgh/LA (PR #70). Parked here until after the 2026-05-05 Zedcor demo.

## (a) Re-run estimates via canonical Inngest path

Once `INNGEST_EVENT_KEY` is set in `Pathfinder/.env.local` (and Vercel env), re-fire the three goals through `pathfinder/coverage.estimate.requested` so the runs appear in Inngest's run history.

- Goal IDs (already in `pathfinder.coverage_goals`, status='draft'):
  - Nashville: `c097699d-4429-48af-ba33-400a203e107e`
  - Pittsburgh: `cd7c3137-557f-4616-9cc4-a0142925b545`
  - Los Angeles: `8f54bc9b-6de6-4826-a0fb-64b245b091c4`
- Dispatch surface: write a tiny API route (e.g. `app/api/coverage/dispatch/route.ts`) that calls `inngest.send({ name: 'pathfinder/coverage.estimate.requested', data: { goal_id } })`, OR add an `inngest.send` mode to `Pathfinder/scripts/dispatch-coverage-estimate.ts` (toggle by env-var presence)
- Caveat: re-running estimate against the same goal_id will OVERWRITE the existing `estimate` jsonb and re-INSERT into `coverage_goal_candidates` (the agent's `try { insert } catch {}` swallows the unique-violation per `coverage_goal_candidates_goal_url_idx`). Demo doc reading is preserved either way.

## (b) Cleanup PR for recorder ↔ architect_sessions linkage

`pathfinder.architect_sessions` for the 2026-05-02 run reported `total_cost_usd=0`, `total_llm_calls=0`, `total_tool_calls=0`, `reasoning_log=[]` even though Sonar + Anthropic calls happened (visible in `pathfinder.llm_calls`). Root cause: the `OnboarderSession` struct returned by `services/source-onboarder/session.ts:createSession` is not threaded into `lib/llm/run.ts`'s recorder.

Concrete fix shape:
- `lib/llm/run.ts` accepts an optional `session?: { log: (step) => void; costUsd: number; llmCalls: number; toolCalls: number }` arg
- Each call appends to `session.steps`, increments `costUsd` / `llmCalls`, so `finalizeSession` writes accurate totals
- Touch points: every `services/coverage-expansion/tools/*` and `services/source-onboarder/tools/*` that calls `run()` needs to pass through the session (already in scope as `args.sessionId`; needs the struct, not just the id)
- Migration: none. All columns exist already.

Without this fix, every Coverage Expansion / Source Onboarder run looks free in `architect_sessions`. Cost dashboards built on that table would mislead. `pathfinder.llm_calls` remains the source of truth in the meantime.

## Other follow-ups from same run (already in demo doc)

3. Sonar prompt tuning for sparse metros (PA / CA returned far fewer candidates than TN). Either tune `SONAR_PROMPT` in `services/coverage-expansion/tools/discover-candidates.ts` or seed curated registry with `PA-PIT`, `CA-LA-COUNTY`, `CA-CALTRANS` entries.
4. Tier 2 detection at estimate time — current behavior optimistically classifies every URL as Tier 1. Add a heuristic in `discoverViaSonar` (URL ends in `.pdf`, contains `/news/`, contains `/opportunity/<id>`) → tag `tier_2` upfront.
5. Don't fire `pathfinder/coverage.run.requested` for the three goal_ids without first pruning de-facto Tier 2 candidates from `coverage_goal_candidates`. Many would burn Source Onboarder budget on URLs that route to `declined`.

## Related

- Branch: `chore/coverage-expansion-estimate-dispatch` (PR #70, no merge needed pre-demo)
- Demo asset: `MEMORY/demo-prep/2026-05-04-coverage-expansion-results.md`
- Dispatch script: `Pathfinder/scripts/dispatch-coverage-estimate.ts`
- Inngest function: `Pathfinder/lib/inngest/functions/coverage-expansion.ts`
