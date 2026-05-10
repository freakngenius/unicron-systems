# Metacron — INNGEST_API_KEY not configured

**Created:** 2026-05-03
**Owner:** Kyle
**Surface:** metacron Vercel project env vars
**Blocking:** Wave 3 / W3-H — Inngest Health Monitor view at `/inngest-health`

## What

The new Inngest health dashboard (`src/views/inngest-health/InngestHealthView.tsx`)
talks to a Vercel serverless proxy at `/api/inngest/health` which calls
the Inngest REST API server-side. The proxy reads `INNGEST_API_KEY` from
the Vercel environment.

When the env var is missing, the proxy returns `configured: false` and
the dashboard renders a yellow "configure-me" banner with the demo
fixture so it's still visually live for ops review.

## To unblock

1. Visit Inngest dashboard for the metacron app.
2. Settings → API Keys → create a read-scoped key (Account / Server key).
3. Copy the key.
4. In Vercel → metacron project → Settings → Environment Variables, add:
   - Name: `INNGEST_API_KEY`
   - Value: <paste the key>
   - Environments: Production + Preview (skip Development unless needed)
5. Redeploy (or wait for next merge).
6. Reload `/inngest-health`. The banner should disappear and the grid
   should show real function registrations + recent runs + cron schedules.

## Notes

- Read-scoped only. The proxy never accepts mutations.
- If Inngest's REST shape has drifted (the proxy is best-effort and accepts
  multiple shapes), the health endpoint returns `502` with a message and
  the dashboard surfaces an inline error.
- Phase B is independently adding an `api/` folder — the new
  `vercel.json` rewrite (`/((?!api/).*)`) is shared between both PRs and
  must stay aligned at merge.
