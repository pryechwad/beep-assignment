import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { RoleCategory } from '@beep/shared';
import { ArrowRight, Briefcase, Building2, CalendarPlus, Inbox, Layers, MapPin, PieChart, RefreshCw, Sparkles, TrendingUp, GraduationCap, Database } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChartFrame, DailyChart, HBarChart, SegmentBar, SimpleTable, type BarDatum } from '@/components/charts/charts';
import { JobCard } from '@/components/job-card';
import { Kpi, KpiGrid } from '@/components/kpi';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { IconTile, StatusDot } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCities, useDaily, useEmployment, useJobs, useOverview, useRoles, useSourceMix } from '@/hooks/queries';
import { employmentHue, HUES, roleHue } from '@/lib/colors';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function PipelineStatus() {
  const o = useOverview();
  if (!o.data) return null;
  const { pipeline, freshness } = o.data;
  const tone = pipeline.status === 'running' ? 'accent' : pipeline.status === 'idle' ? 'success' : pipeline.status === 'degraded' ? 'warning' : 'neutral';
  const label = { running: 'Collection running', idle: 'Pipeline healthy', degraded: 'Pipeline degraded', unknown: 'Pipeline status unknown' }[pipeline.status];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <StatusDot tone={tone}>{label}</StatusDot>
      <span title={fmtDateTime(freshness.lastSuccessfulRunAt)}>
        Last sync <span className="font-medium text-ink-2">{fmtRelative(freshness.lastSuccessfulRunAt)}</span>
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState('30');
  const days = Number(range);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const overview = useOverview();
  const roles = useRoles();
  const cities = useCities();
  const employment = useEmployment();
  const daily = useDaily(days);
  const sources = useSourceMix();
  const recent = useJobs({ fresher: true, sort: 'newest', postedWithinDays: days });

  const t = overview.data?.totals;
  const c = overview.data?.comparisons;
  const noHistory = 'No earlier snapshot yet';

  const roleData: BarDatum[] = (roles.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, secondary: r.fresher, color: HUES[roleHue(r.key as RoleCategory)].solid }));
  const cityData: BarDatum[] = (cities.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, secondary: r.fresher }));
  const empData: BarDatum[] = (employment.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, color: HUES[employmentHue(r.key as never)].solid }));
  if (employment.data?.unknown) empData.push({ key: 'UNKNOWN', label: 'Not stated by source', value: employment.data.unknown, color: HUES.slate.ring });
  const empTotal = empData.reduce((n, d) => n + d.value, 0);
  const platformColor: Record<string, string> = { GREENHOUSE: HUES.green.solid, LEVER: HUES.blue.solid, ASHBY: HUES.violet.solid };
  const sourceData: BarDatum[] = (sources.data?.items ?? []).map((s) => ({ key: s.key, label: `${s.label} (${s.boards} boards)`, value: s.count, color: platformColor[s.key] }));
  const classification = overview.data?.classification;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">Insights</h1>
        <PipelineStatus />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Opportunity snapshot</h2>
          <p className="text-xs text-muted">Live counts from the index. Comparisons appear once daily snapshots exist.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select label="Date range" value={range} onValueChange={setRange} options={RANGES} className="w-36" />
          <Button size="icon" onClick={() => void qc.invalidateQueries()} aria-label="Refresh data" title="Refresh">
            <RefreshCw className={fetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          </Button>
        </div>
      </div>

      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <KpiGrid>
          <Kpi hue="blue" icon={<Briefcase />} label="Opportunities" value={t?.activeJobs} previous={c?.activeJobs.previous} previousDate={c?.activeJobs.previousDate} hint={noHistory} loading={overview.isPending} />
          <Kpi hue="green" icon={<Sparkles />} label="Fresher-eligible" value={t?.fresherEligible} previous={c?.fresherEligible.previous} previousDate={c?.fresherEligible.previousDate} hint={classification ? `${fmtNumber(classification.classified)} of ${fmtNumber(t?.activeJobs)} classified` : undefined} loading={overview.isPending} />
          <Kpi hue="violet" icon={<GraduationCap />} label="Active internships" value={t?.internships} previous={c?.internships.previous} previousDate={c?.internships.previousDate} hint={noHistory} loading={overview.isPending} />
          <Kpi hue="orange" icon={<Building2 />} label="Companies indexed" value={t?.companies} previous={c?.companies.previous} previousDate={c?.companies.previousDate} hint={noHistory} loading={overview.isPending} />
          <Kpi hue="rose" icon={<MapPin />} label="Cities covered" value={t?.cities} previous={c?.cities.previous} previousDate={c?.cities.previousDate} hint={noHistory} loading={overview.isPending} />
          <Kpi hue="teal" icon={<CalendarPlus />} label="Added today (IST)" value={t?.addedToday} hint="New unique postings" loading={overview.isPending} />
        </KpiGrid>
      )}

      {classification && classification.unclassified + classification.pendingLLM > 0 && (
        <p className="-mt-2 text-xs text-muted">
          Role and fresher figures cover classified postings; {fmtNumber(classification.pendingLLM)} still await a full AI pass — see{' '}
          <Link to="/about#classification" className="font-medium text-accent-ink underline underline-offset-2">methodology</Link>.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame icon={<Layers />} hue="blue" title="Opportunities by role" description="Coloured by field. Click a bar to explore." table={<SimpleTable rows={roleData} valueLabel="Postings" secondaryLabel="Fresher-eligible" />}>
          {roles.isPending ? <LoadingRows rows={5} /> : roles.isError ? <ErrorState error={roles.error} /> : <HBarChart data={roleData} valueLabel="postings" secondaryLabel="fresher-eligible" onSelect={(d) => navigate(`/jobs?role=${d.key}`)} />}
        </ChartFrame>
        <ChartFrame
          icon={<MapPin />}
          hue="rose"
          title="Opportunities by city"
          description="A posting listed in several cities counts once per city."
          footnote={cities.data ? `${fmtNumber(cities.data.remote)} remote-only postings and ${fmtNumber(cities.data.unknown)} with no city stated are not shown.` : undefined}
          table={<SimpleTable rows={cityData} valueLabel="Postings" secondaryLabel="Fresher-eligible" />}
        >
          {cities.isPending ? <LoadingRows rows={5} /> : cities.isError ? <ErrorState error={cities.error} /> : <HBarChart data={cityData} color={HUES.rose.solid} valueLabel="postings" secondaryLabel="fresher-eligible" onSelect={(d) => navigate(`/jobs?city=${encodeURIComponent(d.key)}`)} />}
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame icon={<TrendingUp />} hue="teal" className="lg:col-span-2" title="Daily ingestion" description={`New and closed postings per day (IST), ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}.`} footnote={daily.data?.firstIngestedAt ? `Collection began ${fmtDateTime(daily.data.firstIngestedAt)}. That day’s bar is the initial backfill of every listing already open; earlier days have no data, not zero openings.` : undefined} table={<SimpleTable rows={(daily.data?.items ?? []).filter((d) => d.added || d.closed).map((d) => ({ key: d.date, label: d.date, value: d.added, secondary: d.closed }))} valueLabel="Added" secondaryLabel="Closed" />}>
          {daily.isPending ? <LoadingRows rows={4} /> : daily.isError ? <ErrorState error={daily.error} /> : <DailyChart data={daily.data.items} />}
        </ChartFrame>
        <ChartFrame icon={<PieChart />} hue="violet" title="Internship vs full-time" description="Employment type as stated by the source or title." table={<SimpleTable rows={empData} valueLabel="Postings" />}>
          {employment.isPending ? <LoadingRows rows={3} /> : <SegmentBar data={empData} total={empTotal} />}
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:col-span-2">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <IconTile hue="green"><Sparkles /></IconTile>
              <div>
                <h2 className="text-sm font-semibold text-ink">Fresh picks for freshers</h2>
                <p className="text-xs text-muted">Newest postings open to freshers, interns or 0–1 years.</p>
              </div>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link to="/jobs?fresher=true">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </header>
          {recent.isPending ? (
            <LoadingRows rows={5} />
          ) : recent.isError ? (
            <ErrorState error={recent.error} className="m-4" />
          ) : recent.data.items.length === 0 ? (
            <EmptyState icon={Inbox} title="No fresher-eligible postings in this window yet">Classification is still running for part of the index. Try a wider date range or browse every opening.</EmptyState>
          ) : (
            <div className="divide-y divide-line">
              {recent.data.items.slice(0, 6).map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </section>
        <ChartFrame icon={<Database />} hue="green" title="Source distribution" description="Active postings per public ATS platform." table={<SimpleTable rows={sourceData} valueLabel="Postings" />}>
          {sources.isPending ? <LoadingRows rows={3} /> : <HBarChart data={sourceData} valueLabel="postings" />}
        </ChartFrame>
      </div>
    </div>
  );
}
