import type { LiveActivity, RoleCategory } from '@beep/shared';
import { Bot, CheckCircle2, Globe, Radar, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HUES, roleHue } from '@/lib/colors';
import { cn, fmtNumber, fmtRelative, roleLabel, sourceLabel } from '@/lib/format';
import { useLiveActivity } from './live';
import { NavyBackdrop } from './showcase';
import { CompanyMark } from './ui/primitives';

type ScoutEvent =
  | { kind: 'scan'; id: string; at: string; company: string; website: string | null; platform: string; fetched: number; india: number; newJobs: number; status: string }
  | { kind: 'tag'; id: string; at: string; jobId: string; company: string; website: string | null; title: string; role: RoleCategory; city: string | null; model: string | null };

/** Merge the latest board scans and AI tags into one time-ordered event stream. */
function buildEvents(d: LiveActivity): ScoutEvent[] {
  const scans: ScoutEvent[] = d.scans
    .filter((s) => s.finishedAt)
    .map((s) => ({ kind: 'scan', id: `scan-${s.source}-${s.finishedAt}`, at: s.finishedAt!, company: s.company ?? s.source, website: s.companyWebsite, platform: s.platform, fetched: s.fetched, india: s.india, newJobs: s.newJobs, status: s.status }));
  const tags: ScoutEvent[] = d.feed.map((f) => ({ kind: 'tag', id: f.id, at: f.at, jobId: f.jobId, company: f.company, website: f.companyWebsite, title: f.title, role: f.role, city: f.city, model: f.model }));
  // Newest tags first, at most two per company so one employer doesn't flood the stream;
  // board scans (from the morning sweep) are interleaved every third row so both kinds of
  // scouting stay visible. Each row still shows its own true timestamp.
  const perCo = new Map<string, number>();
  const variedTags = tags
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((t) => {
      const n = perCo.get(t.company) ?? 0;
      perCo.set(t.company, n + 1);
      return n < 2;
    });
  const sortedScans = [...scans].sort((a, b) => b.at.localeCompare(a.at) || (b.kind === 'scan' && a.kind === 'scan' ? b.india - a.india : 0));
  const out: ScoutEvent[] = [];
  let si = 0;
  variedTags.forEach((t, i) => {
    out.push(t);
    if (i % 2 === 1 && si < sortedScans.length) out.push(sortedScans[si++]!);
  });
  while (si < sortedScans.length) out.push(sortedScans[si++]!);
  return out;
}

function EventRow({ e, fresh }: { e: ScoutEvent; fresh: boolean }) {
  if (e.kind === 'scan') {
    return (
      <li className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]', fresh ? 'animate-scout-in bg-indigo-400/10' : 'bg-white/[0.03]')}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300"><Globe className="size-3.5" /></span>
        <CompanyMark name={e.company} website={e.website} size="sm" />
        <p className="min-w-0 flex-1 truncate text-[13px] text-slate-300">
          Scanned <span className="font-medium text-white">{e.company}</span> on {sourceLabel(e.platform as never)} —{' '}
          <span className="text-white tabular">{fmtNumber(e.fetched)}</span> postings, <span className="text-emerald-300 tabular">{fmtNumber(e.india)}</span> in India
        </p>
        <span className="shrink-0 font-mono text-[11px] text-slate-500">{fmtRelative(e.at).replace(' ago', '')}</span>
      </li>
    );
  }
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]', fresh ? 'animate-scout-in bg-indigo-400/10' : 'bg-white/[0.03]')}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Bot className="size-3.5" /></span>
      <CompanyMark name={e.company} website={e.website} size="sm" />
      <div className="min-w-0 flex-1">
        <Link to={`/jobs/${e.jobId}`} className="block truncate text-[13px] font-medium text-white hover:text-indigo-200">{e.title}</Link>
        <p className="truncate text-[11px] text-slate-400">
          <span className="text-slate-500">tagged →</span>{' '}
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: HUES[roleHue(e.role)].solid }} />{roleLabel(e.role)}</span>
          {' · '}
          {e.city ?? 'city not stated'} · {e.company}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-slate-500">{fmtRelative(e.at).replace(' ago', '')}</span>
    </li>
  );
}

/** Live, animated view of the AI scout: board scans and AI tags as they happen. */
export function ScoutConsole({ rows = 7, compact = false }: { rows?: number; compact?: boolean }) {
  const q = useLiveActivity(5_000);
  const d = q.data;
  const events = useMemo(() => (d ? buildEvents(d) : []), [d]);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!events.length) return;
    const ids = events.map((e) => e.id);
    if (seen.current) setFresh(new Set(ids.filter((id) => !seen.current!.has(id))));
    seen.current = new Set(ids);
  }, [events]);

  const working = !!d && (d.pipeline.status === 'running' || d.ai.pending + d.queues.classify > 0);
  const progress = d && d.ai.total ? (d.ai.llmTagged / d.ai.total) * 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0b1120] text-white shadow-[0_30px_80px_-30px_rgb(15_23_42/0.55)] ring-1 ring-white/10">
      <NavyBackdrop />
      {working && <div className="scan-line" />}
      <div className="relative">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={cn('flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20', working && 'animate-pulse')}><Radar className="size-4" /></span>
            <div>
              <p className="text-sm font-semibold">AI Scout</p>
              <p className="text-[11px] text-slate-400">{!d ? 'connecting…' : working ? 'scanning boards & tagging postings' : 'idle · next sweep at 06:30 IST'}</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
          </span>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>AI tagging progress</span>
            <span className="tabular text-slate-300">{d ? `${fmtNumber(d.ai.llmTagged)} / ${fmtNumber(d.ai.total)}` : '—'}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <ul className={cn('space-y-1.5 p-3', compact ? 'max-h-[19rem] overflow-hidden' : '')}>
          {!d && Array.from({ length: rows }, (_, i) => <li key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}
          {events.slice(0, rows).map((e) => <EventRow key={e.id} e={e} fresh={fresh.has(e.id)} />)}
        </ul>

        {d && (
          <div className="grid grid-cols-3 border-t border-white/[0.07] text-center">
            {[
              ['Boards scanned', `${d.pipeline.lastRun?.sourcesSucceeded ?? 0}/${d.pipeline.lastRun?.sourcesTotal ?? 0}`],
              ['Tagged · last hour', fmtNumber(d.ai.taggedLastHour)],
              ['Waiting for AI', fmtNumber(d.ai.pending + d.queues.classify)],
            ].map(([k, v]) => (
              <div key={k} className="py-3">
                <div className="text-sm font-semibold tabular">{v}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Board-by-board result grid from the latest sweep. */
export function ScanGrid() {
  const q = useLiveActivity(10_000);
  const scans = [...(q.data?.scans ?? [])].sort((a, b) => b.india - a.india);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {scans.map((s) => (
        <div key={s.source} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
          <CompanyMark name={s.company ?? s.source} website={s.companyWebsite} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{s.company ?? s.source}</p>
            <p className="text-xs text-slate-500">{sourceLabel(s.platform as never)} · <span className="tabular">{fmtNumber(s.india)}</span> in India</p>
          </div>
          {s.status === 'SUCCEEDED' ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Scanned" /> : <Sparkles className="size-4 shrink-0 text-amber-500" aria-label={s.status} />}
        </div>
      ))}
    </div>
  );
}
