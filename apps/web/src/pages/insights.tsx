import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { RoleCategory } from '@beep/shared';
import { ArrowRight, BookOpen, Briefcase, Building2, CalendarPlus, Clock3, Database, GraduationCap, MapPin, RefreshCw, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DailyChart, HBarChart, SegmentBar, type BarDatum } from '@/components/charts/charts';
import { useLiveActivity } from '@/components/live';
import { GlassStat, GradientBanner, GradientTile, LivePill, MetricCard, Panel, ShareRow } from '@/components/showcase';
import { CompanyMark, HueBadge } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCities, useDaily, useEmployment, useJobs, useOverview, useRoles, useSourceMix } from '@/hooks/queries';
import { employmentHue, HUES, roleHue } from '@/lib/colors';
import { curate } from '@/lib/curate';
import { fmtDateTime, fmtNumber, fmtPct, fmtRelative, locationLabel, roleLabel } from '@/lib/format';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function Insights() {
  const [range, setRange] = useState('30');
  const days = Number(range);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const overview = useOverview();
  const live = useLiveActivity(10_000);
  const roles = useRoles();
  const cities = useCities();
  const employment = useEmployment();
  const daily = useDaily(days);
  const sources = useSourceMix();
  const recent = useJobs({ fresher: true, sort: 'newest', pageSize: 50 });
  const picks = curate(recent.data?.items ?? [], 5, (j) => ({ company: j.company.name, role: j.roleCategory }));

  const t = overview.data?.totals;
  const total = t?.activeJobs ?? 0;
  const share = (n: number | undefined) => (total && n !== undefined ? (n / total) * 100 : null);
  const aiTagged = live.data?.ai.llmTagged;
  const loading = overview.isPending;

  const roleRows = (roles.data?.items ?? []).slice(0, 8);
  const roleTotal = (roles.data?.items ?? []).reduce((n, r) => n + r.count, 0);
  const cityData: BarDatum[] = (cities.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, secondary: r.fresher }));
  const empData: BarDatum[] = (employment.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, color: HUES[employmentHue(r.key as never)].solid }));
  if (employment.data?.unknown) empData.push({ key: 'UNKNOWN', label: 'Not stated by source', value: employment.data.unknown, color: HUES.slate.ring });
  const empTotal = empData.reduce((n, d) => n + d.value, 0);
  const sourceItems = sources.data?.items ?? [];
  const sourceTotal = sourceItems.reduce((n, s) => n + s.count, 0);
  const sourceTone = { GREENHOUSE: 'emerald', LEVER: 'blue', ASHBY: 'violet' } as const;

  return (
    <div className="space-y-6">
      {overview.isError && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}

      <GradientBanner>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            <span className="hidden size-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20 sm:flex [&_svg]:size-7"><Briefcase /></span>
            <div>
              <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[2.25rem]">India Early-Career Job Market</h1>
              <p className="mt-1 text-base text-slate-300">Job intelligence dashboard · fresher roles &amp; internships</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <LivePill tone={live.data?.pipeline.status === 'offline' ? 'amber' : 'emerald'}>{live.data?.pipeline.status === 'offline' ? 'Workers offline' : 'Live analytics'}</LivePill>
                <span className="flex items-center gap-1.5 text-sm text-slate-400">
                  <Clock3 className="size-4" /> Last sync {fmtRelative(overview.data?.freshness.lastSuccessfulRunAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-6 text-center ring-1 ring-inset ring-white/10 lg:min-w-60">
            <div className="text-4xl font-semibold tracking-tight tabular">{loading ? '—' : fmtNumber(total)}</div>
            <div className="mt-1 text-sm text-slate-300">Open roles in India</div>
            <div className="mt-1 text-xs text-slate-400">{t ? `${fmtNumber(t.companies)} companies · ${fmtNumber(t.cities)} cities` : ''}</div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-3">
            <GlassStat icon={<Sparkles />} value={t ? fmtNumber(t.fresherEligible) : '—'} label="Fresher-eligible" />
            <GlassStat icon={<GraduationCap />} value={t ? fmtNumber(t.internships) : '—'} label="Internships" />
            <GlassStat icon={<Zap />} value={aiTagged !== undefined ? fmtNumber(aiTagged) : '—'} label="AI-tagged" />
            <GlassStat icon={<CalendarPlus />} value={t ? fmtNumber(t.addedToday) : '—'} label="Added today" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" className="rounded-xl bg-white/[0.07] px-4 py-2.5 text-sm text-white ring-1 ring-inset ring-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-400/50">
              {RANGES.map((r) => (
                <option key={r.value} value={r.value} className="text-slate-900">{r.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => void qc.invalidateQueries()} className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white ring-1 ring-inset ring-white/15 transition hover:bg-white/[0.14]">
              <RefreshCw className={fetching ? 'size-4 animate-spin' : 'size-4'} /> Refresh
            </button>
            <Link to="/jobs" className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
              Open job portal <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </GradientBanner>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard tone="blue" icon={<Briefcase />} label="Open roles" value={fmtNumber(total)} loading={loading} meter={aiTagged !== undefined && total ? (aiTagged / total) * 100 : null} note={aiTagged !== undefined ? `${fmtPct(total ? (aiTagged / total) * 100 : null)} tagged by AI so far` : undefined} to="/jobs" />
        <MetricCard tone="emerald" icon={<Sparkles />} label="Fresher-eligible" value={fmtNumber(t?.fresherEligible)} loading={loading} meter={share(t?.fresherEligible)} note={`${fmtPct(share(t?.fresherEligible))} of all open roles`} to="/jobs?fresher=true" />
        <MetricCard tone="violet" icon={<GraduationCap />} label="Internships" value={fmtNumber(t?.internships)} loading={loading} meter={share(t?.internships)} note={`${fmtPct(share(t?.internships))} of all open roles`} to="/jobs?internship=true" />
        <MetricCard tone="orange" icon={<Building2 />} label="Companies hiring" value={fmtNumber(t?.companies)} loading={loading} note={t ? `across ${fmtNumber(t.cities)} cities` : undefined} to="/companies" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Roles in demand" icon={<GradientTile tone="blue" size="sm"><TrendingUp /></GradientTile>} action={<span className="flex items-center gap-2 text-sm text-slate-500"><span className="size-2.5 rounded-full bg-emerald-500" /> Live data</span>}>
          {roles.isPending ? <LoadingRows rows={6} /> : roleRows.length === 0 ? <EmptyState title="No classified roles yet" /> : (
            <div className="space-y-4">
              {roleRows.map((r) => (
                <button key={r.key} type="button" onClick={() => navigate(`/jobs?role=${r.key}`)} className="block w-full rounded-lg text-left transition hover:bg-slate-50">
                  <ShareRow label={r.label} count={r.count} total={roleTotal} tone="blue" dot={HUES[roleHue(r.key as RoleCategory)].solid} />
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Fresh picks for freshers" icon={<GradientTile tone="emerald" size="sm"><Sparkles /></GradientTile>} action={<Link to="/jobs?fresher=true" className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">View all <ArrowRight className="size-4" /></Link>}>
          {recent.isPending ? <LoadingRows rows={5} /> : recent.isError ? <ErrorState error={recent.error} /> : picks.length === 0 ? <EmptyState title="No fresher-eligible roles classified yet" /> : (
            <div className="space-y-3">
              {picks.map((j) => (
                <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyMark name={j.company.name} website={j.company.website} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{j.title}</p>
                      <p className="truncate text-xs text-slate-500">{j.company.name} · {locationLabel(j)}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {j.roleCategory && <HueBadge hue={roleHue(j.roleCategory)} dot>{roleLabel(j.roleCategory)}</HueBadge>}
                    <p className="mt-1 text-[11px] text-slate-400">{fmtRelative(j.publishedAt ?? j.firstSeenAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Opportunities by city" icon={<GradientTile tone="rose" size="sm"><MapPin /></GradientTile>} action={cities.data ? <span className="text-xs text-slate-500">{fmtNumber(cities.data.remote)} remote · {fmtNumber(cities.data.unknown)} city not stated</span> : undefined}>
          {cities.isPending ? <LoadingRows rows={6} /> : <HBarChart data={cityData} color={HUES.rose.solid} valueLabel="postings" secondaryLabel="fresher-eligible" onSelect={(d) => navigate(`/jobs?city=${encodeURIComponent(d.key)}`)} />}
        </Panel>
        <div className="space-y-6">
          <Panel title="Employment type" icon={<GradientTile tone="violet" size="sm"><GraduationCap /></GradientTile>}>
            {employment.isPending ? <LoadingRows rows={3} /> : <SegmentBar data={empData} total={empTotal} />}
          </Panel>
          <Panel title="Data sources" icon={<GradientTile tone="cyan" size="sm"><Database /></GradientTile>}>
            <div className="space-y-4">
              {sourceItems.map((s) => (
                <ShareRow key={s.key} label={`${s.label} · ${s.boards} boards`} count={s.count} total={sourceTotal} tone={sourceTone[s.key as keyof typeof sourceTone] ?? 'blue'} />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Daily ingestion" icon={<GradientTile tone="indigo" size="sm"><TrendingUp /></GradientTile>} action={<span className="text-xs text-slate-500">{RANGES.find((r) => r.value === range)?.label} · IST</span>}>
        {daily.isPending ? <LoadingRows rows={4} /> : daily.isError ? <ErrorState error={daily.error} /> : <DailyChart data={daily.data.items} />}
        {daily.data?.firstIngestedAt && <p className="mt-3 text-xs text-slate-500">Collection began {fmtDateTime(daily.data.firstIngestedAt)}; that day’s bar is the initial backfill of every listing already open.</p>}
      </Panel>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-7">
        <div className="mb-6 flex items-center gap-4">
          <GradientTile tone="indigo" size="sm"><Zap /></GradientTile>
          <h3 className="text-[15px] font-semibold text-slate-900">Quick actions</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link to="/jobs?fresher=true" className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"><Sparkles className="size-5" /> Browse fresher jobs</Link>
          <Link to="/jobs?internship=true" className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"><GraduationCap className="size-5" /> Find internships</Link>
          <Link to="/about" className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"><BookOpen className="size-5" /> How the data is collected</Link>
        </div>
      </section>
    </div>
  );
}
