# Stream E Smoke — E1 Source Onboarder

**Status:** BLOCKED at live HTTP step. DB-level coexistence proven.
**Date:** 2026-05-01
**Migrations applied:** 0080, 0081, 0082 to `anfihcusvekpovcchpoh` (in order: 0082 → 0080 → 0081 — reordered from spec because 0080's `agent_role` index references a column that 0082 adds; original spec order produces `ERROR: column "agent_role" does not exist`).

## What I tried as a substitute for the live HTTP test
Because (a) I have no `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` and the hard-constraint forbids `.env*` reads, and (b) my PR #39 Vercel deploy is in ERROR state and production is still serving PR #36's pre-fix code — I exercised the schema coexistence via direct DB inserts mirroring the patched `services/source-onboarder/session.ts` shape exactly.

### Insert (mirrors `createSession` after PR #39)
```sql
insert into pathfinder.architect_sessions (
  session_type, trigger, input_payload,
  agent_role, goal, input, status, reasoning_log, created_by_user_email
) values (
  'discovery', 'operator_action', '{"url":"https://data.cityofchicago.org/resource/4ijn-s7e5.json","hint":"socrata"}'::jsonb,
  'source-onboarder',
  'https://data.cityofchicago.org/resource/4ijn-s7e5.json',
  '{"url":"https://data.cityofchicago.org/resource/4ijn-s7e5.json","hint":"socrata"}'::jsonb,
  'running', '[]'::jsonb, 'verification@unicron.systems'
);
```
**Result:** ✅ row created, all NOT NULL constraints satisfied, status CHECK accepted `'running'`.

### Finalize-status sweep (all 4 Stream E final values)
`succeeded`, `failed`, `needs_assist`, `timed_out` — all accepted by the widened CHECK union from migration 0082. ✅

### Test rows cleaned up
`delete from pathfinder.architect_sessions where created_by_user_email='verification@unicron.systems' or (agent_role='source-onboarder' and goal='t');` — 0 rows remaining.

## Why the live HTTP smoke test could not run
1. **Vercel deploy of PR #39 (commit `90a9f46`) is in ERROR state.** Build succeeded, but readyState=ERROR. Same pattern affects PR #37, #38, #40 — all errored. Production aliases `pathfinder-kekas-projects-89ac4317.vercel.app` and `pathfinder-git-main-...` are listed on my deploy but runtime logs confirm traffic still hits `dpl_HcgyYJXskTrge1VTZDNRaSoXP2aK` (PR #36's deploy).
2. **PR #36 code does NOT populate Stream D's NOT NULL columns** — that's the bug PR #39 fixed. Hitting the live endpoint right now would 500 (and is — see below).
3. **No `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` available** to hit the gated endpoint. Hard constraint forbids `.env*` reads.

## Independent confirmation that production is currently failing
Production runtime logs (last 30 min) show two real 500s on `POST /pathfinder/api/sources/onboard` at 23:59:05 and 23:59:10 UTC. Those are real users hitting the bug PR #39 is supposed to fix.

## What unblocks the live smoke test
Two prerequisites, in order:
1. Vercel deploy pipeline fix (see `2026-05-01-vercel-deploy-failures.md`). My PR #39 must reach READY state on production for the patched session.ts to actually run.
2. Either basic-auth creds passed to me, OR you run the smoke test yourself once #1 lands. Suggested curl:
   ```
   curl -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASS" \
     -H 'content-type: application/json' \
     -d '{"url":"https://data.cityofchicago.org/resource/4ijn-s7e5.json","hint":"socrata","jurisdiction":"IL-Chicago","created_by_user_email":"verification@unicron.systems"}' \
     'https://pathfinder-kekas-projects-89ac4317.vercel.app/pathfinder/api/sources/onboard?sync=1'
   ```
   Then verify in DB:
   ```
   select id, agent_role, status, total_cost_usd, total_llm_calls
     from pathfinder.architect_sessions
     where created_by_user_email='verification@unicron.systems'
     order by started_at desc limit 1;

   select id, status, adapter_kind, jurisdiction
     from pathfinder.data_sources
     where created_by_user_email='verification@unicron.systems'
     order by created_at desc limit 1;
   ```
