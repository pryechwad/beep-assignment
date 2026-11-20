/**
 * API response contracts shared by apps/api (producer) and apps/web (consumer).
 * Dates are ISO strings. Nullable fields mean "not stated by the source".
 */
import type { ConfidenceLevel, EmploymentType, ExperienceLevel, LocationType, RoleCategory, SourceAdapterType, WorkMode } from './taxonomy';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SourceRef {
  sourceId: string;
  adapterType: SourceAdapterType;
  postingUrl: string;
}

export interface JobListItem {
  id: string;
  title: string;
  company: { id: string; name: string; slug: string; website: string | null };
  locationType: LocationType;
  primaryCity: string | null;
  primaryState: string | null;
  cities: string[];
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  experienceLevel: ExperienceLevel | null;
  roleCategory: RoleCategory | null;
  isFresherEligible: boolean | null;
  confidenceLevel: ConfidenceLevel | null;
  topSkills: string[];
  publishedAt: string | null;
  firstSeenAt: string;
  status: 'ACTIVE' | 'CLOSED';
  source: SourceRef;
}

export interface ClassificationDTO {
  id: string;
  version: number;
  method: 'RULES' | 'LLM' | 'HYBRID' | 'MANUAL';
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  roleCategory: RoleCategory;
  experienceLevel: ExperienceLevel;
  employmentType: EmploymentType | null;
  workMode: WorkMode | null;
  city: string | null;
  isFresherEligible: boolean;
  eligibilityReasoning: string;
  eligibilityEvidence: string[];
  educationRequirement: string | null;
  summary: string | null;
  skills: string[];
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  validationStatus: 'VALID' | 'REPAIRED' | 'INVALID';
  validationErrors: string[];
  needsReview: boolean;
  createdAt: string;
}

export interface JobDetail extends JobListItem {
  description: string;
  descriptionHtml: string | null;
  department: string | null;
  salaryText: string | null;
  applyUrl: string;
  postingUrl: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  closedAt: string | null;
  llmPending: boolean;
  /** Source-stated facts, exactly as the source wrote them. */
  sourceFacts: { locations: string[]; employmentType: string | null; workplaceType: string | null; department: string | null; publishedAt: string | null; compensation: string | null };
  sources: (SourceRef & { externalId: string; firstSeenAt: string; removedAt: string | null })[];
  skills: { name: string; origin: 'RULES' | 'LLM' }[];
  classification: ClassificationDTO | null;
}

export interface FilterOption<V extends string = string> {
  value: V;
  label: string;
  count: number;
}

export interface JobFilters {
  roles: FilterOption<RoleCategory>[];
  cities: FilterOption[];
  states: FilterOption[];
  employmentTypes: FilterOption<EmploymentType>[];
  experienceLevels: FilterOption<ExperienceLevel>[];
  workModes: FilterOption<WorkMode>[];
  sources: FilterOption[];
}

export interface CompanyListItem {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  activeJobs: number;
  fresherJobs: number;
  internships: number;
  topRoles: { role: RoleCategory; count: number }[];
  cities: string[];
  sources: SourceAdapterType[];
}

export interface Comparison {
  /** Value on the previous snapshot day; null when no snapshot exists (no delta is shown). */
  previous: number | null;
  previousDate: string | null;
}

export interface AnalyticsOverview {
  totals: {
    activeJobs: number;
    fresherEligible: number;
    internships: number;
    companies: number;
    cities: number;
    addedToday: number;
  };
  comparisons: Record<'activeJobs' | 'fresherEligible' | 'internships' | 'companies' | 'cities', Comparison>;
  classification: { classified: number; pendingLLM: number; unclassified: number };
  freshness: {
    lastSuccessfulRunAt: string | null;
    lastRunStatus: string | null;
    lastRunAt: string | null;
    medianAgeDays: number | null;
    verifiedLast24h: number;
  };
  pipeline: { status: 'idle' | 'running' | 'degraded' | 'unknown'; workers: number; scheduler: boolean };
}

export interface CountRow<K extends string = string> {
  key: K;
  label: string;
  count: number;
  fresher: number;
}

export interface DailyIngestionRow {
  date: string;
  added: number;
  closed: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  adapterType: SourceAdapterType;
  company: string | null;
  enabled: boolean;
  healthy: boolean | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastRecordCount: number;
  activeJobs: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/** GET /api/v1/live/activity — polled by the UI; never cached. */
export interface LiveActivity {
  serverTime: string;
  pipeline: {
    status: 'running' | 'idle' | 'degraded' | 'offline';
    workers: number;
    scheduler: boolean;
    aiModels: string[];
    nextScheduledRunAt: string | null;
    lastRun: { status: string; trigger: string; startedAt: string | null; finishedAt: string | null; sourcesSucceeded: number; sourcesTotal: number; jobsFetched: number; jobsNew: number; jobsClosed: number } | null;
  };
  queues: { discovery: number; normalize: number; classify: number; active: number };
  /** Raw India records currently listed at sources, vs unique jobs after de-duplication. */
  dedup: { rawRecords: number; uniqueJobs: number; merged: number; flaggedForReview: number };
  ai: { total: number; llmTagged: number; pending: number; taggedLastHour: number };
  feed: { id: string; jobId: string; title: string; company: string; companyWebsite: string | null; city: string | null; role: RoleCategory; method: string; model: string | null; confidence: string; at: string }[];
  /** Per-source results of the latest collection run (what the scout scanned). */
  scans: { source: string; company: string | null; companyWebsite: string | null; platform: string; status: string; fetched: number; india: number; newJobs: number; finishedAt: string | null }[];
}
