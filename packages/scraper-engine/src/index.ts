import { createHash } from 'node:crypto';
import { isIndiaLocated } from '@beep/normalization';
import type { RawJob, SourceAdapterType } from '@beep/shared';
import { AshbyAdapter } from './adapters/ashby';
import { BaseAdapter, type AdapterConfig, type AdapterDeps } from './adapters/base';
import { GreenhouseAdapter } from './adapters/greenhouse';
import { LeverAdapter } from './adapters/lever';
import { HttpClient } from './http';
import { RobotsCache } from './robots';

export { HttpClient, SourceHttpError, RateLimiter, USER_AGENT } from './http';
export { RobotsCache, parseRobots, isPathAllowed } from './robots';
export { RobotsDisallowedError, BaseAdapter, type AdapterConfig } from './adapters/base';
export { GreenhouseAdapter } from './adapters/greenhouse';
export { LeverAdapter } from './adapters/lever';
export { AshbyAdapter } from './adapters/ashby';
export { htmlToText, sanitizeHtml, decodeEntities } from './html';

const ADAPTERS: Record<SourceAdapterType, new (c: AdapterConfig, d: AdapterDeps) => BaseAdapter> = {
  GREENHOUSE: GreenhouseAdapter,
  LEVER: LeverAdapter,
  ASHBY: AshbyAdapter,
};

export interface SourceDefinition extends AdapterConfig {
  adapterType: SourceAdapterType;
  rateLimitPerMinute: number;
  indiaOnly: boolean;
}

export function createAdapter(def: SourceDefinition, deps?: Partial<AdapterDeps>): BaseAdapter {
  const http = deps?.http ?? new HttpClient({ rateLimitPerMinute: def.rateLimitPerMinute });
  const robots = deps?.robots ?? new RobotsCache(http);
  return new ADAPTERS[def.adapterType](def, { http, robots });
}

/** sha256 over the fields whose change should trigger re-normalisation/re-classification. */
export function contentHash(job: RawJob): string {
  const material = JSON.stringify([job.title, job.locations, job.workplaceType, job.employmentType, job.department, job.descriptionText, job.postingUrl, job.applyUrl, job.compensationText]);
  return createHash('sha256').update(material).digest('hex');
}

export interface CollectResult {
  jobs: (RawJob & { contentHash: string })[];
  pagesFetched: number;
  fetched: number;
  /** Dropped by the India-only filter. */
  filtered: number;
  invalid: { externalId: string | null; reason: string }[];
}

/** Fetch every page of a source and apply the India filter. Throws on source/HTTP failure. */
export async function collectFromSource(def: SourceDefinition, opts: { maxPages?: number; deps?: Partial<AdapterDeps> } = {}): Promise<CollectResult> {
  const adapter = createAdapter(def, opts.deps);
  const maxPages = opts.maxPages ?? 50;
  const jobs: CollectResult['jobs'] = [];
  const invalid: CollectResult['invalid'] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  let fetched = 0;
  let filtered = 0;
  const seen = new Set<string>();

  do {
    const page = await adapter.fetchJobs(cursor);
    pagesFetched++;
    invalid.push(...adapter.invalidRecords.splice(0));
    for (const job of page.jobs) {
      fetched++;
      if (seen.has(job.externalId)) continue; // defensive: pagination overlap
      seen.add(job.externalId);
      if (def.indiaOnly && !isIndiaLocated(job.locations)) {
        filtered++;
        continue;
      }
      jobs.push({ ...job, contentHash: contentHash(job) });
    }
    cursor = page.hasMore ? page.nextCursor : undefined;
  } while (cursor !== undefined && pagesFetched < maxPages);

  return { jobs, pagesFetched, fetched, filtered, invalid };
}
