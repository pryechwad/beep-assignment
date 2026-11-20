import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassificationDTO, ConfidenceLevel, EmploymentType, EvaluationErrorCategory, ExperienceLevel, RoleCategory } from '@beep/shared';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/toast';

// ─── Response shapes for admin endpoints (mirrors apps/api/src/routes/admin.ts) ───
export interface QueueCounts { name: string; waiting?: number; active?: number; delayed?: number; failed?: number; completed?: number; prioritized?: number }
export interface Heartbeat { role: 'worker' | 'scheduler'; pid: number; host: string; startedAt: string; at: string; details?: { schedules?: { id: string; pattern: string; tz: string; next: string | null }[]; providers?: string[]; disabled?: { provider: string; reason: string }[] } }
export interface RunRow { id: string; correlationId: string; trigger: 'SCHEDULED' | 'MANUAL'; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED'; requestedBy: string | null; startedAt: string | null; finishedAt: string | null; sourcesTotal: number; sourcesSucceeded: number; sourcesFailed: number; jobsFetched: number; jobsNew: number; jobsUpdated: number; jobsClosed: number; error: string | null; createdAt: string }
export interface LogRow { id: string; level: 'INFO' | 'WARN' | 'ERROR'; scope: string; message: string; correlationId: string | null; runId: string | null; sourceId: string | null; jobId: string | null; rawJobId: string | null; context: unknown; createdAt: string }
export interface AdminOverview {
  queues: QueueCounts[]; deadLetter: number; workers: Heartbeat[]; scheduler: Heartbeat | null;
  sources: { total: number; enabled: number; unhealthy: number }; lastRun: RunRow | null; lastSuccessfulRunAt: string | null;
  throughput24h: { normalized: number; classified: number }; llmCalls24h: { succeeded: number; failed: number; successRate: number | null; costUsd: number };
  classificationRoutes: Record<string, number>; errors24h: number; recentErrors: LogRow[]; reviewQueues: { classifications: number; duplicates: number };
}
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }
export interface ReviewItem extends ClassificationDTO { job: { id: string; title: string; company: { name: string }; primaryCity: string | null; llmPending: boolean }; confidenceFactors: { notes?: string[]; route?: string } & Record<string, unknown>; reviewedAt: string | null }
export interface DuplicateRow { id: string; layer: string; similarityScore: number; factors: Record<string, number | boolean | null>; decision: string; reviewStatus: string; createdAt: string; canonicalJob: { id: string; title: string; primaryCity: string | null; postingUrl: string; status: string; company: { name: string } }; candidateJob: DuplicateRow['canonicalJob'] | null; rawJob: { sourceId: string; externalId: string; postingUrl: string } }
export interface EvalLabel { trueRole: RoleCategory; trueCity: string | null; trueExperience: ExperienceLevel; trueEmployment: EmploymentType | null; trueFresherEligible: boolean; errorCategories: EvaluationErrorCategory[]; notes: string | null; roleCorrect: boolean; cityCorrect: boolean; experienceCorrect: boolean; employmentCorrect: boolean; eligibilityCorrect: boolean }
export interface EvalItem { prediction: ClassificationDTO; job: { id: string; title: string; description: string; postingUrl: string; company: { name: string }; sourceFacts: { locations: string[]; employmentType: string | null; workplaceType: string | null } | null }; label: EvalLabel | null }
export interface Accuracy { correct: number; total: number; accuracy: number | null }
export interface EvalMetrics { sampleSize: number; targetSampleSize: number; fields: Record<'role' | 'city' | 'experience' | 'employment' | 'eligibility', Accuracy>; exactMatch: Accuracy; byConfidence: Record<ConfidenceLevel, Accuracy>; byMethod: Record<string, Accuracy>; errorCategories: Record<EvaluationErrorCategory, number> }
export interface PriceInfo { inputPerMTok: number; outputPerMTok: number; verified: boolean; source: string }
export interface CostSummary {
  windowDays: number; pricingVersion: string;
  totals: { costUsd: number; classifyCostUsd: number; embeddingCostUsd: number; calls: number; failedCalls: number; inputTokens: number; outputTokens: number; retries: number; unmeasuredTokenCalls: number };
  processed: { total: number; llmClassified: number; rulesOnly: number }; costPer1000Posts: number | null; costPer1000LLMClassified: number | null;
  byModel: { provider: string; model: string; operation: string; calls: number; failed: number; inputTokens: number; outputTokens: number; costUsd: number; avgLatencyMs: number | null; retries: number; price: PriceInfo | null }[];
  daily: { date: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  priceTable: ({ provider: string; modelPrefix: string } & PriceInfo)[];
}
export interface SourceRow { id: string; name: string; adapterType: 'GREENHOUSE' | 'LEVER' | 'ASHBY'; company: string | null; enabled: boolean; healthy: boolean | null; lastSuccessAt: string | null; lastFailureAt: string | null; lastError: string | null; lastRecordCount: number; activeJobs: number }
export interface DeadLetter { id: string; queue: string; jobName: string; jobId?: string; failedReason: string; attemptsMade: number; failedAt: string }

const key = (...k: unknown[]) => ['admin', ...k];

export const useAdminOverview = () => useQuery({ queryKey: key('overview'), queryFn: () => api.get<AdminOverview>('/admin/overview'), refetchInterval: 10_000 });
export const useRuns = (page: number) => useQuery({ queryKey: key('runs', page), queryFn: () => api.get<Paged<RunRow>>('/admin/scrape-runs', { page, pageSize: 15 }), refetchInterval: 10_000, placeholderData: keepPreviousData });
export const useRun = (id: string | null) => useQuery({ queryKey: key('run', id), enabled: !!id, queryFn: () => api.get<RunRow & { tasks: { id: string; sourceId: string; status: string; jobsFetched: number; jobsFiltered: number; jobsNew: number; jobsUpdated: number; jobsClosed: number; errorMessage: string | null; source: { name: string } }[] }>(`/admin/scrape-runs/${id}`) });
export const useQueue = () => useQuery({ queryKey: key('queue'), queryFn: () => api.get<{ queues: QueueCounts[]; deadLetter: DeadLetter[]; heartbeats: Heartbeat[] }>('/admin/queue'), refetchInterval: 8_000 });
export const useAdminSources = () => useQuery({ queryKey: key('sources'), queryFn: () => api.get<{ items: SourceRow[] }>('/sources/status') });
export const useReviewQueue = (page: number, status: 'pending' | 'reviewed') => useQuery({ queryKey: key('review', page, status), queryFn: () => api.get<Paged<ReviewItem>>('/admin/classifications/review', { page, pageSize: 20, status }), placeholderData: keepPreviousData });
export const useDuplicates = (page: number, status: string) => useQuery({ queryKey: key('dups', page, status), queryFn: () => api.get<Paged<DuplicateRow>>('/admin/duplicates', { page, pageSize: 20, status }), placeholderData: keepPreviousData });
export const useEvaluation = () => useQuery({ queryKey: key('evaluation'), queryFn: () => api.get<{ sampleSize: number; audited: number; items: EvalItem[] }>('/admin/evaluation') });
export const useEvalMetrics = () => useQuery({ queryKey: key('evaluation', 'metrics'), queryFn: () => api.get<EvalMetrics>('/admin/evaluation/metrics') });
export const useCosts = (days: number) => useQuery({ queryKey: key('costs', days), queryFn: () => api.get<CostSummary>('/admin/ai-usage', { days }) });
export const useLogs = (page: number, level: string, scope?: string, correlationId?: string) =>
  useQuery({ queryKey: key('logs', page, level, scope, correlationId), queryFn: () => api.get<Paged<LogRow> & { scopes: { scope: string; count: number }[] }>('/admin/errors', { page, pageSize: 30, level, scope, correlationId }), placeholderData: keepPreviousData });

function useAdminMutation<TVars>(fn: (v: TVars) => Promise<unknown>, success: string | ((v: TVars) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, v) => {
      toast.success(typeof success === 'function' ? success(v) : success);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['sources'] });
    },
  });
}

