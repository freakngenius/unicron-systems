# Vercel deploy pipeline broken since PR #37

**Severity:** Production-impacting. Surfaced during the Stream E post-merge verification on 2026-05-01.

## Symptom
Every Vercel deploy from PR #37 (Stream D, `68f7bd7`) onward shows `state: ERROR` / `readyState: ERROR`, including:
- PR #37 — feat(architect): Gate D1 — `dpl_AThELWZKREcxWG3dSMDZ4e8NcdDt`
- PR #38 — feat(chat-renderer) — `dpl_4VUg3LFomhFa7NShLwGySHkF2nWW`
- PR #40 — fix(stream-c): architect contract — `dpl_BPkJFZbGXzhKkPKZU3QYqJ1NwxHN`
- PR #39 — fix(db,services): 0082 — `dpl_6LS2iAM3ZVCjnHcAEhfBPnS7qAXk`

Last successful production deploy: **PR #36 (Stream E original)** — `dpl_HcgyYJXskTrge1VTZDNRaSoXP2aK`, commit `50fc5ca`. That's what production traffic is currently routing to (confirmed via runtime logs).

## What I observed in build logs (PR #39 / commit 90a9f46)
```
…
Compiled successfully
Linting and checking validity of types ... (clean)
Generating static pages (7/7) ✓
Traced Next.js server files
Created all serverless functions
Collected static files
Build Completed in /vercel/output [47s]
Deploying outputs...
<no further log entries — readyState becomes ERROR>
```
Build itself is green. Failure is in the post-build "Deploying outputs..." phase.

## Misleading alias state
My deploy `dpl_6LS2iAM3ZVCjnHcAEhfBPnS7qAXk` lists `alias: ["pathfinder-kekas-projects-89ac4317.vercel.app","pathfinder-git-main-kekas-projects-89ac4317.vercel.app"]` — the production aliases. The URLs respond with 401 (basic auth). But runtime logs confirm the actual deployment serving production is still `dpl_HcgyYJXskTrge1VTZDNRaSoXP2aK` (PR #36). Vercel's deployment metadata appears inconsistent with what's actually serving traffic.

## Production impact RIGHT NOW
Two real `POST /pathfinder/api/sources/onboard` returning 500 in the last 30 minutes (logs at 2026-05-01 23:59:05 and 23:59:10 UTC). That's the exact bug PR #39 fixes — Stream E code calls `architect_sessions.insert()` without populating Stream D's NOT NULL `session_type/trigger/input_payload`, hits NOT NULL violation, returns 500.

Until PR #39 is actually serving production, every Source Onboarder run will 500.

## What might be causing the deploy ERROR
Hypotheses, in rough likelihood order:
1. **Function size or count limit.** Phase 2 added a lot of API routes + Inngest functions. PR #37+ may have crossed a Vercel free/pro tier limit.
2. **Required env var validation.** Vercel sometimes runs a build-time check for declared env vars; one of Phase 2's new vars (`PERPLEXITY_API_KEY`, `ARCHITECT_API_TOKEN`, etc.) may be referenced in code that runs during deploy (e.g., a static page generator) and missing.
3. **Edge-runtime / node-runtime mismatch** introduced by one of the Phase 2 streams.
4. **Output directory bug** — possibly a writable file outside `.next/` that the deploy step refuses.

## What I'd do to diagnose (not in scope for this verification pass)
1. Open `https://vercel.com/kekas-projects-89ac4317/pathfinder/6LS2iAM3ZVCjnHcAEhfBPnS7qAXk` — the Vercel UI shows the deploy step error in plain text where the API hides it.
2. Compare `vercel.json` and `next.config.js` between commits `50fc5ca` (last good) and `68f7bd7` (first bad).
3. Check Vercel project's "Functions" tab for any flagged function (size, runtime mismatch).

## Recommendation
Fix the deploy pipeline FIRST, then re-run Stream E verification. Migrations are already applied and DB-level coexistence is proven, so once `dpl_<new>` from a future commit reaches READY, the smoke tests can run.

If the diagnosis takes long, **rolling back production to `dpl_HcgyYJXskTrge1VTZDNRaSoXP2aK` is NOT a fix** — that deploy has the bug PR #39 addresses. The 500s on `/api/sources/onboard` will continue. The forward fix is to land a green deploy carrying PR #39's session.ts patch.
