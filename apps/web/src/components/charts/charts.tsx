import { Table2, BarChart3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { HUES, type Hue } from '@/lib/colors';
import { cn, fmtNumber } from '@/lib/format';
import { IconTile } from '../ui/primitives';
import { EmptyState } from '../ui/states';

/** Chart colour roles (validated: accent + slot-2 orange pass CVD/contrast checks on the light surface). */
export const CHART = {
  series1: '#315CF5',
  series2: '#eb6834',
  muted: '#c9ced8',
  grid: '#eef0f3',
  axis: '#717784',
  ink: '#17191F',
};

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Optional secondary figure shown in the tooltip/table (e.g. fresher-eligible count). */
  secondary?: number;
  /** Per-bar colour (e.g. role field). Falls back to the chart colour. */
  color?: string;
}

function ChartTooltip({ active, payload, secondaryLabel, valueLabel, color }: { active?: boolean; payload?: { payload: BarDatum }[]; secondaryLabel?: string; valueLabel: string; color: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-pop">
      <p className="font-medium text-ink">{d.label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-ink-2">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: d.color ?? color }} />
        <span className="tabular">{fmtNumber(d.value)}</span> {valueLabel}
      </p>
      {secondaryLabel && d.secondary !== undefined && (
        <p className="mt-0.5 pl-3.5 text-muted">
          <span className="tabular">{fmtNumber(d.secondary)}</span> {secondaryLabel}
        </p>
      )}
    </div>
  );
}

interface FrameProps {
  title: string;
  description?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  table: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
  hue?: Hue;
}

/** Card frame with a chart ⇄ table toggle (every chart has an accessible table view). */
export function ChartFrame({ title, description, footnote, children, table, action, className, icon, hue = 'blue' }: FrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cn('flex flex-col rounded-xl border border-line bg-surface shadow-card', className)} aria-label={title}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && <IconTile hue={hue}>{icon}</IconTile>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="View">
            {(['chart', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                aria-label={v === 'chart' ? 'Chart view' : 'Table view'}
                className={cn('rounded-[4px] p-1 text-muted hover:text-ink', view === v && 'bg-subtle text-ink')}
              >
                {v === 'chart' ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 px-2 pb-2 pt-3">{view === 'chart' ? children : <div className="max-h-[300px] overflow-auto px-2">{table}</div>}</div>
      {footnote && <p className="border-t border-line px-4 py-2 text-2xs text-muted">{footnote}</p>}
    </section>
  );
}

export function SimpleTable({ rows, valueLabel, secondaryLabel }: { rows: BarDatum[]; valueLabel: string; secondaryLabel?: string }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-line text-left text-2xs uppercase tracking-[0.04em] text-muted">
          <th className="py-1.5 font-medium">Category</th>
          <th className="py-1.5 text-right font-medium">{valueLabel}</th>
          {secondaryLabel && <th className="py-1.5 text-right font-medium">{secondaryLabel}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-line last:border-0">
            <td className="py-1.5 text-ink-2">{r.label}</td>
            <td className="py-1.5 text-right tabular text-ink">{fmtNumber(r.value)}</td>
            {secondaryLabel && <td className="py-1.5 text-right tabular text-muted">{fmtNumber(r.secondary)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Horizontal bar ranking (single series → no legend; the title names it).
 * Thin bars, 4px rounded data-end, recessive grid, per-bar hover tooltip.
 */
export function HBarChart({ data, valueLabel, secondaryLabel, onSelect, maxBars = 12, height, color = CHART.series1 }: { data: BarDatum[]; valueLabel: string; secondaryLabel?: string; onSelect?: (d: BarDatum) => void; maxBars?: number; height?: number; color?: string }) {
  if (!data.length) return <EmptyState title="Not enough data yet" className="py-8">This chart fills in once classified jobs exist for it.</EmptyState>;
  const rows = data.slice(0, maxBars);
  const h = height ?? Math.max(120, rows.length * 26 + 16);
  // Size the category axis to the longest label (≈6.6px per char at 12px) so labels are never clipped.
  const labelWidth = Math.min(190, Math.max(56, Math.ceil(Math.max(...rows.map((r) => r.label.length)) * 6.6) + 8));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={labelWidth} tick={{ fill: '#3d414b', fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
        <RTooltip cursor={{ fill: '#f1f2f5' }} content={<ChartTooltip valueLabel={valueLabel} secondaryLabel={secondaryLabel} color={color} />} />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={16}
          isAnimationActive={false}
          onClick={onSelect ? (d: unknown) => onSelect((d as { payload: BarDatum }).payload) : undefined}
          cursor={onSelect ? 'pointer' : undefined}
          label={{ position: 'right', fill: '#3d414b', fontSize: 11, formatter: (v: number) => fmtNumber(v) }}
        >
          {rows.map((r) => (
            <Cell key={r.key} fill={r.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DailyDatum {
  date: string;
  added: number;
  closed: number;
}

/** Daily ingestion: two series (added / closed) → legend shown, grouped thin columns, 2px gap. */
export function DailyChart({ data, height = 220 }: { data: DailyDatum[]; height?: number }) {
  const hasAny = data.some((d) => d.added || d.closed);
  if (!hasAny) return <EmptyState title="No ingestion activity in this window" className="py-8" />;
  const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 px-2 text-2xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.series1 }} />Added</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.series2 }} />Closed</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={fmt} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={{ stroke: CHART.grid }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <RTooltip
            cursor={{ fill: '#f1f2f5' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-pop">
                  <p className="font-medium text-ink">{fmt(String(label))}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="mt-1 flex items-center gap-1.5 text-ink-2">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
                      <span className="tabular">{fmtNumber(Number(p.value))}</span> {p.dataKey === 'added' ? 'added' : 'closed'}
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="added" fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="closed" fill={CHART.series2} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Part-to-whole as a single segmented bar with direct labels (instead of a pie). */
export function SegmentBar({ data, total }: { data: BarDatum[]; total: number }) {
  if (!total) return <EmptyState title="Not enough data yet" className="py-8" />;
  const tones = data.map((d, i) => d.color ?? [HUES.blue.solid, HUES.violet.solid, HUES.amber.solid, HUES.teal.solid, HUES.slate.ring][i % 5]!);
  return (
    <div className="px-2 pb-2">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}>
        {data.map((d, i) => (
          <div key={d.key} title={`${d.label}: ${fmtNumber(d.value)}`} style={{ width: `${(d.value / total) * 100}%`, background: tones[i] }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: tones[i] }} />
            <span className="flex-1 text-ink-2">{d.label}</span>
            <span className="tabular text-ink">{fmtNumber(d.value)}</span>
            <span className="w-12 text-right font-mono text-2xs text-muted tabular">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
