import type { PrismaClient } from '@beep/database';
import type { Redis } from '@beep/queues';
import { readHeartbeats } from '@beep/queues';
import {
  EMPLOYMENT_LABELS,
  EXPERIENCE_LABELS,
  ROLE_LABELS,
  SOURCE_ADAPTER_LABELS,
  WORK_MODE_LABELS,
  type AnalyticsOverview,
  type ClassificationDTO,
  type CompanyListItem,
  type CountRow,
  type DailyIngestionRow,
  type JobDetail,
  type JobFilters,
  type RoleCategory,
  type SourceStatus,
} from '@beep/shared';
import { sanitizeHtml } from '@beep/scraper-engine';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../lib/http';
import { jobListInclude, jobQuerySchema, searchJobs, toListItem } from '../lib/job-query';
import { istDayStart } from '../lib/time';
import { responseCache } from '../lib/cache';

const ACTIVE = { status: 'ACTIVE' as const };

export function toClassificationDTO(c: {
  id: string; version: number; method: ClassificationDTO['method']; provider: string | null; model: string | null; promptVersion: string | null;
  roleCategory: ClassificationDTO['roleCategory']; experienceLevel: ClassificationDTO['experienceLevel']; employmentType: ClassificationDTO['employmentType'];
  workMode: ClassificationDTO['workMode']; city: string | null; isFresherEligible: boolean; eligibilityReasoning: string; eligibilityEvidence: string[];
  educationRequirement: string | null; summary: string | null; skills: string[]; confidenceScore: number; confidenceLevel: ClassificationDTO['confidenceLevel'];
  validationStatus: ClassificationDTO['validationStatus']; validationErrors: string[]; needsReview: boolean; createdAt: Date;
}): ClassificationDTO {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

export function publicRouter(db: PrismaClient, redis: Redis, opts: { cacheTtlMs?: number } = {}): Router {
  const r = Router();
  // Aggregates change only when the pipeline runs: serve them from a short-lived cache.
  const ttl = opts.cacheTtlMs ?? 30_000;
  if (ttl > 0) r.use(['/jobs/filters', '/companies', '/analytics', '/sources/status'], responseCache(ttl));

  r.get('/jobs', asyncHandler(async (req, res) => {
    res.json(await searchJobs(db, jobQuerySchema.parse(req.query)));
  }));

  r.get('/jobs/filters', asyncHandler(async (_req, res) => {
    const [roles, emp, exp, modes, cities, states, sources] = await Promise.all([
      db.job.groupBy({ by: ['roleCategory'], where: ACTIVE, _count: true }),
      db.job.groupBy({ by: ['employmentType'], where: ACTIVE, _count: true }),
      db.job.groupBy({ by: ['experienceLevel'], where: ACTIVE, _count: true }),
      db.job.groupBy({ by: ['workMode'], where: ACTIVE, _count: true }),
      db.$queryRaw<{ v: string; n: bigint }[]>`SELECT l."city" AS v, COUNT(DISTINCT l."jobId") AS n FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId" WHERE j."status" = 'ACTIVE' AND l."city" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      db.$queryRaw<{ v: string; n: bigint }[]>`SELECT l."state" AS v, COUNT(DISTINCT l."jobId") AS n FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId" WHERE j."status" = 'ACTIVE' AND l."state" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      db.$queryRaw<{ v: string; n: bigint }[]>`SELECT s."adapterType"::text AS v, COUNT(DISTINCT r."jobId") AS n FROM "RawJob" r JOIN "JobSource" s ON s."id" = r."sourceId" JOIN "Job" j ON j."id" = r."jobId" WHERE j."status" = 'ACTIVE' GROUP BY 1 ORDER BY 2 DESC`,
    ]);
    const opt = <K extends string>(rows: { key: K | null; n: number }[], labels: Record<K, string>) =>
      rows.filter((x): x is { key: K; n: number } => x.key !== null).map((x) => ({ value: x.key, label: labels[x.key], count: x.n })).sort((a, b) => b.count - a.count);
    const body: JobFilters = {
      roles: opt(roles.map((x) => ({ key: x.roleCategory, n: x._count })), ROLE_LABELS),
      employmentTypes: opt(emp.map((x) => ({ key: x.employmentType, n: x._count })), EMPLOYMENT_LABELS),
      experienceLevels: opt(exp.map((x) => ({ key: x.experienceLevel, n: x._count })), EXPERIENCE_LABELS),
      workModes: opt(modes.map((x) => ({ key: x.workMode, n: x._count })), WORK_MODE_LABELS),
      cities: cities.map((c) => ({ value: c.v, label: c.v, count: Number(c.n) })),
      states: states.map((c) => ({ value: c.v, label: c.v, count: Number(c.n) })),
      sources: sources.map((c) => ({ value: c.v, label: SOURCE_ADAPTER_LABELS[c.v as keyof typeof SOURCE_ADAPTER_LABELS] ?? c.v, count: Number(c.n) })),
    };
    res.json(body);
  }));

  r.get('/jobs/:id', asyncHandler(async (req, res) => {
    const id = z.string().max(40).parse(req.params.id);
    const job = await db.job.findUnique({
      where: { id },
      include: {
        ...jobListInclude,
        skills: { include: { skill: { select: { name: true } } }, orderBy: { rank: 'asc' } },
        rawJobs: { include: { source: { select: { adapterType: true } } }, orderBy: { firstSeenAt: 'asc' } },
        classifications: { where: { isCurrent: true }, take: 1 },
      },
    });
    if (!job) throw notFound('Job');
    const primary = job.rawJobs[0];
    const base = toListItem({ ...job, skills: job.skills.slice(0, 6), rawJobs: job.rawJobs.slice(0, 1) });
    const c = job.classifications[0];
    const body: JobDetail = {
      ...base,
      description: job.description,
      // Third-party HTML: sanitised (allow-list) before it ever reaches a browser.
      descriptionHtml: job.descriptionHtml ? sanitizeHtml(job.descriptionHtml) : null,
      department: job.department,
      salaryText: job.salaryText,
      applyUrl: job.applyUrl,
      postingUrl: job.postingUrl,
      lastSeenAt: job.lastSeenAt.toISOString(),
      lastVerifiedAt: job.lastVerifiedAt?.toISOString() ?? null,
      closedAt: job.closedAt?.toISOString() ?? null,
      llmPending: job.llmPending,
      sourceFacts: {
        locations: primary?.locations ?? [],
        employmentType: primary?.employmentType ?? null,
        workplaceType: primary?.workplaceType ?? null,
        department: primary?.department ?? null,
        publishedAt: primary?.publishedAt ?? null,
        compensation: primary?.compensationText ?? null,
      },
      sources: job.rawJobs.map((rj) => ({ sourceId: rj.sourceId, adapterType: rj.source.adapterType, postingUrl: rj.postingUrl, externalId: rj.externalId, firstSeenAt: rj.firstSeenAt.toISOString(), removedAt: rj.removedAt?.toISOString() ?? null })),
      skills: job.skills.map((s) => ({ name: s.skill.name, origin: s.origin === 'LLM' ? 'LLM' : 'RULES' })),
      classification: c ? toClassificationDTO(c) : null,
    };
    res.json(body);
  }));

  r.get('/companies', asyncHandler(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(80).optional() }).parse(req.query);
    const companies = await db.company.findMany({
      where: { jobs: { some: ACTIVE }, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
      include: { sources: { select: { adapterType: true } } },
      orderBy: { name: 'asc' },
    });
    const ids = companies.map((c) => c.id);
    const [stats, roles, cities] = await Promise.all([
      db.$queryRaw<{ companyId: string; active: bigint; fresher: bigint; interns: bigint }[]>`
        SELECT "companyId", COUNT(*) AS active, COUNT(*) FILTER (WHERE "isFresherEligible") AS fresher,
               COUNT(*) FILTER (WHERE "employmentType" = 'INTERNSHIP' OR "experienceLevel" = 'INTERNSHIP') AS interns
        FROM "Job" WHERE "status" = 'ACTIVE' AND "companyId" = ANY(${ids}) GROUP BY 1`,
      db.job.groupBy({ by: ['companyId', 'roleCategory'], where: { ...ACTIVE, companyId: { in: ids } }, _count: true }),
      db.$queryRaw<{ companyId: string; city: string; n: bigint }[]>`
        SELECT j."companyId", l."city", COUNT(*) AS n FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId"
        WHERE j."status" = 'ACTIVE' AND l."city" IS NOT NULL AND j."companyId" = ANY(${ids}) GROUP BY 1, 2 ORDER BY 3 DESC`,
    ]);
    const statBy = new Map(stats.map((s) => [s.companyId, s]));
    const items: CompanyListItem[] = companies.map((c) => {
      const s = statBy.get(c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        website: c.website,
        activeJobs: Number(s?.active ?? 0),
        fresherJobs: Number(s?.fresher ?? 0),
        internships: Number(s?.interns ?? 0),
        topRoles: roles.filter((x) => x.companyId === c.id && x.roleCategory).sort((a, b) => b._count - a._count).slice(0, 3).map((x) => ({ role: x.roleCategory as RoleCategory, count: x._count })),
        cities: cities.filter((x) => x.companyId === c.id).slice(0, 4).map((x) => x.city),
        sources: [...new Set(c.sources.map((s) => s.adapterType))],
      };
    });
    res.json({ items: items.sort((a, b) => b.activeJobs - a.activeJobs) });
  }));

  r.get('/analytics/overview', asyncHandler(async (_req, res) => {
    const todayStart = istDayStart();
    const [activeJobs, fresherEligible, internships, companies, citiesRow, addedToday, classified, pendingLLM, lastRun, lastSuccess, median, verified, snapshots, heartbeats] = await Promise.all([
      db.job.count({ where: ACTIVE }),
      db.job.count({ where: { ...ACTIVE, isFresherEligible: true } }),
      db.job.count({ where: { ...ACTIVE, OR: [{ employmentType: 'INTERNSHIP' }, { experienceLevel: 'INTERNSHIP' }] } }),
      db.company.count({ where: { jobs: { some: ACTIVE } } }),
      db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT l."city") AS n FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId" WHERE j."status" = 'ACTIVE' AND l."city" IS NOT NULL`,
      db.job.count({ where: { firstSeenAt: { gte: todayStart } } }),
      db.job.count({ where: { ...ACTIVE, classifiedAt: { not: null } } }),
      db.job.count({ where: { ...ACTIVE, llmPending: true } }),
      db.scrapeRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      db.scrapeRun.findFirst({ where: { status: { in: ['SUCCEEDED', 'PARTIAL'] } }, orderBy: { finishedAt: 'desc' } }),
      db.$queryRaw<{ d: number | null }[]>`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - COALESCE("publishedAt", "firstSeenAt"))) / 86400) AS d FROM "Job" WHERE "status" = 'ACTIVE'`,
      db.job.count({ where: { ...ACTIVE, lastVerifiedAt: { gte: new Date(Date.now() - 86400_000) } } }),
      db.dailyMetric.findMany({ where: { date: { lt: new Date(todayStart.getTime() + 5.5 * 3600_000) } }, orderBy: { date: 'desc' }, take: 1 }),
      readHeartbeats(redis).catch(() => []),
    ]);
    const prev = snapshots[0];
    const cmp = (v: number | undefined) => ({ previous: prev ? (v ?? null) : null, previousDate: prev ? prev.date.toISOString().slice(0, 10) : null });
    const workers = heartbeats.filter((h) => h.role === 'worker').length;
    const scheduler = heartbeats.some((h) => h.role === 'scheduler');
    const body: AnalyticsOverview = {
      totals: { activeJobs, fresherEligible, internships, companies, cities: Number(citiesRow[0]?.n ?? 0), addedToday },
      comparisons: { activeJobs: cmp(prev?.activeJobs), fresherEligible: cmp(prev?.fresherEligible), internships: cmp(prev?.internships), companies: cmp(prev?.companies), cities: cmp(prev?.cities) },
      classification: { classified, pendingLLM, unclassified: activeJobs - classified },
      freshness: {
        lastSuccessfulRunAt: lastSuccess?.finishedAt?.toISOString() ?? null,
        lastRunStatus: lastRun?.status ?? null,
        lastRunAt: (lastRun?.finishedAt ?? lastRun?.startedAt)?.toISOString() ?? null,
        medianAgeDays: median[0]?.d === null || median[0]?.d === undefined ? null : Math.round(Number(median[0].d) * 10) / 10,
        verifiedLast24h: verified,
      },
      pipeline: { status: heartbeats.length === 0 ? 'unknown' : lastRun?.status === 'RUNNING' ? 'running' : workers === 0 || !scheduler ? 'degraded' : 'idle', workers, scheduler },
    };
    res.json(body);
  }));

  const countBy = async (column: 'roleCategory' | 'employmentType' | 'experienceLevel' | 'workMode', labels: Record<string, string>): Promise<CountRow[]> => {
    const rows = await db.job.groupBy({ by: [column], where: ACTIVE, _count: true });
    const fresher = await db.job.groupBy({ by: [column], where: { ...ACTIVE, isFresherEligible: true }, _count: true });
    const fBy = new Map(fresher.map((f) => [f[column] as string | null, f._count]));
    return rows
      .filter((x) => x[column] !== null)
      .map((x) => ({ key: x[column] as string, label: labels[x[column] as string] ?? String(x[column]), count: x._count, fresher: fBy.get(x[column] as string) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  };

  r.get('/analytics/roles', asyncHandler(async (_req, res) => res.json({ items: await countBy('roleCategory', ROLE_LABELS) })));
  r.get('/analytics/employment', asyncHandler(async (_req, res) => res.json({ items: await countBy('employmentType', EMPLOYMENT_LABELS), unknown: await db.job.count({ where: { ...ACTIVE, employmentType: null } }) })));
  r.get('/analytics/experience', asyncHandler(async (_req, res) => res.json({ items: await countBy('experienceLevel', EXPERIENCE_LABELS) })));

  r.get('/analytics/cities', asyncHandler(async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(15) }).parse(req.query);
    const rows = await db.$queryRaw<{ city: string; n: bigint; fresher: bigint }[]>`
      SELECT l."city", COUNT(DISTINCT j."id") AS n, COUNT(DISTINCT j."id") FILTER (WHERE j."isFresherEligible") AS fresher
      FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId"
      WHERE j."status" = 'ACTIVE' AND l."city" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`;
    const [remote, unknown] = await Promise.all([db.job.count({ where: { ...ACTIVE, locationType: 'REMOTE' } }), db.job.count({ where: { ...ACTIVE, locationType: 'UNKNOWN' } })]);
    const items: CountRow[] = rows.map((r2) => ({ key: r2.city, label: r2.city, count: Number(r2.n), fresher: Number(r2.fresher) }));
    res.json({ items, remote, unknown });
  }));

  r.get('/analytics/daily', asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }).parse(req.query);
    // One indexed range scan per event type, grouped by IST day, then joined onto a dense day series.
    const rows = await db.$queryRaw<{ d: Date; added: bigint; closed: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
      days AS (SELECT generate_series((SELECT today FROM bounds) - (${days}::int - 1), (SELECT today FROM bounds), interval '1 day')::date AS d),
      since AS (SELECT ((SELECT today FROM bounds) - (${days}::int - 1))::timestamp AT TIME ZONE 'Asia/Kolkata' AS t),
      added AS (SELECT ("firstSeenAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*) AS n FROM "Job" WHERE "firstSeenAt" >= (SELECT t FROM since) GROUP BY 1),
      closed AS (SELECT ("closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*) AS n FROM "Job" WHERE "closedAt" >= (SELECT t FROM since) GROUP BY 1)
      SELECT days.d, COALESCE(added.n, 0) AS added, COALESCE(closed.n, 0) AS closed
      FROM days LEFT JOIN added ON added.d = days.d LEFT JOIN closed ON closed.d = days.d
      ORDER BY days.d`;
    const items: DailyIngestionRow[] = rows.map((x) => ({ date: x.d.toISOString().slice(0, 10), added: Number(x.added), closed: Number(x.closed) }));
    res.json({ items, firstIngestedAt: (await db.job.findFirst({ orderBy: { firstSeenAt: 'asc' }, select: { firstSeenAt: true } }))?.firstSeenAt.toISOString() ?? null });
  }));

  r.get('/analytics/sources', asyncHandler(async (_req, res) => {
    const rows = await db.$queryRaw<{ t: string; n: bigint; boards: bigint }[]>`
      SELECT s."adapterType"::text AS t, COUNT(DISTINCT r."jobId") AS n, COUNT(DISTINCT s."id") AS boards
      FROM "JobSource" s LEFT JOIN "RawJob" r ON r."sourceId" = s."id" AND r."removedAt" IS NULL
      LEFT JOIN "Job" j ON j."id" = r."jobId" AND j."status" = 'ACTIVE'
      GROUP BY 1 ORDER BY 2 DESC`;
    res.json({ items: rows.map((x) => ({ key: x.t, label: SOURCE_ADAPTER_LABELS[x.t as keyof typeof SOURCE_ADAPTER_LABELS] ?? x.t, count: Number(x.n), boards: Number(x.boards) })) });
  }));

  r.get('/sources/status', asyncHandler(async (_req, res) => {
    const sources = await db.jobSource.findMany({ include: { company: { select: { name: true } } }, orderBy: [{ adapterType: 'asc' }, { name: 'asc' }] });
    const active = await db.$queryRaw<{ sourceId: string; n: bigint }[]>`
      SELECT r."sourceId", COUNT(DISTINCT r."jobId") AS n FROM "RawJob" r JOIN "Job" j ON j."id" = r."jobId" WHERE j."status" = 'ACTIVE' AND r."removedAt" IS NULL GROUP BY 1`;
    const by = new Map(active.map((a) => [a.sourceId, Number(a.n)]));
    const items: SourceStatus[] = sources.map((s) => ({
      id: s.id, name: s.name, adapterType: s.adapterType, company: s.company?.name ?? null, enabled: s.enabled, healthy: s.healthy,
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastFailureAt: s.lastFailureAt?.toISOString() ?? null, lastError: s.lastError,
      lastRecordCount: s.lastRecordCount, activeJobs: by.get(s.id) ?? 0,
    }));
    res.json({ items });
  }));

  return r;
}