export const useTriggerSync = () => useAdminMutation((sourceIds?: string[]) => api.post('/admin/sync/trigger', sourceIds ? { sourceIds } : {}), 'Collection run queued');
export const useSyncSource = () => useAdminMutation((id: string) => api.post(`/admin/sources/${encodeURIComponent(id)}/sync`), 'Source sync queued');
export const useToggleSource = () => useAdminMutation((v: { id: string; enabled: boolean }) => api.patch(`/admin/sources/${encodeURIComponent(v.id)}`, { enabled: v.enabled }), (v) => (v.enabled ? 'Source enabled' : 'Source disabled'));
export const useRetryDead = () => useAdminMutation((id: string) => api.post(`/admin/queue/dead-letter/${encodeURIComponent(id)}/retry`), 'Job re-queued');
export const useRetryFailed = () => useAdminMutation((queue: string) => api.post(`/admin/queue/${queue}/retry-failed`), (q) => `Retrying failed ${q} jobs`);
export const useReviewClassification = () =>
  useAdminMutation((v: { id: string; action: 'approve' | 'override'; roleCategory?: RoleCategory; experienceLevel?: ExperienceLevel; employmentType?: EmploymentType | null; isFresherEligible?: boolean; city?: string | null; note?: string }) => {
    const { id, ...body } = v;
    return api.post(`/admin/classifications/${id}/review`, body);
  }, (v) => (v.action === 'approve' ? 'Classification approved' : 'Override saved as a manual version'));
export const useReclassify = () => useAdminMutation((jobId: string) => api.post(`/admin/jobs/${jobId}/reclassify`), 'Re-classification queued');
export const useReviewDuplicate = () => useAdminMutation((v: { id: string; decision: 'CONFIRMED' | 'REJECTED' }) => api.post(`/admin/duplicates/${v.id}/review`, { decision: v.decision }), (v) => (v.decision === 'CONFIRMED' ? 'Merged as duplicate' : 'Kept as separate openings'));
export const useSaveLabel = () =>
  useAdminMutation((v: { classificationId: string; trueRole: RoleCategory; trueCity: string | null; trueExperience: ExperienceLevel; trueEmployment: EmploymentType | null; trueFresherEligible: boolean; extraErrors: EvaluationErrorCategory[]; notes?: string }) => {
    const { classificationId, ...body } = v;
    return api.put(`/admin/evaluation/${classificationId}`, body);
  }, 'Label saved');
