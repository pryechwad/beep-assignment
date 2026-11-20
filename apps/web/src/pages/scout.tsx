import { Bot, Clock3, Globe, Layers } from 'lucide-react';
import { useLiveActivity } from '@/components/live';
import { ScanGrid, ScoutConsole } from '@/components/scout';
import { MetricCard } from '@/components/showcase';
import { fmtDateTime, fmtNumber, fmtPct } from '@/lib/format';

export default function Scout() {
  const q = useLiveActivity(5_000);
  const d = q.data;
  const run = d?.pipeline.lastRun;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-600">Live</p>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight text-slate-900">AI Scout</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">The scout sweeps every public job board each morning, keeps only roles located in India, and an LLM tags each posting with a role and city. Everything below updates live.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard tone="blue" icon={<Globe />} label="Boards in the last sweep" value={run ? `${run.sourcesSucceeded}/${run.sourcesTotal}` : '—'} note={run ? `${fmtNumber(run.jobsFetched)} postings read` : undefined} loading={!d} />
        <MetricCard tone="emerald" icon={<Layers />} label="India openings" value={fmtNumber(d?.dedup.uniqueJobs)} note={d ? `${fmtNumber(d.dedup.flaggedForReview)} near-duplicates sent to review` : undefined} loading={!d} />
        <MetricCard tone="violet" icon={<Bot />} label="Tagged by AI" value={fmtNumber(d?.ai.llmTagged)} meter={d && d.ai.total ? (d.ai.llmTagged / d.ai.total) * 100 : null} note={d ? `${fmtPct(d.ai.total ? (d.ai.llmTagged / d.ai.total) * 100 : null)} done · ${fmtNumber(d.ai.taggedLastHour)} in the last hour` : undefined} loading={!d} />
        <MetricCard tone="amber" icon={<Clock3 />} label="Next automatic sweep" value={d?.pipeline.nextScheduledRunAt ? new Date(d.pipeline.nextScheduledRunAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'} note={d?.pipeline.nextScheduledRunAt ? fmtDateTime(d.pipeline.nextScheduledRunAt) : 'scheduler offline'} loading={!d} />
      </div>

      <ScoutConsole rows={14} />

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Boards scanned in the last sweep</h2>
            <p className="text-sm text-slate-500">Each company’s official public job board, with how many of its openings are in India.</p>
          </div>
        </div>
        <ScanGrid />
      </section>
    </div>
  );
}
