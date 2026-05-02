# 2026-05-02 — Metacron Vercel project setup

Phase 0 close-out for the metacron Vercel project. Captures the verbatim production state at PR #72 merge so future operators (and Cowork chats) can verify what's live without trusting prose.

## Status

`unicron-platform/` (Vite + React 19 operator UI) is now deploying to a dedicated `metacron` Vercel project, decoupled from the `unicron-systems` (Marketing Site) and `pathfinder` projects. Production main deploy at commit `793be48` is **READY**.

One Kyle-action remains: attach `metacron.unicron.systems` as a custom domain in the Vercel dashboard (DNS is already live at Namecheap; TLS currently fails because the project hasn't claimed the hostname yet).

## Vercel project metadata (verbatim)

```
Project: metacron
Project ID: prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz
Team: Keka's projects (team_ox5qAXv7jA6yFUCoOuXQvSfj)
Framework: vite
Node version: 24.x
Root Directory: unicron-platform
Build Command: npm run build
Install Command: npm ci
Output Directory: dist
```

Currently attached domains (from `mcp__claude_ai_Vercel__get_project`):

```
metacron-inky.vercel.app
metacron-kekas-projects-89ac4317.vercel.app
metacron-git-main-kekas-projects-89ac4317.vercel.app
```

`metacron.unicron.systems` is NOT in this list — custom domain attach pending.

## Production deploy (verbatim)

```
Deploy ID: dpl_5YZZ4soStYdiMFy13BLpejhWranq
Commit: 793be48c7512988189a4b8bdb7b11cf5ec416807
Commit message: fix(metacron): unblock Vite build (v2 — without botched workspace move) (#72)
State: READY
Target: production
URL: metacron-9hyy2oaml-kekas-projects-89ac4317.vercel.app
Branch alias: metacron-git-main-kekas-projects-89ac4317.vercel.app
Inspector: https://vercel.com/kekas-projects-89ac4317/metacron/5YZZ4soStYdiMFy13BLpejhWranq
Created: 2026-05-02 (epoch 1777747516219)
```

## Production env vars set (names only — values managed in dashboard)

8 keys in production environment, copied per the original Phase 0 setup runbook:

- `VITE_SUPABASE_URL` (browser-safe Supabase project URL)
- `VITE_SUPABASE_ANON_KEY` (browser-safe Supabase anon/publishable key)
- `VITE_AUTH_REQUIRED` (recommended `true` for production magic-link gate)
- `VITE_COST_SUMMARY_URL` (recommended `https://unicron.systems/pathfinder/api/cost-summary`)
- `VITE_ARCHITECT_API_ENABLED` (recommended `false` until Stream D customer-facing)
- `VITE_ARCHITECT_API_URL` (leave blank until enabled)
- `VITE_SOURCE_ONBOARDER_ENABLED` (recommended `false`)
- `VITE_SOURCE_ONBOARDER_URL` (leave blank until enabled)

The browser-safe pair (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`) was sourced from `unicron-platform/.env.local` (gitignored) — never committed to repo.

## DNS state at Namecheap (verbatim `dig`)

```
$ dig +short metacron.unicron.systems
cname.vercel-dns.com.
76.76.21.123
66.33.60.35
```

CNAME is live and resolves to Vercel anycast IPs. This half is working.

## TLS handshake against `metacron.unicron.systems` (verbatim `curl -vI`)

```
$ curl -vI --max-time 20 https://metacron.unicron.systems/
* Host metacron.unicron.systems:443 was resolved.
* IPv6: (none)
* IPv4: 76.76.21.98, 66.33.60.67
*   Trying 76.76.21.98:443...
* Connected to metacron.unicron.systems (76.76.21.98) port 443
* ALPN: curl offers h2,http/1.1
* (304) (OUT), TLS handshake, Client hello (1):
*  CAfile: /etc/ssl/cert.pem
*  CApath: none
* LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to metacron.unicron.systems:443
* Closing connection
curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to metacron.unicron.systems:443
```

Vercel accepts the TCP connection (anycast IP responds on :443) but the TLS handshake fails — no SNI cert exists for this hostname because the project hasn't claimed it. This is expected behaviour for a hostname whose DNS points at Vercel but isn't bound to a project; once Kyle attaches the domain, Vercel will issue the cert automatically and TLS will succeed.

## Working anonymous-SSO-blocked check (verbatim `curl -I` against the deploy URL)

```
$ curl -I https://metacron-an1vut2l3-kekas-projects-89ac4317.vercel.app/
HTTP/2 401
cache-control: no-store, max-age=0
content-type: text/html; charset=utf-8
server: Vercel
set-cookie: _vercel_sso_nonce=...; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-robots-tag: noindex
```

(captured against an earlier production deploy before PR #72; same shape on the current deploy.)

The `HTTP/2 401` with `_vercel_sso_nonce` cookie confirms the deploy is alive and Vercel Deployment Protection (SSO) is gating access. Logged-in Vercel team members reach the live app via the same URL. To allow anonymous access (for the demo or if `metacron.unicron.systems` should be reachable without Vercel login), Kyle would toggle Settings → Deployment Protection → off in the dashboard.

## Outstanding Kyle-actions (manual, dashboard)

- [ ] Vercel → metacron project → Settings → Domains → Add `metacron.unicron.systems`. Vercel will auto-issue the TLS cert; second attempt at `curl -I https://metacron.unicron.systems/` should return either `200` (if Deployment Protection is off) or `401` with the SSO nonce (if it's on) — either way confirms cert is live.
- [ ] Decide whether to disable Deployment Protection so the operator-facing UI is reachable from a fresh browser session without Vercel team SSO. If Metacron is operator-only and operators are all on the team, leave SSO on. If demos or external operators need access, disable SSO and rely on the magic-link Supabase Auth (`VITE_AUTH_REQUIRED=true`) for app-level gating.

## Provenance

Original Phase 0 runbook: `Company Docs/Prompts/PROMPT - Phase 0 Metacron Vercel.md` (or whatever its post-restore filename is — content is the same as what kicked off this thread).

Sequence to landed state:
1. PR #71 (`fix(metacron): unblock Vite build`) — merged, then **reverted** (`8ad65ed`) because its bundled `chore(workspace): move marketing-site code into Marketing Site/` commit broke the Next.js routes for the `unicron-systems` Marketing Site Vercel project.
2. After revert, both projects ERROR'd: `unicron-systems` (because the Vercel dashboard's Root Directory was set to `Marketing Site/` in anticipation of the move, but the directory had been un-created by the revert) and `metacron` (because the `unicron-platform/` exclusion was back in root `.vercelignore` so vite source wasn't uploaded).
3. Kyle cleared `unicron-systems` Root Directory in Vercel dashboard back to repo root (empty), promoted `dpl_CjB8R7HjctNZkjXdmddtHvfWQpbT` as production safety-belt, and triggered an empty commit (`3b2afd5`). `unicron-systems` returned to READY.
4. PR #72 (`fix(metacron): unblock Vite build (v2 — without botched workspace move)`) reapplied just the `.vercelignore` fix + the docs-restore (without the workspace move). Both projects went READY at commit `793be48`.

The marketing-site → `Marketing Site/` workspace move is **parked** for a separate post-Tuesday-demo PR per `feedback_no_deletes.md` and to keep the demo-week diff small.
