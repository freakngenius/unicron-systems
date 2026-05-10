import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
