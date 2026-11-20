import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/format';

/**
 * Premium design language: navy banners with a fine grid, soft tinted icon
 * tiles, hairline cards. Colour is used sparingly — one indigo accent, with
 * muted tones only to tell categories apart. Every number passed in is real.
 */
export type Tone = 'blue' | 'emerald' | 'violet' | 'orange' | 'rose' | 'cyan' | 'amber' | 'indigo';

const TILE: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
};
const BAR: Record<Tone, string> = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-600',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
};

/** Soft tinted icon tile (kept the old name so existing call sites keep working). */
export function GradientTile({ tone, children, size = 'md', className }: { tone: Tone; children: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'size-9 rounded-xl [&_svg]:size-[18px]', md: 'size-11 rounded-xl [&_svg]:size-5', lg: 'size-16 rounded-2xl [&_svg]:size-8' }[size];
  return <div className={cn('flex shrink-0 items-center justify-center ring-1 ring-inset', TILE[tone], s, className)}>{children}</div>;
}

/** Grid + soft glow overlay for dark surfaces. */
export function NavyBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 opacity-[0.09]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse 80% 90% at 30% 0%, #000, transparent 75%)' }} />
      <div className="absolute -top-48 left-1/4 size-[32rem] rounded-full bg-indigo-500/25 blur-[120px]" />
    </div>
  );
}

/** Navy banner with the site grid. */
export function GradientBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('relative overflow-hidden rounded-3xl bg-[#0b1120] p-6 text-white ring-1 ring-white/5 sm:p-8', className)}>
      <NavyBackdrop />
      <div className="relative">{children}</div>
    </section>
  );
}

/** Stat chip used inside dark banners. */
export function GlassStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-2.5 ring-1 ring-inset ring-white/10 [&_svg]:size-[18px] [&_svg]:text-slate-400">
      {icon}
      <div>
        <div className="text-lg font-semibold leading-6 text-white tabular">{value}</div>
        <div className="text-[11px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export function LivePill({ children, tone = 'emerald' }: { children: ReactNode; tone?: 'emerald' | 'amber' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', tone === 'emerald' ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20' : 'bg-amber-400/10 text-amber-300 ring-amber-400/20')}>
      <span className="relative flex size-2">
        <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', tone === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400')} />
        <span className={cn('relative inline-flex size-2 rounded-full', tone === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400')} />
      </span>
      {children}
    </span>
  );
}

/** Metric card: tinted icon tile, label, big number, optional real-ratio meter. */
export function MetricCard({ label, value, note, icon, tone, meter, to, loading }: { label: string; value: ReactNode; note?: ReactNode; icon: ReactNode; tone: Tone; meter?: number | null; to?: string; loading?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <GradientTile tone={tone} size="sm">{icon}</GradientTile>
      </div>
      {loading ? <div className="mt-3 h-9 w-24 animate-pulse rounded-lg bg-slate-100" /> : <p className="mt-2 text-[2rem] font-semibold leading-9 tracking-tight text-slate-900 tabular">{value}</p>}
      {meter !== undefined && meter !== null && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-1.5 rounded-full transition-all duration-700', BAR[tone])} style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {note && <p className="mt-2.5 text-xs text-slate-500">{note}</p>}
    </>
  );
  const cls = 'group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-all duration-200';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(15_23_42/0.18)]')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** White panel with a title row. */
export function Panel({ title, action, children, className, icon }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-[15px] font-semibold text-slate-900">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontal share row (label · count · bar · percent). */
export function ShareRow({ label, count, total, tone, dot }: { label: string; count: number; total: number; tone: Tone; dot?: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="truncate text-sm font-medium text-slate-700">{label}</span>
        <span className="hidden text-xs text-slate-400 tabular sm:inline">{count.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:w-32">
          <div className={cn('h-1.5 rounded-full transition-all duration-500', BAR[tone])} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-12 text-right text-sm font-medium text-slate-900 tabular">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}
