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
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'unicron.systems', 'www.unicron.systems', 'funder.unicron.systems', 'internal.unicron.systems'],
    },
  },
};

module.exports = nextConfig;
