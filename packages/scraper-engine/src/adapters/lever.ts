import type { RawJob } from '@beep/shared';
import { z } from 'zod';
import { htmlToText } from '../html';
import { BaseAdapter, str } from './base';

const PAGE_SIZE = 100;

/** Subset of the Lever Postings API object (verified 2026-11-20). */
const leverPosting = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().nullable().optional(),
  createdAt: z.number().nullable().optional(),
  workplaceType: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  categories: z
    .object({
      commitment: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
      allLocations: z.array(z.string()).nullable().optional(),
    })
    .partial()
    .optional(),
  description: z.string().nullable().optional(),
  descriptionPlain: z.string().nullable().optional(),
  lists: z.array(z.object({ text: z.string(), content: z.string() })).optional(),
  additional: z.string().nullable().optional(),
  additionalPlain: z.string().nullable().optional(),
  salaryRange: z.object({ min: z.number().nullable().optional(), max: z.number().nullable().optional(), currency: z.string().nullable().optional(), interval: z.string().nullable().optional() }).nullable().optional(),
  salaryDescriptionPlain: z.string().nullable().optional(),
});

/**
 * Lever public Postings API, paginated with skip/limit.
 * https://github.com/lever/postings-api
 */
export class LeverAdapter extends BaseAdapter {
  readonly type = 'LEVER' as const;

  protected endpoint(cursor?: string): string {
    const skip = cursor ? Number(cursor) : 0;
    return `https://api.lever.co/v0/postings/${encodeURIComponent(this.config.boardToken)}?mode=json&skip=${skip}&limit=${PAGE_SIZE}`;
  }

  protected parse(body: unknown, cursor?: string) {
    const items = z.array(z.unknown()).parse(body);
    const skip = cursor ? Number(cursor) : 0;
    return { items, nextCursor: items.length === PAGE_SIZE ? String(skip + PAGE_SIZE) : undefined };
  }

  protected toRawJob(item: unknown): RawJob {
    const p = leverPosting.parse(item);
    const listsHtml = (p.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join('');
    const html = [p.description ?? '', listsHtml, p.additional ?? ''].join('');
    const locations = [...new Set([str(p.categories?.location), ...(p.categories?.allLocations ?? []).map(str)].filter((x): x is string => x !== null))];
    // Lever's ISO country code is a reliable India signal when the city string is ambiguous.
    if (p.country === 'IN' && !locations.some((l) => /india/i.test(l))) locations.push('India');
    return {
      externalId: p.id,
      title: p.text.trim(),
      companyName: this.config.companyName,
      locations,
      workplaceType: p.workplaceType && p.workplaceType !== 'unspecified' ? p.workplaceType : null,
      employmentType: str(p.categories?.commitment),
      department: str(p.categories?.team) ?? str(p.categories?.department),
      descriptionHtml: html || null,
      descriptionText: html ? htmlToText(html) : (p.descriptionPlain ?? ''),
      postingUrl: p.hostedUrl,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      compensationText: formatSalary(p.salaryRange) ?? str(p.salaryDescriptionPlain),
      payload: item,
    };
  }
}

function formatSalary(r: { min?: number | null; max?: number | null; currency?: string | null; interval?: string | null } | null | undefined): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  const range = [r.min, r.max].filter((x) => x != null).map((x) => x!.toLocaleString('en-IN')).join(' – ');
  return [r.currency, range, r.interval].filter(Boolean).join(' ');
}
