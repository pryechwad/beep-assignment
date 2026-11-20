import { defineConfig } from 'vitest/config';

/**
 * Integration tests: API (supertest) and worker services against a real
 * Postgres (`beep_test`, recreated by global setup) and Redis (logical DB 1).
 * Requires `npm run infra:up`.
 */
export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.test.ts', 'apps/worker/test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/env.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
