import type { EmploymentType, WorkMode } from '@beep/shared';

// ───────────────────────── Text ─────────────────────────

export function collapseWhitespace(s: string): string {
  return s.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ───────────────────────── Company ─────────────────────────

const LEGAL_SUFFIX_RE =
  /[,.\s]+(private limited|pvt\.? ?ltd\.?|pvt\.?|limited|ltd\.?|inc\.?|incorporated|llc|llp|corp\.?|corporation|gmbh|plc|co\.?)\s*$/i;

export interface NormalizedCompany {
  display: string;
  /** Matching key: lower-case alphanumerics with legal suffixes removed. */
  key: string;
  slug: string;
}

export function normalizeCompanyName(raw: string): NormalizedCompany {
  let display = collapseWhitespace(raw);
  // Strip legal suffixes repeatedly ("Foo Software Private Limited" → "Foo Software")
  for (let i = 0; i < 3 && LEGAL_SUFFIX_RE.test(display); i++) display = display.replace(LEGAL_SUFFIX_RE, '').trim();
  const key = display.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  const slug = display.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { display, key, slug };
}

// ───────────────────────── Title ─────────────────────────

const TITLE_ABBREVIATIONS: [RegExp, string][] = [
  [/\bsr\.?(?=\s|$)/gi, 'senior'],
  [/\bjr\.?(?=\s|$)/gi, 'junior'],
  [/\bengg\.?\b/gi, 'engineer'],
  [/\bmgr\.?\b/gi, 'manager'],
  [/\bdev\b/gi, 'developer'],
  [/\bsde\b/gi, 'software development engineer'],
  [/\bswe\b/gi, 'software engineer'],
  [/\bml\b/gi, 'machine learning'],
  [/\bai\b/gi, 'artificial intelligence'],
  [/&/g, ' and '],
];

const ROMAN_LEVELS: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };

export interface NormalizedTitle {
  display: string;
  key: string;
}

/**
 * Clean a job title for display (requisition ids and trailing location tags
 * removed) and derive a matching key with common abbreviations expanded.
 */
export function normalizeTitle(raw: string): NormalizedTitle {
  let display = collapseWhitespace(raw)
    // requisition ids: "[R-12345]", "(JR123456)", "- REQ 1234"
    .replace(/\s*[[(](?:req|jr|r|job id|id)[-\s#:]*\d[\w-]*[\])]\s*/gi, ' ')
    .replace(/\s*[-–|]\s*(?:req|job id)[\s#:]*\d[\w-]*\s*$/i, '');
  // trailing "(Remote)" / " - Bangalore" style tags that duplicate the location field
  display = display.replace(
    /\s*(?:[-–|,]\s*|\()\s*(remote|hybrid|on-?site|india|bangalore|bengaluru|mumbai|pune|hyderabad|chennai|gurgaon|gurugram|noida|delhi|new delhi|kolkata)(?:\s*,\s*india)?\s*\)?\s*$/i,
    '',
  );
  display = collapseWhitespace(display);

  let key = display.toLowerCase();
  for (const [re, replacement] of TITLE_ABBREVIATIONS) key = key.replace(re, replacement);
  key = key
    // "SDE I" / "SDE-1" / "SDE 1" share a key: level numbers become lvl1..lvl4
    .replace(/\b(i{1,3}|iv|[1-4])\b/g, (m) => ` lvl${ROMAN_LEVELS[m] ?? m} `)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { display, key };
}

// ───────────────────────── Employment type ─────────────────────────

/**
 * Map an explicit source commitment string (and, failing that, an explicit
 * title marker such as "Intern") to an employment type. Returns null when
 * nothing explicit is stated — we never guess.
 */
export function normalizeEmploymentType(sourceValue: string | null, title: string): EmploymentType | null {
  const v = (sourceValue ?? '').toLowerCase();
  // ATSs often default commitment to "Full-time"; an explicit "Intern" in the title is more specific and wins.
  // (Regression: "Security Engineer Intern" was shown as Full-time, 2026-11-20.)
  if (/\b(intern|internship)\b/i.test(title) && !/part[\s_-]?time|contract|freelanc/.test(v)) return 'INTERNSHIP';
  if (v) {
    if (/\bintern(ship)?\b/.test(v)) return 'INTERNSHIP';
    if (/part[\s_-]?time/.test(v)) return 'PART_TIME';
    if (/freelanc/.test(v)) return 'FREELANCE';
    if (/contract|contractor|temporary|temp\b|fixed[\s_-]?term/.test(v)) return 'CONTRACT';
    if (/full[\s_-]?time|fulltime|permanent|regular/.test(v)) return 'FULL_TIME';
  }
  const t = title.toLowerCase();
  if (/\b(intern|internship|summer intern|winter intern)\b/.test(t)) return 'INTERNSHIP';
  if (/\bpart[\s-]?time\b/.test(t)) return 'PART_TIME';
  if (/\b(contract|contractor)\b/.test(t)) return 'CONTRACT';
  if (/\bfreelanc/.test(t)) return 'FREELANCE';
  return null;
}

// ───────────────────────── Work mode ─────────────────────────

export function normalizeWorkMode(sourceValue: string | null, locationHint: WorkMode | null): WorkMode | null {
  const v = (sourceValue ?? '').toLowerCase();
  if (/hybrid/.test(v)) return 'HYBRID';
  if (/remote/.test(v)) return 'REMOTE';
  if (/on-?site|in[\s-]?office|onsite/.test(v)) return 'ONSITE';
  return locationHint;
}

// ───────────────────────── URLs ─────────────────────────

const TRACKING_PARAMS = /^(utm_\w+|gh_src|lever-source|lever-origin|source|ref|referrer|src|trk|fbclid|gclid|mc_\w+)$/i;

/** Canonical form of a posting URL: https, lower-case host, no tracking params, fragment or trailing slash. */
export function canonicalizeUrl(input: string): string {
  const url = new URL(input.trim());
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  let out = url.toString();
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
  return out.replace(/\/\?/, '?');
}

// ───────────────────────── Dates ─────────────────────────

const MIN_DATE = Date.UTC(2015, 0, 1);

/**
 * Parse a source timestamp (ISO string or epoch milliseconds). Returns null for
 * unparseable values, dates before 2015 or more than a day in the future —
 * those are treated as source errors rather than trusted.
 */
export function parseSourceDate(value: string | number | null | undefined, now = new Date()): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' || /^\d{12,14}$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value));
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  if (t < MIN_DATE || t > now.getTime() + 24 * 3600 * 1000) return null;
  return d;
}
