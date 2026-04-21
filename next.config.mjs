/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/manifesto', destination: '/manifesto/index.html' },
      { source: '/manifesto/', destination: '/manifesto/index.html' },
      { source: '/manifesto/v/:slug', destination: '/manifesto/v/:slug.html' },
    ];
  },
};

export default nextConfig;
