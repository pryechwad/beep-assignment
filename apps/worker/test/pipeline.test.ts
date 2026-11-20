import { StructuredRunner, type ChatJsonRequest, type LLMProvider } from '@beep/ai-engine';
import { prisma } from '@beep/database';
import { contentHash, type CollectResult } from '@beep/scraper-engine';
import type { RawJob } from '@beep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDailyMetric } from '../src/services/analytics';
import { classifyAndPersist } from '../src/services/classify';
import { ingestCollection } from '../src/services/ingest';
import { normalizeRawJob } from '../src/services/normalize';
import { createRun, maybeFinalizeRun } from '../src/services/runs';
import { resetDatabase } from '../../../test/integration/reset';

// Test fixtures only — never used by the product.
const DESC = 'We are hiring a backend engineer for our payments platform. You have 0-1 years of experience with Python and PostgreSQL. Freshers are welcome to apply.';
const raw = (over: Partial<RawJob> = {}): RawJob & { contentHash: string } => {
  const r: RawJob = {
    externalId: 'gh-1', title: 'Backend Engineer', companyName: 'Testco', locations: ['Bangalore, India'], workplaceType: null, employmentType: 'Full-time',
    department: 'Engineering', descriptionHtml: null, descriptionText: DESC, postingUrl: 'https://boards.greenhouse.io/testco/jobs/1', applyUrl: null,
    publishedAt: '2026-11-01T00:00:00Z', compensationText: null, payload: { fixture: true }, ...over,
  };
  return { ...r, contentHash: contentHash(r) };
};
const collect = (jobs: ReturnType<typeof raw>[]): CollectResult => ({ jobs, pagesFetched: 1, fetched: jobs.length, filtered: 0, invalid: [] });

let companyId = '';
beforeAll(async () => {
  await resetDatabase(prisma);
  const c = await prisma.company.create({ data: { name: 'Testco', normalizedName: 'testco', slug: 'testco' } });
  companyId = c.id;
  await prisma.jobSource.createMany({
    data: [
      { id: 'greenhouse:testco', adapterType: 'GREENHOUSE', boardToken: 'testco', name: 'Testco (Greenhouse)', companyId },
      { id: 'lever:testco', adapterType: 'LEVER', boardToken: 'testco', name: 'Testco (Lever)', companyId },
    ],
  });
});
afterAll(() => prisma.$disconnect());

describe('migrations', () => {
  // Regression: an undeclared generated column was silently dropped by a later Prisma migration.
  it('keep the full-text search column and its indexes', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'Job' AND column_name = 'searchVector'`;
    expect(cols).toHaveLength(1);
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE indexname IN ('Job_searchVector_idx', 'Job_titleKey_trgm_idx', 'Company_name_trgm_idx')`;
    expect(idx.map((i) => i.indexname).sort()).toEqual(['Company_name_trgm_idx', 'Job_searchVector_idx', 'Job_titleKey_trgm_idx']);
  });
});

describe('ingest → normalise → deduplicate', () => {
  it('creates raw records, then a canonical job with normalised facets', async () => {
    const stats = await ingestCollection(prisma, 'greenhouse:testco', collect([raw()]), { complete: true });
    expect(stats).toMatchObject({ jobsNew: 1, jobsUpdated: 0, jobsClosed: 0 });
    const out = await normalizeRawJob(prisma, stats.toNormalize[0]!.rawJobId);
    expect(out).toMatchObject({ action: 'created', needsClassification: true });
    const job = await prisma.job.findUniqueOrThrow({ where: { id: out.jobId! }, include: { locations: true, skills: { include: { skill: true } } } });
    expect(job).toMatchObject({ primaryCity: 'Bengaluru', employmentType: 'FULL_TIME', locationType: 'CITY', companyId });
    expect(job.locations[0]).toMatchObject({ raw: 'Bangalore, India', city: 'Bengaluru' });
    expect(job.skills.map((s) => s.skill.name).sort()).toEqual(['PostgreSQL', 'Python']);
    // full-text column is populated by Postgres
    const hit = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Job" WHERE "searchVector" @@ websearch_to_tsquery('english', 'payments backend')`;
    expect(hit.map((h) => h.id)).toContain(job.id);
  });

  it('is idempotent: an unchanged re-ingest creates nothing', async () => {
    const stats = await ingestCollection(prisma, 'greenhouse:testco', collect([raw()]), { complete: true });
    expect(stats).toMatchObject({ jobsNew: 0, jobsUpdated: 0, jobsUnchanged: 1 });
    expect(stats.toNormalize).toHaveLength(0);
  });

  it('merges the same opening cross-posted on another source', async () => {
    const stats = await ingestCollection(prisma, 'lever:testco', collect([raw({ externalId: 'lv-1', postingUrl: 'https://jobs.lever.co/testco/lv-1', employmentType: 'Full Time' })]), { complete: true });
    const out = await normalizeRawJob(prisma, stats.toNormalize[0]!.rawJobId);
    expect(out.action).toBe('merged');
    expect(out.duplicate).toMatchObject({ layer: 'NORMALIZED_KEY', decision: 'MERGED' });
    expect(await prisma.job.count()).toBe(1);
    const dup = await prisma.jobDuplicate.findFirstOrThrow();
    expect(dup).toMatchObject({ decision: 'MERGED', reviewStatus: 'AUTO', layer: 'NORMALIZED_KEY' });
  });

  it('keeps a same-source near-identical posting separate and queues it for review', async () => {
    const stats = await ingestCollection(prisma, 'greenhouse:testco', collect([raw(), raw({ externalId: 'gh-2', postingUrl: 'https://boards.greenhouse.io/testco/jobs/2' })]), { complete: true });
    const out = await normalizeRawJob(prisma, stats.toNormalize[0]!.rawJobId);
    expect(out.action).toBe('created');
    expect(out.duplicate?.decision).toBe('NEEDS_REVIEW');
    expect(await prisma.jobDuplicate.count({ where: { reviewStatus: 'PENDING' } })).toBe(1);
  });

  it('closes a job only when every source stops listing it', async () => {
    const before = await prisma.job.findFirstOrThrow({ where: { canonicalUrl: 'https://boards.greenhouse.io/testco/jobs/1' } });
    // Greenhouse drops gh-1 (gh-2 still listed); Lever still lists the merged copy → job stays active.
    let stats = await ingestCollection(prisma, 'greenhouse:testco', collect([raw({ externalId: 'gh-2', postingUrl: 'https://boards.greenhouse.io/testco/jobs/2' })]), { complete: true });
    expect(stats.jobsClosed).toBe(0);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: before.id } })).status).toBe('ACTIVE');
    // Lever drops it too → closed.
    stats = await ingestCollection(prisma, 'lever:testco', collect([]), { complete: true });
    expect(stats.jobsClosed).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: before.id } })).status).toBe('CLOSED');
  });

  it('never closes jobs after a truncated (incomplete) fetch', async () => {
    const stats = await ingestCollection(prisma, 'greenhouse:testco', collect([]), { complete: false });
    expect(stats.jobsClosed).toBe(0);
    expect(await prisma.rawJob.count({ where: { externalId: 'gh-2', removedAt: null } })).toBe(1);
  });
});

