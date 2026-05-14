// e2e-only Vite config. Forwards /api/internal/{organizations,architect-history}
// to a locally-running Pathfinder dev server, attaching the server-side API
// key headers that the production Vercel proxies attach. Used to verify F2
// against REAL Supabase data (the migration backfilled realberry-4 et al.)
// without standing up vercel dev.
//
// Run:
//   PATHFINDER_DEV_URL=http://127.0.0.1:5194 \
//   UNICRON_INGEST_API_KEY=<key> \
//   npx vite --config vite.e2e.config.ts --port 5192
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

const PATHFINDER = process.env.PATHFINDER_DEV_URL ?? 'http://127.0.0.1:5194';
const API_KEY = process.env.UNICRON_INGEST_API_KEY ?? '';

type Proxy = {
  bypass?: (req: IncomingMessage, res: ServerResponse) => string | void;
  target: string;
  changeOrigin?: boolean;
  configure?: (...args: unknown[]) => void;
  rewrite?: (path: string) => string;
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'metacron-internal-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '';
          if (!url.startsWith('/api/internal/')) return next();
          try {
            let upstreamPath = '';
            if (url.startsWith('/api/internal/organizations')) {
              const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
              const slugMatch = search.match(/[?&]slug=([^&]+)/);
              upstreamPath = slugMatch
                ? `/pathfinder/api/organizations/${decodeURIComponent(slugMatch[1])}`
                : '/pathfinder/api/organizations';
            } else if (url.startsWith('/api/internal/architect-history')) {
              const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
              const slugMatch = search.match(/[?&]slug=([^&]+)/);
              if (!slugMatch) {
                res.statusCode = 400;
                res.end('missing slug');
                return;
              }
              upstreamPath = `/pathfinder/api/organizations/${decodeURIComponent(slugMatch[1])}/architect-history`;
            } else {
              return next();
            }

            const upstream = await fetch(`${PATHFINDER}${upstreamPath}`, {
              method: req.method ?? 'GET',
              headers: {
                accept: 'application/json',
                'x-unicron-api-key': API_KEY,
              },
            });
            res.statusCode = upstream.status;
            res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
            const body = await upstream.text();
            res.end(body);
          } catch (err) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      external: ['/sw.js'],
    },
  },
});
