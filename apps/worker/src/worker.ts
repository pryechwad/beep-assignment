/**
 * Worker process: consumes every pipeline queue. Run independently of the API
 * (`npm run dev:worker` / `node dist/worker.js`). Scheduling lives in
 * scheduler.ts — this process only does work that has been enqueued.
 */
import os from 'node:os';
import { loadAIConfig, StructuredRunner } from '@beep/ai-engine';
import { prisma } from '@beep/database';
import {
  createQueues,
  createRedis,
  connectionFrom,
  DEFAULT_JOB_OPTIONS,
  llmBudgetKey,
  QUEUES,
  writeHeartbeat,
  type ClassifyJobData,
  type DiscoveryJobData,
  type NormalizeJobData,
  type PipelineJobData,
  type QueueName,
} from '@beep/queues';
import { collectFromSource } from '@beep/scraper-engine';
import { loadServerEnv } from '@beep/shared/env';
import { logger } from '@beep/shared/logger';
import { Worker, type Job as BullJob } from 'bullmq';
import { computeDailyMetric } from './services/analytics';
import { classifyAndPersist } from './services/classify';
import { ingestCollection } from './services/ingest';
import { pipelineLog } from './services/logs';
import { normalizeRawJob, persistUsage } from './services/normalize';
import { createRun, maybeFinalizeRun } from './services/runs';
import { verifyLinks } from './services/verify';
import { classifyPriority } from './priority';

const env = loadServerEnv();
const redis = createRedis(env.REDIS_URL);
const queues = createQueues(redis);
const startedAt = new Date().toISOString();
const MAX_PAGES = 50;

// One runner per IST day: providers disabled for quota reasons come back the next day.
let runnerDay = '';
let runner: StructuredRunner | null = null;
let embedder: ReturnType<typeof loadAIConfig>['embeddingProvider'] = null;
function getRunner(): StructuredRunner | null {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== runnerDay) {
    const cfg = loadAIConfig();
    runner = cfg.providers.length ? new StructuredRunner(cfg.providers) : null;
    embedder = cfg.embeddingProvider;
    runnerDay = day;
    logger.info({ providers: cfg.providers.map((p) => `${p.name}:${p.chatModel}`), missingKeys: cfg.missingKeys, embedder: embedder?.name ?? null }, 'AI providers loaded');
  }
  return runner;
}

/**
 * Spaces LLM calls to AI_CLASSIFY_PER_MINUTE across ALL worker processes (Redis-backed slot).
 * Rate limiting lives here — on the LLM call — not on the queue, so rule-only
 * classifications and budget fallbacks are never throttled.
 */
async function waitForLLMSlot(): Promise<void> {
  const interval = Math.ceil(60_000 / env.AI_CLASSIFY_PER_MINUTE);
  for (;;) {
    const now = Date.now();
    // NX-set a short-lived key: whoever sets it owns the next slot.
    const ok = await redis.set('beep:llm-slot', String(now), 'PX', interval, 'NX');
    if (ok) return;
    const ttl = await redis.pttl('beep:llm-slot');
    await new Promise((r) => setTimeout(r, Math.max(50, ttl)));
  }
}

async function reserveLLMBudget(): Promise<boolean> {
  if (env.AI_MAX_LLM_CLASSIFICATIONS_PER_DAY > 0) {
    const key = llmBudgetKey();
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 48 * 3600);
    if (n > env.AI_MAX_LLM_CLASSIFICATIONS_PER_DAY) {
      await redis.decr(key);
      return false;
    }
  }
  await waitForLLMSlot();
  return true;
}

// ───────────── Processors ─────────────

/** Re-queue jobs whose LLM pass could not run earlier (budget/provider), early-career first. */
async function reclassifyPending(limit: number) {
  const used = Number((await redis.get(llmBudgetKey())) ?? 0);
  const remaining = env.AI_MAX_LLM_CLASSIFICATIONS_PER_DAY === 0 ? limit : Math.max(0, env.AI_MAX_LLM_CLASSIFICATIONS_PER_DAY - used);
  const take = Math.min(limit, remaining);
  if (take === 0 || !getRunner()?.availableProviders.length) return { queued: 0, reason: take === 0 ? 'daily LLM budget exhausted' : 'no AI provider available' };
  const pending = await prisma.job.findMany({
    where: { llmPending: true, status: 'ACTIVE' },
    select: { id: true, correlationId: true, experienceLevel: true },
    orderBy: [{ firstSeenAt: 'desc' }],
    take: take * 3,
  });
  const rank = (e: string | null) => (e === 'INTERNSHIP' || e === 'FRESHER' || e === 'ZERO_TO_ONE' ? 0 : e === 'UNKNOWN' ? 1 : 2);
  const chosen = pending.sort((a, b) => rank(a.experienceLevel) - rank(b.experienceLevel)).slice(0, take);
  await queues.classify.addBulk(
    chosen.map((j) => ({
      name: 'classify',
      data: { jobId: j.id, correlationId: j.correlationId, reason: 'reclassify' } satisfies ClassifyJobData,
      opts: { ...DEFAULT_JOB_OPTIONS.classify, priority: rank(j.experienceLevel) + 1, jobId: `cls__${j.id}__pending__${new Date().toISOString().slice(0, 13)}` },
    })),
  );
  return { queued: chosen.length };
}

