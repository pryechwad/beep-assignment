import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/overlay';
import { Badge, Card, Meta, StatusDot } from '@/components/ui/primitives';
import { DataTable, ErrorState, LoadingRows } from '@/components/ui/states';
import { useAdminSources, useSyncSource, useToggleSource } from '@/hooks/admin';
import { fmtDateTime, fmtNumber, fmtRelative, sourceLabel } from '@/lib/format';

export default function Sources() {
  const s = useAdminSources();
  const toggle = useToggleSource();
  const sync = useSyncSource();
  const items = s.data?.items ?? [];
  const failing = items.filter((x) => x.enabled && x.healthy === false).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Sources" description={`${items.length} public ATS boards configured · ${items.filter((x) => x.enabled).length} enabled · ${failing} failing. Each board is fetched from its official public posting API with a per-source rate limit.`} />
      <Card>
        {s.isPending ? <LoadingRows rows={8} /> : s.isError ? <ErrorState error={s.error} className="m-4" /> : (
          <DataTable
            caption="Sources"
            rows={items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Board', cell: (r) => <div><p className="font-medium text-ink">{r.company ?? r.name}</p><Meta>{r.id}</Meta></div> },
              { key: 'type', header: 'Platform', cell: (r) => <Badge tone="outline">{sourceLabel(r.adapterType)}</Badge> },
              {
                key: 'health', header: 'Health', cell: (r) => !r.enabled ? <StatusDot tone="neutral">Disabled</StatusDot> : r.healthy === false ? (
                  <Tooltip content={r.lastError ?? 'Unknown error'}><span><StatusDot tone="danger">Failing · {fmtRelative(r.lastFailureAt)}</StatusDot></span></Tooltip>
                ) : r.healthy ? <StatusDot tone="success">Healthy</StatusDot> : <StatusDot tone="neutral">Not yet run</StatusDot>,
              },
              { key: 'last', header: 'Last success', cell: (r) => <span title={fmtDateTime(r.lastSuccessAt)} className="text-muted">{fmtRelative(r.lastSuccessAt)}</span> },
              { key: 'seen', header: 'India postings (last run)', align: 'right', cell: (r) => fmtNumber(r.lastRecordCount) },
              { key: 'active', header: 'Active in index', align: 'right', cell: (r) => fmtNumber(r.activeJobs) },
              {
                key: 'act', header: '', align: 'right', cell: (r) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" disabled={!r.enabled || sync.isPending} onClick={() => sync.mutate(r.id)} aria-label={`Sync ${r.name} now`}><RefreshCw className="h-3 w-3" />Sync</Button>
                    <Button size="sm" variant={r.enabled ? 'danger' : 'secondary'} onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}>{r.enabled ? 'Disable' : 'Enable'}</Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
