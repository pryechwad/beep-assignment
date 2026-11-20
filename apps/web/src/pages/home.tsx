import { ArrowRight, Bot, Building2, Filter, GitMerge, Inbox, MapPin, RefreshCcw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Hero } from '@/components/hero';
import { JobCard } from '@/components/job-card';
import { PipelineSteps } from '@/components/live';
import { GradientTile, Panel, ShareRow, type Tone } from '@/components/showcase';
import { CompanyMark } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCities, useCompanies, useJobs, useOverview } from '@/hooks/queries';
import { curate } from '@/lib/curate';
import { fmtNumber } from '@/lib/format';
import { NavyBackdrop } from '@/components/showcase';

function SectionTitle({ eyebrow, title, subtitle, action, center }: { eyebrow: string; title: string; subtitle?: string; action?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto mb-8 max-w-2xl text-center' : 'mb-6 flex flex-wrap items-end justify-between gap-3'}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-slate-900 sm:text-[1.875rem]">{title}</h2>
        {subtitle && <p className="mt-2 text-[0.9375rem] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const FEATURES: { tone: Tone; icon: ReactNode; title: string; body: string }[] = [
  { tone: 'blue', icon: <Search />, title: 'Search that understands jobs', body: 'Full-text search across titles, skills and descriptions, with filters for role, city, experience, work mode and date.' },
  { tone: 'violet', icon: <Bot />, title: 'AI tags every posting', body: 'An LLM labels role and city; every quote it gives is checked against the original posting before it’s shown.' },
  { tone: 'emerald', icon: <Sparkles />, title: 'Built for freshers', body: 'Internships, “freshers welcome” and 0–1 year roles are found and prioritised, with the reasoning shown on each job.' },
  { tone: 'orange', icon: <GitMerge />, title: 'No duplicates', body: 'Copies across sources are merged into one opening; near-identical listings go to a human review queue.' },
  { tone: 'cyan', icon: <RefreshCcw />, title: 'Fresh every morning', body: 'A scheduler re-collects every source at 06:30 IST and closes roles the employer has taken down.' },
  { tone: 'rose', icon: <ShieldCheck />, title: 'Straight from employers', body: 'Only official public job boards — no scraping behind logins. Apply links always open the company’s own page.' },
];

export default function Home() {
  const fresh = useJobs({ fresher: true, sort: 'newest', pageSize: 50 });
  const picks = curate(fresh.data?.items ?? [], 5, (j) => ({ company: j.company.name, role: j.roleCategory }));
  const companies = useCompanies('');
  const overview = useOverview();
  const cities = useCities();
  const t = overview.data?.totals;
  const cityItems = (cities.data?.items ?? []).slice(0, 7);
  const cityTotal = (cities.data?.items ?? []).reduce((n, c) => n + c.count, 0);

  return (
    <div className="space-y-16">
      <Hero />

      <section aria-label="Index at a glance" className="grid grid-cols-2 divide-slate-200/80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:grid-cols-4 sm:divide-x">
        {[
          ['Open roles', t?.activeJobs, 'from-blue-600 to-indigo-600'],
          ['Fresher-friendly', t?.fresherEligible, 'from-emerald-500 to-teal-600'],
          ['Companies', t?.companies, 'from-orange-500 to-rose-500'],
          ['Cities', t?.cities, 'from-violet-600 to-purple-600'],
        ].map(([label, value, grad]) => (
          <div key={label as string} className="px-6 py-7 text-center" data-grad={grad as string}>
            <div className="text-4xl font-semibold tracking-tight text-slate-900 tabular sm:text-[2.75rem]">{value === undefined ? '—' : fmtNumber(value as number)}</div>
            <div className="mt-1 text-sm text-slate-500">{label as string}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="features">
        <SectionTitle center eyebrow="Why beep.jobs" title="Everything a fresher needs to find real openings" subtitle="One place for early-career roles across India — cleaned, tagged and kept up to date automatically." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_12px_32px_-16px_rgb(15_23_42/0.2)]">
              <GradientTile tone={f.tone} className="mb-5">{f.icon}</GradientTile>
              <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how">
        <SectionTitle center eyebrow="How it works" title="From employer job boards to your shortlist" subtitle="Live numbers from the running pipeline — no one presses a button." />
        <PipelineSteps />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-label="Fresher-friendly openings">
          <SectionTitle eyebrow="Open now" title="Fresh picks for freshers" action={<Link to="/jobs?fresher=true" className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">See all <ArrowRight className="size-4" /></Link>} />
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
            {fresh.isPending ? <LoadingRows rows={5} /> : fresh.isError ? <ErrorState error={fresh.error} className="m-4" /> : picks.length === 0 ? <EmptyState icon={Inbox} title="No fresher-eligible postings classified yet" /> : (
              <div className="divide-y divide-slate-100">
                {picks.map((j) => <JobCard key={j.id} job={j} />)}
              </div>
            )}
          </div>
        </section>
        <section className="min-w-0" aria-label="Top hiring cities">
          <SectionTitle eyebrow="Where" title="Top hiring cities" />
          <Panel title="Open roles by city" icon={<GradientTile tone="rose" size="sm"><MapPin /></GradientTile>}>
            {cities.isPending ? <LoadingRows rows={6} /> : (
              <div className="space-y-4">
                {cityItems.map((c) => (
                  <Link key={c.key} to={`/jobs?city=${encodeURIComponent(c.key)}`} className="block rounded-lg transition hover:bg-slate-50">
                    <ShareRow label={c.label} count={c.count} total={cityTotal} tone="rose" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>

      <section aria-label="Companies hiring">
        <SectionTitle eyebrow="Who’s hiring" title="Companies with open roles in India" action={<Link to="/companies" className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">All companies <ArrowRight className="size-4" /></Link>} />
        {companies.isPending ? <LoadingRows rows={2} /> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {(companies.data?.items ?? []).slice(0, 12).map((c) => (
              <Link key={c.id} to={`/jobs?company=${encodeURIComponent(c.name)}`} className="group flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 text-center shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-all hover:border-slate-300 hover:shadow-[0_12px_32px_-16px_rgb(15_23_42/0.2)]">
                <CompanyMark name={c.name} website={c.website} size="lg" />
                <p className="w-full truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{c.name}</p>
                <p className="text-xs text-slate-500">{fmtNumber(c.activeJobs)} open{c.fresherJobs ? ` · ${c.fresherJobs} fresher` : ''}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#0b1120] px-6 py-14 text-center text-white ring-1 ring-white/5 sm:px-12">
        <NavyBackdrop />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Start with roles that actually want freshers.</h2>
          <p className="mt-3 text-slate-300">{t ? `${fmtNumber(t.activeJobs)} live openings from ${fmtNumber(t.companies)} companies, refreshed every morning.` : 'Live openings, refreshed every morning.'}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/jobs?fresher=true" className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"><Sparkles className="size-4" /> Browse fresher jobs</Link>
            <Link to="/insights" className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-6 py-3 text-sm font-semibold ring-1 ring-inset ring-white/15 transition hover:bg-white/[0.14]"><Filter className="size-4" /> See market insights</Link>
            <Link to="/companies" className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-6 py-3 text-sm font-semibold ring-1 ring-inset ring-white/15 transition hover:bg-white/[0.14]"><Building2 className="size-4" /> Companies</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
