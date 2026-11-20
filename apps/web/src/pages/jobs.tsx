import type { FilterOption, RoleCategory, WorkMode } from '@beep/shared';
import { EMPLOYMENT_LABELS, EXPERIENCE_LABELS, ROLE_LABELS, SOURCE_ADAPTER_LABELS, WORK_MODE_LABELS } from '@beep/shared';
import { SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { JobCard } from '@/components/job-card';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Checkbox, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Card, Input, SearchInput } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows, Pagination } from '@/components/ui/states';
import { useFilters, useJobs } from '@/hooks/queries';
import { useJobParams, type JobSearchParams, type ListKey } from '@/hooks/use-job-params';
import { HUES, roleHue, workModeHue } from '@/lib/colors';
import { cn, fmtNumber } from '@/lib/format';

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Text input synced to a URL param with debounce. */
function DebouncedField({ value, onCommit, render }: { value: string; onCommit: (v: string) => void; render: (v: string, set: (v: string) => void) => JSX.Element }) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounced(local);
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setLocal(value);
    }
  }, [value]);
  useEffect(() => {
    if (debounced !== committed.current) {
      committed.current = debounced;
      onCommit(debounced);
    }
  }, [debounced, onCommit]);
  return render(local, setLocal);
}

function FacetGroup({ title, k, options, selected, onToggle, limit = 8, colorOf }: { title: string; k: ListKey; options: FilterOption[]; selected: string[]; onToggle: (k: ListKey, v: string) => void; limit?: number; colorOf?: (value: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  if (!options.length) return null;
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const shown = expanded || q ? filtered : filtered.slice(0, limit);
  return (
    <fieldset className="border-b border-line py-3 last:border-0">
      <legend className="mb-1.5 px-1.5 text-2xs font-medium uppercase tracking-[0.05em] text-muted">{title}</legend>
      {options.length > 12 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${title.toLowerCase()}…`} className="mb-1.5 h-7 text-xs" aria-label={`Filter ${title} options`} />}
      <div className="space-y-px">
        {shown.map((o) => (
          <Checkbox key={o.value} id={`${k}-${o.value}`} checked={selected.includes(o.value)} onCheckedChange={() => onToggle(k, o.value)} label={colorOf ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(o.value) }} aria-hidden />{o.label}</span> : o.label} hint={fmtNumber(o.count)} />
        ))}
      </div>
      {filtered.length > limit && !q && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 px-1.5 text-xs text-accent-ink hover:underline">
          {expanded ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </fieldset>
  );
}

function Filters({ params, toggle, update }: { params: JobSearchParams; toggle: (k: ListKey, v: string) => void; update: (p: Partial<JobSearchParams>) => void }) {
  const f = useFilters();
  if (f.isPending) return <LoadingRows rows={6} className="p-2" />;
  if (f.isError) return <ErrorState error={f.error} onRetry={() => void f.refetch()} />;
  const d = f.data;
  return (
    <div>
      <fieldset className="border-b border-line pb-3">
        <legend className="mb-1.5 px-1.5 text-2xs font-medium uppercase tracking-[0.05em] text-muted">Eligibility</legend>
        <Checkbox id="fresher" checked={!!params.fresher} onCheckedChange={(v) => update({ fresher: v })} label="Fresher-eligible only" />
        <Checkbox id="internship" checked={!!params.internship} onCheckedChange={(v) => update({ internship: v })} label="Internships only" />
      </fieldset>
      <div className="border-b border-line py-3">
        <p className="mb-1.5 px-1.5 text-2xs font-medium uppercase tracking-[0.05em] text-muted">Date posted</p>
        <Select
          label="Date posted"
          value={params.postedWithinDays ? String(params.postedWithinDays) : 'any'}
          onValueChange={(v) => update({ postedWithinDays: v === 'any' ? undefined : Number(v) })}
          options={[{ value: 'any', label: 'Any time' }, { value: '1', label: 'Past 24 hours' }, { value: '7', label: 'Past week' }, { value: '30', label: 'Past 30 days' }, { value: '90', label: 'Past 90 days' }]}
          className="w-full"
        />
      </div>
      <FacetGroup title="Role" k="role" options={d.roles} selected={params.role ?? []} onToggle={toggle} colorOf={(v) => HUES[roleHue(v as RoleCategory)].solid} />
      <FacetGroup title="Work mode" k="workMode" options={d.workModes} selected={params.workMode ?? []} onToggle={toggle} colorOf={(v) => HUES[workModeHue(v as WorkMode)].solid} />
      <FacetGroup title="City" k="city" options={d.cities} selected={params.city ?? []} onToggle={toggle} limit={8} />
      <FacetGroup title="State" k="state" options={d.states} selected={params.state ?? []} onToggle={toggle} limit={5} />
      <FacetGroup title="Experience" k="experience" options={d.experienceLevels} selected={params.experience ?? []} onToggle={toggle} />
      <FacetGroup title="Employment type" k="employmentType" options={d.employmentTypes} selected={params.employmentType ?? []} onToggle={toggle} />
      <FacetGroup title="Source" k="source" options={d.sources} selected={params.source ?? []} onToggle={toggle} />
    </div>
  );
}

const LABELS: Partial<Record<ListKey, Record<string, string>>> = { role: ROLE_LABELS, experience: EXPERIENCE_LABELS, employmentType: EMPLOYMENT_LABELS, workMode: WORK_MODE_LABELS, source: SOURCE_ADAPTER_LABELS };

function ActiveChips({ params, toggle, update, clear }: { params: JobSearchParams; toggle: (k: ListKey, v: string) => void; update: (p: Partial<JobSearchParams>) => void; clear: () => void }) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const k of ['role', 'city', 'state', 'experience', 'employmentType', 'workMode', 'source', 'skill'] as ListKey[]) {
    for (const v of params[k] ?? []) chips.push({ key: `${k}:${v}`, label: LABELS[k]?.[v] ?? v, remove: () => toggle(k, v) });
  }
  if (params.fresher) chips.push({ key: 'fresher', label: 'Fresher-eligible', remove: () => update({ fresher: false }) });
  if (params.internship) chips.push({ key: 'internship', label: 'Internships', remove: () => update({ internship: false }) });
  if (params.postedWithinDays) chips.push({ key: 'days', label: `Past ${params.postedWithinDays}d`, remove: () => update({ postedWithinDays: undefined }) });
  if (params.company) chips.push({ key: 'company', label: `Company: ${params.company}`, remove: () => update({ company: undefined }) });
  if (params.location) chips.push({ key: 'location', label: `Location: ${params.location}`, remove: () => update({ location: undefined }) });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-[5px] border border-line-strong bg-surface py-0.5 pl-2 pr-1 text-xs text-ink-2 hover:border-faint" aria-label={`Remove filter ${c.label}`}>
          {c.label}
          <X className="h-3 w-3 text-muted" />
        </button>
      ))}
      <button type="button" onClick={clear} className="px-1 text-xs text-muted hover:text-ink">
        Clear all
      </button>
    </div>
  );
}

export default function Jobs() {
  const { params, update, toggle, clear, activeCount } = useJobParams();
  const [mobileFilters, setMobileFilters] = useState(false);
  const query = { ...params, pageSize: PAGE_SIZE, sort: params.sort ?? (params.q ? 'relevance' : 'newest') } as JobSearchParams & { pageSize: number };
  const jobs = useJobs(query);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commitQ = (v: string) => update({ q: v || undefined, sort: v ? params.sort : params.sort === 'relevance' ? undefined : params.sort });
  const commitCompany = (v: string) => update({ company: v || undefined });
  const commitLocation = (v: string) => update({ location: v || undefined });
  const commitSkill = (v: string) => update({ skill: v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined });

  return (
    <div>
      <PageHeader title="Job explorer" description="Every active posting in the index, searchable and filterable on the server. Results link to the employer’s original listing." />

      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_160px_160px]">
        <DebouncedField
          value={params.q ?? ''}
          onCommit={commitQ}
          render={(v, set) => <SearchInput ref={searchRef} value={v} onValueChange={set} placeholder="Search titles, companies, descriptions…" shortcut="/" aria-label="Search jobs" />}
        />
        <DebouncedField value={params.company ?? ''} onCommit={commitCompany} render={(v, set) => <Input value={v} onChange={(e) => set(e.target.value)} placeholder="Company" aria-label="Company" />} />
        <DebouncedField value={params.location ?? ''} onCommit={commitLocation} render={(v, set) => <Input value={v} onChange={(e) => set(e.target.value)} placeholder="City, state or remote" aria-label="Location" />} />
        <DebouncedField value={(params.skill ?? []).join(', ')} onCommit={commitSkill} render={(v, set) => <Input value={v} onChange={(e) => set(e.target.value)} placeholder="Skills, e.g. SQL, Python" aria-label="Skills" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[232px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
            <Filters params={params} toggle={toggle} update={update} />
          </div>
        </aside>

        <section aria-label="Results" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" className="lg:hidden" onClick={() => setMobileFilters(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeCount ? ` · ${activeCount}` : ''}
              </Button>
              <p className="text-xs text-muted tabular" aria-live="polite">
                {jobs.data ? `${fmtNumber(jobs.data.total)} ${jobs.data.total === 1 ? 'opportunity' : 'opportunities'}` : 'Loading…'}
              </p>
            </div>
            <Select
              label="Sort"
              value={query.sort}
              onValueChange={(v) => update({ sort: v as JobSearchParams['sort'] })}
              options={[...(params.q ? [{ value: 'relevance', label: 'Most relevant' }] : []), { value: 'newest', label: 'Newest first' }, { value: 'company', label: 'Company A–Z' }, { value: 'title', label: 'Title A–Z' }]}
              className="w-40"
            />
          </div>
          <ActiveChips params={params} toggle={toggle} update={update} clear={clear} />

          <Card className={cn('overflow-hidden transition-opacity', jobs.isPlaceholderData && 'opacity-60')}>
            {jobs.isPending ? (
              <LoadingRows rows={8} />
            ) : jobs.isError ? (
              <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} className="m-4" />
            ) : jobs.data.items.length === 0 ? (
              <EmptyState icon={SearchX} title="No opportunities match these filters" action={activeCount || params.q ? <Button size="sm" onClick={clear}>Clear search and filters</Button> : undefined}>
                Try removing a filter or broadening the search. Classified facets (role, experience) only cover postings that have been classified so far.
              </EmptyState>
            ) : (
              <>
                <div className="divide-y divide-line">
                  {jobs.data.items.map((j) => (
                    <JobCard key={j.id} job={j} />
                  ))}
                </div>
                <Pagination
                  page={jobs.data.page}
                  totalPages={jobs.data.totalPages}
                  total={jobs.data.total}
                  pageSize={jobs.data.pageSize}
                  onPage={(p) => {
                    update({ page: p > 1 ? p : undefined }, { resetPage: false });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </>
            )}
          </Card>
        </section>
      </div>

      <Dialog open={mobileFilters} onOpenChange={setMobileFilters} title="Filters" variant="drawer" className="max-w-sm" footer={<><Button size="sm" variant="ghost" onClick={clear}>Clear all</Button><Button size="sm" variant="primary" onClick={() => setMobileFilters(false)}>Show {fmtNumber(jobs.data?.total)} results</Button></>}>
        <Filters params={params} toggle={toggle} update={update} />
      </Dialog>
    </div>
  );
}
