import type { JobIntelligenceOutput } from '@beep/ai-engine';
import { canonicalSkillName, parseLocation } from '@beep/normalization';
import type { ClassificationMethod, ConfidenceLevel, EmploymentType, ExperienceLevel, LocationType, RoleCategory, WorkMode } from '@beep/shared';
import { appearsIn, isQuoteGrounded } from './evidence';
import { eligibilityFromExperience, type RuleResult, type Strength } from './rules';

/** Deterministic facts already normalised from the source record. */
export interface NormalizedFacts {
  title: string;
  description: string;
  locationsRaw: string[];
  department: string | null;
  employmentType: EmploymentType | null;
  workMode: WorkMode | null;
  locationType: LocationType;
  primaryCity: string | null;
  primaryState: string | null;
  salaryText: string | null;
  /** Dictionary skills matched deterministically, most relevant first. */
  skills: string[];
}

export interface ConfidenceFactors {
  role: number;
  experience: number;
  location: number;
  employment: number;
  evidenceGrounding: number | null;
  notes: string[];
}

export interface FinalClassification {
  method: ClassificationMethod;
  roleCategory: RoleCategory;
  experienceLevel: ExperienceLevel;
  employmentType: EmploymentType | null;
  workMode: WorkMode | null;
  locationType: LocationType;
  city: string | null;
  state: string | null;
  isFresherEligible: boolean;
  eligibilityReasoning: string;
  eligibilityEvidence: string[];
  educationRequirement: string | null;
  salaryText: string | null;
  summary: string | null;
  skills: { name: string; origin: 'RULES' | 'LLM' }[];
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  confidenceFactors: ConfidenceFactors;
  validationStatus: 'VALID' | 'REPAIRED' | 'INVALID';
  validationErrors: string[];
  needsReview: boolean;
}

export const CONFIDENCE_THRESHOLDS = { high: 0.8, medium: 0.6 } as const;

export function levelFor(score: number): ConfidenceLevel {
  return score >= CONFIDENCE_THRESHOLDS.high ? 'HIGH' : score >= CONFIDENCE_THRESHOLDS.medium ? 'MEDIUM' : 'LOW';
}

const agreementScore = (agree: boolean, ruleStrength: Strength): number => {
  if (ruleStrength === 'none') return 0.7; // LLM alone, nothing to corroborate
  if (agree) return ruleStrength === 'strong' ? 1 : 0.85;
  return ruleStrength === 'strong' ? 0.35 : 0.55;
};

function combineScore(f: ConfidenceFactors): number {
  const parts = [f.role, f.experience, f.location, f.employment];
  if (f.evidenceGrounding !== null) parts.push(0.5 + f.evidenceGrounding / 2);
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  const min = Math.min(...parts);
  return Math.round((0.6 * mean + 0.4 * min) * 1000) / 1000;
}

function sourceText(f: NormalizedFacts): string {
  return [f.title, f.department ?? '', f.locationsRaw.join(' | '), f.description].join('\n');
}

function locationFromFacts(f: NormalizedFacts) {
  return { locationType: f.locationType, city: f.primaryCity, state: f.primaryState };
}