async function processPipeline(job: BullJob<PipelineJobData & { limit?: number }>) {
  if (job.name === 'reclassify-pending') return reclassifyPending(job.data.limit ?? 60);
  const { run, sourceIds } = await createRun(prisma, job.data);
  await pipelineLog(prisma, 'INFO', 'pipeline', `run ${run.id} started with ${sourceIds.length} sources`, { runId: run.id, correlationId: run.correlationId });
  await queues.discovery.addBulk(
    sourceIds.map((sourceId) => ({
      name: 'collect',
      data: { runId: run.id, sourceId, correlationId: run.correlationId } satisfies DiscoveryJobData,
      opts: { ...DEFAULT_JOB_OPTIONS.discovery, jobId: `disc__${run.id}__${sourceId.replace(/:/g, "-")}` },
    })),
  );
  if (!sourceIds.length) await queues.analytics.add('daily', {}, { jobId: `analytics__${run.id}` });
  return { runId: run.id, sources: sourceIds.length };
}

async function processDiscovery(job: BullJob<DiscoveryJobData>) {
  const { runId, sourceId, correlationId } = job.data;
  const source = await prisma.jobSource.findUniqueOrThrow({ where: { id: sourceId }, include: { company: true } });
  const task = await prisma.scrapeTask.update({ where: { runId_sourceId: { runId, sourceId } }, data: { status: 'RUNNING', startedAt: new Date(), attempt: job.attemptsMade + 1 } });
  try {
    if (!source.enabled) throw new Error('source disabled');
    const result = await collectFromSource(
      { adapterType: source.adapterType, boardToken: source.boardToken, companyName: source.company?.name ?? source.name, sourceId, sourceName: source.name, rateLimitPerMinute: source.rateLimitPerMinute, indiaOnly: source.indiaOnly },
      { maxPages: MAX_PAGES },
    );
    const complete = result.pagesFetched < MAX_PAGES;
    const stats = await ingestCollection(prisma, sourceId, result, { complete });
    for (const inv of result.invalid) await pipelineLog(prisma, 'WARN', 'discovery', `invalid record skipped: ${inv.reason}`, { runId, sourceId, correlationId, externalId: inv.externalId });
    await queues.normalize.addBulk(
      stats.toNormalize.map((n) => ({ name: 'normalize', data: n satisfies NormalizeJobData, opts: { ...DEFAULT_JOB_OPTIONS.normalize, jobId: `norm__${n.rawJobId}__${runId}` } })),
    );
    await prisma.scrapeTask.update({
      where: { id: task.id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), pagesFetched: result.pagesFetched, jobsFetched: result.fetched, jobsFiltered: result.filtered, jobsNew: stats.jobsNew, jobsUpdated: stats.jobsUpdated, jobsUnchanged: stats.jobsUnchanged, jobsClosed: stats.jobsClosed, errorMessage: null },
    });
    await prisma.jobSource.update({
      where: { id: sourceId },
      data: { lastSuccessAt: new Date(), healthy: true, lastError: null, lastHealthCheckAt: new Date(), lastRecordCount: result.jobs.length, totalDiscovered: { increment: stats.jobsNew } },
    });
    return { fetched: result.fetched, india: result.jobs.length, ...stats, toNormalize: stats.toNormalize.length };
  } catch (e) {
    const msg = (e as Error).message;
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.scrapeTask.update({ where: { id: task.id }, data: { status: final ? 'FAILED' : 'QUEUED', finishedAt: final ? new Date() : null, errorMessage: msg.slice(0, 1000) } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastFailureAt: new Date(), lastError: msg.slice(0, 1000), healthy: false, lastHealthCheckAt: new Date() } });
    await pipelineLog(prisma, final ? 'ERROR' : 'WARN', 'discovery', `source ${sourceId} failed (attempt ${job.attemptsMade + 1}): ${msg}`, { runId, sourceId, correlationId });
    throw e;
  } finally {
    const status = await maybeFinalizeRun(prisma, runId);
    if (status) {
      await pipelineLog(prisma, status === 'SUCCEEDED' ? 'INFO' : 'WARN', 'pipeline', `run ${runId} finished: ${status}`, { runId, correlationId });
      await queues.analytics.add('daily', {}, { jobId: `analytics__${runId}`, delay: 60_000 });
    }
  }
}

