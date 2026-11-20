import type { PrismaClient } from '@beep/database';

/** IST calendar-day boundaries (the product's reporting timezone). */
export function istDayBounds(date = new Date()): { day: Date; start: Date; end: Date } {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const dayStr = ist.toISOString().slice(0, 10);
  const start = new Date(`${dayStr}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { day: new Date(`${dayStr}T00:00:00Z`), start, end };
}

/** Snapshot today's headline numbers into DailyMetric (idempotent upsert). */
export async function computeDailyMetric(db: PrismaClient, date = new Date()) {
  const { day, start, end } = istDayBounds(date);
  const active = { status: 'ACTIVE' as const };
  const [activeJobs, fresherEligible, internships, companies, citiesRows, addedToday, closedToday] = await Promise.all([
    db.job.count({ where: active }),
    db.job.count({ where: { ...active, isFresherEligible: true } }),
    db.job.count({ where: { ...active, OR: [{ employmentType: 'INTERNSHIP' }, { experienceLevel: 'INTERNSHIP' }] } }),
    db.company.count({ where: { jobs: { some: active } } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT l."city") AS n FROM "JobLocation" l JOIN "Job" j ON j."id" = l."jobId" WHERE j."status" = 'ACTIVE' AND l."city" IS NOT NULL`,
    db.job.count({ where: { firstSeenAt: { gte: start, lt: end } } }),
    db.job.count({ where: { closedAt: { gte: start, lt: end } } }),
  ]);
  const data = { activeJobs, fresherEligible, internships, companies, cities: Number(citiesRows[0]?.n ?? 0), addedToday, closedToday, computedAt: new Date() };
  return db.dailyMetric.upsert({ where: { date: day }, create: { date: day, ...data }, update: data });
}
