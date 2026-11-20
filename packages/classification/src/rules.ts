import { extractExperienceSignals, type ExperienceSignals } from '@beep/normalization';
import type { EmploymentType, ExperienceLevel, RoleCategory } from '@beep/shared';

export type Strength = 'strong' | 'weak' | 'none';

export interface RuleField<T> {
  value: T;
  strength: Strength;
  evidence: string | null;
}

export interface RuleResult {
  role: RuleField<RoleCategory>;
  experience: RuleField<ExperienceLevel> & { minYears: number | null };
  employment: RuleField<EmploymentType | null>;
  eligibility: RuleField<boolean>;
  signals: ExperienceSignals;
}

/**
 * Title patterns in precedence order. More specific disciplines come first so
 * "Security Analyst" is CYBERSECURITY (not ANALYTICS) and "Product Designer"
 * is DESIGN (not PRODUCT).
 */
const ROLE_PATTERNS: { role: RoleCategory; re: RegExp; specific: boolean }[] = [
  { role: 'CYBERSECURITY', re: /\b(security|cyber|infosec|soc analyst|penetration|threat|vulnerability|grc|iam engineer|appsec)\b/i, specific: true },
  { role: 'AI_ML', re: /\b(machine learning|ml|ml engineer|ml researcher|mlops|ai engineer|applied ai|ai architect|ai\/ml|deep learning|llm|nlp|computer vision|applied scientist|research (engineer|scientist)|genai|generative ai|ai research)\b/i, specific: true },
  { role: 'DATA_ENGINEERING', re: /\b(data engineer(ing)?|etl|data platform|analytics engineer|big data|data infrastructure)\b/i, specific: true },
  { role: 'DATA_SCIENCE', re: /\b(data scien(ce|tist)|decision scien(ce|tist)|quantitative researcher)\b/i, specific: true },
  { role: 'FULL_STACK', re: /\bfull[- ]?stack\b/i, specific: true },
  { role: 'FRONTEND', re: /\b(front[- ]?end|ui engineer|ui developer|react(\.js)? (developer|engineer)|angular developer|web developer)\b/i, specific: true },
  { role: 'BACKEND', re: /\b(back[- ]?end|server[- ]side|api engineer|(java|golang|go|python|node(\.js)?|php|ruby|\.net) (developer|engineer))\b/i, specific: true },
  { role: 'DEVOPS', re: /\b(devops|dev ops|sre|site reliability|platform engineer|release engineer|build engineer|infrastructure engineer|production engineer)\b/i, specific: true },
  { role: 'CLOUD', re: /\b(cloud (engineer|architect|administrator|admin|consultant|support|operations)|aws|azure|gcp)\b/i, specific: true },
  { role: 'DESIGN', re: /\b(designer|ux|ui\/ux|user experience|visual design|graphic|interaction design|design (lead|intern))\b/i, specific: true },
  { role: 'PRODUCT', re: /\b(product manager|product owner|product management|group product|apm|associate product manager|head of product|product lead|product (intern|operations))\b/i, specific: true },
  { role: 'FINANCE', re: /\b(financ(e|ial)|accountant|accounting|accounts|audit(or)?|tax|treasury|controller(ship)?|payroll|fp&a|chartered accountant|credit analyst|billing|collections|reconciliation)\b/i, specific: true },
  { role: 'MARKETING', re: /\b(marketing|marketer|growth|seo|sem|content (writer|strategist|marketing|creator)|copywriter|brand|social media|communications|public relations|demand gen(eration)?|performance marketing|community manager)\b/i, specific: true },
  { role: 'SALES', re: /\b(sales|account executive|account director|account development|adr|business development|bdr|sdr|bde|account manager|pre-?sales|partnerships?|relationship manager|key account|inside sales|field sales|merchant acquisition)\b/i, specific: true },
  { role: 'ANALYTICS', re: /\b(analyst|analytics|business intelligence|bi developer|insights|reporting|mis)\b/i, specific: true },
  { role: 'OPERATIONS', re: /\b(operations|ops|support|customer success|customer experience|hr|human resources|people (operations|partner)|recruit(er|ing|ment)|talent acquisition|talent|legal|counsel|compliance|program manager|project manager|administrat(or|ive)|office manager|executive assistant|procurement|supply chain|logistics|facilities|workplace|risk)\b/i, specific: true },
  { role: 'SOFTWARE_ENGINEERING', re: /\b(software|sde|swe|developer|programmer|qa|sdet|test(ing)? engineer|quality engineer|automation engineer|mobile|android|ios|embedded|firmware|member of technical staff|mts|engineer(ing)?)\b/i, specific: false },
];

