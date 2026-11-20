/**
 * Scheduler process — runs independently of the frontend, API and workers.
 * It only registers repeatable job schedulers in Redis (BullMQ job schedulers
 * are idempotent: restarting the scheduler or running two copies does not
 * duplicate schedules) and publishes a heartbeat. Workers do the processing.
 */
import os from 'node:os';
import { createQueues, createRedis, QUEUES, writeHeartbeat } from '@beep/queues';
import { loadServerEnv } from '@beep/shared/env';
import { logger } from '@beep/shared/logger';

const env = loadServerEnv();
const redis = createRedis(env.REDIS_URL);
const queues = createQueues(redis);
const startedAt = new Date().toISOString();
const tz = env.PIPELINE_TZ;

export const SCHEDULES = [
  { id: 'daily-pipeline', queue: QUEUES.pipeline, name: 'run', pattern: env.PIPELINE_CRON, data: { trigger: 'SCHEDULED' as const } },
  { id: 'reclassify-pending', queue: QUEUES.pipeline, name: 'reclassify-pending', pattern: env.RECLASSIFY_CRON, data: { trigger: 'SCHEDULED' as const, limit: env.AI_CLASSIFY_PER_MINUTE * 55 } },
  { id: 'link-verify', queue: QUEUES.linkVerify, name: 'verify', pattern: env.LINK_VERIFY_CRON, data: { limit: 150 } },
  { id: 'daily-analytics', queue: QUEUES.analytics, name: 'daily', pattern: env.ANALYTICS_CRON, data: {} },
];

/** Current next-run times, read from Redis on every heartbeat so the admin view never shows stale values. */
const describeSchedules = () =>
  Promise.all(
    SCHEDULES.map(async (s) => {
      const sched = await queues[s.queue].getJobScheduler(s.id);
      return { id: s.id, pattern: s.pattern, tz, next: sched?.next ? new Date(sched.next).toISOString() : null };
    }),
  );

async function register() {
  for (const s of SCHEDULES) {
    await queues[s.queue].upsertJobScheduler(s.id, { pattern: s.pattern, tz }, { name: s.name, data: s.data });
  }
  logger.info({ schedules: await describeSchedules() }, 'job schedulers registered');
}

const beat = async () => {
  try {
    await writeHeartbeat(redis, { role: 'scheduler', pid: process.pid, host: os.hostname(), startedAt, at: new Date().toISOString(), details: { schedules: await describeSchedules() } });
  } catch (err) {
    logger.error({ err }, 'heartbeat failed');
  }
};

register()
  .then(() => void beat())
  .catch((err) => {
    logger.error({ err }, 'failed to register schedules');
    process.exit(1);
  });
const interval = setInterval(() => void beat(), 15_000);

async function shutdown(signal: string) {
  logger.info({ signal }, 'scheduler shutting down');
  clearInterval(interval);
  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  await redis.quit();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
