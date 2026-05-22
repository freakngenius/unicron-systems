/** @type {import('next').NextConfig} */
// FUNDER HOST ROUTING:
// The Funder customer accesses Pathfinder via funder.unicron.systems. This
// project owns the unicron.systems apex + subdomains, so host-conditional
// rewrites land here. The Pathfinder app sets basePath '/pathfinder' and
// enforces it at request-receipt — bare paths like `/` would 404 inside
// Pathfinder before any local middleware ran. Doing the host rewrite here
// (no basePath constraint) lets us re-target funder.unicron.systems/* into
// the standard pathfinder-ashy.vercel.app/pathfinder/[slug] routes the
// Pathfinder app already understands, preserving the basePath end-to-end.
//
// Order matters: rewrites are evaluated top to bottom. The funder host
// rules sit BEFORE the existing /pathfinder/* proxy so they catch the
// bare-path / deep-link cases first. Paths already prefixed with
// /pathfinder/* on the funder host fall through to the standard proxy.
// No other host (unicron.systems, www.unicron.systems, pathfinder*.vercel.app,
// localhost) sees any of these — the `has: host` condition isolates them.
const FUNDER_HOST = 'funder.unicron.systems';
const PATHFINDER_ORIGIN = 'https://pathfinder-ashy.vercel.app';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return {
      // beforeFiles runs BEFORE Next.js's file-system routes (the marketing
      // landing page at /). Funder host rewrites have to live here so a
      // bare `/` request on funder.unicron.systems doesn't get the landing
      // page first. Other rewrites that don't conflict with file-system
      // routes stay in afterFiles where the default-host paths get
      // standard precedence.
      beforeFiles: [
        // funder.unicron.systems/ → Funder org dashboard.
        {
          source: '/',
          has: [{ type: 'host', value: FUNDER_HOST }],
          destination: `${PATHFINDER_ORIGIN}/pathfinder/funder`,
        },
        // funder.unicron.systems/pathfinder and /pathfinder/<path> →
        // pass-through to the Pathfinder origin. Matches before the
        // generic /:path* catch-all so /pathfinder/zedcor etc. don't
        // get prefixed a second time.
        {
          source: '/pathfinder',
          has: [{ type: 'host', value: FUNDER_HOST }],
          destination: `${PATHFINDER_ORIGIN}/pathfinder`,
        },
        {
          source: '/pathfinder/:path*',
          has: [{ type: 'host', value: FUNDER_HOST }],
          destination: `${PATHFINDER_ORIGIN}/pathfinder/:path*`,
        },
        // funder.unicron.systems/<anything else> → /pathfinder/<anything>.
        // Covers sibling routes like /leads, /pipeline, /settings, and
        // any /_next/* the browser might request bare (assetPrefix puts
        // assets under /pathfinder/_next/* by default, so this catch-all
        // is defense in depth).
        {
          source: '/:path*',
          has: [{ type: 'host', value: FUNDER_HOST }],
          destination: `${PATHFINDER_ORIGIN}/pathfinder/:path*`,
        },
      ],
      afterFiles: [
        // Default routes for any other host (unicron.systems, www, etc.) —
        // unchanged from the pre-Funder layout.
        { source: '/manifesto', destination: '/manifesto/index.html' },
        { source: '/manifesto/', destination: '/manifesto/index.html' },
        { source: '/manifesto/v/:slug', destination: '/manifesto/v/:slug.html' },
        // Pathfinder demo runs as a standalone Vercel project; rewrite proxies it
        // under unicron.systems/pathfinder. The Pathfinder app sets basePath:
        // '/pathfinder', so the prefix is preserved end-to-end.
        { source: '/pathfinder', destination: `${PATHFINDER_ORIGIN}/pathfinder` },
        { source: '/pathfinder/:path*', destination: `${PATHFINDER_ORIGIN}/pathfinder/:path*` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
