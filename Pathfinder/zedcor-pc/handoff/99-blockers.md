# 99 — Blockers and known issues for Claude Code

Critical issues encountered during the initial handoff push. Document so Claude Code (or whoever resumes) can attack the actual root causes instead of re-diagnosing.

## CRITICAL — Static asset 404s break everything on the live site

**Status:** Active. Map black, fonts wrong, buttons dead, chat dead, tile expand dead — ALL caused by this.

**Symptom:** Every JS chunk, font, and CSS file 404s on `zedcor.unicron.systems`.

**Diagnosed root cause:** Pathfinder app (deployed at `pathfinder-ashy.vercel.app`) uses `basePath: '/pathfinder'` + `assetPrefix: '/pathfinder'`. The HTML it emits correctly references `/pathfinder/_next/static/...`. But when the browser requests those URLs directly against the Vercel origin (either via parent middleware rewrite or direct), the response is:

```
GET /pathfinder/_next/static/chunks/bc0322e2.js
→ 307 redirect to /_next/static/chunks/bc0322e2.js
→ 404 not-found

```

This affects `funder.unicron.systems` too (verified — same 404), but funder appears to load because of browser caching or some other compensating factor. New deploys break the dashboard.

**Where the 307 likely comes from:**
1. `trailingSlash` config interaction with `basePath`
2. `next.config.js` `skipMiddlewareUrlNormalize: true` may be needed
3. Pathfinder's own middleware may be stripping basePath on `_next` paths
4. Vercel's deployment-level routing config that maps `pathfinder-ashy.vercel.app/pathfinder/*` → `/*`

**Suspected fix paths (try in order):**

1. **Check Pathfinder/middleware.ts** for any logic that touches `/pathfinder/_next/`. The `PUBLIC_HOSTS` block may be redirecting these paths. Specifically check the auth-gate and host-routing branches.

2. **Check Pathfinder/next.config.js** for `skipMiddlewareUrlNormalize`. May need to add:
   ```js
   skipTrailingSlashRedirect: true,
   skipMiddlewareUrlNormalize: true,
   ```

3. **Try removing `assetPrefix`** from `next.config.js` (keep basePath). Vercel handles asset routing when only basePath is set; assetPrefix can double-prepend.

4. **Verify the Pathfinder Vercel deployment URL.** If `pathfinder-ashy.vercel.app` has its own basePath routing, the parent rewriting to `pathfinder-ashy.vercel.app/pathfinder/...` may be hitting a redirect loop.

5. **Compare working scenarios:** when accessed at `www.unicron.systems/pathfinder` directly (basic-auth, but works), how does THAT response handle assets? It must be working there. Diff the Vercel deployment configuration.

**Evidence collected (Sunday 2026-05-24):**
- Direct curl to `https://zedcor.unicron.systems/pathfinder/_next/static/chunks/bc0322e2-d6a0b42ce37c7b68.js` returns:
  ```
  HTTP/2 307
  location: /_next/static/chunks/bc0322e2-d6a0b42ce37c7b68.js
  server: Vercel
  ```
- Same call to `https://funder.unicron.systems/pathfinder/_next/...` returns 404
- Headless Playwright load of `zedcor.unicron.systems/` shows 18 failed asset requests, all `/_next/static/*` (without basePath)
- The HTML response from `zedcor.unicron.systems/` correctly contains `<script src="/pathfinder/_next/static/...">` (verified via curl + grep)

**Workaround for submission video if root cause untraceable:**
- Use `https://www.unicron.systems/pathfinder` with basic auth (zedcor / unicron) for the video instead of the vanity subdomain
- The headline dashboard works at that URL today
- Note: customer-facing demos still need the vanity subdomain working

## Dashboard issues that are downstream of the asset 404s

