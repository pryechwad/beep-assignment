import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnalyticsOverview, CompanyListItem, CountRow, DailyIngestionRow, JobDetail, JobFilters, JobListItem, Paginated, SourceStatus } from '@beep/shared';
import { api } from '@/lib/api';
import type { JobSearchParams } from './use-job-params';

export const qk = {
  overview: ['analytics', 'overview'] as const,
  jobs: (p: JobSearchParams) => ['jobs', p] as const,
  job: (id: string) => ['job', id] as const,
  filters: ['jobs', 'filters'] as const,
  companies: (q: string) => ['companies', q] as const,
  roles: ['analytics', 'roles'] as const,
  cities: ['analytics', 'cities'] as const,
  employment: ['analytics', 'employment'] as const,
  experience: ['analytics', 'experience'] as const,
  daily: (days: number) => ['analytics', 'daily', days] as const,
  sources: ['analytics', 'sources'] as const,
  sourceStatus: ['sources', 'status'] as const,
};

export const useOverview = () => useQuery({ queryKey: qk.overview, queryFn: ({ signal }) => api.get<AnalyticsOverview>('/analytics/overview', undefined, signal), refetchInterval: 60_000 });

export const useJobs = (p: JobSearchParams) =>
  useQuery({ queryKey: qk.jobs(p), queryFn: ({ signal }) => api.get<Paginated<JobListItem>>('/jobs', { ...p }, signal), placeholderData: keepPreviousData });

export const useJob = (id: string) => useQuery({ queryKey: qk.job(id), queryFn: ({ signal }) => api.get<JobDetail>(`/jobs/${encodeURIComponent(id)}`, undefined, signal) });

export const useFilters = () => useQuery({ queryKey: qk.filters, queryFn: ({ signal }) => api.get<JobFilters>('/jobs/filters', undefined, signal), staleTime: 5 * 60_000 });

export const useCompanies = (q: string) =>
  useQuery({ queryKey: qk.companies(q), queryFn: ({ signal }) => api.get<{ items: CompanyListItem[] }>('/companies', { q }, signal), placeholderData: keepPreviousData });

export const useRoles = () => useQuery({ queryKey: qk.roles, queryFn: ({ signal }) => api.get<{ items: CountRow[] }>('/analytics/roles', undefined, signal) });
export const useCities = () => useQuery({ queryKey: qk.cities, queryFn: ({ signal }) => api.get<{ items: CountRow[]; remote: number; unknown: number }>('/analytics/cities', { limit: 15 }, signal) });
export const useEmployment = () => useQuery({ queryKey: qk.employment, queryFn: ({ signal }) => api.get<{ items: CountRow[]; unknown: number }>('/analytics/employment', undefined, signal) });
export const useExperience = () => useQuery({ queryKey: qk.experience, queryFn: ({ signal }) => api.get<{ items: CountRow[] }>('/analytics/experience', undefined, signal) });
export const useDaily = (days: number) =>
  useQuery({ queryKey: qk.daily(days), queryFn: ({ signal }) => api.get<{ items: DailyIngestionRow[]; firstIngestedAt: string | null }>('/analytics/daily', { days }, signal) });
export const useSourceMix = () =>
  useQuery({ queryKey: qk.sources, queryFn: ({ signal }) => api.get<{ items: { key: string; label: string; count: number; boards: number }[] }>('/analytics/sources', undefined, signal) });
export const useSourceStatus = () => useQuery({ queryKey: qk.sourceStatus, queryFn: ({ signal }) => api.get<{ items: SourceStatus[] }>('/sources/status', undefined, signal) });
