/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'api/**/*.{test,spec}.{ts,tsx}',
      'lib/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/_archive/**'],
    css: false,
    // api/ and lib/ source files use NodeNext-style `.js` extensions on
    // relative imports so the Vercel serverless build emits the right paths
    // (e.g. `from '../../lib/foo.js'` where foo.js is compiled from foo.ts).
    // Vitest with moduleResolution: 'bundler' needs the .js stripped during
    // test runs. This alias only applies in the test runner — production
    // builds are unaffected (vite.config.ts has no equivalent alias).
    alias: [
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' },
    ],
  },
});
