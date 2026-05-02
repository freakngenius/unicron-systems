# Stream E Smoke — E2 Coverage Expansion

**Status:** BLOCKED at live HTTP step. Same root causes as E1 — see `2026-05-01-stream-e-onboarder.md`.

## What I confirmed at the DB level
- Migration 0081 created `pathfinder.coverage_goals` and `pathfinder.coverage_goal_candidates` tables successfully.
- FK from `coverage_goals.agent_session_id` → `architect_sessions.id` resolves (sanity-checked via `information_schema`).
- FK from `coverage_goal_candidates.source_onboarder_session_id` → `architect_sessions.id` resolves.
- FK from `coverage_goal_candidates.data_source_id` → `data_sources.id` resolves.

## What unblocks the live smoke
Same as E1 — Vercel deploy + basic-auth creds. Suggested curl once unblocked:
```
curl -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASS" \
  -H 'content-type: application/json' \
  -d '{"vertical_id":"construction-security","goal_text":"Add 20 high-quality construction-security sources","budget_usd":5,"target_count":20}' \
  'https://pathfinder-kekas-projects-89ac4317.vercel.app/pathfinder/api/coverage/goals'
```
Then read the pre-flight estimate. If `< $5`, dispatch via `POST /api/coverage/goals/<id>/run`. Otherwise stop and report the estimate.

Verify in DB:
```
select id, status, estimate, total_cost_usd, total_sources_onboarded, total_sources_assist_queued, total_sources_declined
  from pathfinder.coverage_goals where vertical_id='construction-security'
  order by created_at desc limit 1;
```
