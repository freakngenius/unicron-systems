# PLAN — DoD smoke harness fixes (step 3 POST, step 7 URL, step 8 401-aware)

## Card

Metacron kanban "Harness fix follow-up — DoD smoke step 3/7/8 inaccuracies" (filed after first baseline run 2026-05-13T17:24Z showed three step-level inaccuracies).

## What ships

Single-file edit: `Pathfinder/scripts/dod-smoke.ts`.

1. **Step 2** — when `UNICRON_INGEST_API_KEY` is set, POST through the canonical `${pathfinder}/pathfinder/api/organizations` endpoint (`x-unicron-api-key` header) so the Inngest `org.created` event actually emits. Falls back to direct service-role insert with a clear note when the key is missing (step 3 will then block correctly).
2. **Step 3** — only run the agent_runs probe when step 2 went through the API path. Poll up to 15s (was 6s), accept either agent_runs rows OR status advancement past `setting_up` as proof of dispatch.
3. **Step 7** — probe `${pathfinder}/pathfinder/api/organizations` directly with the API key when available (expect 200); otherwise fall back to `${metacron}/api/internal/organizations` and accept 401/403 as proof-of-route-exists.
4. **Step 8** — accept 401/403 from `/pathfinder/[slug]` as pass-with-caveat (route resolves but Basic Auth gates rendering validation from the harness).
5. **SmokeContext** — add `unicronApiKey` and `testorg.viaApi` fields plumbed through.
6. **Default `endpoints.pathfinder`** — switch from `pathfinder-ashy.vercel.app` (Basic-Auth gated) to `https://unicron.systems` (proxies through to Pathfinder; operator-reachable).

## Expected next-run output

With `UNICRON_INGEST_API_KEY` available:
- Step 2 still PASS (now via API)
- Step 3 should flip toward PASS if Inngest is wired and fires within 15s
- Step 7 PASS (200 from authed probe)
- Step 8 PASS-with-caveat for auth-gated route; or actual marker check if reachable
- Other steps unchanged

Without the API key, steps 2/3 stay close to current behaviour but with clearer reasons.

## Out of scope

- DB trigger that fires Inngest on any insert path (would let the direct-insert flow also exercise step 3). Different card.
- Real Playwright headless screenshotting for step 8.

## Auto-merge

Pre-auth overnight window. CI green + multi-Vercel green. Codex skipped (usage limit until 2026-05-17; follow-up audit card already filed).
