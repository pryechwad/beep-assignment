import { AlertTriangle, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api';
import { cn, fmtNumber } from '@/lib/format';
import { Button } from './button';
import { Skeleton } from './primitives';

export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-subtle">
          <Icon className="h-4 w-4 text-muted" />
        </div>
      )}
      <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof ApiRequestError ? error.message : 'Something went wrong while loading this.';
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-lg border border-danger/20 bg-danger-soft/60 px-4 py-3', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="text-[0.8125rem] font-medium text-ink">Couldn’t load this data</p>
        <p className="mt-0.5 text-xs text-ink-2">{msg}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-4', className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <p className="text-xs text-muted tabular">
        {fmtNumber(from)}–{fmtNumber(to)} of {fmtNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1 font-mono text-2xs text-muted tabular">
          {page} / {totalPages}
        </span>
        <Button size="icon-sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

/** Plain, dense data table. Numbers right-aligned and tabular. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, caption }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode; caption?: string }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.8125rem]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2 text-2xs font-medium uppercase tracking-[0.04em] text-muted', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(r) : undefined) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas focus-visible:bg-canvas')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-2.5 align-middle', c.align === 'right' && 'text-right tabular', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
