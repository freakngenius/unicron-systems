# GATE 2 — Sprint Z1B smoke evidence

**Branch:** `feat/zedcor-tier1-ui`
**PR:** #484
**Implementation commit:** `3a69ba1` (schema-fix on top of `ef40d8d`)
**Plan commit:** `878d7d3` (approved at GATE 1)

## Coordination state

Z1A is on `feat/zedcor-tier1-manual` (not the `-adapters` name from the PLAN). Z1A applied their schema migration **directly to live Supabase via `apply_migration`** rather than via a migration file in `main`. As of this commit, no Z1A migration file is in `main` but the live `pathfinder.*` schema has all the columns Z1A's orchestrator and Z1B's stub need.

Per Kyle's GATE 1 direction once the live-schema state was confirmed, this PR **bypasses the file-in-main check** and writes against the actual live schema. Discrepancies from the original PLAN — and the adaptations applied in commit `3a69ba1`:

| PLAN field | Live constraint | Z1B adaptation |
|---|---|---|
| `agent_name='zedcor-orchestrator-manual'` | Not in CHECK | `'ingestor'` for orchestrator + `'briefing'` for digest audit |
| `runner='manual-stub'` | CHECK = (cron, pc, manual) | `'manual'`; stub-ness flagged in `run_metadata.source='sprint-z1b-stub'` |
| `status='partial_failure'` | CHECK = (running, success, failed, empty_queue) | `'success'` |
| `agent_log.run_id` (column) | Doesn't exist | `run_id` stored in `event_data` jsonb; `run-status` reads from `agent_runs.run_metadata` directly |
| `agent_log.runner` | NOT NULL | Included on every insert ('manual') |

## Verified locally (commit 388697a) — auth gate

```
$ curl -sS -w "code=%{http_code} redirect=%{redirect_url}\n" --max-time 60 \
    'http://localhost:3055/pathfinder/internal/zedcor/run'

code=307
redirect=http://localhost:3055/pathfinder/login
```

Response body carries the redirect digest from the layout:

```
a:E{"digest":"NEXT_REDIRECT;replace;/login;307;","message":"NEXT_REDIRECT",
  "stack":"Error: NEXT_REDIRECT
    at AuthenticatedLayout (webpack-internal:///(rsc)/./app/(authenticated)/layout.tsx:27:66)"}
```

All six API routes uniformly return `401 {"error":"no_session"}` without a session:

```
/api/zedcor/recent-runs (GET)           code=401 body={"error":"no_session"}
/api/zedcor/run-status?run_id=1 (GET)   code=401 body={"error":"no_session"}
/api/zedcor/toggle-scheduled (POST)     code=401 body={"error":"no_session"}
/api/zedcor/digest-preview (GET)        code=401 body={"error":"no_session"}
/api/zedcor/run-orchestrator (POST)     code=401 body={"error":"no_session"}
/api/zedcor/send-digest (POST)          code=401 body={"error":"no_session"}
```

Auto-revert defense **"Page renders but auth gate is bypassed" is verified in code**.

## Verified locally (commit 3a69ba1) — both Vercel projects build clean

```
$ cd Pathfinder && pnpm typecheck    # exit 0
$ pnpm lint                          # ✔ No ESLint warnings or errors
$ pnpm build                         # registers /internal/zedcor/run + 6 /api/zedcor/* routes

$ cd .. && pnpm typecheck            # unicron-systems root — exit 0
$ pnpm build                         # exit 0, no regression
```

Pathfinder build output snippet:
```
├ ƒ /api/zedcor/digest-preview                                   0 B                0 B
├ ƒ /api/zedcor/recent-runs                                      0 B                0 B
├ ƒ /api/zedcor/run-orchestrator                                 0 B                0 B
├ ƒ /api/zedcor/run-status                                       0 B                0 B
├ ƒ /api/zedcor/send-digest                                      0 B                0 B
├ ƒ /api/zedcor/toggle-scheduled                                 0 B                0 B
├ ƒ /internal/zedcor/run                                         4.37 kB        95.9 kB
```

## Verified via Supabase MCP — schema dry-runs pass

Each route's INSERT/UPDATE payload was rehearsed against the live database (project `anfihcusvekpovcchpoh`) inside `BEGIN; ... ROLLBACK;` so no rows persisted.

**`run-orchestrator` → `pathfinder.agent_runs` INSERT:**
```sql
INSERT INTO pathfinder.agent_runs (
  agent_name, runner, organization_id, hub_id, started_at, status,
  records_processed, records_new, run_metadata, error_message
) VALUES (
  'ingestor', 'manual', '6cd87740-7c72-4337-ac79-316a54242eef',
  '7afddaff-1b06-428d-94a4-83cf5434e806',
  now(), 'running', 0, 0,
  '{"source":"sprint-z1b-stub","step_label":"Starting…","percent":0}'::jsonb,
  NULL
) RETURNING id;
-- returned: id=6672 (rolled back)
```

