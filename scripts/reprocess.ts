/**
 * Maintenance: re-apply pipeline logic to existing data after a normalisation or classification fix.
 *   npm run reprocess -- --normalize            re-normalise every raw record (cheap, no LLM calls)
 *   npm run reprocess -- --reclassify-other     re-classify jobs currently labelled OTHER (uses LLM budget)
 * Source data is never refetched; RawJob rows are the input.
 */
import { prisma } from '@beep/database';
import { createQueues, createRedis, DEFAULT_JOB_OPTIONS, QUEUES } from '@beep/queues';

const args = new Set(process.argv.slice(2));
const redis = createRedis(process.env.REDIS_URL!);
const queues = createQueues(redis);
const stamp = Date.now();

if (args.has('--normalize')) {
  const raws = await prisma.rawJob.findMany({ where: { removedAt: null }, select: { id: true, correlationId: true } });
  for (let i = 0; i < raws.length; i += 500) {
    await queues[QUEUES.normalize].addBulk(
      raws.slice(i, i + 500).map((r) => ({ name: 'normalize', data: { rawJobId: r.id, correlationId: r.correlationId }, opts: { ...DEFAULT_JOB_OPTIONS.normalize, jobId: `norm__${r.id}__reproc${stamp}` } })),
    );
  }
  console.log(`re-normalising ${raws.length} raw records`);
}
if (args.has('--reclassify-other')) {
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE', roleCategory: 'OTHER' }, select: { id: true, correlationId: true } });
  await queues[QUEUES.classify].addBulk(
    jobs.map((j) => ({ name: 'classify', data: { jobId: j.id, correlationId: j.correlationId, reason: 'reclassify' }, opts: { ...DEFAULT_JOB_OPTIONS.classify, priority: 2, jobId: `cls__${j.id}__reproc${stamp}` } })),
  );
  console.log(`re-classifying ${jobs.length} jobs labelled OTHER`);
}
if (args.has('--mark-llm-pending')) {
  // Jobs whose current tag never came from an LLM get picked up by the hourly reclassify-pending schedule.
  const n = await prisma.job.updateMany({ where: { status: 'ACTIVE', llmPending: false, classifications: { some: { isCurrent: true, method: 'RULES' } } }, data: { llmPending: true } });
  console.log(`marked ${n.count} rules-only jobs as pending an LLM pass`);
}
if (!args.size) console.log('nothing to do: pass --normalize and/or --reclassify-other');
await Promise.all(Object.values(queues).map((q) => q.close()));
await redis.quit();
await prisma.$disconnect();
