import { NextResponse, type NextRequest } from "next/server";

// FUNDER HOST ROUTING:
// The Funder customer accesses Pathfinder via funder.unicron.systems. We
// proxy funder.unicron.systems/* → pathfinder-ashy.vercel.app/pathfinder/*
// here in edge middleware (not in next.config.mjs rewrites) because the
// `has: [{ type: 'host' }]` rewrite for `source: '/'` in `beforeFiles`
// silently does not fire in production on this project — only the
// non-host-conditional `afterFiles` `/pathfinder*` rewrites match. The
// middleware approach runs before file-system routing and reliably sees
// the Host header, so bare `/` and arbitrary `/<path>` requests on the
// funder host land on the right Pathfinder route.
//
// INTERNAL HOST ROUTING (Stage 3 of internal-onboarding):
// Internal org accesses Pathfinder via internal.unicron.systems. Mirrors
// the Funder shape: bare host root rewrites to /pathfinder/internal, deep
// paths rewrite to /pathfinder/internal/<path> (or pass-through when the
// path already carries /pathfinder). Strictly additive — does not alter
// the Funder branch.
const FUNDER_HOST = "funder.unicron.systems";
const INTERNAL_HOST = "internal.unicron.systems";
const ZEDCOR_HOST = "zedcor.unicron.systems";
const PATHFINDER_ORIGIN = "https://pathfinder-ashy.vercel.app";

// The admin gate originally ran on a narrow matcher list. Now that the
// matcher is broadened to catch the funder host, re-assert the original
// scope inside the function so non-funder traffic on manifesto / marketing
// / pathfinder paths keeps passing through untouched.
const GATED_PREFIXES = [
  "/app",
  "/api/mycelium",
  "/api/beehive",
  "/api/colony",
  "/api/murmuration",
  "/api/slime",
  "/api/cron",
  "/api/demo",
];

function isGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export const config = {
  // Broad matcher so the funder host rewrite can fire on `/` and arbitrary
  // paths. Static assets and favicon skip middleware. Non-funder hosts on
  // ungated paths get a fast pass-through via isGatedPath().
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (host === FUNDER_HOST) {
    const { pathname, search } = req.nextUrl;
    // Strip the Pathfinder basePath if present so all routing
    // decisions below operate on the canonical app-relative path.
    // Pathfinder's <Link href="/leads"> renders as
    // /pathfinder/leads in HTML because Next.js auto-prepends the
    // basePath; on the funder host that needs to land on the
    // org-scoped /pathfinder/funder/leads, not the global Zedcor
    // /pathfinder/leads.
    const stripped = pathname === "/pathfinder"
      ? "/"
      : pathname.startsWith("/pathfinder/")
        ? pathname.slice("/pathfinder".length)
        : pathname;

    // Global (non-tenant) Pathfinder routes: API handlers + auth
    // callback. These do NOT take an org slug. Preserve the original
    // basePath so the Pathfinder app still resolves the route.
    if (stripped.startsWith("/api/") || stripped.startsWith("/auth/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Already explicitly scoped to /funder/* — pass through as
    // /pathfinder/funder/* on the origin.
    if (stripped === "/funder" || stripped.startsWith("/funder/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Bare root → funder dashboard.
    if (stripped === "/") {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder/funder${search}`),
      );
    }

    // Tenant-scope everything else: /leads, /pipeline, /leads/<id>,
    // /settings (→ org-scoped not-found backstop), /onboarding/* (same).
    return NextResponse.rewrite(
      new URL(`${PATHFINDER_ORIGIN}/pathfinder/funder${stripped}${search}`),
    );
  }
  if (host === INTERNAL_HOST) {
    const { pathname, search } = req.nextUrl;
    // Strip Pathfinder basePath so all routing decisions below operate
    // on the canonical app-relative path. Pathfinder's <Link href="/leads">
    // renders as /pathfinder/leads in HTML because Next.js auto-prepends
    // the basePath; on the internal host that needs to land on the
    // org-scoped /pathfinder/internal/leads, not the global Zedcor
    // /pathfinder/leads. Mirrors PR #464's Funder block exactly.
    const stripped = pathname === "/pathfinder"
      ? "/"
      : pathname.startsWith("/pathfinder/")
        ? pathname.slice("/pathfinder".length)
        : pathname;

    // Global (non-tenant) Pathfinder routes: API handlers + auth
    // callback. These do NOT take an org slug. Preserve the original
    // basePath so the Pathfinder app still resolves the route.
    if (stripped.startsWith("/api/") || stripped.startsWith("/auth/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Already explicitly scoped to /internal/* — pass through as
    // /pathfinder/internal/* on the origin.
    if (stripped === "/internal" || stripped.startsWith("/internal/")) {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder${stripped}${search}`),
      );
    }

    // Bare root → internal dashboard.
    if (stripped === "/") {
      return NextResponse.rewrite(
        new URL(`${PATHFINDER_ORIGIN}/pathfinder/internal${search}`),
      );
    }

    // Tenant-scope everything else: /leads, /pipeline, /leads/<id>,
    // /settings (→ org-scoped not-found backstop), /onboarding/* (same).
    return NextResponse.rewrite(
      new URL(`${PATHFINDER_ORIGIN}/pathfinder/internal${stripped}${search}`),
    );
  }
  if (host === ZEDCOR_HOST) {
    // ZEDCOR HOST ROUTING (Zedcor PC variant — 2026-05-24):
    // Zedcor is the DEFAULT Pathfinder org. Map zedcor.unicron.systems/
    // → /pathfinder/ (root Dashboard with map, branches, leads, chat,
    // agent log). The Pathfinder root reads pathfinder.branches /
    // pathfinder.customers / pathfinder.projects which are already
    // Zedcor-scoped by default.
    //
    // Unlike Funder/Internal (which use the multi-tenant /[slug] page),
    // Zedcor gets the headline operator-grade Dashboard at root.
    //
    // Implementation: rewrite the URL but preserve as a local path so the
    // afterFiles rewrites in next.config.mjs handle the proxy to
    // pathfinder-ashy.vercel.app correctly. Direct rewrite to the origin
    // URL was being interpreted by Vercel as a /[slug] match.
    const { pathname, search } = req.nextUrl;
    const localPath = pathname.startsWith("/pathfinder")
      ? pathname
      : `/pathfinder${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(
      new URL(`${localPath}${search}`, req.url),
    );
  }

  const { pathname } = req.nextUrl;
  if (!isGatedPath(pathname)) {
    return NextResponse.next();
  }

  // Cron endpoints: accept either `Authorization: Bearer <CRON_SECRET>`
  // (Vercel Cron's default header) or `x-cron-secret: <CRON_SECRET>`
  // for easy curl testing. Skip cookie gate.
  if (pathname.startsWith("/api/cron/")) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    const xs = req.headers.get("x-cron-secret") ?? "";
    const fromAuth = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || (fromAuth !== secret && xs !== secret)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Public reads of pattern APIs allowed; only gate mutating methods.
  if (pathname.startsWith("/api/")) {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
      return NextResponse.next();
    }
  }

  const passcode = req.cookies.get("unicron-admin")?.value;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/gate";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
