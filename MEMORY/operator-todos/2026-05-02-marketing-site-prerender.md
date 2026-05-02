# 2026-05-02 — Marketing site prerender failure (deferred to post-Tuesday-demo)

> **STATUS UPDATE 2026-05-02 03:46 UTC: OBSOLETE.** This was a preview-env-only failure. Production has `SUPABASE_SERVICE_ROLE_KEY` set; the four post-#47 production deploys (sha 48484a5, 225c6fc, d8d444b, f281406) all reached state=READY. Issue #48 should be closed and this todo retired. Original analysis below kept for archive.



**GitHub:** [Issue #48](https://github.com/freakngenius/unicron-systems/issues/48)
**Verbatim error log:** captured in the issue body and in `MEMORY/end-to-end-verification/2026-05-02.md` (Gate 6).
**Demo dependency:** none. Tuesday demo doesn't touch the marketing site. Pathfinder traffic at `unicron.systems/pathfinder/*` is unaffected (proxied via rewrite to the separate `pathfinder` Vercel project, which is healthy on current main).

## Status

Marketing-site Vercel project (`prj_gVtrF2p1n7SnUsDhXWkJhpwJH8tQ`, name `unicron-systems`) has not deployed since 2026-05-01 21:55 UTC. Live site serves sha `c10ee9ee` (PR #32). Every push since errors at the same point.

Layer 1 (typecheck on `unicron-platform/`) was fixed by PR #47 (merged 2026-05-02 03:23 UTC). Layer 2 (this issue) is now visible.

## Root cause

`Next.js 14` static-prerenders App Router route handlers at build time when they don't declare `export const dynamic = "force-dynamic"`. Each affected route calls `supabaseService()` from `lib/supabase.ts`, which calls `requireServerEnv("SUPABASE_SERVICE_ROLE_KEY")`. Build-time env doesn't include that secret on the marketing-site Vercel project, so the prerender pass throws and `next build` exits 1.

Pattern PR #45 already fixed for Pathfinder (`fix(deploy): defer NEXT_PUBLIC_SUPABASE_URL reads to runtime`).

## Affected files (15 total)

API routes (14):
```
app/api/demo/run-all/route.ts
app/api/mycelium/signals/route.ts
app/api/mycelium/signals/[id]/reinforce/route.ts
app/api/mycelium/topics/route.ts
app/api/slime/runs/[id]/route.ts
app/api/colony/jobs/[id]/route.ts
app/api/murmuration/run/route.ts
app/api/murmuration/run/execute/route.ts
app/api/murmuration/runs/[id]/route.ts
app/api/beehive/run/route.ts
app/api/beehive/run/execute/route.ts
app/api/beehive/runs/route.ts
app/api/beehive/runs/[id]/route.ts
app/api/cron/mycelium-decay/route.ts
```

Server component (1):
```
app/app/page.tsx     # currently has `revalidate = 30` → switch to `dynamic = "force-dynamic"` (or accept it as a live-data dashboard)
```

## Fix pattern

For each API route, add at the top after the existing `runtime` export:
```ts
export const runtime = "nodejs";          // already present
export const dynamic = "force-dynamic";   // ADD
export const revalidate = 0;              // ADD (belt-and-suspenders)
```

For `app/app/page.tsx`, replace `export const revalidate = 30;` with `export const dynamic = "force-dynamic";`.

Belt-and-suspenders also: confirm `SUPABASE_SERVICE_ROLE_KEY` exists in the `unicron-systems` Vercel project's production env (separate from the `pathfinder` project's env). If absent, set it. Even with the env present the `force-dynamic` add is required so Next stops trying to prerender data routes.

## Estimated effort

1–2 hour PR. Mechanical — same three-line addition × 15 files. Worth running `npm run build` locally first to confirm no other prerender targets surface (e.g. if any of the 5 marketing-site pattern pages — `/app/mycelium`, `/app/beehive`, `/app/colony`, `/app/murmuration`, `/app/slime` — also do server-side Supabase reads, they'll need the same treatment).

## When to ship

After Tuesday demo. Until then, keep the live marketing site frozen on `c10ee9ee`. Issue #48 stays open as the queued task.
