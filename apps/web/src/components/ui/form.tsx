import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export function Checkbox({ checked, onCheckedChange, id, label, hint }: { checked: boolean; onCheckedChange: (v: boolean) => void; id: string; label: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[0.8125rem] text-ink-2 hover:bg-subtle">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-line-strong bg-surface data-[state=checked]:border-ink data-[state=checked]:bg-ink"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint !== undefined && <span className="font-mono text-2xs text-muted tabular">{hint}</span>}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({ value, onValueChange, options, placeholder, label, className, id }: { value: string | undefined; onValueChange: (v: string) => void; options: SelectOption[]; placeholder?: string; label: string; className?: string; id?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        className={cn('inline-flex h-8 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-[0.8125rem] text-ink shadow-card hover:border-faint data-[placeholder]:text-muted', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none items-center rounded px-2 py-1.5 pr-7 text-[0.8125rem] text-ink-2 outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-ink">
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const Label = ({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) => (
  <label htmlFor={htmlFor} className={cn('mb-1 block text-xs font-medium text-ink-2', className)}>
    {children}
  </label>
);

export const FieldError = ({ children }: { children?: ReactNode }) => (children ? <p className="mt-1 text-xs text-danger">{children}</p> : null);

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn('flex gap-4 border-b border-line', className)}>{children}</TabsPrimitive.List>;
}
export const TabsTrigger = forwardRef<HTMLButtonElement, { value: string; children: ReactNode }>(({ value, children }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    value={value}
    className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent pb-2 text-[0.8125rem] font-medium text-muted hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink"
  >
    {children}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = 'TabsTrigger';
