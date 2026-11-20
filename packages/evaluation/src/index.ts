import type { ConfidenceLevel, EmploymentType, EvaluationErrorCategory, ExperienceLevel, RoleCategory } from '@beep/shared';

/** What the system predicted (a stored JobClassification). */
export interface Prediction {
  roleCategory: RoleCategory;
  city: string | null;
  experienceLevel: ExperienceLevel;
  employmentType: EmploymentType | null;
  isFresherEligible: boolean;
}

/** What a human evaluator says is true after reading the original posting. */
export interface HumanLabel {
  trueRole: RoleCategory;
  trueCity: string | null;
  trueExperience: ExperienceLevel;
  trueEmployment: EmploymentType | null;
  trueFresherEligible: boolean;
}

export interface FieldCorrectness {
  roleCorrect: boolean;
  cityCorrect: boolean;
  experienceCorrect: boolean;
  employmentCorrect: boolean;
  eligibilityCorrect: boolean;
}

const normCity = (c: string | null) => (c ? c.trim().toLowerCase() : null);

export function scorePrediction(p: Prediction, h: HumanLabel): FieldCorrectness {
  return {
    roleCorrect: p.roleCategory === h.trueRole,
    cityCorrect: normCity(p.city) === normCity(h.trueCity),
    experienceCorrect: p.experienceLevel === h.trueExperience,
    employmentCorrect: p.employmentType === h.trueEmployment,
    eligibilityCorrect: p.isFresherEligible === h.trueFresherEligible,
  };
}

/** Error categories implied by the field comparison; evaluators may add MISSING_INFORMATION / HALLUCINATED_EXTRACTION. */
export function impliedErrorCategories(c: FieldCorrectness): EvaluationErrorCategory[] {
  const out: EvaluationErrorCategory[] = [];
  if (!c.roleCorrect) out.push('WRONG_ROLE');
  if (!c.cityCorrect) out.push('WRONG_CITY');
  if (!c.experienceCorrect) out.push('INCORRECT_EXPERIENCE');
  if (!c.eligibilityCorrect) out.push('INCORRECT_ELIGIBILITY');
  return out;
}

export interface AuditRow extends FieldCorrectness {
  confidenceLevel: ConfidenceLevel;
  method: string;
  errorCategories: EvaluationErrorCategory[];
}

export interface Accuracy {
  correct: number;
  total: number;
  /** Correct / total × 100, rounded to 1 dp; null when nothing has been evaluated. */
  accuracy: number | null;
}

const acc = (correct: number, total: number): Accuracy => ({ correct, total, accuracy: total ? Math.round((correct / total) * 1000) / 10 : null });

export interface EvaluationMetrics {
  sampleSize: number;
  fields: Record<'role' | 'city' | 'experience' | 'employment' | 'eligibility', Accuracy>;
  exactMatch: Accuracy;
  /** Accuracy (exact match) per confidence level — empirical calibration of the confidence system. */
  byConfidence: Record<ConfidenceLevel, Accuracy>;
  byMethod: Record<string, Accuracy>;
  errorCategories: Record<EvaluationErrorCategory, number>;
}

export function computeMetrics(rows: AuditRow[]): EvaluationMetrics {
  const count = (f: (r: AuditRow) => boolean) => rows.filter(f).length;
  const exact = (r: AuditRow) => r.roleCorrect && r.cityCorrect && r.experienceCorrect && r.employmentCorrect && r.eligibilityCorrect;
  const byConfidence = Object.fromEntries(
    (['HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => {
      const subset = rows.filter((r) => r.confidenceLevel === lvl);
      return [lvl, acc(subset.filter(exact).length, subset.length)];
    }),
  ) as Record<ConfidenceLevel, Accuracy>;
  const methods = [...new Set(rows.map((r) => r.method))];
  const byMethod = Object.fromEntries(methods.map((m) => {
    const subset = rows.filter((r) => r.method === m);
    return [m, acc(subset.filter(exact).length, subset.length)];
  }));
  const errorCategories = { WRONG_ROLE: 0, WRONG_CITY: 0, MISSING_INFORMATION: 0, INCORRECT_EXPERIENCE: 0, INCORRECT_ELIGIBILITY: 0, HALLUCINATED_EXTRACTION: 0 } as Record<EvaluationErrorCategory, number>;
  for (const r of rows) for (const c of new Set(r.errorCategories)) errorCategories[c]++;
  return {
    sampleSize: rows.length,
    fields: {
      role: acc(count((r) => r.roleCorrect), rows.length),
      city: acc(count((r) => r.cityCorrect), rows.length),
      experience: acc(count((r) => r.experienceCorrect), rows.length),
      employment: acc(count((r) => r.employmentCorrect), rows.length),
      eligibility: acc(count((r) => r.eligibilityCorrect), rows.length),
    },
    exactMatch: acc(count(exact), rows.length),
    byConfidence,
    byMethod,
    errorCategories,
  };
}

// ───────────── Sampling ─────────────

/** Deterministic PRNG (mulberry32) so the evaluation sample is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleCandidate {
  classificationId: string;
  roleCategory: string;
  confidenceLevel: ConfidenceLevel;
  method: string;
}

/**
 * Stratified sample: round-robin across (role × confidence) strata, shuffled
 * with a fixed seed, so the 50 audited records cover the label space rather
 * than whatever role happens to dominate the index.
 */
export function stratifiedSample<T extends SampleCandidate>(candidates: T[], size = 50, seed = 20261120): T[] {
  const rand = rng(seed);
  const strata = new Map<string, T[]>();
  for (const c of candidates) {
    const k = `${c.roleCategory}|${c.confidenceLevel}`;
    (strata.get(k) ?? strata.set(k, []).get(k)!).push(c);
  }
  const buckets = [...strata.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => {
    const arr = [...list].sort((x, y) => x.classificationId.localeCompare(y.classificationId));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  });
  const out: T[] = [];
  while (out.length < size && buckets.some((b) => b.length)) {
    for (const b of buckets) {
      const next = b.shift();
      if (next) out.push(next);
      if (out.length >= size) break;
    }
  }
  return out;
}

// ───────────── CSV ─────────────

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection (cells starting with = + - @)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
