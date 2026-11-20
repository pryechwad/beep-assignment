import type { JobDetail } from '@beep/shared';
import { ArrowLeft, ArrowUpRight, Bot, FileText, Info, Quote, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EligibilityBadge, RoleBadge } from '@/components/job-card';
import { HUES, type Hue } from '@/lib/colors';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/overlay';
import { Badge, Card, CompanyMark, Meta } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useJob } from '@/hooks/queries';
import { ApiRequestError } from '@/lib/api';
import { cn, empLabel, expLabel, fmtDate, fmtDateTime, fmtRelative, locationLabel, modeLabel, roleLabel, sourceLabel } from '@/lib/format';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[0.8125rem]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right text-ink">{children ?? <span className="text-faint">Not stated</span>}</dd>
    </div>
  );
}

function SectionLabel({ icon: Icon, children, aside, hue = 'slate' }: { icon: typeof Bot; children: ReactNode; aside?: ReactNode; hue?: Hue }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md" style={{ background: HUES[hue].soft, color: HUES[hue].solid }}><Icon className="h-3.5 w-3.5" /></span>
        {children}
      </span>
      {aside}
    </div>
  );
}

const confidenceTone = { HIGH: 'success', MEDIUM: 'neutral', LOW: 'warning' } as const;

function AiPanel({ job }: { job: JobDetail }) {
  const c = job.classification;
  if (!c) {
    return (
      <Card>
        <SectionLabel icon={Bot} hue="violet">AI interpretation</SectionLabel>
        <EmptyState title="Not classified yet" className="py-8">This posting is queued for classification. Source facts on this page are already accurate.</EmptyState>
      </Card>
    );
  }
  const engine = c.method === 'MANUAL' ? 'Reviewed by a human' : c.method === 'RULES' ? 'Deterministic rules (no LLM)' : `${c.provider} · ${c.model}`;
  return (
    <Card>
      <SectionLabel icon={Bot} hue="violet" aside={<Badge tone={confidenceTone[c.confidenceLevel]}>{c.confidenceLevel.toLowerCase()} confidence</Badge>}>
        AI interpretation
      </SectionLabel>
      <div className="space-y-4 px-4 py-3.5">
        {c.summary ? (
          <p className="text-[0.8125rem] leading-relaxed text-ink-2">{c.summary}</p>
        ) : (
          <p className="text-xs text-muted">{job.llmPending ? 'A summary will appear once the AI pass runs (provider quota is shared across the index).' : 'Classified by rules only — no summary was generated for this senior role.'}</p>
        )}
        <dl className="divide-y divide-line">
          <Fact label="Role">{roleLabel(c.roleCategory)}</Fact>
          <Fact label="Experience">{expLabel(c.experienceLevel)}</Fact>
          <Fact label="Fresher-eligible">{c.isFresherEligible ? 'Yes' : 'No'}</Fact>
          {c.educationRequirement && <Fact label="Education">{c.educationRequirement}</Fact>}
        </dl>
        <div>
          <p className="mb-1 text-xs font-medium text-ink">Why</p>
          <p className="text-xs leading-relaxed text-ink-2">{c.eligibilityReasoning}</p>
          {c.eligibilityEvidence.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {c.eligibilityEvidence.map((q) => (
                <li key={q} className="flex gap-1.5 rounded-md bg-subtle px-2.5 py-1.5 text-xs text-ink-2">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-faint" aria-hidden />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          )}
          {c.eligibilityEvidence.length > 0 && <p className="mt-1 text-2xs text-muted">Quotes are verified to appear verbatim in the original posting.</p>}
        </div>
        {c.validationErrors.length > 0 && (
          <details className="rounded-md border border-line px-2.5 py-1.5 text-xs">
            <summary className="cursor-pointer text-muted">Validation notes ({c.validationErrors.length})</summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-2">
              {c.validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2">
        <Meta>{engine}</Meta>
        {c.promptVersion && (
          <Tooltip content={c.promptVersion}>
            <span>
              <Meta>prompt {c.promptVersion.split('(')[0]}</Meta>
            </span>
          </Tooltip>
        )}
        <Meta>v{c.version} · {fmtRelative(c.createdAt)}</Meta>
      </div>
    </Card>
  );
}

export default function JobDetailPage() {
  const { id = '' } = useParams();
  const q = useJob(id);

  if (q.isPending) return <LoadingRows rows={8} />;
  if (q.isError) {
    if (q.error instanceof ApiRequestError && q.error.status === 404)
      return <EmptyState icon={FileText} title="This posting isn’t in the index" action={<Button asChild size="sm"><Link to="/jobs">Back to jobs</Link></Button>}>It may have been removed by the employer or never existed.</EmptyState>;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  const job = q.data;
  const closed = job.status === 'CLOSED';
  const sf = job.sourceFacts;

  return (
    <div>
      <Link to="/jobs" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All jobs
      </Link>

      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <CompanyMark name={job.company.name} size="lg" />
          <div className="min-w-0">
            <Link to={`/jobs?company=${encodeURIComponent(job.company.name)}`} className="text-xs text-muted hover:text-ink">
              {job.company.name}
            </Link>
            <h1 className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-ink">{job.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>{locationLabel(job)}</span>
              <span className="text-faint">·</span>
              <span>{empLabel(job.employmentType)}</span>
              {modeLabel(job.workMode) && (
                <>
                  <span className="text-faint">·</span>
                  <span>{modeLabel(job.workMode)}</span>
                </>
              )}
              <RoleBadge role={job.roleCategory} />
              <EligibilityBadge job={job} />
              {closed && <Badge tone="danger">No longer listed</Badge>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
          <Button asChild variant={closed ? 'secondary' : 'accent'} size="lg">
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow">
              {closed ? 'View original posting' : 'Apply on employer site'} <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
          <span className="font-mono text-2xs text-muted">opens {new URL(job.applyUrl).hostname}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <SectionLabel icon={FileText} hue="blue" aside={<Meta>Original text · {sourceLabel(job.source.adapterType)}</Meta>}>
            Job description
          </SectionLabel>
          <div className="px-5 py-4">
            {job.descriptionHtml ? (
              <div className="prose-source" dangerouslySetInnerHTML={{ __html: job.descriptionHtml }} />
            ) : (
              <div className="prose-source whitespace-pre-line">{job.description || 'The source did not include a description.'}</div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <AiPanel job={job} />

          <Card>
            <SectionLabel icon={ShieldCheck} hue="green" aside={<Meta>Verbatim</Meta>}>
              Source facts
            </SectionLabel>
            <dl className="divide-y divide-line px-4 py-1.5">
              <Fact label="Locations">{sf.locations.length ? sf.locations.join(' · ') : null}</Fact>
              <Fact label="Employment">{sf.employmentType}</Fact>
              <Fact label="Workplace">{sf.workplaceType}</Fact>
              <Fact label="Department">{sf.department}</Fact>
              <Fact label="Compensation">{sf.compensation}</Fact>
              <Fact label="Published">{sf.publishedAt ? fmtDate(sf.publishedAt) : null}</Fact>
            </dl>
            <div className="border-t border-line px-4 py-2.5">
              <p className="mb-1.5 text-xs font-medium text-ink">Skills</p>
              <div className="flex flex-wrap gap-1">
                {job.skills.length ? (
                  job.skills.map((s) => (
                    <Tooltip key={s.name} content={s.origin === 'RULES' ? 'Matched from the skills dictionary' : 'Extracted by the AI and verified to appear in the posting'}>
                      <span>
                        <Badge tone={s.origin === 'RULES' ? 'neutral' : 'outline'} className="font-normal">
                          {s.name}
                        </Badge>
                      </span>
                    </Tooltip>
                  ))
                ) : (
                  <span className="text-xs text-faint">None detected</span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel icon={Info} hue="amber">Provenance</SectionLabel>
            <dl className="divide-y divide-line px-4 py-1.5">
              <Fact label="First discovered">{fmtDateTime(job.firstSeenAt)}</Fact>
              <Fact label="Last seen at source">{fmtDateTime(job.lastSeenAt)}</Fact>
              <Fact label="Link last verified">{job.lastVerifiedAt ? fmtDateTime(job.lastVerifiedAt) : null}</Fact>
            </dl>
            <ul className="border-t border-line px-4 py-2.5">
              {job.sources.map((s) => (
                <li key={`${s.sourceId}:${s.externalId}`} className="flex items-center justify-between gap-2 py-1 text-xs">
                  <a href={s.postingUrl} target="_blank" rel="noopener noreferrer nofollow" className={cn('truncate text-accent-ink hover:underline', s.removedAt && 'text-muted line-through')}>
                    {sourceLabel(s.adapterType)} · {new URL(s.postingUrl).hostname}
                  </a>
                  <Meta className="shrink-0">id {s.externalId.slice(0, 10)}</Meta>
                </li>
              ))}
              {job.sources.length > 1 && <li className="pt-1 text-2xs text-muted">Listed on {job.sources.length} sources — merged as one opening.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
