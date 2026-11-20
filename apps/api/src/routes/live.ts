import type { PrismaClient } from '@beep/database';
import { QUEUES, readHeartbeats, type Queue, type QueueName, type Redis } from '@beep/queues';
import type { LiveActivity } from '@beep/shared';
import { Router } from 'express';
import { asyncHandler } from '../lib/http';


/**
 * Live pipeline activity for the public site. Never cached (Cache-Control: no-store):
 * the UI polls it every few seconds, so syncing and AI tagging are visible as they happen.
 */
export function liveRouter(db: PrismaClient, redis: Redis, queues: Record<QueueName, Queue>): Router {
  const r = Router();
  r.get('/live/activity', asyncHandler(async (_req, res) => {
    const hourAgo = new Date(Date.now() - 3600_000);
    const [heartbeats, lastRun, total, llmTagged, pending, taggedLastHour, feed, counts, rawRecords, merged, flagged] = await Promise.all([
      readHeartbeats(redis).catch(() => []),
      db.scrapeRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      db.job.count({ where: { status: 'ACTIVE' } }),
      db.job.count({ where: { status: 'ACTIVE', classifications: { some: { isCurrent: true, method: { in: ['HYBRID', 'LLM', 'MANUAL'] } } } } }),
      db.job.count({ where: { status: 'ACTIVE', llmPending: true } }),
      db.jobClassification.count({ where: { createdAt: { gte: hourAgo }, method: { in: ['HYBRID', 'LLM'] } } }),
      db.jobClassification.findMany({
        where: { isCurrent: true, method: { in: ['HYBRID', 'LLM'] } },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, jobId: true, roleCategory: true, city: true, method: true, model: true, confidenceLevel: true, createdAt: true, job: { select: { title: true, primaryCity: true, company: { select: { name: true } } } } },
      }),
      Promise.all([QUEUES.discovery, QUEUES.normalize, QUEUES.classify].map((q) => queues[q].getJobCounts('waiting', 'prioritized', 'active', 'delayed'))),
      db.rawJob.count({ where: { removedAt: null } }),
      db.jobDuplicate.count({ where: { decision: 'MERGED' } }),
      db.jobDuplicate.count({ where: { reviewStatus: 'PENDING' } }),
    ]);
    const workers = heartbeats.filter((h) => h.role === 'worker');
    const scheduler = heartbeats.find((h) => h.role === 'scheduler');
    const schedules = (scheduler?.details as { schedules?: { id: string; next: string | null }[] } | undefined)?.schedules ?? [];
    const models = [...new Set(workers.flatMap((w) => ((w.details as { providers?: string[] } | undefined)?.providers ?? [])))];
    const depth = (c: Record<string, number>) => (c.waiting ?? 0) + (c.prioritized ?? 0) + (c.delayed ?? 0);
    const [d, n, c] = counts as [Record<string, number>, Record<string, number>, Record<string, number>];
    const body: LiveActivity = {
      serverTime: new Date().toISOString(),
      pipeline: {
        status: workers.length === 0 ? 'offline' : lastRun?.status === 'RUNNING' || depth(d) + depth(n) > 0 ? 'running' : !scheduler ? 'degraded' : 'idle',
        workers: workers.length,
        scheduler: !!scheduler,
        aiModels: models,
        nextScheduledRunAt: schedules.find((s) => s.id === 'daily-pipeline')?.next ?? null,
        lastRun: lastRun
          ? { status: lastRun.status, trigger: lastRun.trigger, startedAt: lastRun.startedAt?.toISOString() ?? null, finishedAt: lastRun.finishedAt?.toISOString() ?? null, sourcesSucceeded: lastRun.sourcesSucceeded, sourcesTotal: lastRun.sourcesTotal, jobsFetched: lastRun.jobsFetched, jobsNew: lastRun.jobsNew, jobsClosed: lastRun.jobsClosed }
          : null,
      },
      dedup: { rawRecords, uniqueJobs: total, merged, flaggedForReview: flagged },
      queues: { discovery: depth(d), normalize: depth(n), classify: depth(c), active: (d.active ?? 0) + (n.active ?? 0) + (c.active ?? 0) },
      ai: { total, llmTagged, pending, taggedLastHour },
      feed: feed.map((f) => ({ id: f.id, jobId: f.jobId, title: f.job.title, company: f.job.company.name, city: f.city ?? f.job.primaryCity, role: f.roleCategory, method: f.method, model: f.model, confidence: f.confidenceLevel, at: f.createdAt.toISOString() })),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  }));
  return r;
}
