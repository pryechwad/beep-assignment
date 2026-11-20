/**
 * Canonical classification vocabulary. These string values are persisted in the
 * database (as Postgres enums), returned by the API and used in LLM prompts, so
 * changing a value is a migration — add new values, never rename silently.
 */

export const ROLE_CATEGORIES = [
  'FRONTEND',
  'BACKEND',
  'FULL_STACK',
  'SOFTWARE_ENGINEERING',
  'AI_ML',
  'DATA_ENGINEERING',
  'DATA_SCIENCE',
  'ANALYTICS',
  'DEVOPS',
  'CLOUD',
  'CYBERSECURITY',
  'PRODUCT',
  'DESIGN',
  'MARKETING',
  'SALES',
  'FINANCE',
  'OPERATIONS',
  'OTHER',
] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

export const ROLE_LABELS: Record<RoleCategory, string> = {
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  FULL_STACK: 'Full Stack',
  SOFTWARE_ENGINEERING: 'Software Engineering',
  AI_ML: 'AI / ML',
  DATA_ENGINEERING: 'Data Engineering',
  DATA_SCIENCE: 'Data Science',
  ANALYTICS: 'Analytics',
  DEVOPS: 'DevOps',
  CLOUD: 'Cloud',
  CYBERSECURITY: 'Cybersecurity',
  PRODUCT: 'Product',
  DESIGN: 'Design',
  MARKETING: 'Marketing',
  SALES: 'Sales',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  OTHER: 'Other',
};

export const EXPERIENCE_LEVELS = [
  'INTERNSHIP',
  'FRESHER',
  'ZERO_TO_ONE',
  'ONE_TO_TWO',
  'EXPERIENCED',
  'UNKNOWN',
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  INTERNSHIP: 'Internship',
  FRESHER: 'Fresher',
  ZERO_TO_ONE: '0–1 years',
  ONE_TO_TWO: '1–2 years',
  EXPERIENCED: 'Experienced',
  UNKNOWN: 'Unknown',
};

/** Experience levels considered open to freshers / new graduates. */
export const EARLY_CAREER_LEVELS: readonly ExperienceLevel[] = ['INTERNSHIP', 'FRESHER', 'ZERO_TO_ONE'];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'INTERNSHIP', 'PART_TIME', 'CONTRACT', 'FREELANCE'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  INTERNSHIP: 'Internship',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  FREELANCE: 'Freelance',
};

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  ONSITE: 'On-site',
  HYBRID: 'Hybrid',
  REMOTE: 'Remote',
};

export const LOCATION_TYPES = ['CITY', 'STATE', 'REMOTE', 'MULTIPLE', 'UNKNOWN'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CLASSIFICATION_METHODS = ['RULES', 'LLM', 'HYBRID', 'MANUAL'] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];

export const EVALUATION_ERROR_CATEGORIES = [
  'WRONG_ROLE',
  'WRONG_CITY',
  'MISSING_INFORMATION',
  'INCORRECT_EXPERIENCE',
  'INCORRECT_ELIGIBILITY',
  'HALLUCINATED_EXTRACTION',
] as const;
export type EvaluationErrorCategory = (typeof EVALUATION_ERROR_CATEGORIES)[number];

export const EVALUATION_ERROR_LABELS: Record<EvaluationErrorCategory, string> = {
  WRONG_ROLE: 'Wrong role',
  WRONG_CITY: 'Wrong city',
  MISSING_INFORMATION: 'Missing information',
  INCORRECT_EXPERIENCE: 'Incorrect experience',
  INCORRECT_ELIGIBILITY: 'Incorrect eligibility',
  HALLUCINATED_EXTRACTION: 'Hallucinated extraction',
};

export const SOURCE_ADAPTER_TYPES = ['GREENHOUSE', 'LEVER', 'ASHBY'] as const;
export type SourceAdapterType = (typeof SOURCE_ADAPTER_TYPES)[number];

export const SOURCE_ADAPTER_LABELS: Record<SourceAdapterType, string> = {
  GREENHOUSE: 'Greenhouse',
  LEVER: 'Lever',
  ASHBY: 'Ashby',
};
