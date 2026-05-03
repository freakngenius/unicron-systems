# 2026-05-02 — `unicron-systems` Vercel build flake on `SUPABASE_SERVICE_ROLE_KEY`

Recurring infrastructure flake on the `unicron-systems` (marketing-site) Vercel project. Same root cause as **Issue #48** (closed, parked as non-blocking) per `MEMORY/progress.md` M0 entry:

> Issue #48 (marketing-site prerender failure) closed — production self-healed before this work; the 14-route force-dynamic refactor is captured as a non-blocking cleanup todo.

The "self-heal" doesn't actually fix anything; the build re-succeeds when env vars + build cache happen to align. It re-fails on subsequent builds. **Today's failure is the second documented recurrence.**

## What happened

Triggering merge: PR #80 (M1 — Coverage Expansion Modal). Merged to main as `49a3c9d` at `2026-05-02T23:58:51Z`.

M1's diff (verified via `git diff --name-only 7d707a2 49a3c9d`) touched **zero marketing-site files** — only `unicron-platform/`, `MEMORY/`, `Company Docs/`, and `.gitignore`. The routes that fail to prerender are byte-identical between the previous-READY commit (`7d707a2`) and the current-FAIL commit (`49a3c9d`):

```
$ for route in app/api/beehive/runs/route.ts app/api/mycelium/topics/route.ts app/api/colony/dispatch/execute/route.ts; do
    echo "=== $route ==="
    diff <(git show 7d707a2:$route) <(git show 49a3c9d:$route)
done
# (empty diffs across all three routes)
```

The build error (verbatim from `dpl_FTp7jn6wD4Q1U3DZPjqbTYhfw9kH`):

```
Error occurred prerendering page "/api/beehive/runs". Read more: https://nextjs.org/docs/messages/prerender-error
Error: Missing required server env: SUPABASE_SERVICE_ROLE_KEY
    at o (/vercel/path0/.next/server/app/api/colony/dispatch/execute/route.js:3:930)
    at i (/vercel/path0/.next/server/app/api/colony/dispatch/execute/route.js:10:3989)
    at l (/vercel/path0/.next/server/app/api/beehive/runs/route.js:1:551)
```

Routes affected (3 confirmed by build logs; up to 14 total per the M0 entry's "14-route force-dynamic refactor" note):

- `app/api/beehive/runs/route.ts`
- `app/api/mycelium/topics/route.ts`
- `app/api/colony/dispatch/execute/route.ts`

Each route reads `process.env.SUPABASE_SERVICE_ROLE_KEY` at module-load time. None has `export const dynamic = 'force-dynamic'`. Without that declaration, Next.js 14 attempts to prerender at build time, which executes the module load, which dereferences the missing env, which throws.

## Why "self-heal" happens

Vercel build cache. When the build cache contains the previously-prerendered output for these routes, Next.js skips re-prerendering and the build succeeds without ever needing the env var. When the cache is evicted (TTL, or first build after a config change), the build re-runs the prerender step and fails.

Today's M1 merge probably caused cache invalidation by changing files anywhere in the repo (even outside the marketing-site root), triggering a full rebuild that hit the prerender path.

## Two fixes

### Quick fix (right now — unblocks merge cascade)

Restore the env var on the `unicron-systems` Vercel project:

```
Vercel dashboard → unicron-systems → Settings → Environment Variables
  SUPABASE_SERVICE_ROLE_KEY = <production service-role key>
  Apply to: Production, Preview, Development
Trigger redeploy (Deployments → … → Redeploy on the latest commit).
```

CLI alternative if Kyle prefers (run from anywhere; no deploy side-effect):

```
vercel env add SUPABASE_SERVICE_ROLE_KEY production --token=<vercel token>
# enter the value at the prompt (NEVER paste here or in any committed file)
vercel redeploy <latest-prod-deployment-id> --token=<vercel token>
```

### Durable fix (post-merge cleanup)

The 14-route force-dynamic refactor referenced in M0. Add to each route file in `app/api/{beehive,mycelium,colony,...}/.../route.ts`:

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // already present
```

This tells Next.js to never prerender these routes — they always run at request time, after the env vars are loaded. Eliminates the recurring flake permanently.

Tracking grep for the affected routes:

```bash
grep -rL "export const dynamic" app/api --include "route.ts" | xargs grep -l "process.env.SUPABASE_SERVICE_ROLE_KEY\|process.env.SUPABASE_URL"
```

Should produce ~14 matches matching the M0 entry's count.

## Status of the Phase 1 merge cascade

**Paused.** PR #80 (M1) is merged. PR #84 (M2), #87 (M4), #89 (M5), #92 (M3) are open and ready to merge but the multi-Vercel verification rule blocks each subsequent merge until `unicron-systems` is back to READY.

The `metacron` Vercel project (M1's actual home) is `READY` at `49a3c9d` — `dpl_BTJfkwGE4WyGBmdZuPi8t8FvgrZ8`. Pathfinder is `READY` too. The flake is isolated to the marketing-site project.

Resume condition: once `unicron-systems` deploys READY for `49a3c9d` (or any subsequent main commit), continue merging in stack order: M2 → M4 → M5 → M3.

## Acceptance for closing this todo

1. Quick fix: env var restored, `unicron-systems` main deploy READY for the current commit.
2. Durable fix: PR opened that adds `export const dynamic = 'force-dynamic'` to all ~14 affected routes; merged; subsequent build succeeds without relying on env-var-at-prerender-time.
3. M0 entry's "14-route force-dynamic refactor … non-blocking cleanup todo" can be marked done.

---

RESOLVED at 3672b204ca3686e48dee790f99eda951ea8eaa67 · merged at 2026-05-03T02:48:43Z (PR #93). Force-dynamic applied to all 15 affected routes + `app/app/page.tsx`. Multi-Vercel post-merge state at merge SHA: unicron-systems READY (`dpl_2djJs1BopcHWFwq1NFzF6o6FNPxK`), metacron READY (`dpl_4E53tgiPTqTAKx9QRoD5iVryhWXa`), pathfinder READY (`dpl_GNPKWKm4XYpajcJiCouFtCAV7tLD`). Vercel build log confirms all 15 routes + `/app` show `ƒ (Dynamic)`; `/app` flipped from Static (`revalidate = 30`) to Dynamic.
