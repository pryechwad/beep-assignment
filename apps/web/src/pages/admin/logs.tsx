import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Badge, Card, Meta, SearchInput } from '@/components/ui/primitives';
import { DataTable, EmptyState, ErrorState, LoadingRows, Pagination } from '@/components/ui/states';
import { useLogs, type LogRow } from '@/hooks/admin';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

const levelTone = { ERROR: 'danger', WARN: 'warning', INFO: 'neutral' } as const;

function Trace({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useQuery({ queryKey: ['admin', 'trace', id], enabled: !!id, queryFn: () => api.get<{ raw: unknown[]; jobs: unknown[]; classifications: unknown[]; usage: unknown[]; logs: LogRow[] }>(`/admin/trace/${id}`) });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()} variant="drawer" title="Record trace" description={id ?? undefined}>
      {t.isPending ? <LoadingRows /> : t.isError ? <ErrorState error={t.error} /> : (
        <div className="space-y-4 text-xs">
          {(['raw', 'jobs', 'classifications', 'usage'] as const).map((k) => (
            <section key={k}>
              <p className="mb-1 font-medium text-ink">{k} <span className="text-muted">({t.data[k].length})</span></p>
              <pre className="max-h-52 overflow-auto rounded-md bg-subtle p-2 font-mono text-2xs text-ink-2">{JSON.stringify(t.data[k], null, 2)}</pre>
            </section>
          ))}
          <section>
            <p className="mb-1 font-medium text-ink">logs ({t.data.logs.length})</p>
            <ul className="space-y-1">{t.data.logs.map((l) => <li key={l.id} className="text-ink-2"><Badge tone={levelTone[l.level]}>{l.level}</Badge> {l.message}</li>)}</ul>
          </section>
        </div>
      )}
    </Dialog>
  );
}

export default function Logs() {
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<string | null>(null);
  const level = sp.get('level') ?? 'ALL';
  const scope = sp.get('scope') ?? undefined;
  const correlationId = sp.get('correlationId') ?? undefined;
  const logs = useLogs(page, level, scope, correlationId);
  const set = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(sp);
    if (v && v !== 'ALL') next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
    setPage(1);
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Logs" description="Warnings and errors persisted by the pipeline (full structured logs go to stdout). Every record carries a correlation id — open one to trace it from discovery to classification." />
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Level" value={level} onValueChange={(v) => set('level', v)} options={[{ value: 'ALL', label: 'All levels' }, { value: 'ERROR', label: 'Errors' }, { value: 'WARN', label: 'Warnings' }]} className="w-32" />
        <Select label="Scope" value={scope ?? 'ALL'} onValueChange={(v) => set('scope', v)} options={[{ value: 'ALL', label: 'All scopes' }, ...(logs.data?.scopes ?? []).map((s) => ({ value: s.scope, label: `${s.scope} (${s.count})` }))]} className="w-44" />
        <SearchInput value={correlationId ?? ''} onValueChange={(v) => set('correlationId', v.trim() || undefined)} placeholder="Correlation id" aria-label="Correlation id" className="w-64" />
      </div>
      <Card>
        {logs.isPending ? <LoadingRows /> : logs.isError ? <ErrorState error={logs.error} className="m-4" /> : (
          <>
            <DataTable
              caption="Logs"
              rows={logs.data.items}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No log entries match" />}
              columns={[
                { key: 't', header: 'Time', cell: (r) => <span className="whitespace-nowrap font-mono text-2xs text-muted">{fmtDateTime(r.createdAt)}</span> },
                { key: 'l', header: 'Level', cell: (r) => <Badge tone={levelTone[r.level]}>{r.level.toLowerCase()}</Badge> },
                { key: 's', header: 'Scope', cell: (r) => <Meta>{r.scope}</Meta> },
                { key: 'm', header: 'Message', cell: (r) => <span className="line-clamp-2 max-w-xl text-ink-2">{r.message}</span> },
                { key: 'c', header: 'Trace', cell: (r) => (r.correlationId ? <button type="button" onClick={() => setTrace(r.correlationId)} className="font-mono text-2xs text-accent-ink hover:underline">{r.correlationId.slice(0, 16)}…</button> : <span className="text-faint">—</span>) },
              ]}
            />
            <Pagination page={logs.data.page} totalPages={logs.data.totalPages} total={logs.data.total} pageSize={logs.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      <Trace id={trace} onClose={() => setTrace(null)} />
    </div>
  );
}
