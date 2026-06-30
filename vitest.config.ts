import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['pipeline/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['pipeline/src/**/*.ts'],
      exclude: ['pipeline/src/types.ts'],
    },
    reporters: ['default'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