export function classifyRoleByTitle(title: string, department: string | null): RuleField<RoleCategory> {
  const matches = ROLE_PATTERNS.filter((p) => p.re.test(title));
  const top = matches[0];
  if (top) {
    const m = top.re.exec(title);
    // A generic "engineer" match is weak; a specific discipline is strong unless a second discipline competes.
    const competing = matches.filter((x) => x.specific && x.role !== top.role).length > 0;
    const strength: Strength = !top.specific ? (/\b(software|sde|swe|developer|programmer|sdet|qa)\b/i.test(title) ? 'strong' : 'weak') : competing ? 'weak' : 'strong';
    return { value: top.role, strength, evidence: m?.[0] ?? null };
  }
  if (department) {
    const d = ROLE_PATTERNS.find((p) => p.re.test(department));
    if (d) return { value: d.role, strength: 'weak', evidence: `department: ${department}` };
  }
  return { value: 'OTHER', strength: 'none', evidence: null };
}

export function classifyExperience(s: ExperienceSignals, employment: EmploymentType | null): RuleResult['experience'] {
  if (s.internTitle || employment === 'INTERNSHIP') {
    return { value: 'INTERNSHIP', strength: 'strong', evidence: s.internTitle ? 'title marks an internship' : 'source lists the role as an internship', minYears: null };
  }
  if (s.seniorTitle) return { value: 'EXPERIENCED', strength: 'strong', evidence: 'title indicates a senior position', minYears: s.years?.min ?? null };
  if (s.years) {
    const { min, max, evidence } = s.years;
    let value: ExperienceLevel;
    if (min === 0 && (max === null || max <= 2)) value = s.fresherEvidence.length ? 'FRESHER' : 'ZERO_TO_ONE';
    else if (min === 0) value = 'ZERO_TO_ONE';
    else if (min <= 2) value = min < 1 ? 'ZERO_TO_ONE' : 'ONE_TO_TWO';
    else value = 'EXPERIENCED';
    return { value, strength: 'strong', evidence, minYears: min };
  }
  if (s.fresherEvidence.length) return { value: 'FRESHER', strength: 'strong', evidence: s.fresherEvidence[0]!, minYears: 0 };
  if (s.juniorTitle) return { value: 'ZERO_TO_ONE', strength: 'weak', evidence: 'title indicates a junior / entry-level position', minYears: null };
  return { value: 'UNKNOWN', strength: 'none', evidence: null, minYears: null };
}

export function eligibilityFromExperience(level: ExperienceLevel): boolean {
  return level === 'INTERNSHIP' || level === 'FRESHER' || level === 'ZERO_TO_ONE';
}

export interface RuleInput {
  title: string;
  description: string;
  department: string | null;
  /** Employment type already normalised from the source (explicit only). */
  employmentType: EmploymentType | null;
}

export function classifyByRules(input: RuleInput): RuleResult {
  const signals = extractExperienceSignals(input.title, input.description);
  const role = classifyRoleByTitle(input.title, input.department);
  const experience = classifyExperience(signals, input.employmentType);
  const employment: RuleField<EmploymentType | null> = input.employmentType
    ? { value: input.employmentType, strength: 'strong', evidence: 'stated by source' }
    : { value: null, strength: 'none', evidence: null };
  const eligible = eligibilityFromExperience(experience.value);
  const eligibility: RuleField<boolean> = {
    value: eligible,
    strength: experience.strength,
    evidence: experience.evidence,
  };
  return { role, experience, employment, eligibility, signals };
}

/**
 * Rules are sufficient (no LLM call) only when the job is clearly *not* an
 * early-career opening and both role and seniority are strongly determined.
 * Every potentially fresher-relevant posting goes to the LLM, because those
 * are the records this product exists to get right.
 */
export function rulesSufficient(r: RuleResult): boolean {
  return r.experience.value === 'EXPERIENCED' && r.experience.strength === 'strong' && r.role.strength === 'strong';
}
