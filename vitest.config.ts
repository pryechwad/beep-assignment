import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Package + API tests. Web unit tests run via apps/web's own config; e2e via Playwright.
    include: ["packages/*/test/**/*.test.ts"],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
  },
});
