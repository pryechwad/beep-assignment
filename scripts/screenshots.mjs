// Dev helper: capture screenshots of key pages with the locally installed Edge (no browser download).
// Usage: node scripts/screenshots.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5180';
const pages = [
  ['home', '/'],
  ['insights', '/insights'],
  ['scout', '/scout'],
  ['jobs', '/jobs'],
  ['jobs-filtered', '/jobs?internship=true&city=Bengaluru'],
  ['companies', '/companies'],
  ['analytics', '/analytics'],
  ['about', '/about'],
];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
for (const [name, path] of pages) {
  for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}/${label}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${name}/${label}: ${e.message}`));
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: label === 'desktop' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`${name}/${label}: horizontal overflow (${await page.evaluate(() => document.documentElement.scrollWidth)}px)`);
    await page.close();
  }
}
// Job detail: open the first job from the explorer
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', (e) => errors.push(`detail: ${e.message}`));
await page.goto(`${base}/jobs?internship=true`, { waitUntil: 'networkidle' });
const href = await page.locator('article h3 a').first().getAttribute('href');
if (href) {
  await page.goto(base + href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/job-detail-desktop.png`, fullPage: true });
}
await browser.close();
console.log(errors.length ? `ISSUES:\n${errors.join('\n')}` : 'no console errors, no horizontal overflow');
