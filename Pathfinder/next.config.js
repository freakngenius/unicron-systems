/** @type {import('next').NextConfig} */
// Pathfinder is mounted at unicron.systems/pathfinder via a rewrite in the
// parent unicron-systems Next.js project (additive: doesn't touch the landing
// page). basePath + assetPrefix ensure all internal links and assets resolve
// under the /pathfinder prefix when proxied.
const nextConfig = {
  reactStrictMode: true,
  basePath: '/pathfinder',
  assetPrefix: '/pathfinder',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'unicron.systems', 'www.unicron.systems'],
    },
  },
};

module.exports = nextConfig;
