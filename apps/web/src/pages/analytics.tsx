import type { RoleCategory } from '@beep/shared';
import { BarChart3, GraduationCap, Layers, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HUES, employmentHue, roleHue } from '@/lib/colors';
import { ChartFrame, HBarChart, SegmentBar, SimpleTable, type BarDatum } from '@/components/charts/charts';
import { PageHeader } from '@/components/layout';
import { Card, CardHeader } from '@/components/ui/primitives';
import { DataTable, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCities, useEmployment, useExperience, useOverview, useRoles } from '@/hooks/queries';
import { fmtNumber, fmtPct } from '@/lib/format';

export default function Analytics() {
  const navigate = useNavigate();
  const roles = useRoles();
  const cities = useCities();
  const experience = useExperience();
  const employment = useEmployment();
  const overview = useOverview();

  const roleRows = roles.data?.items ?? [];
  const EXP_COLORS: Record<string, string> = { INTERNSHIP: HUES.violet.solid, FRESHER: HUES.green.solid, ZERO_TO_ONE: HUES.teal.solid, ONE_TO_TWO: HUES.blue.solid, EXPERIENCED: HUES.orange.solid, UNKNOWN: HUES.slate.ring };
  const expData: BarDatum[] = (experience.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, color: EXP_COLORS[r.key] }));
  const expTotal = expData.reduce((n, d) => n + d.value, 0);
  const freshRole: BarDatum[] = roleRows.filter((r) => r.fresher > 0).sort((a, b) => b.fresher - a.fresher).map((r) => ({ key: r.key, label: r.label, value: r.fresher, secondary: r.count, color: HUES[roleHue(r.key as RoleCategory)].solid }));
  const freshCity: BarDatum[] = (cities.data?.items ?? []).filter((r) => r.fresher > 0).sort((a, b) => b.fresher - a.fresher).map((r) => ({ key: r.key, label: r.label, value: r.fresher, secondary: r.count }));
  const cls = overview.data?.classification;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunity analytics"
        description="Where early-career openings concentrate, computed from classified active postings. Every figure is a live count — nothing is projected or estimated."
      />
      {cls && (
        <p className="text-xs text-muted">
          Coverage: {fmtNumber(cls.classified)} of {fmtNumber(cls.classified + cls.unclassified)} active postings classified ({fmtPct(cls.classified + cls.unclassified ? (cls.classified / (cls.classified + cls.unclassified)) * 100 : null)}). Role and experience charts describe that subset.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame icon={<Layers />} hue="blue" title="Fresher-eligible openings by role" description="Bars show fresher-eligible postings; total postings in the tooltip." table={<SimpleTable rows={freshRole} valueLabel="Fresher-eligible" secondaryLabel="All postings" />}>
          {roles.isPending ? <LoadingRows /> : roles.isError ? <ErrorState error={roles.error} /> : <HBarChart data={freshRole} valueLabel="fresher-eligible" secondaryLabel="postings in total" onSelect={(d) => navigate(`/jobs?role=${d.key}&fresher=true`)} />}
        </ChartFrame>
        <ChartFrame icon={<MapPin />} hue="rose" title="Fresher-eligible openings by city" description="Bars show fresher-eligible postings; total postings in the tooltip." table={<SimpleTable rows={freshCity} valueLabel="Fresher-eligible" secondaryLabel="All postings" />}>
          {cities.isPending ? <LoadingRows /> : cities.isError ? <ErrorState error={cities.error} /> : <HBarChart data={freshCity} color={HUES.rose.solid} valueLabel="fresher-eligible" secondaryLabel="postings in total" onSelect={(d) => navigate(`/jobs?city=${encodeURIComponent(d.key)}&fresher=true`)} />}
        </ChartFrame>
        <ChartFrame icon={<GraduationCap />} hue="violet" title="Experience required" description="Classified experience band across active postings." table={<SimpleTable rows={expData} valueLabel="Postings" />}>
          {experience.isPending ? <LoadingRows /> : <SegmentBar data={expData} total={expTotal} />}
        </ChartFrame>
        <ChartFrame icon={<BarChart3 />} hue="teal" title="Employment type" description="As stated by the source or title; “not stated” is shown, not guessed." table={<SimpleTable rows={(employment.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count }))} valueLabel="Postings" />}>
          {employment.isPending ? <LoadingRows /> : <HBarChart data={[...(employment.data?.items ?? []).map((r) => ({ key: r.key, label: r.label, value: r.count, color: HUES[employmentHue(r.key as never)].solid })), ...(employment.data?.unknown ? [{ key: 'UNKNOWN', label: 'Not stated', value: employment.data.unknown, color: HUES.slate.ring }] : [])]} valueLabel="postings" />}
        </ChartFrame>
      </div>
      <Card>
        <CardHeader title="Role breakdown" description="Share of each role that is open to freshers." />
        {roles.isPending ? (
          <LoadingRows />
        ) : (
          <DataTable
            caption="Role breakdown"
            rows={roleRows}
            rowKey={(r) => r.key}
            onRowClick={(r) => navigate(`/jobs?role=${r.key}`)}
            columns={[
              { key: 'role', header: 'Role', cell: (r) => <span className="inline-flex items-center gap-2 font-medium text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: HUES[roleHue(r.key as RoleCategory)].solid }} aria-hidden />{r.label}</span> },
              { key: 'total', header: 'Active postings', align: 'right', cell: (r) => fmtNumber(r.count) },
              { key: 'fresher', header: 'Fresher-eligible', align: 'right', cell: (r) => fmtNumber(r.fresher) },
              { key: 'share', header: 'Fresher share', align: 'right', cell: (r) => fmtPct(r.count ? (r.fresher / r.count) * 100 : null) },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
