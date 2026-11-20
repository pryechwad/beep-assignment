import { AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';
import { ChartFrame, HBarChart, SimpleTable } from '@/components/charts/charts';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { Badge, Card, CardHeader, Meta } from '@/components/ui/primitives';
import { DataTable, ErrorState, LoadingRows } from '@/components/ui/states';
import { useCosts } from '@/hooks/admin';
import { api } from '@/lib/api';
import { fmtNumber, fmtUsd } from '@/lib/format';

export default function Costs() {
  const [days, setDays] = useState('30');
  const c = useCosts(Number(days));
  const anyUnverified = c.data?.byModel.some((m) => m.price && !m.price.verified);
  const unpriced = c.data?.byModel.filter((m) => !m.price) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI cost intelligence"
        description="Token counts are measured from each provider’s usage report. Costs are computed from those tokens × a dated list-price table — they are not invoice figures."
        actions={<><Select label="Window" value={days} onValueChange={setDays} options={[{ value: '1', label: 'Last 24 hours' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '365', label: 'Last year' }]} className="w-36" /><Button asChild size="md"><a href={api.url('/admin/ai-usage/export.csv', { days })}><Download className="h-3.5 w-3.5" />Export CSV</a></Button></>}
      />
      {c.isPending ? <LoadingRows /> : c.isError ? <ErrorState error={c.error} /> : (
        <>
          {(anyUnverified || unpriced.length > 0 || c.data.totals.unmeasuredTokenCalls > 0) && (
            <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-ink-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-0.5">
                {anyUnverified && <p>Some prices come from third-party trackers and are not yet confirmed against the provider’s official page (marked <em>unverified</em>). Pricing table version {c.data.pricingVersion}.</p>}
                {unpriced.length > 0 && <p>No price entry for: {unpriced.map((m) => m.model).join(', ')} — their cost is reported as $0 and excluded from the totals until priced.</p>}
                {c.data.totals.unmeasuredTokenCalls > 0 && <p>{fmtNumber(c.data.totals.unmeasuredTokenCalls)} calls had no provider usage report; their tokens are estimated (≈4 chars/token).</p>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Cost per 1,000 processed posts', fmtUsd(c.data.costPer1000Posts), `total cost ÷ ${fmtNumber(c.data.processed.total)} classified posts × 1,000`],
              ['Cost per 1,000 LLM-classified', fmtUsd(c.data.costPer1000LLMClassified), `${fmtNumber(c.data.processed.llmClassified)} LLM · ${fmtNumber(c.data.processed.rulesOnly)} rules-only (free)`],
              ['Total AI cost', fmtUsd(c.data.totals.costUsd, 5), `classification ${fmtUsd(c.data.totals.classifyCostUsd, 5)} · embeddings ${fmtUsd(c.data.totals.embeddingCostUsd, 5)}`],
              ['API calls', fmtNumber(c.data.totals.calls), `${fmtNumber(c.data.totals.failedCalls)} failed · ${fmtNumber(c.data.totals.retries)} retries`],
            ].map(([k, v, s]) => (
              <Card key={k} className="p-3.5">
                <p className="text-xs text-muted">{k}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular">{v}</p>
                <p className="mt-0.5 text-2xs text-muted">{s}</p>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Usage by provider and model" description={`${fmtNumber(c.data.totals.inputTokens)} input · ${fmtNumber(c.data.totals.outputTokens)} output tokens in this window.`} />
            <DataTable
              caption="Usage by model"
              rows={c.data.byModel}
              rowKey={(m) => `${m.provider}:${m.model}:${m.operation}`}
              columns={[
                { key: 'm', header: 'Model', cell: (m) => <div><p className="font-mono text-xs text-ink">{m.model}</p><Meta>{m.provider} · {m.operation.toLowerCase()}</Meta></div> },
                { key: 'calls', header: 'Calls', align: 'right', cell: (m) => `${fmtNumber(m.calls)}${m.failed ? ` (${m.failed} failed)` : ''}` },
                { key: 'in', header: 'Input tok.', align: 'right', cell: (m) => fmtNumber(m.inputTokens) },
                { key: 'out', header: 'Output tok.', align: 'right', cell: (m) => fmtNumber(m.outputTokens) },
                { key: 'lat', header: 'Avg latency', align: 'right', cell: (m) => (m.avgLatencyMs === null ? '—' : `${fmtNumber(m.avgLatencyMs)} ms`) },
                { key: 'price', header: 'List price /1M (in · out)', align: 'right', cell: (m) => (m.price ? <Tooltip content={m.price.source}><span className="inline-flex items-center gap-1.5">${m.price.inputPerMTok} · ${m.price.outputPerMTok}{!m.price.verified && <Badge tone="warning">unverified</Badge>}</span></Tooltip> : <Badge tone="danger">no price</Badge>) },
                { key: 'cost', header: 'Cost', align: 'right', cell: (m) => <span className="text-ink">{fmtUsd(m.costUsd, 5)}</span> },
              ]}
            />
          </Card>
          <ChartFrame title="Daily AI spend" description="Computed cost per IST day." table={<SimpleTable rows={c.data.daily.map((d) => ({ key: d.date, label: d.date, value: d.calls, secondary: Math.round(d.costUsd * 1e5) / 1e5 }))} valueLabel="Calls" secondaryLabel="Cost (USD)" />}>
            <HBarChart data={c.data.daily.map((d) => ({ key: d.date, label: d.date, value: d.calls, secondary: Math.round(d.costUsd * 1e5) / 1e5 }))} valueLabel="calls" secondaryLabel="USD" maxBars={31} />
          </ChartFrame>
          <Card>
            <CardHeader title={`Price table · ${c.data.pricingVersion}`} description="Edit packages/ai-engine/src/pricing.ts when prices change or are confirmed." />
            <DataTable
              caption="Price table"
              rows={c.data.priceTable}
              rowKey={(p) => `${p.provider}:${p.modelPrefix}`}
              columns={[
                { key: 'p', header: 'Model prefix', cell: (p) => <span className="font-mono text-xs">{p.provider}/{p.modelPrefix}</span> },
                { key: 'i', header: 'Input /1M', align: 'right', cell: (p) => `$${p.inputPerMTok}` },
                { key: 'o', header: 'Output /1M', align: 'right', cell: (p) => `$${p.outputPerMTok}` },
                { key: 'v', header: 'Status', cell: (p) => (p.verified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>) },
                { key: 's', header: 'Source', cell: (p) => <span className="line-clamp-1 max-w-xs text-2xs text-muted">{p.source}</span> },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
