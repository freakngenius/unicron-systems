// vitest.config.ts — minimal Vitest configuration.
//
// Resolves the `@/` alias the rest of the codebase uses (matches tsconfig
// "paths") so test files can import from `@/lib/scoring` etc. No DOM env —
// these are pure unit tests; pulling JSDOM would slow the suite for no gain.

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
