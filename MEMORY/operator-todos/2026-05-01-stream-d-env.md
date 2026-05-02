# Operator todos — Stream D Architect (2026-05-01)

Two things Kyle (or the operator session) needs to do before the Architect is fully wired in production. The 2026-05-08 scheduled smoke (`trig_015ZCGczmMBPHAmSzF5mGXmR`) reports a clean skip if `ARCHITECT_API_TOKEN` isn't set; doing both before then makes the smoke exercise real LLM paths.

## 1. Set ARCHITECT_API_TOKEN in Vercel production env

The three Architect API routes (`/api/architect/decompose`, `/api/architect/tune`, `/api/architect/discover`) require Bearer auth via `process.env.ARCHITECT_API_TOKEN`. The middleware exempts `/api/architect/*` from basic-auth so cross-origin Stream C UI calls flow through; the routes enforce their own bearer check.

When `ARCHITECT_API_TOKEN` is unset in production, all three routes return `503 { error: "ARCHITECT_API_TOKEN not configured" }` (fail-closed in production). In dev the routes pass through unauthenticated — useful for local testing only.

How to set:

```
# Generate a 32+ char random token (standard pattern from Phase 1's CRON_SECRET)
openssl rand -hex 32

# Add to Vercel — uses the same vercel env add pattern Pathfinder/CLAUDE.md authorizes
vercel env add ARCHITECT_API_TOKEN production
# Paste the value when prompted

# Trigger a redeploy so the env shows up in serverless functions
vercel redeploy <pathfinder-deployment-url> --target production
```

Then share the same token value with the Stream C operator UI as `ARCHITECT_API_TOKEN` (or whatever env name the platform app uses). Stream C's operator must POST `Authorization: Bearer <token>` with every Architect API call.

## 2. Confirm Inngest cloud picks up the two new architect functions

`Pathfinder/lib/inngest/functions/index.ts` now exports two new functions Stream D added:

- `architectTuningCron` (id: `pathfinder-architect-tuning-weekly`, cron: `TZ=UTC 0 2 * * 0` = Sunday 02:00 UTC)
- `architectDiscoveryCron` (id: `pathfinder-architect-discovery-weekly`, cron: `TZ=UTC 0 4 * * 0` = Sunday 04:00 UTC)

After Vercel deploys main (`68f7bd7`), Inngest's discovery PUT to `https://www.unicron.systems/pathfinder/api/inngest` should pick up the new IDs alongside the existing 8. Verification:

```
# Inngest cloud dashboard → app "pathfinder" → Functions tab.
# Confirm both 'pathfinder-architect-tuning-weekly' and
# 'pathfinder-architect-discovery-weekly' show up alongside the 8 existing
# functions (qualifier-rank, verifier, outreach, delivery,
# slack-alert-on-verified, source-onboarder, coverage-expansion-estimate,
# coverage-expansion-run).
#
# OR via curl:
curl -X PUT https://www.unicron.systems/pathfinder/api/inngest
# Expect 200 with { message: "Successfully registered", modified: true|false }
```

If the PUT 401s, the middleware exemption for `/api/inngest` is broken — that's a regression, not a Stream D issue.

The first cron firings will be 2026-05-03 02:00 UTC (tuning) and 04:00 UTC (discovery) — that Sunday. They'll fail-fast when `ANTHROPIC_API_KEY` is missing inside the function execution context, which is fine for verification. The 2026-05-08 smoke explicitly checks env before firing real LLM calls.

## 3. (Optional) Verify the cost-alert cron sees Architect spend

The Phase 1 G2 cost-alert cron at `app/api/cron/cost-alert/route.ts` aggregates `pathfinder.llm_calls.cost_usd` and posts to Slack/Resend. Architect sessions write rows with `surface='architect'` and `agent_name='architect-decomposition'|'architect-tuning'|'architect-discovery'`, so they should already be visible in the daily total. Confirm after the first real run: a $0.20-$1.50 architect spend should appear in the next daily 13:00 UTC alert.
