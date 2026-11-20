/** Dev helper: re-enqueue normalisation for raw records left in FAILED state. */
import { prisma } from '@beep/database';
import { createQueues, createRedis, DEFAULT_JOB_OPTIONS, QUEUES } from '@beep/queues';

const redis = createRedis(process.env.REDIS_URL!);
const queues = createQueues(redis);
const failed = await prisma.rawJob.findMany({ where: { status: 'FAILED' }, select: { id: true, correlationId: true } });
const stamp = Date.now();
await queues[QUEUES.normalize].addBulk(
  failed.map((r) => ({ name: 'normalize', data: { rawJobId: r.id, correlationId: r.correlationId }, opts: { ...DEFAULT_JOB_OPTIONS.normalize, jobId: `norm__${r.id}__retry${stamp}` } })),
);
console.log(`re-enqueued ${failed.length} failed raw records`);
await Promise.all(Object.values(queues).map((q) => q.close()));
await redis.quit();
await prisma.$disconnect();
