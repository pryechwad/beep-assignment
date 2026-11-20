import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Credentials of the seeded admin come from the repo .env (never hard-coded).
function adminCreds() {
  const env = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
  const get = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.trim() ?? '';
  return { email: process.env.E2E_ADMIN_EMAIL ?? get('ADMIN_EMAIL'), password: process.env.E2E_ADMIN_PASSWORD ?? get('ADMIN_PASSWORD') };
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('landing page shows live pipeline numbers and keeps polling the live activity API', async ({ page }) => {
  const errors = trackErrors(page);
  const polls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/live/activity')) polls.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /first job or internship/i })).toBeVisible();
  await expect(page.getByText('How it works')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI tagging — live' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Data sync status/ })).toBeVisible();
  // the live feed refetches on an interval → repeated network requests
  await page.waitForTimeout(11_000);
  expect(polls.length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('insights shows real KPIs and charts without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  const kpi = page.getByText('Opportunities', { exact: true }).locator('..').locator('..');
  await expect(kpi).toContainText(/\d/);
  await expect(page.getByRole('region', { name: 'Opportunities by role' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Opportunities by city' })).toBeVisible();
  // every chart offers a table view
  await page.getByRole('region', { name: 'Opportunities by city' }).getByRole('button', { name: 'Table view' }).click();
  await expect(page.getByRole('region', { name: 'Opportunities by city' }).getByRole('table')).toContainText('Bengaluru');
  expect(errors).toEqual([]);
});

test('job explorer: server-side search and filters persist in the URL', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page.getByText(/\d[\d,]* opportunities/)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search jobs' }).fill('engineer');
  await expect(page).toHaveURL(/q=engineer/);
  await page.getByRole('checkbox', { name: /Internships only/ }).click();
  await expect(page).toHaveURL(/internship=true/);
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText(/Intern/i);
  // reload keeps state
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Internships only/ })).toBeChecked();
  await page.getByRole('button', { name: 'Clear all' }).first().click();
  await expect(page).not.toHaveURL(/internship=true/);
});

test('job detail separates source facts from AI interpretation and links to the original posting', async ({ page }) => {
  await page.goto('/jobs?internship=true');
  await page.locator('article h3 a').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Source facts')).toBeVisible();
  await expect(page.getByText('AI interpretation')).toBeVisible();
  const apply = page.getByRole('link', { name: /Apply on employer site|View original posting/ });
  await expect(apply).toHaveAttribute('href', /^https:\/\/(job-boards(\.eu)?\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\//);
  await expect(apply).toHaveAttribute('rel', /noopener/);
});

test('unknown job id shows a not-found state', async ({ page }) => {
  await page.goto('/jobs/does-not-exist');
  await expect(page.getByText('This posting isn’t in the index')).toBeVisible();
});

test('admin routes require sign-in and reject bad credentials', async ({ page }) => {
  await page.goto('/admin/costs');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
});

test('admin can sign in and every operations page renders', async ({ page }) => {
  const { email, password } = adminCreds();
  test.skip(!email || !password, 'ADMIN_EMAIL / ADMIN_PASSWORD not configured');
  const errors = trackErrors(page);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  for (const [path, heading] of [
    ['/admin/pipeline', 'Pipeline'],
    ['/admin/sources', 'Sources'],
    ['/admin/ai', 'AI classification'],
    ['/admin/evaluation', 'Human evaluation'],
    ['/admin/costs', 'AI cost intelligence'],
    ['/admin/logs', 'Logs'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Cost per 1,000 processed posts/)).toHaveCount(0); // we're on logs now
  await page.goto('/admin/costs');
  await expect(page.getByText('Cost per 1,000 processed posts')).toBeVisible();
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});
