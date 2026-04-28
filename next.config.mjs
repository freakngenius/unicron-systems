/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/manifesto', destination: '/manifesto/index.html' },
      { source: '/manifesto/', destination: '/manifesto/index.html' },
      { source: '/manifesto/v/:slug', destination: '/manifesto/v/:slug.html' },
      // Pathfinder demo runs as a standalone Vercel project; rewrite proxies it
      // under unicron.systems/pathfinder. The Pathfinder app sets basePath:
      // '/pathfinder', so the prefix is preserved end-to-end.
      { source: '/pathfinder', destination: 'https://pathfinder-ashy.vercel.app/pathfinder' },
      { source: '/pathfinder/:path*', destination: 'https://pathfinder-ashy.vercel.app/pathfinder/:path*' },
    ];
  },
};

export default nextConfig;
