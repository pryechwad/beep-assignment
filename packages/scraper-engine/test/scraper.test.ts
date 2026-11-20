import { describe, expect, it } from 'vitest';
import { collectFromSource, htmlToText, isPathAllowed, parseRobots, type HttpClient, type RobotsCache, type SourceDefinition } from '../src';

// Test doubles: a stub HTTP client returning canned payloads keyed by URL substring.
function stubHttp(routes: Record<string, unknown>): HttpClient {
  return {
    async getJson(url: string) {
      const key = Object.keys(routes).find((k) => url.includes(k));
      if (!key) throw new Error(`unexpected url ${url}`);
      return routes[key];
    },
  } as unknown as HttpClient;
}
const allowAll = { isAllowed: async () => true } as unknown as RobotsCache;
const denyAll = { isAllowed: async () => false } as unknown as RobotsCache;

const def = (adapterType: SourceDefinition['adapterType'], indiaOnly = true): SourceDefinition => ({
  adapterType,
  boardToken: 'acme',
  companyName: 'Acme',
  sourceId: `${adapterType.toLowerCase()}:acme`,
  sourceName: 'Acme',
  rateLimitPerMinute: 600,
  indiaOnly,
});

describe('robots.txt', () => {
  const rules = parseRobots(['User-agent: *', 'Disallow: /embed/', 'Allow: /embed/public', '', 'User-agent: otherbot', 'Disallow: /'].join('\n'));
  it('applies the * group and longest-match precedence', () => {
    expect(isPathAllowed(rules, '/v1/boards/acme/jobs')).toBe(true);
    expect(isPathAllowed(rules, '/embed/job_board')).toBe(false);
    expect(isPathAllowed(rules, '/embed/public/x')).toBe(true);
  });
  it('supports wildcards and end anchors', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$');
    expect(isPathAllowed(r, '/a/b.pdf')).toBe(false);
    expect(isPathAllowed(r, '/a/b.pdf?x=1')).toBe(true);
  });
  it('prefers a group naming our bot', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: BeepJobIntelligenceBot\nAllow: /');
    expect(isPathAllowed(r, '/anything')).toBe(true);
  });
});

describe('htmlToText', () => {
  it('keeps paragraph and list structure', () => {
    expect(htmlToText('<p>About us</p><ul><li>Python</li><li>SQL</li></ul>')).toBe('About us\n• Python\n• SQL');
  });
});

describe('Greenhouse adapter', () => {
  const payload = {
    jobs: [
      {
        id: 101,
        title: 'Software Engineer I',
        absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/101',
        first_published: '2026-11-01T10:00:00-04:00',
        location: { name: 'Bengaluru, India' },
        departments: [{ name: 'Engineering' }],
        content: '&lt;p&gt;Freshers welcome. Python.&lt;/p&gt;',
        metadata: [{ name: 'Employment Type', value: 'Full-time' }],
      },
      { id: 102, title: 'Account Executive', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/102', location: { name: 'London, United Kingdom' }, content: '' },
      { id: 103, title: '', absolute_url: 'not-a-url' },
    ],
  };

  it('maps fields, decodes entity-escaped HTML and filters to India', async () => {
    const r = await collectFromSource(def('GREENHOUSE'), { deps: { http: stubHttp({ 'boards-api.greenhouse.io': payload }), robots: allowAll } });
    expect(r.fetched).toBe(2);
    expect(r.filtered).toBe(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({
      externalId: '101',
      companyName: 'Acme',
      locations: ['Bengaluru, India'],
      employmentType: 'Full-time',
      department: 'Engineering',
      descriptionText: 'Freshers welcome. Python.',
      publishedAt: '2026-11-01T10:00:00-04:00',
    });
    expect(r.jobs[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses to fetch when robots.txt disallows', async () => {
    await expect(collectFromSource(def('GREENHOUSE'), { deps: { http: stubHttp({}), robots: denyAll } })).rejects.toThrow(/robots/);
  });
});

describe('Lever adapter', () => {
  const posting = (id: string, extra: object = {}) => ({
    id,
    text: 'Backend Intern',
    hostedUrl: `https://jobs.lever.co/acme/${id}`,
    applyUrl: `https://jobs.lever.co/acme/${id}/apply`,
    createdAt: 1761955200000,
    workplaceType: 'hybrid',
    country: 'IN',
    categories: { commitment: 'Intern', location: 'Pune', team: 'Platform', allLocations: ['Pune'] },
    description: '<p>Join us</p>',
    lists: [{ text: 'Requirements', content: '<li>Java</li>' }],
    additional: '',
    ...extra,
  });

  it('paginates with skip/limit and adds India from the country code', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => posting(`a${i}`));
    const page2 = [posting('b0', { categories: { location: 'Remote' } })];
    const http = stubHttp({ 'skip=0&': page1, 'skip=100&': page2 });
    const r = await collectFromSource(def('LEVER'), { deps: { http, robots: allowAll } });
    expect(r.pagesFetched).toBe(2);
    expect(r.jobs).toHaveLength(101);
    expect(r.jobs[0]).toMatchObject({ employmentType: 'Intern', workplaceType: 'hybrid', locations: ['Pune', 'India'], applyUrl: 'https://jobs.lever.co/acme/a0/apply' });
    expect(r.jobs[0]!.descriptionText).toContain('• Java');
    expect(r.jobs[100]!.locations).toEqual(['Remote', 'India']);
  });
});

describe('Ashby adapter', () => {
  it('skips unlisted jobs and only shows compensation when the employer allows it', async () => {
    const http = stubHttp({
      'api.ashbyhq.com': {
        jobs: [
          {
            id: 'x1',
            title: 'Data Analyst',
            employmentType: 'FullTime',
            location: 'Mumbai',
            secondaryLocations: [{ location: 'Remote' }],
            isListed: true,
            workplaceType: 'Hybrid',
            address: { postalAddress: { addressCountry: 'India' } },
            jobUrl: 'https://jobs.ashbyhq.com/acme/x1',
            descriptionHtml: '<p>SQL</p>',
            shouldDisplayCompensationOnJobPostings: false,
            compensation: { compensationTierSummary: '₹10L – ₹14L' },
          },
          { id: 'x2', title: 'Hidden', isListed: false, location: 'Mumbai', jobUrl: 'https://jobs.ashbyhq.com/acme/x2' },
        ],
      },
    });
    const r = await collectFromSource(def('ASHBY'), { deps: { http, robots: allowAll } });
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({ externalId: 'x1', employmentType: 'FullTime', workplaceType: 'Hybrid', compensationText: null, locations: ['Mumbai', 'Remote', 'India'] });
  });
});
