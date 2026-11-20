import { prisma } from '@beep/database';
import { createQueues, createRedis } from '@beep/queues';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from '../../../test/integration/reset';

const redis = createRedis(process.env.REDIS_URL!);
const queues = createQueues(redis);
const app = createApp({ db: prisma, redis, queues, jwtSecret: process.env.JWT_SECRET!, webOrigins: ['http://localhost:5180'], production: false, cacheTtlMs: 0 });
const api = () => request(app);

const PASSWORD = 'correct-horse-battery';
let jobId = '';
let classificationId = '';
let cookie = '';

// Test fixtures only.
beforeAll(async () => {
  await resetDatabase(prisma);
  await redis.flushdb();
  const company = await prisma.company.create({ data: { name: 'Apico', normalizedName: 'apico', slug: 'apico' } });
  await prisma.jobSource.create({ data: { id: 'ashby:apico', adapterType: 'ASHBY', boardToken: 'apico', name: 'Apico (Ashby)', companyId: company.id, healthy: true, lastRecordCount: 2 } });
  const mk = async (i: number, over: Record<string, unknown>) => {
    const job = await prisma.job.create({
      data: {
        companyId: company.id, title: `Job ${i}`, titleKey: `job ${i}`, description: 'Generic description', locationType: 'CITY', primaryCity: 'Pune', primaryState: 'Maharashtra',
        postingUrl: `https://jobs.ashbyhq.com/apico/${i}`, applyUrl: `https://jobs.ashbyhq.com/apico/${i}/application`, canonicalUrl: `https://jobs.ashbyhq.com/apico/${i}`,
        dedupKey: `apico|job ${i}|pune`, correlationId: `job_test${i}`, ...over,
        locations: { create: [{ raw: 'Pune, India', city: 'Pune', state: 'Maharashtra', country: 'India' }] },
      },
    });
    await prisma.rawJob.create({ data: { sourceId: 'ashby:apico', externalId: `x${i}`, title: job.title, companyName: 'Apico', locations: ['Pune, India'], descriptionText: job.description, postingUrl: job.postingUrl, payload: {}, contentHash: `h${i}`, correlationId: job.correlationId, jobId: job.id, status: 'NORMALIZED', employmentType: 'FullTime' } });
    return job;
  };
  const a = await mk(1, { title: 'Data Analyst Intern', titleKey: 'data analyst intern', description: 'Analyse dashboards with SQL and Excel. Students welcome.', employmentType: 'INTERNSHIP', experienceLevel: 'INTERNSHIP', roleCategory: 'ANALYTICS', isFresherEligible: true, confidenceLevel: 'MEDIUM' });
  await mk(2, { title: 'Senior Platform Engineer', titleKey: 'senior platform engineer', description: 'Kubernetes and Go at scale. 6+ years of experience.', employmentType: 'FULL_TIME', experienceLevel: 'EXPERIENCED', roleCategory: 'DEVOPS', isFresherEligible: false, workMode: 'REMOTE' });
  jobId = a.id;
  const sql = await prisma.skill.create({ data: { name: 'SQL', key: 'sql' } });
  await prisma.jobSkill.create({ data: { jobId, skillId: sql.id, origin: 'RULES' } });
  const c = await prisma.jobClassification.create({
    data: {
      jobId, version: 1, method: 'HYBRID', provider: 'groq', model: 'openai/gpt-oss-20b', promptVersion: 'job-intel.v1(test)', roleCategory: 'ANALYTICS', experienceLevel: 'INTERNSHIP',
      employmentType: 'INTERNSHIP', locationType: 'CITY', city: 'Pune', state: 'Maharashtra', isFresherEligible: true, eligibilityReasoning: 'Internship.', eligibilityEvidence: ['Students welcome.'],
      summary: 'Analyse dashboards.', skills: ['SQL'], confidenceScore: 0.66, confidenceLevel: 'MEDIUM', confidenceFactors: { route: 'llm' }, validationStatus: 'VALID', validationErrors: [], needsReview: true, correlationId: 'job_test1',
    },
  });
  classificationId = c.id;
  await prisma.aIUsage.create({ data: { operation: 'CLASSIFY', provider: 'groq', model: 'openai/gpt-oss-20b', promptVersion: 'job-intel.v1(test)', jobId, classificationId, correlationId: 'job_test1', inputTokens: 2000, outputTokens: 500, tokensMeasured: true, latencyMs: 900, success: true, costUsd: 0.0003, pricingVersion: '2026-11-20' } });
  await prisma.adminUser.create({ data: { email: 'eval@beep.test', name: 'Eval', passwordHash: await bcrypt.hash(PASSWORD, 4), role: 'ADMIN' } });
});

