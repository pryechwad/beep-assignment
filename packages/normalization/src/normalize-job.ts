import type { EmploymentType, LocationType, RawJob, WorkMode } from '@beep/shared';
import { canonicalizeUrl, collapseWhitespace, normalizeCompanyName, normalizeEmploymentType, normalizeTitle, normalizeWorkMode, parseSourceDate } from './fields';
import { summarizeLocations, type NormalizedLocation } from './location';
import { extractSkills } from './skills';

export interface NormalizedJob {
  company: { display: string; key: string; slug: string };
  title: string;
  titleKey: string;
  description: string;
  descriptionHtml: string | null;
  locations: NormalizedLocation[];
  locationType: LocationType;
  primaryCity: string | null;
  primaryState: string | null;
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  department: string | null;
  salaryText: string | null;
  postingUrl: string;
  applyUrl: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  /** company|title|primary-location key used by layer-2 deduplication */
  dedupKey: string;
  skills: string[];
}

export function buildDedupKey(companyKey: string, titleKey: string, primaryCity: string | null, locationType: LocationType): string {
  const loc = primaryCity ? primaryCity.toLowerCase() : locationType.toLowerCase();
  return `${companyKey}|${titleKey}|${loc}`;
}

/** Deterministically normalise a raw source record. Pure function — no I/O. */
export function normalizeJob(raw: RawJob, now = new Date()): NormalizedJob {
  const company = normalizeCompanyName(raw.companyName);
  const title = normalizeTitle(raw.title);
  const loc = summarizeLocations(raw.locations);
  const description = raw.descriptionText.trim();
  const postingUrl = canonicalizeUrl(raw.postingUrl);
  const applyUrl = raw.applyUrl ? raw.applyUrl.trim() : raw.postingUrl.trim();

  return {
    company,
    title: title.display,
    titleKey: title.key,
    description,
    descriptionHtml: raw.descriptionHtml,
    locations: loc.locations,
    locationType: loc.locationType,
    primaryCity: loc.primaryCity,
    primaryState: loc.primaryState,
    workMode: normalizeWorkMode(raw.workplaceType, loc.workModeHint),
    employmentType: normalizeEmploymentType(raw.employmentType, raw.title),
    department: raw.department ? collapseWhitespace(raw.department) : null,
    salaryText: raw.compensationText ? collapseWhitespace(raw.compensationText) : null,
    postingUrl: raw.postingUrl.trim(),
    applyUrl,
    canonicalUrl: postingUrl,
    publishedAt: parseSourceDate(raw.publishedAt, now),
    dedupKey: buildDedupKey(company.key, title.key, loc.primaryCity, loc.locationType),
    skills: extractSkills(title.display, description).map((s) => s.name),
  };
}
