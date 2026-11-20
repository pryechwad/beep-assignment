import { Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlay';
import { Badge, Card, CardHeader, Meta } from '@/components/ui/primitives';
import { DataTable, EmptyState, ErrorState, LoadingRows, Pagination } from '@/components/ui/states';
import { useQueue, useRetryDead, useRetryFailed, useRun, useRuns, useTriggerSync, type RunRow } from '@/hooks/admin';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { RunStatusBadge } from './overview';

function duration(r: RunRow) {
  if (!r.startedAt || !r.finishedAt) return '—';
  const s = Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function RunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const run = useRun(id);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()} variant="drawer" title="Run detail" description={run.data ? `${run.data.trigger.toLowerCase()} · started ${fmtDateTime(run.data.startedAt)} · ${run.data.correlationId}` : undefined}>
      {run.isPending ? <LoadingRows /> : run.isError ? <ErrorState error={run.error} /> : (
        <div className="-mx-5">
          <DataTable
            caption="Per-source tasks"
            rows={run.data.tasks}
            rowKey={(t) => t.id}
            columns={[
              { key: 'src', header: 'Source', cell: (t) => <div><p className="text-ink">{t.source.name}</p>{t.errorMessage && <p className="mt-0.5 line-clamp-2 text-2xs text-danger">{t.errorMessage}</p>}</div> },
              { key: 'st', header: 'Status', cell: (t) => <RunStatusBadge status={t.status as RunRow['status']} /> },
              { key: 'f', header: 'Fetched', align: 'right', cell: (t) => fmtNumber(t.jobsFetched) },
              { key: 'n', header: 'New', align: 'right', cell: (t) => fmtNumber(t.jobsNew) },
              { key: 'u', header: 'Upd.', align: 'right', cell: (t) => fmtNumber(t.jobsUpdated) },
              { key: 'c', header: 'Closed', align: 'right', cell: (t) => fmtNumber(t.jobsClosed) },
            ]}
          />
        </div>
      )}
    </Dialog>
  );
}

export default function Pipeline() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const runs = useRuns(page);
  const queue = useQueue();
  const trigger = useTriggerSync();
  const retryDead = useRetryDead();
  const retryFailed = useRetryFailed();
  const running = runs.data?.items.some((r) => r.status === 'RUNNING');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        description="Discover → collect → normalise → deduplicate → classify → persist → aggregate. Each stage is a BullMQ queue with retries and exponential backoff; exhausted jobs move to the dead-letter queue."
        actions={<Button variant="primary" onClick={() => trigger.mutate(undefined)} loading={trigger.isPending} disabled={running}><Play className="h-3.5 w-3.5" />{running ? 'Run in progress' : 'Run collection now'}</Button>}
      />

      <Card>
        <CardHeader title="Queues" description="Live job counts per stage." />
        {queue.isPending ? <LoadingRows rows={4} /> : queue.isError ? <ErrorState error={queue.error} className="m-4" /> : (
          <DataTable
            caption="Queues"
            rows={queue.data.queues}
            rowKey={(q) => q.name}
            columns={[
              { key: 'n', header: 'Queue', cell: (q) => <span className="font-mono text-xs text-ink">{q.name}</span> },
              { key: 'w', header: 'Waiting', align: 'right', cell: (q) => fmtNumber((q.waiting ?? 0) + (q.prioritized ?? 0)) },
              { key: 'a', header: 'Active', align: 'right', cell: (q) => fmtNumber(q.active) },
              { key: 'd', header: 'Delayed', align: 'right', cell: (q) => fmtNumber(q.delayed) },
              { key: 'f', header: 'Failed', align: 'right', cell: (q) => <span className={q.failed ? 'text-danger' : undefined}>{fmtNumber(q.failed)}</span> },
              { key: 'c', header: 'Completed (kept)', align: 'right', cell: (q) => <span className="text-muted">{fmtNumber(q.completed)}</span> },
              { key: 'r', header: '', align: 'right', cell: (q) => (q.failed ? <Button size="sm" variant="ghost" onClick={() => retryFailed.mutate(q.name)}><RotateCcw className="h-3 w-3" />Retry failed</Button> : null) },
            ]}
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Collection runs" description="Select a run to see per-source results." />
        {runs.isPending ? <LoadingRows /> : runs.isError ? <ErrorState error={runs.error} className="m-4" /> : (
          <>
            <DataTable
              caption="Runs"
              rows={runs.data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpen(r.id)}
              empty={<EmptyState title="No runs yet" action={<Button size="sm" onClick={() => trigger.mutate(undefined)}>Start the first run</Button>} />}
              columns={[
                { key: 't', header: 'Started', cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.startedAt ?? r.createdAt)}</span> },
                { key: 'tr', header: 'Trigger', cell: (r) => <Badge tone="outline">{r.trigger.toLowerCase()}{r.requestedBy ? ` · ${r.requestedBy}` : ''}</Badge> },
                { key: 's', header: 'Status', cell: (r) => <RunStatusBadge status={r.status} /> },
                { key: 'src', header: 'Sources ok', align: 'right', cell: (r) => `${r.sourcesSucceeded}/${r.sourcesTotal}` },
                { key: 'f', header: 'Fetched', align: 'right', cell: (r) => fmtNumber(r.jobsFetched) },
                { key: 'n', header: 'New', align: 'right', cell: (r) => fmtNumber(r.jobsNew) },
                { key: 'c', header: 'Closed', align: 'right', cell: (r) => fmtNumber(r.jobsClosed) },
                { key: 'd', header: 'Duration', align: 'right', cell: (r) => duration(r) },
              ]}
            />
            <Pagination page={runs.data.page} totalPages={runs.data.totalPages} total={runs.data.total} pageSize={runs.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Dead-letter queue" description="Jobs that failed every retry. Re-queue after fixing the cause." />
        {queue.isPending ? <LoadingRows rows={3} /> : (
          <DataTable
            caption="Dead letters"
            rows={queue.data?.deadLetter ?? []}
            rowKey={(d) => d.id}
            empty={<EmptyState title="Dead-letter queue is empty" />}
            columns={[
              { key: 't', header: 'Failed', cell: (d) => <span className="whitespace-nowrap text-muted">{fmtRelative(d.failedAt)}</span> },
              { key: 'q', header: 'Queue', cell: (d) => <Meta>{d.queue}</Meta> },
              { key: 'r', header: 'Reason', cell: (d) => <span className="line-clamp-2 text-xs text-ink-2">{d.failedReason}</span> },
              { key: 'a', header: 'Attempts', align: 'right', cell: (d) => d.attemptsMade },
              { key: 'x', header: '', align: 'right', cell: (d) => <Button size="sm" onClick={() => retryDead.mutate(d.id)}>Re-queue</Button> },
            ]}
          />
        )}
      </Card>
      <RunDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
