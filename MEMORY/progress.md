# Progress

Cross-stream progress log. Newest entries on top. One section per stream/sprint.

---

## Stream M0 (Metacron) — 2026-05-02

Phase 0 (Metacron Vercel project setup) closed.

- Vercel project `metacron` created and live: ID `prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz` (team `team_ox5qAXv7jA6yFUCoOuXQvSfj`). Framework Vite, Root Directory `unicron-platform`, Build `npm run build`, Install `npm ci`, Output `dist`.
- Production deploy READY: `dpl_5YZZ4soStYdiMFy13BLpejhWranq` at commit `793be48` (PR #72 squash merge). Working URLs: `https://metacron-9hyy2oaml-kekas-projects-89ac4317.vercel.app/` and the branch alias `https://metacron-git-main-kekas-projects-89ac4317.vercel.app/`.
- 8 production env vars set per Phase 0 runbook (names captured in the operator-todo; values managed in Vercel dashboard).
- Issue #48 (marketing-site prerender failure) closed — production self-healed before this work; the 14-route force-dynamic refactor is captured as a non-blocking cleanup todo.
- Bumps along the way (logged for posterity, all resolved):
  - PR #71's bundled workspace move (marketing-site source → `Marketing Site/`) doubled the Next.js route paths and broke the `unicron-systems` post-build packaging. Reverted at `8ad65ed`.
  - The revert in turn left the `unicron-systems` Vercel project's Root Directory pointing at the (now-non-existent) `Marketing Site/` directory and re-introduced the `unicron-platform/` exclusion in root `.vercelignore` that was breaking the metacron Vite build. Kyle cleared the Root Directory in the dashboard and promoted the previous READY deploy as a safety belt; an empty commit (`3b2afd5`) re-triggered the marketing-site build to pick up the corrected setting. PR #72 then re-applied just the `.vercelignore` fix and docs-restore (without the broken move).

Outstanding Kyle-actions (none block any other work):

- Attach `metacron.unicron.systems` as a custom domain in Vercel dashboard → metacron → Settings → Domains. DNS is already live (CNAME → `cname.vercel-dns.com` at Namecheap). Currently TLS handshake fails because the project hasn't claimed the hostname.
- Decide whether to keep Vercel Deployment Protection (SSO) on for the metacron project. Default-on is fine for an operator-only UI; toggle off if external demo access is needed, since `VITE_AUTH_REQUIRED=true` already gates the app via Supabase magic-link.

The marketing-site → `Marketing Site/` workspace move is parked for a separate post-Tuesday-demo PR.

Next: Phase 0.5 (Agent Console foundation) per `Company Docs/Specs/SPEC - Agent Console (Metacron).md`.
