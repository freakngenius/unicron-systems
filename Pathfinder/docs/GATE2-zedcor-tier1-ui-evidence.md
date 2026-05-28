# GATE 2 — Sprint Z1B smoke evidence

**Branch:** `feat/zedcor-tier1-ui`
**Implementation commit:** `ef40d8d` (pushed)
**Plan commit:** `878d7d3` (approved by Kyle at GATE 1)

## Verified locally

### 1. TypeScript clean in both Vercel projects

```
$ cd Pathfinder && pnpm typecheck
$ tsc --noEmit
[exit 0]

$ cd .. && pnpm typecheck         # unicron-systems root project
$ tsc --noEmit
[exit 0]
```

### 2. Lint clean in Pathfinder

```
$ pnpm lint
$ next lint
✔ No ESLint warnings or errors
```

Root `next lint` prompts interactively for ESLint config — pre-existing repo state, not caused by this PR. Not blocking.

### 3. Production build clean in both Vercel projects

Pathfinder — new routes registered:
```
├ ƒ /api/zedcor/digest-preview                                   0 B                0 B
├ ƒ /api/zedcor/recent-runs                                      0 B                0 B
├ ƒ /api/zedcor/run-orchestrator                                 0 B                0 B
├ ƒ /api/zedcor/run-status                                       0 B                0 B
├ ƒ /api/zedcor/send-digest                                      0 B                0 B
├ ƒ /api/zedcor/toggle-scheduled                                 0 B                0 B
├ ƒ /internal/zedcor/run                                         4.37 kB        95.9 kB
```

Root unicron-systems — no regressions, all existing pages still build:
```
├ ƒ /app                                  1.31 kB         104 kB
├ ○ /app/beehive                          2.67 kB        96.7 kB
├ ○ /app/colony                           2.4 kB         96.4 kB
├ ○ /app/murmuration                      2.65 kB        96.7 kB
├ ○ /app/mycelium                         2.85 kB        96.9 kB
├ ○ /app/slime                            2.44 kB        96.5 kB
├ ○ /gate                                 1.43 kB        95.5 kB
└ ○ /pathfinder-roadmap                   2.85 kB        90.2 kB
ƒ Middleware                              26.9 kB
[exit 0]
```

### 4. Auth gate (critical auto-revert defense)

Started `pnpm dev` against the Pathfinder app (port 3055). Curled the protected page without a session:

```
$ curl -sS -w "code=%{http_code}\nfinal_url=%{url_effective}\nredirect=%{redirect_url}\n" \
    --max-time 60 'http://localhost:3055/pathfinder/internal/zedcor/run'

code=307
final_url=http://localhost:3055/pathfinder/internal/zedcor/run
redirect=http://localhost:3055/pathfinder/login
```

The response body carries the redirect signal explicitly:

```
a:E{"digest":"NEXT_REDIRECT;replace;/login;307;","message":"NEXT_REDIRECT",
"stack":"Error: NEXT_REDIRECT
  at getRedirectError (...)
  at redirect (...)
  at AuthenticatedLayout (webpack-internal:///(rsc)/./app/(authenticated)/layout.tsx:27:66)"}
```

Confirms the `app/(authenticated)/layout.tsx` operator gate fires before any page content is delivered to the browser. A browser navigating to `/pathfinder/internal/zedcor/run` without a `pf-access-token` cookie redirects to `/pathfinder/login`. The auto-revert trigger "Page renders but auth gate is bypassed" is defended in code.

### 5. All 6 API routes gated

Same dev server, curled each route without a session:

```
/api/zedcor/recent-runs (GET)           code=401 body={"error":"no_session"}
/api/zedcor/run-status?run_id=1 (GET)   code=401 body={"error":"no_session"}
/api/zedcor/toggle-scheduled (POST)     code=401 body={"error":"no_session"}
/api/zedcor/digest-preview (GET)        code=401 body={"error":"no_session"}
/api/zedcor/run-orchestrator (POST)     code=401 body={"error":"no_session"}
/api/zedcor/send-digest (POST)          code=401 body={"error":"no_session"}
```

Each route invokes `getOperatorIdentity()` first and returns `{ error: 'no_session', status: 401 }` when the `pf-access-token` cookie is absent.

## Pending — blocked on Z1A and on preview-deploy

The full GATE 2 smoke script needs three things this PR cannot provide on its own:

1. **Z1A's schema migration must be in `main`.** As of this commit, Z1A's branch `feat/zedcor-tier1-adapters` is not yet on origin (`git fetch origin && git branch -r` shows only `origin/main`, `origin/zedcor-pc`, and this PR's branch). Until the migration adds `agent_runs.runner`, `agent_runs.organization_id`, `agent_runs.hub_id`, the widened `agent_name` CHECK, `agent_runs.status='partial_failure'`, `agent_log.run_id`, `agent_log.organization_id`, and `organizations.config`, the stub orchestrator and toggle endpoint return HTTP 503 + `code='schema_pending_z1a'` and the UI shows the graceful banner.

   Per Kyle's GATE 1 direction: *"If Z1A's migration isn't in main by the time you hit GATE 2 (smoke test), wait. Do not work around it with JSONB shims — clean schema is worth a brief block."*

2. **Preview-deploy URL.** Per `Pathfinder/docs/RUNTIME-ARCHITECTURE.md` the Pathfinder Vercel project may not be git-linked yet (the doc snapshot from 2026-04-28 noted "the Pathfinder Vercel project is not yet linked to GitHub"). I cannot confirm whether the push to `feat/zedcor-tier1-ui` produced a preview deploy. Kyle needs to share the preview URL (or trigger one if needed).

3. **Authenticated browser session.** Screenshots of the running page, Recent Runs table populated, toggle audit rows from `pathfinder.agent_log` — all require a magic-link sign-in to an operator account, which is Kyle-only. Locally I can prove the auth-gate redirects; I cannot prove the gated-side renders without provisioning a fake session, which I will not do.

## What I will do post-Z1A-merge

When Z1A's migration is in `main` and a preview URL is available, the remaining GATE 2 evidence is straightforward:

1. Pull `main` into this branch, push.
2. Open preview deploy URL in an authed browser.
3. Screenshot rendered page (header, button, toggle, send panel, recent runs).
4. Click Run Zedcor; screenshot Live Progress mid-flight if it lands during a poll tick; screenshot Recent Runs after the row appears.
5. Re-click; verify button disabled state during the second run.
6. Flip Scheduled toggle on → off → on; query `pathfinder.agent_log` for the three `manual_only_toggle` rows; dump as JSON.
7. Enter `team@unicron.systems, kyle@freakngenius.com` into Send Digest input; click Send; capture response JSON + the `digest_sent_stub` audit row.
8. Open `Preview digest →`; screenshot the placeholder card.
9. Refresh page; confirm Recent Runs and toggle state persist.
10. Hit `/internal/zedcor/run` in incognito; confirm 307 redirect to `/login`.

All of this slots into the existing PR description; no code changes anticipated.
