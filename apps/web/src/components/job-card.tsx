import type { JobListItem } from '@beep/shared';
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { employmentHue, roleHue, workModeHue } from '@/lib/colors';
import { cn, empLabel, expLabel, fmtRelative, locationLabel, modeLabel, roleLabel, sourceLabel } from '@/lib/format';
import { Badge, CompanyMark, HueBadge } from './ui/primitives';
import { Tooltip } from './ui/overlay';

export function EligibilityBadge({ job }: { job: Pick<JobListItem, 'isFresherEligible' | 'experienceLevel'> }) {
  if (job.experienceLevel === 'INTERNSHIP') return <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 text-2xs font-semibold leading-5 text-indigo-700 ring-1 ring-inset ring-indigo-100">Internship</span>;
  if (job.isFresherEligible)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 text-2xs font-semibold leading-5 text-emerald-700 ring-1 ring-inset ring-emerald-100">
        <Sparkles className="h-3 w-3" aria-hidden /> Fresher-friendly
      </span>
    );
  if (job.isFresherEligible === null) return <Badge tone="outline">Not yet classified</Badge>;
  return null;
}

export function RoleBadge({ role }: { role: JobListItem['roleCategory'] }) {
  if (!role) return null;
  return (
    <HueBadge hue={roleHue(role)} dot>
      {roleLabel(role)}
    </HueBadge>
  );
}

/** Job row used in the explorer and dashboard. */
export function JobCard({ job, compact = false }: { job: JobListItem; compact?: boolean }) {
  const mode = modeLabel(job.workMode);
  const exp = job.experienceLevel && job.experienceLevel !== 'INTERNSHIP' && job.experienceLevel !== 'UNKNOWN' ? expLabel(job.experienceLevel) : null;
  return (
    <article className={cn('group relative flex gap-3.5 px-4 transition-colors hover:bg-slate-50/70', compact ? 'py-3' : 'py-4')}>
      <span className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-accent transition-transform duration-200 group-hover:scale-y-100" aria-hidden />
      <CompanyMark name={job.company.name} website={job.company.website} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted">{job.company.name}</p>
            <h3 className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-ink">
              <Link to={`/jobs/${job.id}`} className="after:absolute after:inset-0 focus-visible:outline-none group-hover:text-accent-ink">
                {job.title}
              </Link>
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <EligibilityBadge job={job} />
            {job.confidenceLevel === 'LOW' && (
              <Tooltip content="Low-confidence classification — queued for human review. Check the original posting.">
                <span className="relative z-10">
                  <Badge tone="warning">Low confidence</Badge>
                </span>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          <span className="mr-1 inline-flex items-center gap-1 font-medium">
            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {locationLabel(job)}
          </span>
          <RoleBadge role={job.roleCategory} />
          {job.employmentType && job.experienceLevel !== 'INTERNSHIP' && <HueBadge hue={employmentHue(job.employmentType)}>{empLabel(job.employmentType)}</HueBadge>}
          {mode && <HueBadge hue={workModeHue(job.workMode)}>{mode}</HueBadge>}
          {exp && <HueBadge hue="slate">{exp}</HueBadge>}
        </div>
        {!compact && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {job.topSkills.map((s) => (
                <span key={s} className="rounded-md border border-line bg-surface px-1.5 text-2xs leading-5 text-ink-2">
                  {s}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-2 text-2xs text-muted">
              <span>{job.publishedAt ? `Posted ${fmtRelative(job.publishedAt)}` : `Found ${fmtRelative(job.firstSeenAt)}`}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-0.5 font-medium text-ink-2">
                {sourceLabel(job.source.adapterType)}
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </span>
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