async function processNormalize(job: BullJob<NormalizeJobData>) {
  const { rawJobId, correlationId } = job.data;
  try {
    getRunner();
    const out = await normalizeRawJob(prisma, rawJobId, { embedder });
    await persistUsage(prisma, out.usage, { jobId: out.jobId, correlationId });
    if (out.duplicate?.decision === 'NEEDS_REVIEW') await pipelineLog(prisma, 'WARN', 'dedup', `possible duplicate queued for review (${out.duplicate.layer}, score ${out.duplicate.score}): ${out.duplicate.reason}`, { rawJobId, jobId: out.jobId, correlationId });
    if (out.jobId && out.needsClassification) {
      const priority = await classifyPriority(prisma, out.jobId);
      await queues.classify.add('classify', { jobId: out.jobId, correlationId, reason: out.action === 'created' ? 'new' : 'changed' } satisfies ClassifyJobData, { ...DEFAULT_JOB_OPTIONS.classify, priority, jobId: `cls__${out.jobId}__${Date.now()}` });
    }
    return { action: out.action, jobId: out.jobId };
  } catch (e) {
    await prisma.rawJob.update({ where: { id: rawJobId }, data: { status: 'FAILED', processingError: (e as Error).message.slice(0, 1000) } }).catch(() => undefined);
    await pipelineLog(prisma, 'ERROR', 'normalize', `normalisation failed: ${(e as Error).message}`, { rawJobId, correlationId });
    throw e;
  }
}

async function processClassify(job: BullJob<ClassifyJobData>) {
  const { jobId, correlationId, forceLLM } = job.data;
  const out = await classifyAndPersist(prisma, jobId, { runner: getRunner(), reserveLLMBudget, forceLLM, llmForAll: env.AI_LLM_FOR_ALL });
  if (out.route === 'llm-failed-fallback') await pipelineLog(prisma, 'WARN', 'classify', `LLM failed, rules fallback stored: ${out.llmError}`, { jobId, correlationId });
  if (out.result.needsReview && out.route === 'llm') await pipelineLog(prisma, 'INFO', 'classify', 'low-confidence classification queued for review', { jobId, correlationId });
  return { route: out.route, confidence: out.result.confidenceLevel, method: out.result.method };
}

// ───────────── Wiring ─────────────

const connection = connectionFrom(redis);
type Processor = (job: BullJob) => Promise<unknown>;
const specs: { queue: QueueName; processor: Processor; concurrency: number; limiter?: { max: number; duration: number } }[] = [
  { queue: QUEUES.pipeline, processor: processPipeline as Processor, concurrency: 1 },
  { queue: QUEUES.discovery, processor: processDiscovery as Processor, concurrency: 4 },
  // Concurrency 1: candidate lookup + insert must not race, or two cross-posted copies could both become canonical.
  { queue: QUEUES.normalize, processor: processNormalize as Processor, concurrency: 1 },
  // LLM pacing is enforced per call (waitForLLMSlot), so rule-only work flows at full speed.
  { queue: QUEUES.classify, processor: processClassify as Processor, concurrency: 1 },
  { queue: QUEUES.linkVerify, processor: (async (j: BullJob<{ limit?: number }>) => verifyLinks(prisma, { limit: j.data.limit })) as Processor, concurrency: 1 },
  { queue: QUEUES.analytics, processor: (async () => computeDailyMetric(prisma)) as Processor, concurrency: 1 },
];

const workers = specs.map(({ queue, processor, concurrency, limiter }) => {
  const w = new Worker(queue, processor, { connection, concurrency, limiter, autorun: true });
  w.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      // Exhausted retries → dead-letter queue (kept for inspection and manual retry from the admin console).
      await queues[QUEUES.deadLetter].add('dead', { queue, jobName: job.name, jobId: job.id, data: job.data, failedReason: err.message.slice(0, 2000), attemptsMade: job.attemptsMade, failedAt: new Date().toISOString() });
      await pipelineLog(prisma, 'ERROR', queue, `job moved to dead-letter after ${job.attemptsMade} attempts: ${err.message}`, { bullJobId: job.id, correlationId: (job.data as { correlationId?: string }).correlationId });
    }
  });
  w.on('error', (err) => logger.error({ err, queue }, 'worker error'));
  return w;
});

const heartbeat = setInterval(() => {
  void writeHeartbeat(redis, { role: 'worker', pid: process.pid, host: os.hostname(), startedAt, at: new Date().toISOString(), details: { queues: specs.map((s) => s.queue), providers: runner?.availableProviders ?? [], disabled: runner?.disabledProviders ?? [] } }).catch((err) => logger.error({ err }, 'heartbeat failed'));
}, 15_000);
void writeHeartbeat(redis, { role: 'worker', pid: process.pid, host: os.hostname(), startedAt, at: new Date().toISOString() });
getRunner();
logger.info({ queues: specs.map((s) => `${s.queue}×${s.concurrency}`) }, 'worker started');

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'worker shutting down — finishing active jobs');
  clearInterval(heartbeat);
  const timer = setTimeout(() => {
    logger.error('forced exit after 30s');
    process.exit(1);
  }, 30_000);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  await prisma.$disconnect();
  await redis.quit();
  clearTimeout(timer);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
