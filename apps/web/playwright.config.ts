import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against a running stack (API + worker data + web).
 * Locally: `npm run build -w @beep/web && npx vite preview --port 5181` with the API on :4100.
 * Uses the installed Microsoft Edge (channel "msedge") — no browser download needed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5181',
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
});
