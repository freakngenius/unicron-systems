# Zedcor host routing patch — parent `unicron-systems/middleware.ts`

Adds `zedcor.unicron.systems` host routing alongside the existing `funder.unicron.systems` and `internal.unicron.systems` branches. Strictly additive — does not touch funder or internal branches.

## Target file

`/home/user/workspace/unicron-systems/middleware.ts` (parent project)

## Apply patches in order

### Patch 1 — Add ZEDCOR_HOST constant

Find:
```ts
const FUNDER_HOST = "funder.unicron.systems";
const INTERNAL_HOST = "internal.unicron.systems";
const PATHFINDER_ORIGIN = "https://pathfinder-ashy.vercel.app";
```

Replace with:
```ts
const FUNDER_HOST = "funder.unicron.systems";
const INTERNAL_HOST = "internal.unicron.systems";
const ZEDCOR_HOST = "zedcor.unicron.systems";
const PATHFINDER_ORIGIN = "https://pathfinder-ashy.vercel.app";
```

### Patch 2 — Update the header comment block

Find:
```ts
// INTERNAL HOST ROUTING (Stage 3 of internal-onboarding):
// Internal org accesses Pathfinder via internal.unicron.systems. Mirrors
// the Funder shape: bare host root rewrites to /pathfinder/internal, deep
// paths rewrite to /pathfinder/internal/<path> (or pass-through when the
// path already carries /pathfinder). Strictly additive — does not alter
// the Funder branch.
```

Append immediately after:
```ts
// ZEDCOR HOST ROUTING (Zedcor PC variant — 2026-05-24):
// Zedcor accesses Pathfinder via zedcor.unicron.systems. Mirrors the
// Funder/Internal shape: bare host root rewrites to /pathfinder/zedcor,
// deep paths rewrite to /pathfinder/zedcor/<path>. Strictly additive —
// does not alter Funder, Internal, or default Pathfinder branches.
// The /pathfinder/zedcor route already exists in production
// (Pathfinder/app/zedcor/leads + /map); this rewrite makes the existing
// dashboard reachable at the vanity URL.
```

### Patch 3 — Add the Zedcor branch after INTERNAL_HOST block

Find the end of the `if (host === INTERNAL_HOST) { ... }` block (look for its closing `}` followed by the next non-INTERNAL code). Right after that closing `}`, insert the Zedcor branch (mirrors Internal exactly with the slug swapped):

```ts
  if (host === ZEDCOR_HOST) {
    const { pathname, search } = req.nextUrl;
    // Strip Pathfinder basePath so routing decisions below operate on the
    // canonical app-relative path. Pathfinder's <Link href="/leads"> renders
    // as /pathfinder/leads in HTML because Next.js auto-prepends basePath;
    // on the zedcor host that needs to land on /pathfinder/zedcor/leads.
    const stripped = pathname === "/pathfinder"
      ? "/"
      : pathname.startsWith("/pathfinder/")
        ? pathname.slice("/pathfinder".length)
        : pathname;

    // Global (non-tenant) Pathfinder routes: API + auth callback.
    if (stripped.startsWith("/api/") || stripped.startsWith("/auth/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Already explicitly scoped to /zedcor/* — pass through as
    // /pathfinder/zedcor/* on the origin.
    if (stripped === "/zedcor" || stripped.startsWith("/zedcor/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Bare root → Zedcor dashboard.
    if (stripped === "/") {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder/zedcor${search}`),
      );
    }

    // Tenant-scope everything else.
    return NextResponse.rewrite(
      new URL(`${PATHFINDER_ORIGIN}/pathfinder/zedcor${stripped}${search}`),
    );
  }
```

---

# Pathfinder app — public-slug + public-host whitelist

## Target file 1: `Pathfinder/app/[slug]/layout.tsx`

Find:
```ts
const PUBLIC_SLUGS = new Set(['funder', 'internal']);
```

Replace with:
```ts
const PUBLIC_SLUGS = new Set(['funder', 'internal', 'zedcor']);
```

## Target file 2: `Pathfinder/middleware.ts`

Find:
```ts
const PUBLIC_HOSTS = new Set(['funder.unicron.systems']);
```

Replace with:
```ts
const PUBLIC_HOSTS = new Set([
  'funder.unicron.systems',
  'internal.unicron.systems',
  'zedcor.unicron.systems',
]);
```

(Internal was missing from this set — adding both is a bugfix + Zedcor add.)

---

# Apply commands (from Pathfinder repo root)

```bash
cd /home/user/workspace/unicron-systems
git checkout zedcor-pc

# Pathfinder patches
sed -i "s|new Set(\['funder', 'internal'\])|new Set(['funder', 'internal', 'zedcor'])|" Pathfinder/app/\[slug\]/layout.tsx
sed -i "s|new Set(\['funder.unicron.systems'\])|new Set(['funder.unicron.systems', 'internal.unicron.systems', 'zedcor.unicron.systems'])|" Pathfinder/middleware.ts

# Parent middleware patches must be applied manually because they add a
# multi-line block. Open /home/user/workspace/unicron-systems/middleware.ts
# and follow Patches 1, 2, 3 above.
```
