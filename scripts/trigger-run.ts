/** Dev helper: enqueue a manual pipeline run (same as POST /api/v1/admin/sync/trigger). */
import { createQueues, createRedis, QUEUES } from '@beep/queues';

const redis = createRedis(process.env.REDIS_URL!);
const queues = createQueues(redis);
const sourceIds = process.argv.slice(2);
const job = await queues[QUEUES.pipeline].add('run', { trigger: 'MANUAL', requestedBy: 'cli', ...(sourceIds.length ? { sourceIds } : {}) });
console.log('enqueued pipeline job', job.id, sourceIds.length ? sourceIds : '(all sources)');
await Promise.all(Object.values(queues).map((q) => q.close()));
await redis.quit();
