import { rawJobSchema, type FetchJobsResult, type JobSourceAdapter, type RawJob, type SourceAdapterType } from '@beep/shared';
import type { HttpClient } from '../http';
import type { RobotsCache } from '../robots';

export interface AdapterConfig {
  sourceId: string;
  sourceName: string;
  boardToken: string;
  /** Employer display name; overrides any name in the payload for consistency. */
  companyName: string;
}

export interface AdapterDeps {
  http: HttpClient;
  robots: RobotsCache;
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

/** Shared plumbing: robots check, payload validation, invalid-record accounting. */
export abstract class BaseAdapter implements JobSourceAdapter {
  abstract readonly type: SourceAdapterType;
  readonly sourceId: string;
  readonly sourceName: string;
  /** Records the source returned that failed schema validation in the last fetch. */
  invalidRecords: { externalId: string | null; reason: string }[] = [];

  constructor(
    protected readonly config: AdapterConfig,
    protected readonly deps: AdapterDeps,
  ) {
    this.sourceId = config.sourceId;
    this.sourceName = config.sourceName;
  }

  protected abstract endpoint(cursor?: string): string;
  protected abstract parse(body: unknown, cursor?: string): { items: unknown[]; nextCursor?: string };
  protected abstract toRawJob(item: unknown): RawJob | null;

  async isAvailable(): Promise<boolean> {
    try {
      const url = this.endpoint();
      if (!(await this.deps.robots.isAllowed(url))) return false;
      await this.deps.http.getJson<unknown>(url);
      return true;
    } catch {
      return false;
    }
  }

  async fetchJobs(cursor?: string): Promise<FetchJobsResult> {
    const url = this.endpoint(cursor);
    if (!(await this.deps.robots.isAllowed(url))) throw new RobotsDisallowedError(url);
    const body = await this.deps.http.getJson<unknown>(url);
    const { items, nextCursor } = this.parse(body, cursor);
    if (cursor === undefined) this.invalidRecords = [];

    const jobs: RawJob[] = [];
    for (const item of items) {
      let candidate: RawJob | null = null;
      try {
        candidate = this.toRawJob(item);
      } catch (e) {
        this.invalidRecords.push({ externalId: idOf(item), reason: (e as Error).message });
        continue;
      }
      if (!candidate) continue; // intentionally skipped (e.g. unlisted)
      const parsed = rawJobSchema.safeParse(candidate);
      if (parsed.success) jobs.push(parsed.data);
      else this.invalidRecords.push({ externalId: candidate.externalId, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    return { jobs, nextCursor, hasMore: nextCursor !== undefined };
  }
}

function idOf(item: unknown): string | null {
  if (item && typeof item === 'object' && 'id' in item) return String((item as { id: unknown }).id);
  return null;
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
