/** @type {import('next').NextConfig} */
// Pathfinder is mounted at unicron.systems/pathfinder via a rewrite in the
// parent unicron-systems Next.js project (additive: doesn't touch the landing
// page). basePath + assetPrefix ensure all internal links and assets resolve
// under the /pathfinder prefix when proxied.
//
// FUNDER HOST ROUTING (funder.unicron.systems → /pathfinder/funder):
// Implemented in the parent unicron-systems project's next.config.mjs
// (workspace root), NOT here. Reason: Next.js basePath is enforced at
// request-receipt — requests without the /pathfinder prefix get 404'd
// before any local rewrite or middleware runs inside the Pathfinder
// app. The parent project has no basePath, so it can host-rewrite
// funder.unicron.systems/* into pathfinder-ashy.vercel.app/pathfinder/
// funder/* while preserving the basePath end-to-end.
//
// The only Pathfinder-side change for the Funder host is the
// allowedOrigins entry below, so server actions issued from
// funder.unicron.systems don't trip the SSRF guard.
const nextConfig = {
  reactStrictMode: true,
  basePath: '/pathfinder',
  assetPrefix: '/pathfinder',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'unicron.systems', 'www.unicron.systems', 'funder.unicron.systems'],
    },
  },
};

module.exports = nextConfig;
