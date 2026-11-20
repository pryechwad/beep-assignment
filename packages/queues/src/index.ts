import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Queue contract shared by the API (producer, monitoring) and the worker /
 * scheduler processes (consumers). Pipeline:
 *
 *   pipeline ─▶ discovery (1 job per source) ─▶ normalize (1 per changed raw record)
 *                                                  └─▶ classify (1 per new/changed job)
 *   link-verify, analytics, reclassify are scheduled independently.
 */
export const QUEUES = {
  pipeline: 'pipeline',
  discovery: 'discovery',
  normalize: 'normalize',
  classify: 'classify',
  linkVerify: 'link-verify',
  analytics: 'analytics',
  deadLetter: 'dead-letter',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export const PROCESSING_QUEUES: QueueName[] = [QUEUES.pipeline, QUEUES.discovery, QUEUES.normalize, QUEUES.classify, QUEUES.linkVerify, QUEUES.analytics];

export interface PipelineJobData {
  trigger: 'SCHEDULED' | 'MANUAL';
  requestedBy?: string;
  /** Restrict to these source ids (manual single-source runs). */
  sourceIds?: string[];
}
export interface DiscoveryJobData {
  runId: string;
  sourceId: string;
  correlationId: string;
}
export interface NormalizeJobData {
  rawJobId: string;
  correlationId: string;
}
export interface ClassifyJobData {
  jobId: string;
  correlationId: string;
  reason: 'new' | 'changed' | 'reclassify' | 'manual';
  forceLLM?: boolean;
}
export interface LinkVerifyJobData {
  limit?: number;
}
export interface AnalyticsJobData {
  date?: string;
}
export interface DeadLetterJobData {
  queue: QueueName;
  jobName: string;
  jobId: string | undefined;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

/** Retry policy: exponential backoff; failures after the last attempt go to the dead-letter queue. */
export const DEFAULT_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  pipeline: { attempts: 1, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
  discovery: { attempts: 3, backoff: { type: 'exponential', delay: 15_000 }, removeOnComplete: { count: 2000 }, removeOnFail: { count: 2000 } },
  normalize: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: { count: 5000 }, removeOnFail: { count: 5000 } },
  classify: { attempts: 4, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: { count: 5000 }, removeOnFail: { count: 5000 } },
  'link-verify': { attempts: 2, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
  analytics: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
  'dead-letter': { attempts: 1, removeOnComplete: false, removeOnFail: false },
};

export function createRedis(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest=null for blocking connections.
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
}

export function connectionFrom(redis: Redis): ConnectionOptions {
  return redis as unknown as ConnectionOptions;
}

export function createQueues(redis: Redis): Record<QueueName, Queue> {
  const connection = connectionFrom(redis);
  const entries = Object.values(QUEUES).map((name) => [name, new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS[name] })] as const);
  return Object.fromEntries(entries) as Record<QueueName, Queue>;
}

// ───────────── Process heartbeats (worker / scheduler health) ─────────────

export const HEARTBEAT_PREFIX = 'beep:heartbeat:';
export const HEARTBEAT_TTL_SECONDS = 45;

export interface Heartbeat {
  role: 'worker' | 'scheduler';
  pid: number;
  host: string;
  startedAt: string;
  at: string;
  details?: Record<string, unknown>;
}

export async function writeHeartbeat(redis: Redis, hb: Heartbeat): Promise<void> {
  await redis.set(`${HEARTBEAT_PREFIX}${hb.role}:${hb.host}:${hb.pid}`, JSON.stringify(hb), 'EX', HEARTBEAT_TTL_SECONDS);
}

export async function readHeartbeats(redis: Redis): Promise<Heartbeat[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `${HEARTBEAT_PREFIX}*`, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  if (!keys.length) return [];
  const values = await redis.mget(keys);
  return values.filter((v): v is string => v !== null).map((v) => JSON.parse(v) as Heartbeat);
}

/** Daily LLM-call budget counter shared by all worker processes. */
export function llmBudgetKey(date = new Date()): string {
  return `beep:llm-budget:${date.toISOString().slice(0, 10)}`;
}

export { Queue, Redis };
