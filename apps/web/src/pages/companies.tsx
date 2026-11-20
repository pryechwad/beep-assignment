import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Badge, Card, CompanyMark, HueBadge, SearchInput } from '@/components/ui/primitives';
import { HUES, roleHue } from '@/lib/colors';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCompanies } from '@/hooks/queries';
import { fmtNumber, roleLabel, sourceLabel } from '@/lib/format';

export default function Companies() {
  const [q, setQ] = useState('');
  const companies = useCompanies(q.trim());
  return (
    <div>
      <PageHeader title="Companies" description="Employers whose public job boards are indexed, ranked by active openings in India." actions={<SearchInput value={q} onValueChange={setQ} placeholder="Find a company" aria-label="Find a company" className="w-64" />} />
      {companies.isPending ? (
        <Card><LoadingRows rows={8} /></Card>
      ) : companies.isError ? (
        <ErrorState error={companies.error} onRetry={() => void companies.refetch()} />
      ) : companies.data.items.length === 0 ? (
        <Card><EmptyState icon={Building2} title={q ? `No company matches “${q}”` : 'No companies indexed yet'} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {companies.data.items.map((c) => (
            <Card key={c.id} className="flex min-w-0 flex-col rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
              <div className="flex min-w-0 items-start gap-3">
                <CompanyMark name={c.name} website={c.website} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[0.9375rem] font-bold text-ink">{c.name}</h2>
                  <p className="truncate text-xs text-muted">{c.cities.length ? c.cities.join(' · ') : 'Location varies'}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {c.sources.map((s) => (
                    <Badge key={s} tone="outline" className="font-mono text-[0.625rem]">{sourceLabel(s)}</Badge>
                  ))}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {([
                  ['Active', c.activeJobs, 'blue'],
                  ['Fresher', c.fresherJobs, 'green'],
                  ['Interns', c.internships, 'violet'],
                ] as const).map(([label, v, hue]) => (
                  <div key={label} className="rounded-lg px-2.5 py-2" style={{ background: HUES[hue].soft }}>
                    <dt className="text-2xs font-medium" style={{ color: HUES[hue].ink }}>{label}</dt>
                    <dd className="text-lg font-bold tabular" style={{ color: HUES[hue].ink }}>{fmtNumber(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {c.topRoles.map((r) => (
                  <HueBadge key={r.role} hue={roleHue(r.role)} dot>{roleLabel(r.role)} · {r.count}</HueBadge>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs">
                <Link to={`/jobs?company=${encodeURIComponent(c.name)}`} className="font-medium text-accent-ink hover:underline">View openings →</Link>
                {c.fresherJobs > 0 && <Link to={`/jobs?company=${encodeURIComponent(c.name)}&fresher=true`} className="text-muted hover:text-ink">Fresher roles</Link>}
                {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted hover:text-ink">Website ↗</a>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
