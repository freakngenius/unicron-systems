# 2026-05-02 — agent_runs telemetry regression (demo-blocking)

## Symptom

All Pathfinder cron handlers stopped writing to `pathfinder.agent_runs` since **2026-05-02 00:44:06 UTC**. The Vercel cron schedules continue to fire on cadence and return HTTP 200, but no rows land.

## Evidence (verbatim, captured 2026-05-02 04:11 UTC)

### Last run per agent (from Supabase MCP execute_sql)

```sql
select agent_name, max(started_at) as last_run,
       count(*) filter (where started_at > now() - interval '24 hours') as last_24h
  from pathfinder.agent_runs
  group by agent_name order by max(started_at) desc;
```

| agent_name | last_run                       | last_24h |
|---|---|---|
| ranker     | 2026-05-02 00:44:06.038+00     | 44 |
| verifier   | 2026-05-02 00:43:41.534+00     | 29 |
| ingestor   | 2026-05-02 00:00:24.737042+00  |  8 |
| outreach   | 2026-05-01 17:45:32.211+00     |  8 |
| adjacent   | 2026-04-28 16:13:29.167+00     |  0 |

### Vercel runtime logs (project `prj_UwEYuzUkDTEwJz9HU4WgexQoax4m`, since=3h, level=error)

ranker `/api/cron/ranker`:
```
04:00:44 GET 200
03:30:03 GET 200
03:00:01 GET 200
02:30:01 GET 200
02:00:01 GET 200
01:30:01 GET 200
```
**Zero error-level logs.** Same pattern for slack-alerts (10 firings post-PR-#49-deploy, all 200).

### RLS policies on pathfinder.agent_runs

```
agent_runs_read   SELECT  to {anon, authenticated}    qual=true
agent_runs_write  ALL     to {service_role}           qual=true, withcheck=true
```

Service-role writes are policy-allowed.

## What we know

- The ranker route at `Pathfinder/app/api/cron/ranker/route.ts:483-525` opens an agent_runs row before doing work and returns 500 if the insert fails (`if (runInsertRes.error || !runInsertRes.data) { return 500 }`).
- Routes are returning 200, which would normally imply the insert succeeded. Yet `select count(*) from pathfinder.agent_runs where started_at > now() - interval '30 min'` returns zero.
- Other Supabase tables (`pathfinder.projects`, `pathfinder.outreach_drafts`, `pathfinder.llm_calls`) ARE accepting writes — only agent_runs appears affected. **(Worth re-verifying — the agent_runs starvation may correlate with other writes too.)**

## Demo impact

- Tuesday's score-distribution + cost dashboards key off `agent_runs`. With it frozen at ~00:44 UTC, the panels will look broken on demo day.
- PR #49's "fix" (Bug C — slack-alerts/cost-alert/briefing telemetry) is masked. The handler shells now have agent_runs lifecycle calls but the underlying mechanism isn't accepting writes from any handler right now.

## Diagnosis order for the next session

1. **Manual route probe**: hit the ranker directly and inspect the response body:
   ```bash
   curl -i "https://pathfinder-ashy.vercel.app/pathfinder/api/cron/ranker?secret=$CRON_SECRET" | head -50
   ```
   The success body should contain `run_id` (the just-inserted agent_runs.id). If `run_id` is present but the row is missing in DB, we have a write-vs-read split or replica drift. If the body shows an error string, that's the immediate root cause.

2. **Check `pathfinder.llm_calls` writes** as a control: those are produced by the same `supabaseAdmin()` client. If llm_calls is accepting writes but agent_runs is not, the issue is table-specific (RLS, trigger, FK constraint).

3. **Inspect agent_runs for any table-level damage**:
   ```sql
   select * from pg_stat_user_tables where relname='agent_runs';
   select * from pathfinder.agent_runs order by id desc limit 1;  -- verify highest id and recency
   ```

4. **Bust Vercel build cache**: if 1-3 don't surface a cause, redeploy with a no-op commit to force a fresh build (Vercel sometimes caches lib/ outputs across deploys; possible the supabase client init is stale).

5. **As a last resort**: capture the route's own console.log output by hitting it with verbose logging. Add a temporary log line, deploy, observe via `get_runtime_logs` with `query="ranker"` and no level filter.

## Effort estimate

15-45 min. Most likely root cause is either (a) Vercel build cache regression after one of today's many deploys, or (b) a transient Supabase write-path issue tied to one of the recent migration applies. Both are quick to confirm/dismiss with steps 1-2.

## Out of scope for this todo

- Do NOT change agent_runs schema.
- Do NOT modify producer-cron handlers (they were verified working until 00:44 UTC; their code is fine).
- The fix should be a deploy/config change, not a code rewrite.

## Demo-blocker priority

**CRITICAL** — must be resolved before Tuesday demo. The demo's "Computer is the engine" narrative leans on visible agent activity. A frozen activity feed undermines the pitch even if every other system works.
