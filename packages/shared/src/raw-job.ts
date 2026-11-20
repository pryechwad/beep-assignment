import { z } from 'zod';

/**
 * The shape every source adapter must emit. Values are kept as close to the
 * source as possible — no normalisation, no inference. Anything the source does
 * not state is null. Normalisation happens later in @beep/normalization so the
 * original values remain auditable.
 */
export const rawJobSchema = z.object({
  /** Stable identifier of the posting within its source (ATS job id). */
  externalId: z.string().min(1),
  title: z.string().min(1),
  companyName: z.string().min(1),
  /** Location strings exactly as the source lists them (primary first). */
  locations: z.array(z.string()),
  /** Source-provided workplace hint, e.g. Ashby's "Remote"/"Hybrid", Lever's workplaceType. */
  workplaceType: z.string().nullable(),
  /** Source-provided commitment, e.g. "Full-time", "Intern". */
  employmentType: z.string().nullable(),
  department: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  descriptionText: z.string(),
  /** Public posting page. */
  postingUrl: z.string().url(),
  /** Where applicants actually apply (often the same as postingUrl). */
  applyUrl: z.string().url().nullable(),
  /** ISO timestamp the source reports for publication/update, if any. */
  publishedAt: z.string().nullable(),
  /** Explicit compensation text as stated by the source, if any. */
  compensationText: z.string().nullable(),
  /** The untouched source record, kept for audit. */
  payload: z.unknown(),
});
export type RawJob = z.infer<typeof rawJobSchema>;

export interface FetchJobsResult {
  jobs: RawJob[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface JobSourceAdapter {
  readonly sourceId: string;
  readonly sourceName: string;
  isAvailable(): Promise<boolean>;
  fetchJobs(cursor?: string): Promise<FetchJobsResult>;
}
