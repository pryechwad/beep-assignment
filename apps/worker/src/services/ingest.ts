import type { Prisma, PrismaClient } from '@beep/database';
import type { CollectResult } from '@beep/scraper-engine';
import { newCorrelationId } from '@beep/shared/logger';

export interface IngestStats {
  jobsNew: number;
  jobsUpdated: number;
  jobsUnchanged: number;
  jobsClosed: number;
  /** Raw records that need (re)normalisation. */
  toNormalize: { rawJobId: string; correlationId: string }[];
}

/**
 * Persist one source's collection result.
 *  - new posting → RawJob(PENDING) → normalise
 *  - changed content hash → update + normalise
 *  - unchanged → touch lastSeenAt (re-open if it had been removed)
 *  - previously seen but absent now → removedAt; a Job whose every source
 *    reference is removed is CLOSED.
 * `complete` must be false when pagination was truncated, so that a partial
 * fetch never closes jobs.
 */
export async function ingestCollection(db: PrismaClient, sourceId: string, result: CollectResult, opts: { complete: boolean; seenAt?: Date }): Promise<IngestStats> {
  const seenAt = opts.seenAt ?? new Date();
  const existing = await db.rawJob.findMany({
    where: { sourceId },
    select: { id: true, externalId: true, contentHash: true, removedAt: true, correlationId: true, jobId: true },
  });
  const byExternal = new Map(existing.map((r) => [r.externalId, r]));
  const stats: IngestStats = { jobsNew: 0, jobsUpdated: 0, jobsUnchanged: 0, jobsClosed: 0, toNormalize: [] };

  for (const job of result.jobs) {
    const fields = {
      title: job.title,
      companyName: job.companyName,
      locations: job.locations,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      department: job.department,
      descriptionHtml: job.descriptionHtml,
      descriptionText: job.descriptionText,
      postingUrl: job.postingUrl,
      applyUrl: job.applyUrl,
      publishedAt: job.publishedAt,
      compensationText: job.compensationText,
      payload: job.payload as Prisma.InputJsonValue,
      contentHash: job.contentHash,
    };
    const prev = byExternal.get(job.externalId);
    if (!prev) {
      const correlationId = newCorrelationId('job');
      const created = await db.rawJob.create({ data: { sourceId, externalId: job.externalId, ...fields, correlationId, firstSeenAt: seenAt, lastSeenAt: seenAt } });
      stats.jobsNew++;
      stats.toNormalize.push({ rawJobId: created.id, correlationId });
    } else if (prev.contentHash !== job.contentHash) {
      await db.rawJob.update({ where: { id: prev.id }, data: { ...fields, status: 'PENDING', processingError: null, lastSeenAt: seenAt, removedAt: null } });
      stats.jobsUpdated++;
      stats.toNormalize.push({ rawJobId: prev.id, correlationId: prev.correlationId });
    } else {
      await db.rawJob.update({ where: { id: prev.id }, data: { lastSeenAt: seenAt, removedAt: null } });
      stats.jobsUnchanged++;
      if (prev.removedAt) stats.toNormalize.push({ rawJobId: prev.id, correlationId: prev.correlationId }); // re-listed → reopen
    }
  }

  if (opts.complete) {
    const present = new Set(result.jobs.map((j) => j.externalId));
    const gone = existing.filter((r) => !r.removedAt && !present.has(r.externalId));
    if (gone.length) {
      await db.rawJob.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { removedAt: seenAt } });
      const jobIds = [...new Set(gone.map((g) => g.jobId).filter((x): x is string => x !== null))];
      for (const jobId of jobIds) {
        const stillListed = await db.rawJob.count({ where: { jobId, removedAt: null } });
        if (stillListed === 0) {
          const closed = await db.job.updateMany({ where: { id: jobId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: seenAt } });
          stats.jobsClosed += closed.count;
        }
      }
    }
  }

  // Touch lastSeenAt on canonical jobs that are still listed
  await db.$executeRaw`UPDATE "Job" SET "lastSeenAt" = ${seenAt} WHERE "id" IN (SELECT "jobId" FROM "RawJob" WHERE "sourceId" = ${sourceId} AND "removedAt" IS NULL AND "jobId" IS NOT NULL)`;
  return stats;
}
