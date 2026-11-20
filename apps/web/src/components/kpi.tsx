import type { ReactNode } from 'react';
import { HUES, type Hue } from '@/lib/colors';
import { fmtNumber } from '@/lib/format';
import { IconTile, Skeleton } from './ui/primitives';
import { Tooltip } from './ui/overlay';

interface KpiProps {
  label: string;
  value: number | null | undefined;
  /** Previous snapshot value. A delta renders only when this is a real number. */
  previous?: number | null;
  previousDate?: string | null;
  hint?: ReactNode;
  loading?: boolean;
  hue: Hue;
  icon: ReactNode;
}

/**
 * KPI card. Deltas appear only when a historical snapshot exists —
 * never a fabricated "+12%". Without history it says so.
 */
export function Kpi({ label, value, previous, previousDate, hint, loading, hue, icon }: KpiProps) {
  const delta = typeof previous === 'number' && typeof value === 'number' ? value - previous : null;
  const h = HUES[hue];
  return (
    <div className="relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: h.solid }} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-2">{label}</span>
        <IconTile hue={hue}>{icon}</IconTile>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span className="text-[1.75rem] font-bold leading-none tracking-[-0.03em] text-ink tabular">{fmtNumber(value)}</span>
      )}
      <span className="min-h-4 truncate text-2xs text-muted">
        {loading ? null : delta !== null ? (
          <Tooltip content={`Compared with the ${previousDate} snapshot (${fmtNumber(previous)})`}>
            <span className="font-medium tabular" style={{ color: delta >= 0 ? HUES.green.ink : '#D94B4B' }}>
              {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}
              {fmtNumber(delta)} vs {previousDate}
            </span>
          </Tooltip>
        ) : (
          hint
        )}
      </span>
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{children}</div>;
}