**`toggle-scheduled` → `pathfinder.agent_log` INSERT + `organizations` UPDATE:**
```sql
INSERT INTO pathfinder.agent_log (agent_name, runner, organization_id, event_type, event_data)
VALUES ('ingestor', 'manual', '6cd87740-7c72-4337-ac79-316a54242eef', 'manual_only_toggle',
  '{"by":"kyle@freakngenius.com","from":false,"to":true,"enabled":false,"source":"sprint-z1b"}'::jsonb)
RETURNING id;
-- returned: id=23582 (rolled back)

UPDATE pathfinder.organizations
SET config = config || '{"manual_only":true}'::jsonb
WHERE id = '6cd87740-7c72-4337-ac79-316a54242eef'
RETURNING id, config;
-- returned: { id, config: {"manual_only":true} } (rolled back)
```

**`send-digest` → `pathfinder.agent_log` INSERT:**
```sql
INSERT INTO pathfinder.agent_log (agent_name, runner, organization_id, event_type, event_data)
VALUES ('briefing', 'manual', '6cd87740-7c72-4337-ac79-316a54242eef', 'digest_sent_stub',
  '{"recipients":["team@unicron.systems"],"resend_message_id":"stub-mock-id","lead_count":12,
    "by":"kyle@freakngenius.com","source":"sprint-z1b-stub"}'::jsonb)
RETURNING id;
-- (rolled back, INSERT succeeded)
```

All three pass the live CHECK constraints. The actual API routes will write identical shapes when an authed operator triggers them.

## Org isolation defenses (auto-revert: "Toggle writes to the WRONG org's config")

- All write paths hard-code `organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'` in INSERT payloads.
- `toggle-scheduled` UPDATE also hard-filters by `id = '6cd87740-...'` so the WHERE clause cannot match another tenant by accident.
- `recent-runs` query: `WHERE organization_id = $1 AND runner = 'manual'`.
- `run-status` query: filtered by both `id = ?run_id` AND `organization_id = $ZEDCOR` to prevent cross-tenant peeks.

## Preview deploy state — live and reachable

After Kyle disabled Vercel Deployment Protection and rebased the branch with verified author identity:

- Branch alias: `pathfinder-git-feat-zedcor-tier1-ui-kekas-projects-89ac4317.vercel.app`
- Latest deploy: `dpl_6wze1FDxaxz8oFGTyEuCCXSAsnzr` (commit `a99e321`), state READY.
- The `/api/zedcor/` exclusion in `middleware.ts` was needed and added in `a99e321` (Z1A added the same exclusion independently in `a64cf003` — identical edits merge clean).

## Live-preview smoke — green

```
$ curl -sS -o /tmp/z1b-smoke/A.html -D /tmp/z1b-smoke/A.h -w "code=%{http_code} redirect=%{redirect_url}" \
    "$PREVIEW/pathfinder/internal/zedcor/run"

code=307 redirect=https://pathfinder-git-feat-zedcor-tier1-ui-kekas-projects-89ac4317.vercel.app/pathfinder/login
HTTP/2 307
location: /pathfinder/login

NEXT_REDIRECT digest in body:
NEXT_REDIRECT;replace;/login;307;
```

Confirms the `app/(authenticated)/layout.tsx` operator gate fires on the live preview before any page content is delivered. Auto-revert defense "Page renders but auth gate is bypassed" is verified on the production Vercel runtime.

All 6 API routes uniformly 401 without a session:

```
GET  /api/zedcor/recent-runs          {"error":"no_session"} | code=401
GET  /api/zedcor/run-status?run_id=1  {"error":"no_session"} | code=401
POST /api/zedcor/toggle-scheduled     {"error":"no_session"} | code=401
GET  /api/zedcor/digest-preview       {"error":"no_session"} | code=401
POST /api/zedcor/run-orchestrator     {"error":"no_session"} | code=401
POST /api/zedcor/send-digest          {"error":"no_session"} | code=401
```

## What is left for the human-driven smoke pass

The deterministic auth-gate proofs above cover smoke steps 1, 2, 8 (page render redirect / API gates / incognito). Steps 3-7 require an authenticated operator browser session (clicks + screenshots), which can only be Kyle since the magic-link sign-in flow is interactive. Pulling the four `pathfinder.agent_log` rows that those clicks generate is a one-call Supabase MCP query I'll run after the visual pass:

1. **Operator sign-in.** Visit the branch alias above, request a magic link from `/pathfinder/login`, click the link in email.
2. **Page render.** Land on `/pathfinder/internal/zedcor/run`. Screenshot header + Run button + toggle + digest panel + (initially empty) recent-runs table.
3. **Run button.** Click Run Zedcor. The 2-second stub writes a `pathfinder.agent_runs` row + 3 `agent_log` events + a final `orchestrator_run_summary_stub` row. Screenshot the Live Progress mid-flight if a poll tick lands during the run (it ticks twice in 2s). Screenshot the populated Recent Runs row afterwards.
4. **Toggle.** Flip Scheduled toggle on → off → on. Three `agent_log` rows land with `event_type='manual_only_toggle'`.
5. **Send digest.** Type `team@unicron.systems, kyle@freakngenius.com` → click Send → confirm the inline result shows `message ID stub-mock-id · lead_count 12`. One `agent_log` row lands with `event_type='digest_sent_stub'`.
6. **Preview digest →** opens the placeholder card.
7. **Refresh.** Page re-renders with the runs persisted and toggle state intact.
8. **Incognito.** Hit `/pathfinder/internal/zedcor/run` without cookies; confirm redirect to `/login`.

After your visual pass, I can pull the four `agent_log` rows from the live DB via Supabase MCP for the PR evidence dump.
