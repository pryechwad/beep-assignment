import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/format';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
/** Global toast queue (Zustand: toasts are raised from anywhere — mutations, queries, auth). */
export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id: ++seq }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ title, description, tone: 'success' }),
  error: (title: string, description?: string) => useToasts.getState().push({ title, description, tone: 'error' }),
  info: (title: string, description?: string) => useToasts.getState().push({ title, description, tone: 'info' }),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="flex w-[22rem] items-start gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-pop data-[state=open]:animate-[slideUp_160ms_ease-out]"
        >
          {t.tone === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' ? 'text-success' : 'text-accent')} />}
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-[0.8125rem] font-medium text-ink">{t.title}</ToastPrimitive.Title>
            {t.description && <ToastPrimitive.Description className="mt-0.5 text-xs text-muted">{t.description}</ToastPrimitive.Description>}
          </div>
          <ToastPrimitive.Close className="rounded p-0.5 text-muted hover:bg-subtle" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
