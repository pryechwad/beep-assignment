import type { PrismaClient, VerificationOutcome } from '@beep/database';
import { HttpClient, RobotsCache, USER_AGENT } from '@beep/scraper-engine';
import axios from 'axios';

export interface VerifyResult {
  checked: number;
  closed: number;
  errors: number;
  skippedByRobots: number;
}

/**
 * Check that the original posting pages still resolve. Greenhouse redirects a
 * closed posting to the board with `?error=true`; Lever returns 404; any 404/410
 * is treated as closed. Ashby boards are client-rendered (always 200), so for
 * them the authoritative signal remains the source API listing in discovery.
 */
export async function verifyLinks(db: PrismaClient, opts: { limit?: number; olderThanHours?: number; http?: HttpClient } = {}): Promise<VerifyResult> {
  const cutoff = new Date(Date.now() - (opts.olderThanHours ?? 24) * 3600 * 1000);
  const jobs = await db.job.findMany({
    where: { status: 'ACTIVE', OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: cutoff } }] },
    select: { id: true, postingUrl: true },
    orderBy: [{ lastVerifiedAt: { sort: 'asc', nulls: 'first' } }],
    take: opts.limit ?? 150,
  });
  const robots = new RobotsCache(opts.http ?? new HttpClient({ rateLimitPerMinute: 60 }));
  const client = axios.create({ timeout: 15_000, maxRedirects: 5, validateStatus: () => true, headers: { 'User-Agent': USER_AGENT } });
  const result: VerifyResult = { checked: 0, closed: 0, errors: 0, skippedByRobots: 0 };

  for (const job of jobs) {
    if (!(await robots.isAllowed(job.postingUrl))) {
      result.skippedByRobots++;
      continue;
    }
    const started = Date.now();
    let outcome: VerificationOutcome;
    let httpStatus: number | null = null;
    let finalUrl: string | null = null;
    let error: string | null = null;
    try {
      const res = await client.get(job.postingUrl, { responseType: 'text' });
      httpStatus = res.status;
      finalUrl = (res.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? job.postingUrl;
      if (res.status === 404 || res.status === 410 || /[?&]error=true/.test(finalUrl)) outcome = 'CLOSED';
      else if (res.status >= 200 && res.status < 300) outcome = new URL(finalUrl).pathname !== new URL(job.postingUrl).pathname ? 'REDIRECTED' : 'LIVE';
      else outcome = 'ERROR';
    } catch (e) {
      outcome = 'ERROR';
      error = (e as Error).message.slice(0, 300);
    }
    await db.jobVerification.create({ data: { jobId: job.id, url: job.postingUrl, outcome, httpStatus, finalUrl, latencyMs: Date.now() - started, error } });
    await db.job.update({
      where: { id: job.id },
      data: { lastVerifiedAt: new Date(), ...(outcome === 'CLOSED' ? { status: 'CLOSED', closedAt: new Date() } : {}) },
    });
    result.checked++;
    if (outcome === 'CLOSED') result.closed++;
    if (outcome === 'ERROR') result.errors++;
  }
  return result;
}
