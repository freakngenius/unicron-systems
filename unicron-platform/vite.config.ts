import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev override: when VITE_API_PROXY_TARGET is set (e.g. to a
    // Vercel preview URL), forward all /api/* requests to that origin so
    // `npm run dev` exercises the real serverless functions without
    // needing `vercel dev`. Off by default; never enabled in production.
    ...(process.env.VITE_API_PROXY_TARGET
      ? {
          proxy: {
            '/api': {
              target: process.env.VITE_API_PROXY_TARGET,
              changeOrigin: true,
              secure: true,
            },
          },
        }
      : {}),
  },
  build: {
    rollupOptions: {
      // sw.js, manifest.webmanifest, offline.html, and icons live in public/
      // and are copied verbatim by Vite — they never enter the Rollup module
      // graph. This external list is a belt-and-suspenders guard against any
      // future import accidentally pulling them in.
      external: ['/sw.js'],
    },
  },
})
