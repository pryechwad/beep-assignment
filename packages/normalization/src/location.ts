import type { LocationType, WorkMode } from '@beep/shared';
import { AMBIGUOUS_STATE_ALIASES, INDIAN_CITIES, INDIAN_STATES, type CityEntry } from './india-geo';

export interface NormalizedLocation {
  /** The segment exactly as the source wrote it. */
  raw: string;
  city: string | null;
  state: string | null;
  country: string | null;
  isRemote: boolean;
  /** True only when the text positively identifies India (city, state or the country name). */
  isIndia: boolean;
}

export interface LocationSummary {
  locations: NormalizedLocation[];
  locationType: LocationType;
  primaryCity: string | null;
  primaryState: string | null;
  /** Work-mode hint stated in the location text itself ("Remote", "Hybrid - Pune"). */
  workModeHint: WorkMode | null;
  /** At least one location is in India (including "Remote, India"). */
  hasIndia: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest aliases first so "navi mumbai" wins over "mumbai" and "new delhi" over "delhi".
const CITY_ALIASES: { alias: string; entry: CityEntry; re: RegExp }[] = INDIAN_CITIES.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, entry, re: new RegExp(`(?<![a-z])${escapeRe(alias)}(?![a-z])`, 'i') })),
).sort((a, b) => b.alias.length - a.alias.length);

const STATE_ALIASES = INDIAN_STATES.flatMap((s) =>
  s.aliases.map((alias) => ({ alias, state: s.state, re: new RegExp(`(?<![a-z])${escapeRe(alias)}(?![a-z])`, 'i') })),
).sort((a, b) => b.alias.length - a.alias.length);

const FOREIGN_MARKERS =
  /\b(united states|usa|u\.s\.|canada|united kingdom|\buk\b|london|ireland|germany|france|netherlands|spain|poland|singapore|japan|australia|brazil|mexico|pakistan|bangladesh|sri lanka|uae|dubai|philippines|indonesia|vietnam|israel|china|korea|new york|san francisco|seattle|toronto)\b/i;
const INDIA_RE = /(?<![a-z])(india|bharat)(?![a-z])/i;
const REMOTE_RE = /\b(remote|work from home|wfh|anywhere)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on-?site|in[- ]office|office[- ]based)\b/i;

/** Split a source location string into independent location segments. */
function splitSegments(raw: string): string[] {
  return raw
    .split(/\s*(?:;|\||\/|•|\s+or\s+|\s+&\s+|\n)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function rejectAmbiguousState(segment: string, alias: string, mentionsIndia: boolean): boolean {
  if (!AMBIGUOUS_STATE_ALIASES.has(alias)) return false;
  // Only accept "KA" etc. as an entire comma/dash-separated component of a segment that names India.
  const parts = segment.split(/[,\-–]/).map((p) => p.trim().toLowerCase());
  return !mentionsIndia || !parts.includes(alias);
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

/** Parse one source location string (which may name several cities). */
export function parseLocation(raw: string): NormalizedLocation[] {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const results: NormalizedLocation[] = [];

  for (const segment of splitSegments(cleaned)) {
    const isRemote = REMOTE_RE.test(segment);
    // The ISO code "IN" is deliberately not trusted — it collides with Indiana ("Lafayette, IN").
    // Adapters translate structured country codes (Lever `country: IN`) into an explicit "India" location.
    const mentionsIndia = INDIA_RE.test(segment);
    const foreign = FOREIGN_MARKERS.test(segment) && !mentionsIndia;

    // Find every city mentioned in this segment ("Bangalore, Mumbai, Pune").
    let remaining = segment;
    const cities: CityEntry[] = [];
    if (!foreign) {
      for (const { re, entry } of CITY_ALIASES) {
        if (re.test(remaining)) {
          if (!cities.includes(entry)) cities.push(entry);
          remaining = remaining.replace(re, ' ');
        }
      }
    }

    if (cities.length > 0) {
      for (const c of cities) {
        results.push({ raw: segment, city: c.city, state: c.state, country: 'India', isRemote, isIndia: true });
      }
      continue;
    }

    let state: string | null = null;
    if (!foreign) {
      const parts = segment.split(',').map((p) => p.trim());
      let stateComponentIndex = -1;
      for (const { re, state: s, alias } of STATE_ALIASES) {
        if (re.test(segment) && !rejectAmbiguousState(segment, alias, mentionsIndia)) {
          state = s;
          stateComponentIndex = parts.findIndex((p) => re.test(p));
          break;
        }
      }
      // "Aligarh, Uttar Pradesh": the source explicitly names a city we have no dictionary entry for.
      if (state && stateComponentIndex > 0) {
        const candidate = parts[stateComponentIndex - 1]!;
        if (/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(candidate) && !REMOTE_RE.test(candidate) && !/locations?|n\/a/i.test(candidate)) {
          results.push({ raw: segment, city: titleCase(candidate), state, country: 'India', isRemote, isIndia: true });
          continue;
        }
      }
    }
    const isIndia = !foreign && (mentionsIndia || state !== null);
    results.push({
      raw: segment,
      city: null,
      state,
      country: isIndia ? 'India' : foreign ? 'Other' : null,
      isRemote,
      isIndia,
    });
  }
  return results;
}

function detectWorkModeHint(raws: string[]): WorkMode | null {
  const joined = raws.join(' | ');
  if (HYBRID_RE.test(joined)) return 'HYBRID';
  if (REMOTE_RE.test(joined)) return 'REMOTE';
  if (ONSITE_RE.test(joined)) return 'ONSITE';
  return null;
}

/**
 * Normalise all location strings of a posting. Non-Indian locations are dropped
 * from the result when at least one Indian location exists (this product is
 * India-scoped), but the raw strings are always preserved on the RawJob.
 */
export function summarizeLocations(raws: string[]): LocationSummary {
  const all = raws.flatMap(parseLocation);
  const india = all.filter((l) => l.isIndia);
  const hasIndia = india.length > 0;
  const locations = dedupeLocations(hasIndia ? india : all);

  const distinctCities = [...new Set(locations.map((l) => l.city).filter((c): c is string => c !== null))];
  // No city anywhere but at least one explicitly remote location ("Remote, India || India") → remote role.
  const onlyRemote = distinctCities.length === 0 && locations.some((l) => l.isRemote);

  let locationType: LocationType;
  if (distinctCities.length > 1) locationType = 'MULTIPLE';
  else if (distinctCities.length === 1) locationType = 'CITY';
  else if (onlyRemote) locationType = 'REMOTE';
  else if (locations.some((l) => l.state)) locationType = 'STATE';
  else locationType = 'UNKNOWN';

  const primary = locations.find((l) => l.city) ?? locations.find((l) => l.state) ?? null;
  return {
    locations,
    locationType,
    primaryCity: primary?.city ?? null,
    primaryState: primary?.state ?? null,
    workModeHint: detectWorkModeHint(raws),
    hasIndia,
  };
}

function dedupeLocations(list: NormalizedLocation[]): NormalizedLocation[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    const key = `${l.city ?? ''}|${l.state ?? ''}|${l.isRemote}|${l.city || l.state ? '' : l.raw.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True if the posting can be considered India-located (used by the India-only source filter). */
export function isIndiaLocated(raws: string[]): boolean {
  return raws.flatMap(parseLocation).some((l) => l.isIndia);
}
