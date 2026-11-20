import { Prisma, type PrismaClient } from '@beep/database';
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, ROLE_CATEGORIES, SOURCE_ADAPTER_TYPES, WORK_MODES, type JobListItem } from '@beep/shared';
import { z } from 'zod';
import { csv } from './http';

const list = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(csv, z.array(z.enum(values)).optional());
const strings = z.preprocess(csv, z.array(z.string().max(80)).max(30).optional());
const bool = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined), z.boolean().optional());

export const jobQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  company: z.string().trim().max(120).optional(),
  skill: strings,
  location: z.string().trim().max(80).optional(),
  role: list(ROLE_CATEGORIES),
  city: strings,
  state: strings,
  employmentType: list(EMPLOYMENT_TYPES),
  experience: list(EXPERIENCE_LEVELS),
  workMode: list(WORK_MODES),
  source: list(SOURCE_ADAPTER_TYPES),
  companyId: z.string().max(40).optional(),
  fresher: bool,
  internship: bool,
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'ALL']).default('ACTIVE'),
  sort: z.enum(['newest', 'relevance', 'company', 'title']).default('newest'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type JobQuery = z.infer<typeof jobQuerySchema>;

/** Full-text match ids ranked by ts_rank (title weighted A, department B, description C) plus prefix/substring fallbacks. */
async function fullTextIds(db: PrismaClient, q: string): Promise<{ id: string; rank: number }[]> {
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  return db.$queryRaw<{ id: string; rank: number }[]>`
    SELECT j."id", (ts_rank(j."searchVector", websearch_to_tsquery('english', ${q})) + CASE WHEN j."title" ILIKE ${like} THEN 1 ELSE 0 END) AS rank
    FROM "Job" j JOIN "Company" c ON c."id" = j."companyId"
    WHERE j."searchVector" @@ websearch_to_tsquery('english', ${q}) OR j."title" ILIKE ${like} OR c."name" ILIKE ${like}
    ORDER BY rank DESC
    LIMIT 5000`;
}

export async function buildJobWhere(db: PrismaClient, q: JobQuery): Promise<{ where: Prisma.JobWhereInput; rankById: Map<string, number> | null }> {
  const and: Prisma.JobWhereInput[] = [];
  let rankById: Map<string, number> | null = null;

  if (q.status !== 'ALL') and.push({ status: q.status });
  if (q.q) {
    const rows = await fullTextIds(db, q.q);
    rankById = new Map(rows.map((r) => [r.id, Number(r.rank)]));
    and.push({ id: { in: rows.map((r) => r.id) } });
  }
  if (q.company) and.push({ company: { name: { contains: q.company, mode: 'insensitive' } } });
  if (q.companyId) and.push({ companyId: q.companyId });
  if (q.skill?.length) for (const s of q.skill) and.push({ skills: { some: { skill: { name: { equals: s, mode: 'insensitive' } } } } });
  if (q.location) {
    const loc = q.location;
    and.push({
      OR: [
        { locations: { some: { OR: [{ city: { contains: loc, mode: 'insensitive' } }, { state: { contains: loc, mode: 'insensitive' } }, { raw: { contains: loc, mode: 'insensitive' } }] } } },
        ...(/remote/i.test(loc) ? [{ workMode: 'REMOTE' as const }, { locationType: 'REMOTE' as const }] : []),
      ],
    });
  }
  if (q.role?.length) and.push({ roleCategory: { in: q.role } });
  if (q.city?.length) and.push({ locations: { some: { city: { in: q.city } } } });
  if (q.state?.length) and.push({ locations: { some: { state: { in: q.state } } } });
  if (q.employmentType?.length) and.push({ employmentType: { in: q.employmentType } });
  if (q.experience?.length) and.push({ experienceLevel: { in: q.experience } });
  if (q.workMode?.length) and.push({ workMode: { in: q.workMode } });
  if (q.source?.length) and.push({ rawJobs: { some: { source: { adapterType: { in: q.source } } } } });
  if (q.fresher !== undefined) and.push({ isFresherEligible: q.fresher });
  if (q.internship) and.push({ OR: [{ employmentType: 'INTERNSHIP' }, { experienceLevel: 'INTERNSHIP' }] });
  if (q.postedWithinDays) {
    const since = new Date(Date.now() - q.postedWithinDays * 86400_000);
    and.push({ OR: [{ publishedAt: { gte: since } }, { publishedAt: null, firstSeenAt: { gte: since } }] });
  }
  return { where: and.length ? { AND: and } : {}, rankById };
}

export const jobListInclude = {
  company: { select: { id: true, name: true, slug: true, website: true } },
  locations: { select: { city: true }, orderBy: { position: 'asc' } },
  skills: { include: { skill: { select: { name: true } } }, orderBy: [{ origin: 'desc' }, { rank: 'asc' }], take: 6 },
  rawJobs: { select: { sourceId: true, postingUrl: true, source: { select: { adapterType: true } } }, orderBy: { firstSeenAt: 'asc' }, take: 1 },
} satisfies Prisma.JobInclude;

type JobWithListInclude = Prisma.JobGetPayload<{ include: typeof jobListInclude }>;

export function toListItem(j: JobWithListInclude): JobListItem {
  const primary = j.rawJobs[0];
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    locationType: j.locationType,
    primaryCity: j.primaryCity,
    primaryState: j.primaryState,
    cities: [...new Set(j.locations.map((l) => l.city).filter((c): c is string => c !== null))],
    workMode: j.workMode,
    employmentType: j.employmentType,
    experienceLevel: j.experienceLevel,
    roleCategory: j.roleCategory,
    isFresherEligible: j.isFresherEligible,
    confidenceLevel: j.confidenceLevel,
    // RULES-origin skills sort after LLM by 'desc'; prefer dictionary matches, which are verified by construction
    topSkills: [...j.skills].sort((a, b) => (a.origin === b.origin ? a.rank - b.rank : a.origin === 'RULES' ? -1 : 1)).slice(0, 3).map((s) => s.skill.name),
    publishedAt: j.publishedAt?.toISOString() ?? null,
    firstSeenAt: j.firstSeenAt.toISOString(),
    status: j.status,
    source: { sourceId: primary?.sourceId ?? '', adapterType: primary?.source.adapterType ?? 'GREENHOUSE', postingUrl: primary?.postingUrl ?? j.postingUrl },
  };
}

export async function searchJobs(db: PrismaClient, q: JobQuery) {
  const { where, rankById } = await buildJobWhere(db, q);
  const total = await db.job.count({ where });
  const useRelevance = q.sort === 'relevance' && rankById;
  const orderBy: Prisma.JobOrderByWithRelationInput[] =
    q.sort === 'company' ? [{ company: { name: 'asc' } }, { title: 'asc' }] : q.sort === 'title' ? [{ title: 'asc' }] : [{ firstSeenAt: 'desc' }, { id: 'asc' }];

  let rows: JobWithListInclude[];
  if (useRelevance) {
    // Rank ordering is computed in SQL above; page through the ranked id list.
    const ids = await db.job.findMany({ where, select: { id: true } });
    const ranked = ids.map((r) => r.id).sort((a, b) => (rankById.get(b) ?? 0) - (rankById.get(a) ?? 0));
    const pageIds = ranked.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const found = await db.job.findMany({ where: { id: { in: pageIds } }, include: jobListInclude });
    const byId = new Map(found.map((f) => [f.id, f]));
    rows = pageIds.map((id) => byId.get(id)).filter((x): x is JobWithListInclude => x !== undefined);
  } else {
    rows = await db.job.findMany({ where, include: jobListInclude, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
  }
  return { items: rows.map(toListItem), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
