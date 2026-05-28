/** @type {import('next').NextConfig} */
// Pathfinder is mounted at unicron.systems/pathfinder via a rewrite in the
// parent unicron-systems Next.js project (additive: doesn't touch the landing
// page). basePath + assetPrefix ensure all internal links and assets resolve
// under the /pathfinder prefix when proxied.
//
// FUNDER HOST ROUTING (funder.unicron.systems → /pathfinder/funder):
// Implemented in the parent unicron-systems project's edge middleware
// (workspace-root `middleware.ts`), NOT here. Reason: Next.js basePath
// is enforced at request-receipt — requests without the /pathfinder
// prefix get 404'd before any local rewrite or middleware runs inside
// the Pathfinder app. The parent project has no basePath, so it can
// host-rewrite funder.unicron.systems/* into pathfinder-ashy.vercel.app/
// pathfinder/funder/* while preserving the basePath end-to-end.
//
// INTERNAL HOST ROUTING (internal.unicron.systems → /pathfinder/internal):
// Same shape as the Funder host. Edge middleware at the workspace root
// owns the rewrite; the only Pathfinder-side change is the allowedOrigins
// entry below, so server actions issued from internal.unicron.systems
// don't trip the SSRF guard.
//
// The only Pathfinder-side change for the Funder + Internal hosts is the
// allowedOrigins entry below, so server actions issued from those hosts
// don't trip the SSRF guard.
const nextConfig = {
  reactStrictMode: true,
  basePath: '/pathfinder',
  assetPrefix: '/pathfinder',
  // Z6 — Playwright + @sparticuz/chromium are server-only optional deps used
  // by the tiered detail-page-fetcher's Layer 3 path (dynamic import). They
  // ship native bindings + transitive deps (chromium-bidi) that webpack
  // can't resolve in a Next.js client/server bundle. Mark them as external
  // so they're require()'d at runtime inside server functions instead of
  // bundled.
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium', 'chromium-bidi'],
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'unicron.systems', 'www.unicron.systems', 'funder.unicron.systems', 'internal.unicron.systems', 'zedcor.unicron.systems'],
    },
    // Next 14.2 still requires the experimental flag name for this option;
    // Next 15 promotes it to top-level serverExternalPackages. We set both
    // for forward-compat — Next ignores unknown top-level keys gracefully.
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium', 'chromium-bidi'],
  },
  // Webpack escape hatch — silence the resolve error for the chromium-bidi
  // sub-imports that webpack can't trace even with the externals above
  // (Next 14's experimental.serverComponentsExternalPackages externalizes
  // playwright-core's entrypoint, but webpack still walks the require()
  // call sites inside coreBundle.js looking for chromium-bidi). Mark them
  // as ignored at the resolver level.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'playwright-core': 'commonjs playwright-core',
        '@sparticuz/chromium': 'commonjs @sparticuz/chromium',
        'chromium-bidi/lib/cjs/bidiMapper/BidiMapper': 'commonjs chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
        'chromium-bidi/lib/cjs/cdp/CdpConnection': 'commonjs chromium-bidi/lib/cjs/cdp/CdpConnection',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
