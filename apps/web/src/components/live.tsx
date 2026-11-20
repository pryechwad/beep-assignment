import type { LiveActivity } from '@beep/shared';
import { useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, Clock, Filter, GitMerge, Globe, RefreshCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { HUES, type Hue } from '@/lib/colors';
import { cn, fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { RoleBadge } from './job-card';
import { Popover, PopoverContent, PopoverTrigger } from './ui/overlay';
import { GradientTile, type Tone } from './showcase';
import { CompanyMark, HueBadge, IconTile, Skeleton } from './ui/primitives';

const HUE_TONE: Record<Hue, Tone> = { blue: 'blue', violet: 'violet', teal: 'cyan', rose: 'rose', orange: 'orange', amber: 'amber', green: 'emerald', slate: 'indigo' };

/** Live pipeline state. Polled (never cached server-side), so it shows up in the browser's Network tab. */
export function useLiveActivity(intervalMs = 10_000) {
  return useQuery({
    queryKey: ['live', 'activity'],
    queryFn: ({ signal }) => api.get<LiveActivity>('/live/activity', undefined, signal),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** Re-render every `ms` so "x seconds ago" labels stay current between polls. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const STATUS: Record<LiveActivity['pipeline']['status'], { label: string; hue: Hue }> = {
  running: { label: 'Syncing now', hue: 'blue' },
  idle: { label: 'Live', hue: 'green' },
  degraded: { label: 'Degraded', hue: 'amber' },
  offline: { label: 'Workers offline', hue: 'rose' },
};

/** Navbar pill: pulsing status dot + time since last poll; popover with pipeline details. */
export function LiveSyncPill() {
  const q = useLiveActivity(10_000);
  const now = useNow();
  if (!q.data) return <Skeleton className="h-8 w-28 rounded-full" />;
  const d = q.data;
  const s = STATUS[d.pipeline.status];
  const h = HUES[s.hue];
  const secs = Math.max(0, Math.round((now - q.dataUpdatedAt) / 1000));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-8 items-center gap-2 rounded-full border bg-surface pl-2.5 pr-3 text-xs font-medium shadow-card hover:shadow-pop" style={{ borderColor: h.ring, color: h.ink }} aria-label={`Data sync status: ${s.label}`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: h.solid }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: h.solid }} />
          </span>
          {s.label}
          <span className="hidden font-normal text-muted sm:inline">· {secs}s ago</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Data pipeline</p>
          <p className="text-xs text-muted">Polled from the API every 10 s · server time {fmtDateTime(d.serverTime)}</p>
        </div>
        <dl className="divide-y divide-line px-4 text-xs">
          {[
            ['Last collection', d.pipeline.lastRun ? `${d.pipeline.lastRun.status.toLowerCase()} · ${fmtRelative(d.pipeline.lastRun.finishedAt ?? d.pipeline.lastRun.startedAt)}` : 'never'],
            ['Sources synced', d.pipeline.lastRun ? `${d.pipeline.lastRun.sourcesSucceeded} / ${d.pipeline.lastRun.sourcesTotal}` : '—'],
            ['Next automatic run', d.pipeline.nextScheduledRunAt ? fmtDateTime(d.pipeline.nextScheduledRunAt) : 'scheduler offline'],
            ['AI-tagged postings', `${fmtNumber(d.ai.llmTagged)} of ${fmtNumber(d.ai.total)}`],
            ['Waiting for AI tagging', fmtNumber(d.ai.pending + d.queues.classify)],
            ['Workers · scheduler', `${d.pipeline.workers} · ${d.pipeline.scheduler ? 'running' : 'offline'}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-line px-4 py-2.5 text-2xs text-muted">AI models: {d.pipeline.aiModels.length ? d.pipeline.aiModels.join(', ') : 'none available right now'}</div>
      </PopoverContent>
    </Popover>
  );
}

/** "How it works" with live numbers on every step. */
export function PipelineSteps() {
  const q = useLiveActivity(10_000);
  const d = q.data;
  const run = d?.pipeline.lastRun;
  const steps: { icon: JSX.Element; hue: Hue; title: string; value: string; detail: string }[] = [
    { icon: <Globe />, hue: 'blue', title: 'Collect', value: run ? fmtNumber(run.jobsFetched) : '—', detail: run ? `postings read from ${run.sourcesTotal} public career boards` : 'waiting for first run' },
    { icon: <Filter />, hue: 'rose', title: 'Filter to India', value: d ? fmtNumber(d.dedup.rawRecords) : '—', detail: 'source records located in India (non-India dropped)' },
    { icon: <GitMerge />, hue: 'orange', title: 'De-duplicate', value: d ? fmtNumber(d.dedup.uniqueJobs) : '—', detail: d ? `unique openings · ${fmtNumber(d.dedup.merged)} copies merged · ${fmtNumber(d.dedup.flaggedForReview)} near-duplicates sent to review` : '' },
    { icon: <Bot />, hue: 'violet', title: 'AI tagging', value: d ? fmtNumber(d.ai.llmTagged) : '—', detail: d ? `tagged by LLM · ${fmtNumber(d.ai.pending + d.queues.classify)} in the queue` : '' },
    { icon: <RefreshCcw />, hue: 'green', title: 'Daily refresh', value: d?.pipeline.nextScheduledRunAt ? new Date(d.pipeline.nextScheduledRunAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—', detail: 'next automatic run (IST), no one presses a button' },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((s, i) => (
        <li key={s.title} className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-900/[0.04] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex items-center justify-between">
            <GradientTile tone={HUE_TONE[s.hue]} size="sm" className="transition-transform duration-300 group-hover:scale-110">{s.icon}</GradientTile>
            <span className="text-2xs font-semibold text-faint">STEP {i + 1}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{s.title}</p>
          {q.isPending ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="mt-0.5 text-2xl font-bold tracking-tight tabular" style={{ color: HUES[s.hue].ink }}>{s.value}</p>}
          <p className="mt-1 text-xs leading-snug text-muted">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}

/** Feed of the latest AI-tagged postings; new rows highlight as they arrive. */
export function LiveTaggingFeed({ limit = 8 }: { limit?: number }) {
  const q = useLiveActivity(5_000);
  useNow(5000);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!q.data) return;
    const ids = q.data.feed.map((f) => f.id);
    if (seen.current) {
      const added = ids.filter((id) => !seen.current!.has(id));
      if (added.length) setFresh(new Set(added));
    }
    seen.current = new Set(ids);
  }, [q.data]);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <IconTile hue="violet"><Bot /></IconTile>
          <div>
            <h2 className="text-sm font-semibold text-ink">AI tagging — live</h2>
            <p className="text-xs text-muted">Each posting tagged with a role and city by an LLM, checked against the original text.</p>
          </div>
        </div>
        {q.data && <HueBadge hue="violet" dot>{fmtNumber(q.data.ai.taggedLastHour)} in the last hour</HueBadge>}
      </header>
      {q.isPending ? (
        <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !q.data?.feed.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No AI-tagged postings yet — the worker will start tagging as soon as an AI provider is available.</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.feed.slice(0, limit).map((f) => (
            <li key={f.id} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors duration-1000', fresh.has(f.id) && 'bg-[#F3EFFE]')}>
              <CompanyMark name={f.company} size="sm" />
              <div className="min-w-0 flex-1">
                <Link to={`/jobs/${f.jobId}`} className="block truncate text-[0.8125rem] font-medium text-ink hover:text-accent-ink">{f.title}</Link>
                <p className="truncate text-2xs text-muted">{f.company}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <RoleBadge role={f.role} />
                <HueBadge hue="rose">{f.city ?? 'City not stated'}</HueBadge>
              </div>
              <span className="w-16 shrink-0 text-right text-2xs text-muted">
                <Clock className="mr-0.5 inline h-3 w-3" aria-hidden />{fmtRelative(f.at).replace(' ago', '')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.data && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-2xs text-muted">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" style={{ color: HUES.green.solid }} /> Model: {q.data.feed[0]?.model ?? '—'} · refreshes every 5 s</span>
          <span>Badge colour = field (Engineering, Data & AI, …)</span>
        </footer>
      )}
    </section>
  );
}
