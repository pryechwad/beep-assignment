// Dev helper: sign in with the seeded admin (from .env) and capture the operations pages.
// Usage: node scripts/screenshots-admin.mjs <outDir> [baseUrl]
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5181';
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.trim();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/admin/login`);
await page.getByLabel('Email').fill(get('ADMIN_EMAIL'));
await page.getByLabel('Password').fill(get('ADMIN_PASSWORD'));
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Operations overview' }).waitFor();
for (const p of ['', 'pipeline', 'sources', 'ai', 'evaluation', 'costs', 'logs']) {
  await page.goto(`${base}/admin/${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/admin-${p || 'overview'}.png`, fullPage: true });
}
await browser.close();
console.log(errors.length ? `ISSUES:\n${errors.join('\n')}` : 'admin pages captured, no page errors');
