import { cva, type VariantProps } from 'class-variance-authority';
import { Search, X } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { companyHue, HUES, type Hue } from '@/lib/colors';
import { cn, monogram } from '@/lib/format';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[0.8125rem] text-ink placeholder:text-faint transition-colors',
      'hover:border-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/12 disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onValueChange: (v: string) => void;
  shortcut?: string;
}
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({ value, onValueChange, shortcut, className, ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
      <Input ref={ref} value={value} onChange={(e) => onValueChange(e.target.value)} className="pl-8 pr-14" type="search" {...props} />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button type="button" onClick={() => onValueChange('')} className="rounded p-0.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          shortcut && <Kbd>{shortcut}</Kbd>
        )}
      </div>
    </div>
  );
});

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line bg-subtle px-1.5 font-mono text-[0.625rem] leading-4 text-muted">{children}</kbd>
);

const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border px-1.5 text-2xs font-medium leading-[18px]', {
  variants: {
    tone: {
      neutral: 'border-line bg-subtle text-ink-2',
      outline: 'border-line-strong bg-surface text-ink-2',
      accent: 'border-accent/20 bg-accent-soft text-accent-ink',
      success: 'border-success/20 bg-success-soft text-success',
      warning: 'border-warning/25 bg-warning-soft text-[#8a5f17]',
      danger: 'border-danger/20 bg-danger-soft text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;

/** Status dot + label — colour never carries meaning alone. */
export function StatusDot({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral' | 'accent'; children: ReactNode }) {
  const color = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-faint', accent: 'bg-accent' }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} aria-hidden />
      {children}
    </span>
  );
}

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-line bg-surface shadow-card', className)} {...p} />
);

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[0.8125rem] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn('animate-shimmer rounded bg-subtle', className)}
    style={{ backgroundImage: 'linear-gradient(90deg, transparent 0, rgb(255 255 255 / 0.7) 50%, transparent 100%)', backgroundSize: '400px 100%', backgroundRepeat: 'no-repeat' }}
  />
);

/** Company identity: coloured monogram tile (stable colour per company). We never show logos we haven't verified. */
export function CompanyMark({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-6 w-6 text-[0.625rem] rounded-[5px]', md: 'h-9 w-9 text-xs rounded-lg', lg: 'h-12 w-12 text-base rounded-xl' }[size];
  const h = HUES[companyHue(name)];
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center font-bold tracking-tight', s)} style={{ background: h.soft, color: h.ink, boxShadow: `inset 0 0 0 1px ${h.ring}` }}>
      {monogram(name)}
    </span>
  );
}

/** Coloured pill badge; `dot` adds a solid colour dot before the label. */
export function HueBadge({ hue, children, dot, className }: { hue: Hue; children: ReactNode; dot?: boolean; className?: string }) {
  const h = HUES[hue];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-2xs font-medium leading-5', className)} style={{ background: h.soft, color: h.ink }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: h.solid }} aria-hidden />}
      {children}
    </span>
  );
}

/** Small tinted square holding an icon — used for KPI and section headers. */
export function IconTile({ hue, children, className }: { hue: Hue; children: ReactNode; className?: string }) {
  const h = HUES[hue];
  return (
    <span aria-hidden className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', className)} style={{ background: h.soft, color: h.solid }}>
      {children}
    </span>
  );
}

export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-2xs uppercase tracking-[0.04em] text-muted', className)}>{children}</span>;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn(vertical ? 'h-4 w-px' : 'h-px w-full', 'bg-line', className)} />;
}
