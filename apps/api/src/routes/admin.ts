import { PRICE_TABLE, PRICING_VERSION } from '@beep/ai-engine';
import type { Prisma, PrismaClient } from '@beep/database';
import { computeMetrics, impliedErrorCategories, scorePrediction, stratifiedSample, toCsv } from '@beep/evaluation';
import { DEFAULT_JOB_OPTIONS, PROCESSING_QUEUES, QUEUES, readHeartbeats, type ClassifyJobData, type DeadLetterJobData, type Queue, type QueueName, type Redis } from '@beep/queues';
import { EMPLOYMENT_TYPES, EVALUATION_ERROR_CATEGORIES, EXPERIENCE_LEVELS, ROLE_CATEGORIES, WORK_MODES } from '@beep/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../lib/auth';
import { requireAdmin } from '../lib/auth';
import { asyncHandler, HttpError, notFound } from '../lib/http';
import { toClassificationDTO } from './public';

const page = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const who = (req: Request) => (req as AuthedRequest).admin;
const EVAL_SAMPLE_SIZE = 50;

export function adminRouter(db: PrismaClient, redis: Redis, queues: Record<QueueName, Queue>, jwtSecret: string): Router {
  const r = Router();
  const anyStaff = requireAdmin(jwtSecret, ['ADMIN', 'EVALUATOR']);
  const adminOnly = requireAdmin(jwtSecret, ['ADMIN']);

  // ───────────── Pipeline control ─────────────

  r.post('/sync/trigger', adminOnly, asyncHandler(async (req, res) => {
    const body = z.object({ sourceIds: z.array(z.string().max(80)).max(100).optional() }).parse(req.body ?? {});
    const running = await db.scrapeRun.findFirst({ where: { status: 'RUNNING' } });
    if (running) throw new HttpError(409, 'RUN_IN_PROGRESS', `Run ${running.id} is still in progress`);
    const job = await queues[QUEUES.pipeline].add('run', { trigger: 'MANUAL', requestedBy: who(req).email, ...(body.sourceIds?.length ? { sourceIds: body.sourceIds } : {}) });
    res.status(202).json({ queued: true, queueJobId: job.id });
  }));

  r.get('/scrape-runs', anyStaff, asyncHandler(async (req, res) => {
    const q = page.parse(req.query);
    const [items, total] = await Promise.all([db.scrapeRun.findMany({ orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.scrapeRun.count()]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
  }));

  r.get('/scrape-runs/:id', anyStaff, asyncHandler(async (req, res) => {
    const run = await db.scrapeRun.findUnique({ where: { id: String(req.params.id) }, include: { tasks: { include: { source: { select: { name: true, adapterType: true } } }, orderBy: { sourceId: 'asc' } } } });
    if (!run) throw notFound('Run');
    res.json(run);
  }));

  // ───────────── Operational overview ─────────────

  r.get('/overview', anyStaff, asyncHandler(async (_req, res) => {
    const since24h = new Date(Date.now() - 86400_000);
    const [queueCounts, heartbeats, sources, lastRun, lastSuccess, normalized24h, classified24h, usage24h, routes, errors24h, recentErrors, reviewPending, dupPending] = await Promise.all([
      Promise.all(PROCESSING_QUEUES.map(async (name) => ({ name, ...(await queues[name].getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized')) }))),
      readHeartbeats(redis),
      db.jobSource.groupBy({ by: ['enabled', 'healthy'], _count: true }),
      db.scrapeRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      db.scrapeRun.findFirst({ where: { status: { in: ['SUCCEEDED', 'PARTIAL'] } }, orderBy: { finishedAt: 'desc' } }),
      db.rawJob.count({ where: { status: { in: ['NORMALIZED', 'MERGED'] }, lastSeenAt: { gte: since24h } } }),
      db.jobClassification.count({ where: { createdAt: { gte: since24h } } }),
      db.aIUsage.groupBy({ by: ['success'], where: { createdAt: { gte: since24h }, operation: 'CLASSIFY' }, _count: true, _sum: { costUsd: true } }),
      db.$queryRaw<{ route: string; n: bigint }[]>`SELECT "confidenceFactors"->>'route' AS route, COUNT(*) AS n FROM "JobClassification" WHERE "isCurrent" GROUP BY 1`,
      db.pipelineLog.count({ where: { level: 'ERROR', createdAt: { gte: since24h } } }),
      db.pipelineLog.findMany({ where: { level: 'ERROR' }, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.jobClassification.count({ where: { isCurrent: true, needsReview: true, reviewedAt: null } }),
      db.jobDuplicate.count({ where: { reviewStatus: 'PENDING' } }),
    ]);
    const deadLetter = await queues[QUEUES.deadLetter].getJobCounts('waiting', 'completed', 'failed');
    const ok = usage24h.find((u) => u.success)?._count ?? 0;
    const failed = usage24h.find((u) => !u.success)?._count ?? 0;
    res.json({
      queues: queueCounts,
      deadLetter: (deadLetter.waiting ?? 0) + (deadLetter.completed ?? 0) + (deadLetter.failed ?? 0),
      workers: heartbeats.filter((h) => h.role === 'worker'),
      scheduler: heartbeats.find((h) => h.role === 'scheduler') ?? null,
      sources: {
        total: sources.reduce((n, s) => n + s._count, 0),
        enabled: sources.filter((s) => s.enabled).reduce((n, s) => n + s._count, 0),
        unhealthy: sources.filter((s) => s.enabled && s.healthy === false).reduce((n, s) => n + s._count, 0),
      },
      lastRun,
      lastSuccessfulRunAt: lastSuccess?.finishedAt ?? null,
      throughput24h: { normalized: normalized24h, classified: classified24h },
      llmCalls24h: { succeeded: ok, failed, successRate: ok + failed ? Math.round((ok / (ok + failed)) * 1000) / 10 : null, costUsd: usage24h.reduce((n, u) => n + Number(u._sum.costUsd ?? 0), 0) },
      classificationRoutes: Object.fromEntries(routes.map((x) => [x.route ?? 'unknown', Number(x.n)])),
      errors24h,
      recentErrors,
      reviewQueues: { classifications: reviewPending, duplicates: dupPending },
    });
  }));

  // ───────────── Queues & dead letters ─────────────

  r.get('/queue', anyStaff, asyncHandler(async (_req, res) => {
    const counts = await Promise.all(PROCESSING_QUEUES.map(async (name) => ({ name, ...(await queues[name].getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized')) })));
    const dead = await queues[QUEUES.deadLetter].getJobs(['waiting', 'completed', 'failed'], 0, 49, false);
    res.json({
      queues: counts,
      deadLetter: dead.map((j) => ({ id: j.id, ...(j.data as DeadLetterJobData) })),
      heartbeats: await readHeartbeats(redis),
    });
  }));

  r.post('/queue/dead-letter/:id/retry', adminOnly, asyncHandler(async (req, res) => {
    const job = await queues[QUEUES.deadLetter].getJob(String(req.params.id));
    if (!job) throw notFound('Dead-letter entry');
    const d = job.data as DeadLetterJobData;
    const target = queues[d.queue];
    const requeued = await target.add(d.jobName, d.data, { ...DEFAULT_JOB_OPTIONS[d.queue], jobId: `${d.jobId ?? 'retry'}__dlq${Date.now()}` });
    await job.remove();
    res.json({ requeued: true, queue: d.queue, jobId: requeued.id });
  }));

  r.post('/queue/:queue/retry-failed', adminOnly, asyncHandler(async (req, res) => {
    const name = z.enum(PROCESSING_QUEUES as [QueueName, ...QueueName[]]).parse(req.params.queue);
    const failed = await queues[name].getFailed(0, 499);
    await Promise.all(failed.map((j) => j.retry()));
    res.json({ retried: failed.length });
  }));

  // ───────────── Sources ─────────────

  r.patch('/sources/:id', adminOnly, asyncHandler(async (req, res) => {
    const body = z.object({ enabled: z.boolean().optional(), rateLimitPerMinute: z.number().int().min(1).max(120).optional(), indiaOnly: z.boolean().optional() }).strict().parse(req.body);
    const found = await db.jobSource.findUnique({ where: { id: String(req.params.id) } });
    if (!found) throw notFound('Source');
    res.json(await db.jobSource.update({ where: { id: found.id }, data: body }));
  }));

  r.post('/sources/:id/sync', adminOnly, asyncHandler(async (req, res) => {
    const found = await db.jobSource.findUnique({ where: { id: String(req.params.id) } });
    if (!found) throw notFound('Source');
    if (!found.enabled) throw new HttpError(409, 'SOURCE_DISABLED', 'Enable the source before syncing it');
    const job = await queues[QUEUES.pipeline].add('run', { trigger: 'MANUAL', requestedBy: who(req).email, sourceIds: [found.id] });
    res.status(202).json({ queued: true, queueJobId: job.id });
  }));

  // ───────────── Classification review ─────────────

  r.get('/classifications/review', anyStaff, asyncHandler(async (req, res) => {
    const q = page.extend({ status: z.enum(['pending', 'reviewed']).default('pending') }).parse(req.query);
    const where: Prisma.JobClassificationWhereInput = { isCurrent: true, needsReview: true, reviewedAt: q.status === 'pending' ? null : { not: null }, job: { status: 'ACTIVE' } };
    const [items, total] = await Promise.all([
      db.jobClassification.findMany({ where, include: { job: { select: { id: true, title: true, company: { select: { name: true } }, primaryCity: true, llmPending: true } } }, orderBy: [{ confidenceScore: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.jobClassification.count({ where }),
    ]);
    res.json({ items: items.map((c) => ({ ...toClassificationDTO(c), job: c.job, confidenceFactors: c.confidenceFactors, reviewedAt: c.reviewedAt })), total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
  }));

  const overrideSchema = z.object({
    action: z.enum(['approve', 'override']),
    roleCategory: z.enum(ROLE_CATEGORIES).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    workMode: z.enum(WORK_MODES).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
    isFresherEligible: z.boolean().optional(),
    note: z.string().max(500).optional(),
  });

  r.post('/classifications/:id/review', anyStaff, asyncHandler(async (req, res) => {
    const body = overrideSchema.parse(req.body);
    const c = await db.jobClassification.findUnique({ where: { id: String(req.params.id) } });
    if (!c || !c.isCurrent) throw notFound('Current classification');
    const admin = who(req);
    if (body.action === 'approve') {
      res.json(await db.jobClassification.update({ where: { id: c.id }, data: { reviewedAt: new Date(), reviewedById: admin.sub, needsReview: false } }));
      return;
    }
    // Override: a new MANUAL version; the model's prediction is kept as history.
    const created = await db.$transaction(async (tx) => {
      await tx.jobClassification.update({ where: { id: c.id }, data: { isCurrent: false, reviewedAt: new Date(), reviewedById: admin.sub } });
      const next = await tx.jobClassification.create({
        data: {
          jobId: c.jobId, version: c.version + 1, isCurrent: true, method: 'MANUAL', provider: null, model: null, promptVersion: null,
          roleCategory: body.roleCategory ?? c.roleCategory, experienceLevel: body.experienceLevel ?? c.experienceLevel,
          employmentType: body.employmentType === undefined ? c.employmentType : body.employmentType, workMode: body.workMode === undefined ? c.workMode : body.workMode,
          locationType: c.locationType, city: body.city === undefined ? c.city : body.city, state: c.state,
          isFresherEligible: body.isFresherEligible ?? c.isFresherEligible,
          eligibilityReasoning: body.note ? `Reviewer: ${body.note}` : c.eligibilityReasoning, eligibilityEvidence: c.eligibilityEvidence,
          educationRequirement: c.educationRequirement, salaryText: c.salaryText, summary: c.summary, skills: c.skills,
          confidenceScore: 1, confidenceLevel: 'HIGH', confidenceFactors: { manualOverrideOf: c.id, by: admin.email } as Prisma.InputJsonValue,
          validationStatus: 'VALID', validationErrors: [], needsReview: false, reviewedAt: new Date(), reviewedById: admin.sub, correlationId: c.correlationId,
        },
      });
      await tx.job.update({ where: { id: c.jobId }, data: { roleCategory: next.roleCategory, experienceLevel: next.experienceLevel, isFresherEligible: next.isFresherEligible, confidenceLevel: 'HIGH', employmentType: next.employmentType ?? undefined, workMode: next.workMode ?? undefined, llmPending: false } });
      return next;
    });
    res.json(created);
  }));

  r.post('/jobs/:id/reclassify', adminOnly, asyncHandler(async (req, res) => {
    const job = await db.job.findUnique({ where: { id: String(req.params.id) }, select: { id: true, correlationId: true } });
    if (!job) throw notFound('Job');
    const q = await queues[QUEUES.classify].add('classify', { jobId: job.id, correlationId: job.correlationId, reason: 'manual', forceLLM: true } satisfies ClassifyJobData, { ...DEFAULT_JOB_OPTIONS.classify, priority: 1, jobId: `cls__${job.id}__manual${Date.now()}` });
    res.status(202).json({ queued: true, queueJobId: q.id });
  }));

  // ───────────── Duplicate review ─────────────

  r.get('/duplicates', anyStaff, asyncHandler(async (req, res) => {
    const q = page.extend({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'AUTO']).default('PENDING') }).parse(req.query);
    const where = { reviewStatus: q.status };
    const sel = { select: { id: true, title: true, primaryCity: true, postingUrl: true, status: true, company: { select: { name: true } } } } as const;
    const [items, total] = await Promise.all([
      db.jobDuplicate.findMany({ where, include: { canonicalJob: sel, candidateJob: sel, rawJob: { select: { sourceId: true, externalId: true, postingUrl: true } } }, orderBy: { similarityScore: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.jobDuplicate.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
  }));

  r.post('/duplicates/:id/review', adminOnly, asyncHandler(async (req, res) => {
    const { decision } = z.object({ decision: z.enum(['CONFIRMED', 'REJECTED']) }).parse(req.body);
    const d = await db.jobDuplicate.findUnique({ where: { id: String(req.params.id) } });
    if (!d) throw notFound('Duplicate decision');
    if (d.reviewStatus !== 'PENDING') throw new HttpError(409, 'ALREADY_REVIEWED', 'This decision was already reviewed');
    const admin = who(req);
    await db.$transaction(async (tx) => {
      if (decision === 'CONFIRMED' && d.candidateJobId) {
        // Merge: move every source reference to the canonical job and close the duplicate record (kept for audit).
        await tx.rawJob.updateMany({ where: { jobId: d.candidateJobId }, data: { jobId: d.canonicalJobId, status: 'MERGED' } });
        await tx.job.update({ where: { id: d.candidateJobId }, data: { status: 'CLOSED', closedAt: new Date() } });
      }
      await tx.jobDuplicate.update({ where: { id: d.id }, data: { reviewStatus: decision, decision: decision === 'CONFIRMED' ? 'MERGED' : 'DISTINCT', reviewedById: admin.sub, reviewedAt: new Date() } });
    });
    res.json({ ok: true });
  }));

  // ───────────── Human evaluation ─────────────

  async function evaluationSample() {
    const audited = await db.classificationAudit.findMany({ select: { classificationId: true } });
    const auditedIds = new Set(audited.map((a) => a.classificationId));
    const need = Math.max(0, EVAL_SAMPLE_SIZE - auditedIds.size);
    const candidates = need
      ? await db.jobClassification.findMany({ where: { isCurrent: true, method: { not: 'MANUAL' }, job: { status: 'ACTIVE' }, id: { notIn: [...auditedIds] } }, select: { id: true, roleCategory: true, confidenceLevel: true, method: true } })
      : [];
    const picked = stratifiedSample(candidates.map((c) => ({ classificationId: c.id, roleCategory: c.roleCategory, confidenceLevel: c.confidenceLevel, method: c.method })), need);
    return [...auditedIds, ...picked.map((p) => p.classificationId)];
  }

  r.get('/evaluation', anyStaff, asyncHandler(async (_req, res) => {
    const ids = await evaluationSample();
    const items = await db.jobClassification.findMany({
      where: { id: { in: ids } },
      include: {
        job: { select: { id: true, title: true, description: true, postingUrl: true, company: { select: { name: true } }, rawJobs: { take: 1, orderBy: { firstSeenAt: 'asc' }, select: { locations: true, employmentType: true, workplaceType: true } } } },
        audits: { take: 1, orderBy: { updatedAt: 'desc' } },
      },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    res.json({
      sampleSize: EVAL_SAMPLE_SIZE,
      audited: items.filter((i) => i.audits.length).length,
      items: items.map((c) => ({ prediction: toClassificationDTO(c), job: { ...c.job, sourceFacts: c.job.rawJobs[0] ?? null, rawJobs: undefined }, label: c.audits[0] ?? null })),
    });
  }));

  const labelSchema = z.object({
    trueRole: z.enum(ROLE_CATEGORIES),
    trueCity: z.string().trim().max(80).nullable(),
    trueExperience: z.enum(EXPERIENCE_LEVELS),
    trueEmployment: z.enum(EMPLOYMENT_TYPES).nullable(),
    trueFresherEligible: z.boolean(),
    extraErrors: z.array(z.enum(EVALUATION_ERROR_CATEGORIES)).max(6).default([]),
    notes: z.string().max(1000).optional(),
  });

  r.put('/evaluation/:classificationId', anyStaff, asyncHandler(async (req, res) => {
    const body = labelSchema.parse(req.body);
    const c = await db.jobClassification.findUnique({ where: { id: String(req.params.classificationId) } });
    if (!c) throw notFound('Classification');
    if (c.method === 'MANUAL') throw new HttpError(400, 'NOT_A_PREDICTION', 'Manual classifications cannot be evaluated as predictions');
    const correctness = scorePrediction(c, body);
    const errorCategories = [...new Set([...impliedErrorCategories(correctness), ...body.extraErrors])];
    const admin = who(req);
    const data = { ...correctness, trueRole: body.trueRole, trueCity: body.trueCity || null, trueExperience: body.trueExperience, trueEmployment: body.trueEmployment, trueFresherEligible: body.trueFresherEligible, errorCategories, notes: body.notes ?? null };
    const audit = await db.classificationAudit.upsert({
      where: { classificationId_evaluatorId: { classificationId: c.id, evaluatorId: admin.sub } },
      create: { jobId: c.jobId, classificationId: c.id, evaluatorId: admin.sub, ...data },
      update: data,
    });
    res.json(audit);
  }));

  async function auditRows() {
    return db.classificationAudit.findMany({ include: { classification: true, job: { select: { title: true, company: { select: { name: true } } } }, evaluator: { select: { email: true } } }, orderBy: { createdAt: 'asc' } });
  }

  r.get('/evaluation/metrics', anyStaff, asyncHandler(async (_req, res) => {
    const rows = await auditRows();
    res.json({ ...computeMetrics(rows.map((a) => ({ ...a, confidenceLevel: a.classification.confidenceLevel, method: a.classification.method }))), targetSampleSize: EVAL_SAMPLE_SIZE });
  }));

  r.get('/evaluation/export.csv', anyStaff, asyncHandler(async (_req, res) => {
    const rows = await auditRows();
    const csv = toCsv(rows.map((a) => ({
      job_id: a.jobId, company: a.job.company.name, title: a.job.title, classification_id: a.classificationId, method: a.classification.method,
      model: a.classification.model, prompt_version: a.classification.promptVersion, confidence: a.classification.confidenceLevel, confidence_score: a.classification.confidenceScore,
      predicted_role: a.classification.roleCategory, true_role: a.trueRole, role_correct: a.roleCorrect,
      predicted_city: a.classification.city, true_city: a.trueCity, city_correct: a.cityCorrect,
      predicted_experience: a.classification.experienceLevel, true_experience: a.trueExperience, experience_correct: a.experienceCorrect,
      predicted_employment: a.classification.employmentType, true_employment: a.trueEmployment, employment_correct: a.employmentCorrect,
      predicted_fresher: a.classification.isFresherEligible, true_fresher: a.trueFresherEligible, eligibility_correct: a.eligibilityCorrect,
      error_categories: a.errorCategories, notes: a.notes, evaluator: a.evaluator.email, evaluated_at: a.updatedAt,
    })));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="beep-evaluation-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }));

  // ───────────── AI usage & cost ─────────────

  async function costSummary(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [byModel, daily, processed, llmClassified, rulesOnly] = await Promise.all([
      db.aIUsage.groupBy({ by: ['provider', 'model', 'operation'], where: { createdAt: { gte: since } }, _count: true, _sum: { inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, retryCount: true } }),
      db.$queryRaw<{ d: Date; calls: bigint; cost: number; input: bigint; output: bigint }[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*) AS calls, SUM("costUsd")::float AS cost, SUM("inputTokens") AS input, SUM("outputTokens") AS output
        FROM "AIUsage" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      db.jobClassification.count({ where: { createdAt: { gte: since }, method: { in: ['HYBRID', 'LLM', 'RULES'] } } }),
      db.jobClassification.count({ where: { createdAt: { gte: since }, method: { in: ['HYBRID', 'LLM'] } } }),
      db.jobClassification.count({ where: { createdAt: { gte: since }, method: 'RULES' } }),
    ]);
    const failedCalls = await db.aIUsage.groupBy({ by: ['provider', 'model', 'operation'], where: { createdAt: { gte: since }, success: false }, _count: true });
    const unmeasured = await db.aIUsage.count({ where: { createdAt: { gte: since }, tokensMeasured: false } });
    const totalCost = byModel.reduce((n, m) => n + Number(m._sum.costUsd ?? 0), 0);
    const classifyCost = byModel.filter((m) => m.operation === 'CLASSIFY').reduce((n, m) => n + Number(m._sum.costUsd ?? 0), 0);
    const embeddingCost = totalCost - classifyCost;
    const priceFor = (provider: string, model: string) => PRICE_TABLE.filter((p) => p.provider === provider && model.startsWith(p.modelPrefix)).sort((a, b) => b.modelPrefix.length - a.modelPrefix.length)[0] ?? null;
    return {
      windowDays: days,
      pricingVersion: PRICING_VERSION,
      totals: {
        costUsd: totalCost, classifyCostUsd: classifyCost, embeddingCostUsd: embeddingCost,
        calls: byModel.reduce((n, m) => n + m._count, 0), failedCalls: failedCalls.reduce((n, m) => n + m._count, 0),
        inputTokens: byModel.reduce((n, m) => n + (m._sum.inputTokens ?? 0), 0), outputTokens: byModel.reduce((n, m) => n + (m._sum.outputTokens ?? 0), 0),
        retries: byModel.reduce((n, m) => n + (m._sum.retryCount ?? 0), 0), unmeasuredTokenCalls: unmeasured,
      },
      processed: { total: processed, llmClassified, rulesOnly },
      // Actual total processing cost / successfully processed posts × 1,000 (spec definition).
      costPer1000Posts: processed ? (totalCost / processed) * 1000 : null,
      costPer1000LLMClassified: llmClassified ? (classifyCost / llmClassified) * 1000 : null,
      byModel: byModel.map((m) => {
        const price = priceFor(m.provider, m.model);
        return {
          provider: m.provider, model: m.model, operation: m.operation, calls: m._count,
          failed: failedCalls.find((f) => f.provider === m.provider && f.model === m.model && f.operation === m.operation)?._count ?? 0,
          inputTokens: m._sum.inputTokens ?? 0, outputTokens: m._sum.outputTokens ?? 0, costUsd: Number(m._sum.costUsd ?? 0),
          avgLatencyMs: m._count ? Math.round((m._sum.latencyMs ?? 0) / m._count) : null, retries: m._sum.retryCount ?? 0,
          price: price ? { inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok, verified: price.verified, source: price.source } : null,
        };
      }),
      daily: daily.map((d) => ({ date: d.d.toISOString().slice(0, 10), calls: Number(d.calls), costUsd: Number(d.cost ?? 0), inputTokens: Number(d.input), outputTokens: Number(d.output) })),
      priceTable: PRICE_TABLE,
    };
  }

  r.get('/ai-usage', anyStaff, asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    res.json(await costSummary(days));
  }));

  r.get('/ai-usage/export.csv', anyStaff, asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await db.aIUsage.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="beep-ai-usage-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows.map((u) => ({ created_at: u.createdAt, operation: u.operation, provider: u.provider, model: u.model, prompt_version: u.promptVersion, job_id: u.jobId, input_tokens: u.inputTokens, output_tokens: u.outputTokens, tokens_measured: u.tokensMeasured, latency_ms: u.latencyMs, retry_count: u.retryCount, success: u.success, cost_usd: u.costUsd.toString(), pricing_version: u.pricingVersion, error: u.errorMessage, correlation_id: u.correlationId }))));
  }));

  // ───────────── Logs & tracing ─────────────

  r.get('/errors', anyStaff, asyncHandler(async (req, res) => {
    const q = page.extend({ level: z.enum(['WARN', 'ERROR', 'ALL']).default('ALL'), scope: z.string().max(40).optional(), correlationId: z.string().max(60).optional() }).parse(req.query);
    const where: Prisma.PipelineLogWhereInput = { ...(q.level !== 'ALL' ? { level: q.level } : {}), ...(q.scope ? { scope: q.scope } : {}), ...(q.correlationId ? { correlationId: q.correlationId } : {}) };
    const [items, total, scopes] = await Promise.all([
      db.pipelineLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.pipelineLog.count({ where }),
      db.pipelineLog.groupBy({ by: ['scope'], _count: true }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), scopes: scopes.map((s) => ({ scope: s.scope, count: s._count })) });
  }));

  r.get('/trace/:correlationId', anyStaff, asyncHandler(async (req, res) => {
    const id = z.string().max(60).parse(req.params.correlationId);
    const [raw, jobs, classifications, usage, logs] = await Promise.all([
      db.rawJob.findMany({ where: { correlationId: id }, select: { id: true, sourceId: true, externalId: true, status: true, processingError: true, firstSeenAt: true, lastSeenAt: true, removedAt: true, jobId: true } }),
      db.job.findMany({ where: { correlationId: id }, select: { id: true, title: true, status: true, classifiedAt: true, llmPending: true } }),
      db.jobClassification.findMany({ where: { correlationId: id }, orderBy: { version: 'asc' }, select: { id: true, version: true, method: true, model: true, confidenceLevel: true, validationStatus: true, validationErrors: true, createdAt: true, isCurrent: true } }),
      db.aIUsage.findMany({ where: { correlationId: id }, orderBy: { createdAt: 'asc' } }),
      db.pipelineLog.findMany({ where: { correlationId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!raw.length && !jobs.length) throw notFound('Correlation id');
    res.json({ correlationId: id, raw, jobs, classifications, usage, logs });
  }));

  return r;
}