describe('classification persistence', () => {
  const llmJson = {
    role_category: 'BACKEND', role_evidence: 'backend engineer', experience_level: 'FRESHER', experience_evidence: '0-1 years of experience', min_years_required: 0,
    employment_type: 'FULL_TIME', work_mode: null, location: { type: 'CITY', city: 'Bengaluru', state: 'Karnataka' }, is_fresher_eligible: true,
    eligibility_reasoning: 'Freshers are explicitly welcome.', eligibility_evidence: ['Freshers are welcome to apply.'], education_requirement: null,
    salary_text: null, skills: ['Python', 'PostgreSQL'], summary: 'Build payment backend services in Python.',
  };
  const fakeProvider: LLMProvider = {
    name: 'groq', chatModel: 'openai/gpt-oss-20b', embeddingModel: null,
    async chatJson(_req: ChatJsonRequest) {
      return { text: JSON.stringify(llmJson), usage: { inputTokens: 2000, outputTokens: 400, measured: true }, model: 'openai/gpt-oss-20b', latencyMs: 12 };
    },
  };

  it('stores a versioned hybrid classification, usage with cost, and denormalised filter fields', async () => {
    const job = await prisma.job.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const out = await classifyAndPersist(prisma, job.id, { runner: new StructuredRunner([fakeProvider]), reserveLLMBudget: async () => true });
    expect(out.route).toBe('llm');
    const c = await prisma.jobClassification.findUniqueOrThrow({ where: { id: out.classificationId }, include: { usage: true } });
    expect(c).toMatchObject({ version: 1, isCurrent: true, method: 'HYBRID', provider: 'groq', roleCategory: 'BACKEND', experienceLevel: 'FRESHER', confidenceLevel: 'HIGH', needsReview: false });
    expect(c.promptVersion).toMatch(/^job-intel\.v1/);
    expect(c.usage).toHaveLength(1);
    expect(Number(c.usage[0]!.costUsd)).toBeCloseTo((2000 * 0.075 + 400 * 0.3) / 1e6, 10);
    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated).toMatchObject({ roleCategory: 'BACKEND', isFresherEligible: true, llmPending: false });

    // Re-classification keeps history: version 2 becomes current, version 1 is retained.
    const again = await classifyAndPersist(prisma, job.id, { runner: new StructuredRunner([fakeProvider]), reserveLLMBudget: async () => true, forceLLM: true });
    const versions = await prisma.jobClassification.findMany({ where: { jobId: job.id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => [v.version, v.isCurrent])).toEqual([[1, false], [2, true]]);
    expect(again.classificationId).toBe(versions[1]!.id);
  });

  it('falls back to rules and marks llmPending when the daily LLM budget is exhausted', async () => {
    const job = await prisma.job.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const out = await classifyAndPersist(prisma, job.id, { runner: new StructuredRunner([fakeProvider]), reserveLLMBudget: async () => false });
    expect(out.route).toBe('llm-budget-exhausted');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).llmPending).toBe(true);
  });
});

describe('runs & analytics', () => {
  it('finalises a run only when all tasks are terminal', async () => {
    const { run } = await createRun(prisma, { trigger: 'MANUAL', sourceIds: ['greenhouse:testco', 'lever:testco'] });
    await prisma.scrapeTask.updateMany({ where: { runId: run.id, sourceId: 'greenhouse:testco' }, data: { status: 'SUCCEEDED', jobsNew: 3 } });
    expect(await maybeFinalizeRun(prisma, run.id)).toBeNull();
    await prisma.scrapeTask.updateMany({ where: { runId: run.id, sourceId: 'lever:testco' }, data: { status: 'FAILED' } });
    expect(await maybeFinalizeRun(prisma, run.id)).toBe('PARTIAL');
    expect(await maybeFinalizeRun(prisma, run.id)).toBeNull(); // idempotent
    expect(await prisma.scrapeRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'PARTIAL', sourcesSucceeded: 1, sourcesFailed: 1, jobsNew: 3 });
  });

  it('snapshots daily metrics from real rows', async () => {
    const m = await computeDailyMetric(prisma);
    expect(m.activeJobs).toBe(await prisma.job.count({ where: { status: 'ACTIVE' } }));
    expect(m.cities).toBe(1);
  });
});
