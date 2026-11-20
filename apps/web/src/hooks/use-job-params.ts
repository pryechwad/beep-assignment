import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Job explorer state, persisted in the URL so searches are shareable and survive reloads. */
export interface JobSearchParams {
  q?: string;
  company?: string;
  location?: string;
  skill?: string[];
  role?: string[];
  city?: string[];
  state?: string[];
  employmentType?: string[];
  experience?: string[];
  workMode?: string[];
  source?: string[];
  fresher?: boolean;
  internship?: boolean;
  postedWithinDays?: number;
  sort?: 'newest' | 'relevance' | 'company' | 'title';
  page?: number;
}

const LIST_KEYS = ['skill', 'role', 'city', 'state', 'employmentType', 'experience', 'workMode', 'source'] as const;
const TEXT_KEYS = ['q', 'company', 'location'] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export function useJobParams() {
  const [sp, setSp] = useSearchParams();

  const params = useMemo<JobSearchParams>(() => {
    const p: JobSearchParams = {};
    for (const k of TEXT_KEYS) {
      const v = sp.get(k);
      if (v) p[k] = v;
    }
    for (const k of LIST_KEYS) {
      const v = sp.get(k);
      if (v) p[k] = v.split(',').filter(Boolean);
    }
    if (sp.get('fresher') === 'true') p.fresher = true;
    if (sp.get('internship') === 'true') p.internship = true;
    const days = Number(sp.get('postedWithinDays'));
    if (days > 0) p.postedWithinDays = days;
    const sort = sp.get('sort');
    if (sort === 'relevance' || sort === 'company' || sort === 'title' || sort === 'newest') p.sort = sort;
    const page = Number(sp.get('page'));
    if (page > 1) p.page = page;
    return p;
  }, [sp]);

  const update = useCallback(
    (patch: Partial<JobSearchParams>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === false || v === '' || (Array.isArray(v) && !v.length)) next.delete(k);
            else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
          }
          if (opts.resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const toggle = useCallback(
    (key: ListKey, value: string) => {
      const cur = params[key] ?? [];
      update({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
    },
    [params, update],
  );

  const clear = useCallback(() => setSp(new URLSearchParams(), { replace: true }), [setSp]);

  const activeCount =
    LIST_KEYS.reduce((n, k) => n + (params[k]?.length ?? 0), 0) + (params.fresher ? 1 : 0) + (params.internship ? 1 : 0) + (params.postedWithinDays ? 1 : 0) + (params.company ? 1 : 0) + (params.location ? 1 : 0);

  return { params, update, toggle, clear, activeCount };
}
