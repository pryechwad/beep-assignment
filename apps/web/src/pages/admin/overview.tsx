import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Meta, StatusDot } from '@/components/ui/primitives';
import { DataTable, EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useAdminOverview, useTriggerSync, type RunRow } from '@/hooks/admin';
import { fmtDateTime, fmtNumber, fmtPct, fmtRelative, fmtUsd } from '@/lib/format';

export function RunStatusBadge({ status }: { status: RunRow['status'] }) {
  const tone = { SUCCEEDED: 'success', PARTIAL: 'warning', FAILED: 'danger', RUNNING: 'accent', QUEUED: 'outline' } as const;
  return <Badge tone={tone[status]}>{status.toLowerCase()}</Badge>;
}

function Stat({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular">{value}</p>
      {sub && <p className="mt-0.5 truncate text-2xs text-muted">{sub}</p>}
    </>
  );
  return to ? <Link to={to} className="block rounded-lg border border-line bg-surface p-3.5 shadow-card hover:border-line-strong">{body}</Link> : <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">{body}</div>;
}

export default function AdminOverview() {
  const o = useAdminOverview();
  const trigger = useTriggerSync();
  // The header renders immediately; only the data area waits for the (heavier) overview query.
  if (o.isPending || o.isError)
    return (
      <div className="space-y-5">
        <PageHeader title="Operations overview" description="Live health of collection, processing and AI classification. Refreshes every 10 seconds." />
        {o.isError ? <ErrorState error={o.error} onRetry={() => void o.refetch()} /> : <LoadingRows rows={8} />}
      </div>
    );
  const d = o.data;
  const running = d.lastRun?.status === 'RUNNING';
  const totalQueued = d.queues.reduce((n, q) => n + (q.waiting ?? 0) + (q.prioritized ?? 0) + (q.delayed ?? 0), 0);
  const failed = d.queues.reduce((n, q) => n + (q.failed ?? 0), 0);
  const routes = d.classificationRoutes;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operations overview"
        description="Live health of collection, processing and AI classification. Refreshes every 10 seconds."
        actions={<Button variant="primary" onClick={() => trigger.mutate(undefined)} loading={trigger.isPending} disabled={running}><Play className="h-3.5 w-3.5" />{running ? 'Run in progress' : 'Run collection now'}</Button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Last successful run" value={fmtRelative(d.lastSuccessfulRunAt)} sub={fmtDateTime(d.lastSuccessfulRunAt)} to="/admin/pipeline" />
        <Stat label="Queued jobs" value={fmtNumber(totalQueued)} sub={`${fmtNumber(failed)} failed · ${fmtNumber(d.deadLetter)} dead-lettered`} to="/admin/pipeline" />
        <Stat label="LLM success (24h)" value={fmtPct(d.llmCalls24h.successRate)} sub={`${fmtNumber(d.llmCalls24h.succeeded)} ok · ${fmtNumber(d.llmCalls24h.failed)} failed · ${fmtUsd(d.llmCalls24h.costUsd)}`} to="/admin/costs" />
        <Stat label="Errors (24h)" value={fmtNumber(d.errors24h)} sub={`${fmtNumber(d.sources.unhealthy)} of ${fmtNumber(d.sources.enabled)} sources failing`} to="/admin/logs" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Processes" description="From Redis heartbeats (expire after 45 s)." />
          <ul className="divide-y divide-line">
            {d.workers.length === 0 && <li className="px-4 py-3"><StatusDot tone="danger">No worker running</StatusDot></li>}
            {d.workers.map((w) => (
              <li key={`${w.host}-${w.pid}`} className="px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <StatusDot tone="success">Worker</StatusDot>
                  <Meta>pid {w.pid} · up {fmtRelative(w.startedAt).replace(' ago', '')}</Meta>
                </div>
                <p className="mt-1 text-2xs text-muted">AI providers: {w.details?.providers?.length ? w.details.providers.join(', ') : 'none available'}{w.details?.disabled?.length ? ` · disabled today: ${w.details.disabled.map((x) => x.provider).join(', ')}` : ''}</p>
              </li>
            ))}
            <li className="px-4 py-2.5">
              <div className="flex items-center justify-between">
                <StatusDot tone={d.scheduler ? 'success' : 'danger'}>{d.scheduler ? 'Scheduler' : 'Scheduler not running'}</StatusDot>
                {d.scheduler && <Meta>pid {d.scheduler.pid}</Meta>}
              </div>
              {d.scheduler?.details?.schedules?.map((s) => (
                <p key={s.id} className="mt-1 flex justify-between text-2xs text-muted">
                  <span>{s.id} <span className="font-mono">{s.pattern}</span></span>
                  <span>next {fmtDateTime(s.next)}</span>
                </p>
              ))}
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Throughput (24h)" />
          <dl className="divide-y divide-line px-4">
            {[
              ['Raw records normalised', fmtNumber(d.throughput24h.normalized)],
              ['Classifications written', fmtNumber(d.throughput24h.classified)],
              ['Current: rules sufficient', fmtNumber(routes['rules-sufficient'] ?? 0)],
              ['Current: LLM-assisted', fmtNumber(routes.llm ?? 0)],
              ['Current: LLM pending (budget/provider)', fmtNumber((routes['llm-budget-exhausted'] ?? 0) + (routes['llm-unavailable'] ?? 0) + (routes['llm-failed-fallback'] ?? 0))],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 text-[0.8125rem]"><dt className="text-muted">{k}</dt><dd className="text-ink tabular">{v}</dd></div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Needs attention" />
          <ul className="divide-y divide-line text-[0.8125rem]">
            <li><Link to="/admin/ai" className="flex justify-between px-4 py-2.5 hover:bg-canvas"><span className="text-ink-2">Low-confidence classifications</span><span className="tabular text-ink">{fmtNumber(d.reviewQueues.classifications)}</span></Link></li>
            <li><Link to="/admin/ai?tab=duplicates" className="flex justify-between px-4 py-2.5 hover:bg-canvas"><span className="text-ink-2">Possible duplicates to review</span><span className="tabular text-ink">{fmtNumber(d.reviewQueues.duplicates)}</span></Link></li>
            <li><Link to="/admin/pipeline" className="flex justify-between px-4 py-2.5 hover:bg-canvas"><span className="text-ink-2">Dead-lettered jobs</span><span className="tabular text-ink">{fmtNumber(d.deadLetter)}</span></Link></li>
            <li><Link to="/admin/sources" className="flex justify-between px-4 py-2.5 hover:bg-canvas"><span className="text-ink-2">Failing sources</span><span className="tabular text-ink">{fmtNumber(d.sources.unhealthy)}</span></Link></li>
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent errors" action={<Button asChild size="sm" variant="ghost"><Link to="/admin/logs?level=ERROR">All logs</Link></Button>} />
        <DataTable
          caption="Recent errors"
          rows={d.recentErrors}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No errors recorded" />}
          columns={[
            { key: 'time', header: 'Time', cell: (r) => <span className="whitespace-nowrap text-muted">{fmtRelative(r.createdAt)}</span> },
            { key: 'scope', header: 'Scope', cell: (r) => <Meta>{r.scope}</Meta> },
            { key: 'msg', header: 'Message', cell: (r) => <span className="line-clamp-2 text-ink-2">{r.message}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