afterAll(async () => {
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await redis.quit();
  await prisma.$disconnect();
});

describe('public API', () => {
  it('GET /health reports database and redis', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: true, redis: true });
  });

  it('lists jobs with pagination metadata and list DTO shape', async () => {
    const res = await api().get('/api/v1/jobs?pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(res.body.items[0]).toHaveProperty('source.adapterType', 'ASHBY');
  });

  it('full-text search matches description words and ranks by relevance', async () => {
    const res = await api().get('/api/v1/jobs?q=dashboards&sort=relevance');
    expect(res.body.items.map((j: { id: string }) => j.id)).toEqual([jobId]);
  });

  it('combines filters', async () => {
    expect((await api().get('/api/v1/jobs?fresher=true&city=Pune&role=ANALYTICS')).body.total).toBe(1);
    expect((await api().get('/api/v1/jobs?internship=true&experience=EXPERIENCED')).body.total).toBe(0);
    expect((await api().get('/api/v1/jobs?skill=sql')).body.total).toBe(1);
    expect((await api().get('/api/v1/jobs?location=remote')).body.total).toBe(1);
    expect((await api().get('/api/v1/jobs?role=ANALYTICS,DEVOPS')).body.total).toBe(2);
  });

  it('rejects invalid filter values with a structured 400', async () => {
    const res = await api().get('/api/v1/jobs?role=NOT_A_ROLE');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns job detail with source facts separated from AI classification', async () => {
    const res = await api().get(`/api/v1/jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.sourceFacts).toMatchObject({ locations: ['Pune, India'], employmentType: 'FullTime' });
    expect(res.body.classification).toMatchObject({ method: 'HYBRID', model: 'openai/gpt-oss-20b', summary: 'Analyse dashboards.' });
    expect(res.body.applyUrl).toBe('https://jobs.ashbyhq.com/apico/1/application');
    expect((await api().get('/api/v1/jobs/does-not-exist')).status).toBe(404);
  });

  it('serves facets, companies, analytics and source status from real rows', async () => {
    const f = (await api().get('/api/v1/jobs/filters')).body;
    expect(f.cities).toEqual([{ value: 'Pune', label: 'Pune', count: 2 }]);
    const companies = (await api().get('/api/v1/companies')).body.items;
    expect(companies[0]).toMatchObject({ name: 'Apico', activeJobs: 2, fresherJobs: 1, internships: 1 });
    const o = (await api().get('/api/v1/analytics/overview')).body;
    expect(o.totals).toMatchObject({ activeJobs: 2, fresherEligible: 1, internships: 1, companies: 1, cities: 1 });
    expect(o.comparisons.activeJobs.previous).toBeNull(); // no snapshot yet → no invented delta
    expect((await api().get('/api/v1/analytics/roles')).body.items.map((r: { key: string }) => r.key).sort()).toEqual(['ANALYTICS', 'DEVOPS']);
    expect((await api().get('/api/v1/analytics/daily?days=7')).body.items).toHaveLength(7);
    expect((await api().get('/api/v1/sources/status')).body.items[0]).toMatchObject({ id: 'ashby:apico', activeJobs: 2 });
  });

  it('caches public aggregates when enabled (MISS then HIT)', async () => {
    const cachedApp = createApp({ db: prisma, redis, queues, jwtSecret: process.env.JWT_SECRET!, webOrigins: [], production: false, cacheTtlMs: 60_000 });
    const first = await request(cachedApp).get('/api/v1/analytics/roles');
    const second = await request(cachedApp).get('/api/v1/analytics/roles');
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect((await request(cachedApp).get('/api/v1/jobs')).headers['x-cache']).toBeUndefined(); // search is never cached
  });

  it('serves an OpenAPI document', async () => {
    const res = await api().get('/api/v1/openapi.json');
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toContain('/admin/evaluation/metrics');
  });
});

describe('authentication', () => {
  it('blocks admin routes without a session', async () => {
    expect((await api().get('/api/v1/admin/overview')).status).toBe(401);
    expect((await api().post('/api/v1/admin/sync/trigger')).status).toBe(401);
  });

  it('rejects bad credentials without revealing which part was wrong', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'eval@beep.test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await api().post('/api/v1/auth/login').send({ email: 'nobody@beep.test', password: 'x' })).body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('issues an httpOnly session cookie and resolves /me', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'EVAL@beep.test', password: PASSWORD });
    expect(res.status).toBe(200);
    const set = res.headers['set-cookie'] as unknown as string[];
    expect(set[0]).toMatch(/beep_session=.*HttpOnly/i);
    cookie = set[0]!.split(';')[0]!;
    expect((await api().get('/api/v1/auth/me').set('Cookie', cookie)).body.user.email).toBe('eval@beep.test');
  });

  it('rejects a tampered token', async () => {
    expect((await api().get('/api/v1/auth/me').set('Cookie', `${cookie}x`)).status).toBe(401);
  });
});

describe('admin API', () => {
  it('overview reports queues, review queues and recent errors', async () => {
    const res = await api().get('/api/v1/admin/overview').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.reviewQueues).toEqual({ classifications: 1, duplicates: 0 });
    expect(res.body.queues.map((q: { name: string }) => q.name)).toContain('classify');
  });

  it('triggers a sync (202) and refuses a second one while a run is in progress (409)', async () => {
    expect((await api().post('/api/v1/admin/sync/trigger').set('Cookie', cookie).send({})).status).toBe(202);
    const run = await prisma.scrapeRun.create({ data: { correlationId: 'run_test', trigger: 'MANUAL', status: 'RUNNING' } });
    expect((await api().post('/api/v1/admin/sync/trigger').set('Cookie', cookie).send({})).status).toBe(409);
    await prisma.scrapeRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED' } });
  });

  it('disables a source', async () => {
    const res = await api().patch('/api/v1/admin/sources/ashby:apico').set('Cookie', cookie).send({ enabled: false });
    expect(res.body.enabled).toBe(false);
    expect((await api().patch('/api/v1/admin/sources/ashby:apico').set('Cookie', cookie).send({ unknownField: 1 })).status).toBe(400);
  });

  it('records human evaluation labels and computes accuracy from them', async () => {
    const sample = (await api().get('/api/v1/admin/evaluation').set('Cookie', cookie)).body;
    expect(sample.items.map((i: { prediction: { id: string } }) => i.prediction.id)).toContain(classificationId);
    const put = await api()
      .put(`/api/v1/admin/evaluation/${classificationId}`)
      .set('Cookie', cookie)
      .send({ trueRole: 'ANALYTICS', trueCity: 'Pune', trueExperience: 'INTERNSHIP', trueEmployment: 'FULL_TIME', trueFresherEligible: true, extraErrors: ['MISSING_INFORMATION'] });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ roleCorrect: true, cityCorrect: true, employmentCorrect: false, errorCategories: ['MISSING_INFORMATION'] });
    const m = (await api().get('/api/v1/admin/evaluation/metrics').set('Cookie', cookie)).body;
    expect(m.sampleSize).toBe(1);
    expect(m.fields.employment).toEqual({ correct: 0, total: 1, accuracy: 0 });
    expect(m.fields.role.accuracy).toBe(100);
    expect(m.byConfidence.MEDIUM.total).toBe(1);
    const csv = await api().get('/api/v1/admin/evaluation/export.csv').set('Cookie', cookie);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')).toHaveLength(2);
  });

  it('computes cost per 1,000 posts from recorded usage', async () => {
    const res = await api().get('/api/v1/admin/ai-usage?days=30').set('Cookie', cookie);
    expect(res.body.totals).toMatchObject({ calls: 1, inputTokens: 2000, outputTokens: 500 });
    expect(res.body.costPer1000Posts).toBeCloseTo((0.0003 / 1) * 1000, 6);
    expect(res.body.byModel[0].price).toMatchObject({ verified: false });
  });

  it('override creates a MANUAL version and keeps the prediction as history', async () => {
    const res = await api().post(`/api/v1/admin/classifications/${classificationId}/review`).set('Cookie', cookie).send({ action: 'override', employmentType: 'FULL_TIME', note: 'Paid full-time internship' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ method: 'MANUAL', version: 2, isCurrent: true });
    const old = await prisma.jobClassification.findUniqueOrThrow({ where: { id: classificationId } });
    expect(old.isCurrent).toBe(false);
    expect((await api().post(`/api/v1/admin/classifications/${classificationId}/review`).set('Cookie', cookie).send({ action: 'approve' })).status).toBe(404);
  });

  it('traces a record by correlation id', async () => {
    const res = await api().get('/api/v1/admin/trace/job_test1').set('Cookie', cookie);
    expect(res.body.classifications.length).toBe(2);
    expect(res.body.usage.length).toBe(1);
  });
});