function dedupeSkills(skills: { name: string; origin: 'RULES' | 'LLM' }[]) {
  const seen = new Set<string>();
  return skills.filter((s) => {
    const k = s.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Rules-only classification (LLM not needed, unavailable, or failed). */
export function finalizeFromRules(r: RuleResult, f: NormalizedFacts, extraNotes: string[] = []): FinalClassification {
  const factors: ConfidenceFactors = {
    role: r.role.strength === 'strong' ? 0.85 : r.role.strength === 'weak' ? 0.5 : 0.3,
    experience: r.experience.strength === 'strong' ? 0.9 : r.experience.strength === 'weak' ? 0.55 : 0.45,
    location: f.locationType === 'UNKNOWN' ? 0.6 : 0.9,
    employment: f.employmentType ? 0.95 : 0.6,
    evidenceGrounding: null,
    notes: ['rules only', ...extraNotes],
  };
  const score = combineScore(factors);
  const level = levelFor(score);
  const eligible = r.eligibility.value;
  return {
    method: 'RULES',
    roleCategory: r.role.value,
    experienceLevel: r.experience.value,
    employmentType: f.employmentType,
    workMode: f.workMode,
    ...locationFromFacts(f),
    isFresherEligible: eligible,
    eligibilityReasoning: eligibilityReasonFromRules(r),
    eligibilityEvidence: r.experience.evidence && isQuoteGrounded(r.experience.evidence, sourceText(f)) ? [r.experience.evidence] : [],
    educationRequirement: null,
    salaryText: f.salaryText,
    summary: null,
    skills: f.skills.map((name) => ({ name, origin: 'RULES' as const })),
    confidenceScore: score,
    confidenceLevel: level,
    confidenceFactors: factors,
    validationStatus: 'VALID',
    validationErrors: [],
    needsReview: level === 'LOW',
  };
}

function eligibilityReasonFromRules(r: RuleResult): string {
  switch (r.experience.value) {
    case 'INTERNSHIP':
      return 'Internship position — open to students and recent graduates.';
    case 'FRESHER':
      return 'The posting explicitly welcomes freshers or new graduates.';
    case 'ZERO_TO_ONE':
      return r.experience.strength === 'strong' ? `Requires at most about a year of experience (${r.experience.evidence}).` : 'Junior/entry-level title; experience requirement not explicitly stated.';
    case 'ONE_TO_TWO':
      return `Requires ${r.experience.minYears ?? 1}+ year(s) of experience.`;
    case 'EXPERIENCED':
      return r.experience.minYears !== null ? `Requires ${r.experience.minYears}+ years of experience.` : 'Senior-level position.';
    case 'UNKNOWN':
      return 'The posting does not state an experience requirement.';
  }
}

/**
 * Merge deterministic rules with the LLM's structured output.
 *
 * Precedence:
 *  - Source-stated facts (structured location, employment type, salary) win over the LLM.
 *  - Explicit title markers (intern / senior) win for experience.
 *  - Otherwise the LLM's semantic judgement wins, and disagreement with a
 *    strong rule lowers confidence and queues the record for human review.
 *  - Any LLM extraction that cannot be found in the posting is discarded and
 *    counted against evidence grounding (hallucination guard).
 */
export function mergeWithLLM(r: RuleResult, f: NormalizedFacts, llm: JobIntelligenceOutput, repaired: boolean): FinalClassification {
  const text = sourceText(f);
  const notes: string[] = [];
  const errors: string[] = [];

  // Role
  // OTHER means "none of the categories apply"; a strong, specific title match is evidence that one does.
  const otherOverridden = llm.role_category === 'OTHER' && r.role.strength === 'strong' && r.role.value !== 'OTHER';
  const role = otherOverridden ? r.role.value : llm.role_category;
  if (otherOverridden) notes.push(`role: LLM said OTHER; title rule ${r.role.value} kept`);
  const roleScore = otherOverridden ? 0.7 : agreementScore(role === r.role.value, r.role.strength);
  if (role !== r.role.value && r.role.strength === 'strong') notes.push(`role: LLM ${role} vs rules ${r.role.value}`);

  // Experience
  let experience: ExperienceLevel = llm.experience_level;
  const titleOverride = r.experience.strength === 'strong' && (r.signals.internTitle || r.signals.seniorTitle || r.employment.value === 'INTERNSHIP');
  if (titleOverride && experience !== r.experience.value) {
    notes.push(`experience: title/source marker overrides LLM ${experience} → ${r.experience.value}`);
    experience = r.experience.value;
  }
  let expScore = agreementScore(llm.experience_level === r.experience.value, r.experience.strength);
  if (titleOverride) expScore = Math.max(expScore, 0.75);
  if (experience === 'UNKNOWN' && r.experience.value === 'UNKNOWN') expScore = 0.6;
  if (llm.experience_level !== r.experience.value && r.experience.strength === 'strong' && !titleOverride) notes.push(`experience: LLM ${llm.experience_level} vs rules ${r.experience.value}`);

  // Employment: the source's explicit value wins
  let employment: EmploymentType | null = f.employmentType ?? llm.employment_type;
  let empScore = f.employmentType ? (llm.employment_type === f.employmentType || llm.employment_type === null ? 1 : 0.8) : llm.employment_type ? 0.7 : 0.6;
  // An internship (by title/source marker) is an internship regardless of the LLM's employment guess.
  if (experience === 'INTERNSHIP' && !f.employmentType && employment !== 'INTERNSHIP') {
    employment = 'INTERNSHIP';
    empScore = 0.8;
  }

  // Work mode: source, else LLM only if the mode word appears in the posting
  let workMode: WorkMode | null = f.workMode;
  if (!workMode && llm.work_mode) {
    const word = { ONSITE: '(on-?site|in office|office)', HYBRID: 'hybrid', REMOTE: '(remote|work from home)' }[llm.work_mode];
    if (new RegExp(word, 'i').test(text)) workMode = llm.work_mode;
    else notes.push(`work mode ${llm.work_mode} not grounded in text — discarded`);
  }

  // Location: deterministic normalisation wins; LLM may fill an unknown city only if grounded
  let loc = locationFromFacts(f);
  let locScore = f.locationType === 'UNKNOWN' ? 0.6 : 0.95;
  if (f.locationType === 'UNKNOWN' && llm.location.city) {
    const parsed = parseLocation(llm.location.city)[0];
    if (appearsIn(llm.location.city, text) && parsed?.isIndia && parsed.city) {
      loc = { locationType: 'CITY', city: parsed.city, state: parsed.state };
      locScore = 0.75;
      notes.push(`city ${parsed.city} taken from description text`);
    } else {
      errors.push(`hallucinated city "${llm.location.city}" not in posting — discarded`);
      locScore = 0.5;
    }
  } else if (f.primaryCity && llm.location.city && parseLocation(llm.location.city)[0]?.city !== f.primaryCity && llm.location.type === 'CITY' && f.locationType === 'CITY') {
    notes.push(`LLM city ${llm.location.city} differs from source ${f.primaryCity}; source kept`);
  }

  // Evidence grounding (hallucination guard)
  const quotes = [...llm.eligibility_evidence, ...(llm.experience_evidence ? [llm.experience_evidence] : [])];
  const grounded = llm.eligibility_evidence.filter((q) => isQuoteGrounded(q, text));
  const groundedCount = quotes.filter((q) => isQuoteGrounded(q, text)).length;
  const grounding = quotes.length ? groundedCount / quotes.length : 1;
  if (groundedCount < quotes.length) errors.push(`${quotes.length - groundedCount} of ${quotes.length} evidence quotes not found in posting — removed`);
  if (llm.min_years_required !== null && !new RegExp(`\\b${llm.min_years_required}\\b|\\b(${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][llm.min_years_required] ?? 'x'})\\b`, 'i').test(f.description)) {
    errors.push(`min_years_required=${llm.min_years_required} not stated in posting`);
  }

  // Eligibility must be consistent with the final experience level
  let eligible = llm.is_fresher_eligible;
  let reasoning = llm.eligibility_reasoning.trim();
  const expected = eligibilityFromExperience(experience);
  let status: FinalClassification['validationStatus'] = repaired ? 'REPAIRED' : 'VALID';
  if (experience !== 'UNKNOWN' && eligible !== expected) {
    errors.push(`eligibility ${eligible} inconsistent with experience ${experience} — corrected to ${expected}`);
    eligible = expected;
    reasoning = `${reasoning} [Corrected for consistency with the ${experience.replace(/_/g, ' ').toLowerCase()} classification.]`;
    status = 'REPAIRED';
  }

  // Salary: only explicitly stated text
  let salary = f.salaryText;
  if (!salary && llm.salary_text) {
    if (isQuoteGrounded(llm.salary_text, text)) salary = llm.salary_text;
    else errors.push('salary text not found in posting — discarded');
  }

  // Skills: dictionary matches first, then LLM skills that are actually mentioned
  const llmSkills = llm.skills
    .filter((s) => appearsIn(s, text) || (canonicalSkillName(s) !== null && f.skills.includes(canonicalSkillName(s)!)))
    .map((s) => ({ name: canonicalSkillName(s) ?? s.trim(), origin: 'LLM' as const }));
  const droppedSkills = llm.skills.length - llmSkills.length;
  if (droppedSkills > 0) notes.push(`${droppedSkills} LLM skill(s) not mentioned in posting — dropped`);
  const skills = dedupeSkills([...f.skills.map((name) => ({ name, origin: 'RULES' as const })), ...llmSkills]).slice(0, 15);

  const factors: ConfidenceFactors = { role: roleScore, experience: expScore, location: locScore, employment: empScore, evidenceGrounding: grounding, notes: [...notes, ...errors] };
  let score = combineScore(factors);
  if (errors.some((e) => e.startsWith('hallucinated'))) score = Math.min(score, 0.59);
  const level = levelFor(score);

  return {
    method: 'HYBRID',
    roleCategory: role,
    experienceLevel: experience,
    employmentType: employment,
    workMode,
    ...loc,
    isFresherEligible: eligible,
    eligibilityReasoning: reasoning,
    eligibilityEvidence: grounded.slice(0, 3),
    educationRequirement: llm.education_requirement?.trim() || null,
    salaryText: salary,
    summary: llm.summary.trim(),
    skills,
    confidenceScore: score,
    confidenceLevel: level,
    confidenceFactors: factors,
    validationStatus: status,
    validationErrors: errors,
    needsReview: level === 'LOW' || errors.some((e) => e.startsWith('hallucinated')),
  };
}
