import { ArrowRight, Building2, Inbox, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Hero } from '@/components/hero';
import { JobCard } from '@/components/job-card';
import { LiveTaggingFeed, PipelineSteps } from '@/components/live';
import { Button } from '@/components/ui/button';
import { CompanyMark, IconTile } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCompanies, useJobs } from '@/hooks/queries';
import { fmtNumber } from '@/lib/format';

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function Home() {
  const fresh = useJobs({ fresher: true, sort: 'newest' });
  const companies = useCompanies('');

  return (
    <div className="space-y-12">
      <Hero />

      <section aria-labelledby="how">
        <SectionTitle eyebrow="How it works" title="From employer job boards to your shortlist — automatically" />
        <PipelineSteps />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="min-w-0 lg:col-span-3" aria-label="Fresher-friendly openings">
          <SectionTitle
            eyebrow="Open now"
            title="Fresh picks for freshers"
            action={<Button asChild variant="ghost" size="sm"><Link to="/jobs?fresher=true">See all <ArrowRight className="h-3.5 w-3.5" /></Link></Button>}
          />
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {fresh.isPending ? (
              <LoadingRows rows={5} />
            ) : fresh.isError ? (
              <ErrorState error={fresh.error} className="m-4" />
            ) : fresh.data.items.length === 0 ? (
              <EmptyState icon={Inbox} title="No fresher-eligible postings classified yet" />
            ) : (
              <div className="divide-y divide-line">
                {fresh.data.items.slice(0, 5).map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="min-w-0 lg:col-span-2" aria-label="Live AI tagging">
          <SectionTitle eyebrow="Happening now" title="Watch the AI work" />
          <LiveTaggingFeed limit={7} />
        </section>
      </div>

      <section aria-label="Companies hiring">
        <SectionTitle
          eyebrow="Who’s hiring"
          title="Companies with open roles in India"
          action={<Button asChild variant="ghost" size="sm"><Link to="/companies">All companies <ArrowRight className="h-3.5 w-3.5" /></Link></Button>}
        />
        {companies.isPending ? (
          <LoadingRows rows={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(companies.data?.items ?? []).slice(0, 12).map((c) => (
              <Link key={c.id} to={`/jobs?company=${encodeURIComponent(c.name)}`} className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
                <CompanyMark name={c.name} />
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-semibold text-ink group-hover:text-accent-ink">{c.name}</p>
                  <p className="text-2xs text-muted">{fmtNumber(c.activeJobs)} open{c.fresherJobs ? ` · ${c.fresherJobs} fresher` : ''}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl px-6 py-8 text-white sm:px-10" style={{ background: 'linear-gradient(120deg, #2346C9 0%, #315CF5 45%, #7C5CE6 100%)' }}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconTile hue="blue" className="bg-white/15 text-white"><Sparkles /></IconTile>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Every posting links to the employer’s own page.</h2>
              <p className="mt-1 max-w-xl text-sm text-white/80">We never repost or rewrite applications — search here, apply at the source.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="lg" className="bg-white text-accent-ink hover:bg-white/90"><Link to="/jobs">Open job portal</Link></Button>
            <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white"><Link to="/companies"><Building2 className="h-4 w-4" /> Companies</Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
