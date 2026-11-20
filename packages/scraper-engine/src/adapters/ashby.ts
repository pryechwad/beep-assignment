import type { RawJob } from '@beep/shared';
import { z } from 'zod';
import { htmlToText } from '../html';
import { BaseAdapter, str } from './base';

/** Subset of the Ashby public Job Posting API object (verified 2026-11-20). */
const ashbyJob = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  secondaryLocations: z.array(z.object({ location: z.string().nullable().optional() })).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  isListed: z.boolean().optional(),
  isRemote: z.boolean().nullable().optional(),
  workplaceType: z.string().nullable().optional(),
  address: z
    .object({ postalAddress: z.object({ addressCountry: z.string().nullable().optional(), addressLocality: z.string().nullable().optional() }).partial().nullable().optional() })
    .nullable()
    .optional(),
  jobUrl: z.string(),
  applyUrl: z.string().nullable().optional(),
  descriptionHtml: z.string().nullable().optional(),
  descriptionPlain: z.string().nullable().optional(),
  shouldDisplayCompensationOnJobPostings: z.boolean().nullable().optional(),
  compensation: z.object({ compensationTierSummary: z.string().nullable().optional(), scrapeableCompensationSalarySummary: z.string().nullable().optional() }).partial().nullable().optional(),
});

/**
 * Ashby public Job Posting API — one request returns the full board.
 * https://developers.ashbyhq.com/docs/public-job-posting-api
 */
export class AshbyAdapter extends BaseAdapter {
  readonly type = 'ASHBY' as const;

  protected endpoint(): string {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.config.boardToken)}?includeCompensation=true`;
  }

  protected parse(body: unknown) {
    return { items: z.object({ jobs: z.array(z.unknown()) }).parse(body).jobs };
  }

  protected toRawJob(item: unknown): RawJob | null {
    const j = ashbyJob.parse(item);
    if (j.isListed === false) return null;
    const country = j.address?.postalAddress?.addressCountry ?? null;
    const locations = [...new Set([str(j.location), ...(j.secondaryLocations ?? []).map((s) => str(s.location))].filter((x): x is string => x !== null))];
    if (country && /india/i.test(country) && !locations.some((l) => /india/i.test(l))) locations.push('India');
    const comp = j.shouldDisplayCompensationOnJobPostings
      ? (str(j.compensation?.compensationTierSummary) ?? str(j.compensation?.scrapeableCompensationSalarySummary))
      : null;
    return {
      externalId: j.id,
      title: j.title.trim(),
      companyName: this.config.companyName,
      locations,
      workplaceType: str(j.workplaceType) ?? (j.isRemote ? 'Remote' : null),
      employmentType: str(j.employmentType),
      department: str(j.department) ?? str(j.team),
      descriptionHtml: j.descriptionHtml ?? null,
      descriptionText: j.descriptionHtml ? htmlToText(j.descriptionHtml) : (j.descriptionPlain ?? ''),
      postingUrl: j.jobUrl,
      applyUrl: j.applyUrl ?? j.jobUrl,
      publishedAt: j.publishedAt ?? null,
      compensationText: comp,
      payload: item,
    };
  }
}