These will likely fix themselves once the asset routing works:
- Map is black (Google Maps JS never loads because main bundle 404s)
- Top counters all 0 (LiveStat subscription is in a chunk that 404s)
- Chat button doesn't open (chat component code 404s)
- Lead tile doesn't expand (modal component code 404s)
- Cross-pollination doesn't fire (cross-poll code 404s)
- Font wrong (woff2 404s)

**Do not fix these individually.** Fix the asset routing and re-test.

## Branch dock duplicates

**Symptom:** "Alabama" appears twice as `ALABAMA-AL` and `ALABAMA` (likewise other cities).

**Cause:** Kyle's manual inline SQL when running seed 03 created branches with one ID format, but my seed (which he didn't run because the file didn't exist on `zedcor-pc` branch) would have used a different format. The result is duplicate rows in `pathfinder.branches`.

**Fix:** Run this in Supabase SQL Editor:
```sql
-- Delete the variants that don't match Zedcor's canonical IDs (the ones
-- WITHOUT the state suffix appear to be Kyle's inline format).
-- Verify first:
SELECT id, name, region FROM pathfinder.branches
WHERE name IN ('Alabama','Albuquerque','Arkansas','Austin','Calgary','Charlotte','Chilliwack','Dallas')
ORDER BY name, id;

-- Then keep only the canonical pattern. If Kyle's inline used <NAME>-<STATE>:
-- DELETE FROM pathfinder.branches WHERE id IN ('ALABAMA','ALBUQUERQUE',...);
-- OR if canonical is <NAME>: keep those, delete the -<STATE> variants.
-- Kyle decides which set to keep based on what the rest of the data references.
```

## Cities-out-of-scope

Kyle says: only Houston matters. Branches sidebar shows 74 cities including Calgary, Ottawa, Toronto, Sacramento, etc.

**Fix:** `pickDemoBranches` already supports the `NEXT_PUBLIC_ZEDCOR_FULL_NETWORK` flag — flipping that OFF on Vercel would return to the 4-demo-branch view. But that filters too aggressively (only Houston/LA/Nashville/Pittsburgh).

**Right fix:** Add a new `NEXT_PUBLIC_ZEDCOR_HOUSTON_HUB_ONLY=1` mode in `lib/demo-branches.ts` that filters by geofence — show only branches within 300 miles of Houston (29.7604, -95.3698). Approximately: Houston, Austin, San Antonio, Midland, Dallas, Arkansas state-marker.

## Open questions for Kyle

- **Did Kyle's manual SQL for "seed 03" / "seed 04" use the files in repo, or his own inline rewrite?** He said "inline transform SQL." Need to know to dedupe correctly.
- **Is `pathfinder-ashy.vercel.app` the correct production target for the parent project's rewrites?** The PR list shows multiple Pathfinder deployments; need to confirm.
- **Has the Google Maps API key been added to allowed referrers in Google Cloud Console for `zedcor.unicron.systems`?** This was flagged but never confirmed done.

## Things that DO work and don't need touching

- DNS routing (Vercel + Namecheap)
- Parent middleware host-routing for FUNDER + INTERNAL hosts (don't touch)
- Pathfinder middleware PUBLIC_HOSTS bypass (don't touch — works for funder)
- Database schema, RLS, additive migration
- Seed data in pathfinder.zedcor_branches, pathfinder.zedcor_customer_sites, pathfinder.data_sources, pathfinder.source_licenses, pathfinder.hubs
- Existing Vercel cron pipeline (ingestor, ranker, verifier, outreach, briefing)
- Right-rail lead list (renders correctly)
- Pitch deck

## What's NOT yet started (PC agents)

The 3 Perplexity Computer agent chats have not been spun up. The chat-starter prompts in `Pathfinder/zedcor-pc/prompts/` may have SQL contract mismatches against the actual deployed schema. Kyle needs to:
1. Resolve the asset 404 issue first (otherwise the submission can't have a working live URL)
2. THEN review + paste the 3 prompts into a new Perplexity Space
3. Run the acceptance-test SQL queries from `02-data-flow-spec.md` to verify PC writes are landing
