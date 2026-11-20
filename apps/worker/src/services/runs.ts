import type { PrismaClient, RunStatus } from '@beep/database';
import { newCorrelationId } from '@beep/shared/logger';

export async function createRun(db: PrismaClient, opts: { trigger: 'SCHEDULED' | 'MANUAL'; requestedBy?: string; sourceIds?: string[] }) {
  const sources = await db.jobSource.findMany({
    where: { enabled: true, ...(opts.sourceIds?.length ? { id: { in: opts.sourceIds } } : {}) },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const correlationId = newCorrelationId('run');
  const run = await db.scrapeRun.create({
    data: {
      correlationId,
      trigger: opts.trigger,
      requestedBy: opts.requestedBy ?? null,
      status: sources.length ? 'RUNNING' : 'SUCCEEDED',
      startedAt: new Date(),
      finishedAt: sources.length ? null : new Date(),
      sourcesTotal: sources.length,
      tasks: { create: sources.map((s) => ({ sourceId: s.id })) },
    },
  });
  return { run, sourceIds: sources.map((s) => s.id) };
}

/**
 * Close the run once every task is terminal. Idempotent and safe to call
 * from several concurrent discovery jobs: the status update is conditional.
 */
export async function maybeFinalizeRun(db: PrismaClient, runId: string): Promise<RunStatus | null> {
  const tasks = await db.scrapeTask.findMany({ where: { runId } });
  if (tasks.some((t) => t.status === 'QUEUED' || t.status === 'RUNNING')) return null;
  const succeeded = tasks.filter((t) => t.status === 'SUCCEEDED').length;
  const failed = tasks.filter((t) => t.status === 'FAILED').length;
  const status: RunStatus = failed === 0 ? 'SUCCEEDED' : succeeded === 0 ? 'FAILED' : 'PARTIAL';
  const sum = (k: 'jobsFetched' | 'jobsNew' | 'jobsUpdated' | 'jobsClosed') => tasks.reduce((n, t) => n + t[k], 0);
  const updated = await db.scrapeRun.updateMany({
    where: { id: runId, status: 'RUNNING' },
    data: {
      status,
      finishedAt: new Date(),
      sourcesSucceeded: succeeded,
      sourcesFailed: failed,
      jobsFetched: sum('jobsFetched'),
      jobsNew: sum('jobsNew'),
      jobsUpdated: sum('jobsUpdated'),
      jobsClosed: sum('jobsClosed'),
      error: failed ? `${failed} source(s) failed` : null,
    },
  });
  return updated.count ? status : null;
}
