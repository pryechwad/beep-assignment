import type { RawJob } from '@beep/shared';
import { z } from 'zod';
import { decodeEntities, htmlToText } from '../html';
import { BaseAdapter, str } from './base';

/** Subset of the Greenhouse Job Board API job object we rely on (verified 2026-11-20). */
const ghJob = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  updated_at: z.string().nullable().optional(),
  first_published: z.string().nullable().optional(),
  location: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
  offices: z.array(z.object({ name: z.string().nullable().optional(), location: z.string().nullable().optional() })).optional(),
  departments: z.array(z.object({ name: z.string() })).optional(),
  content: z.string().nullable().optional(),
  metadata: z.array(z.object({ name: z.string(), value: z.unknown() })).nullable().optional(),
});
type GhJob = z.infer<typeof ghJob>;

/**
 * Greenhouse public Job Board API — one request returns the full board.
 * https://developers.greenhouse.io/job-board.html
 */
export class GreenhouseAdapter extends BaseAdapter {
  readonly type = 'GREENHOUSE' as const;

  protected endpoint(): string {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.config.boardToken)}/jobs?content=true`;
  }

  protected parse(body: unknown) {
    const parsed = z.object({ jobs: z.array(z.unknown()) }).parse(body);
    return { items: parsed.jobs };
  }

  protected toRawJob(item: unknown): RawJob {
    const j: GhJob = ghJob.parse(item);
    const html = j.content ? decodeEntities(j.content) : null;
    const locations = uniq([
      str(j.location?.name),
      ...(j.offices ?? []).map((o) => str(o.location) ?? str(o.name)),
    ]);
    return {
      externalId: String(j.id),
      title: j.title.trim(),
      companyName: this.config.companyName,
      locations,
      workplaceType: metadataValue(j, /workplace|work type|remote|location type/i),
      employmentType: metadataValue(j, /employment|job type|commitment|worker type|time type/i),
      department: j.departments?.[0]?.name ?? null,
      descriptionHtml: html,
      descriptionText: html ? htmlToText(html) : '',
      postingUrl: j.absolute_url,
      applyUrl: j.absolute_url,
      publishedAt: j.first_published ?? j.updated_at ?? null,
      compensationText: metadataValue(j, /salary|compensation|pay range|ctc/i),
      payload: item,
    };
  }
}

function metadataValue(j: GhJob, re: RegExp): string | null {
  const m = (j.metadata ?? []).find((x) => re.test(x.name));
  if (!m) return null;
  if (typeof m.value === 'string') return str(m.value);
  if (Array.isArray(m.value)) return str(m.value.filter((v) => typeof v === 'string').join(', '));
  return null;
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x !== null))];
