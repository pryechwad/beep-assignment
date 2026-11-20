import { BarChart3, BookOpen, Bot, Briefcase, Building2, ClipboardCheck, Coins, Database, House, LayoutDashboard, LogOut, Menu, Radar, ScrollText, Search, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession, useLogout } from '@/hooks/use-session';
import { cn } from '@/lib/format';
import { LiveSyncPill } from './live';
import { Button } from './ui/button';
import { Dialog } from './ui/overlay';

export function Wordmark({ to = '/', subtitle = 'Job Intelligence' }: { to?: string; subtitle?: ReactNode }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-3" aria-label="Beep Job Intelligence home">
      <span className="flex size-10 items-center justify-center rounded-xl bg-[#0b1120] shadow-sm ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="size-5 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13 7h8m0 0v8m0-8-8 8-4-4-6 6" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold tracking-tight text-slate-900">beep<span className="text-indigo-500">.</span>jobs</span>
        <span className="block text-xs font-medium text-slate-500">{subtitle}</span>
      </span>
    </Link>
  );
}

const PUBLIC_SECTIONS: { title: string; items: { to: string; label: string; icon: ReactNode; end?: boolean }[] }[] = [
  {
    title: 'Discover',
    items: [
      { to: '/', label: 'Home', icon: <House />, end: true },
      { to: '/jobs', label: 'Jobs', icon: <Briefcase /> },
      { to: '/companies', label: 'Companies', icon: <Building2 /> },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/scout', label: 'AI Scout', icon: <Radar /> },
      { to: '/insights', label: 'Insights', icon: <LayoutDashboard /> },
      { to: '/analytics', label: 'Analytics', icon: <BarChart3 /> },
    ],
  },
  { title: 'About', items: [{ to: '/about', label: 'Methodology', icon: <BookOpen /> }] },
];

const PAGE_TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/jobs\/.+/, 'Job details'],
  [/^\/jobs/, 'Jobs'],
  [/^\/companies/, 'Companies'],
  [/^\/scout/, 'AI Scout'],
  [/^\/insights/, 'Insights'],
  [/^\/analytics/, 'Analytics'],
  [/^\/about/, 'Methodology'],
];

function NavSearch({ onDone, className }: { onDone?: () => void; className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : '/jobs');
        setQ('');
        onDone?.();
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search jobs, skills, companies…"
        aria-label="Search jobs"
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
      />
    </form>
  );
}

function PublicSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[4.5rem] items-center px-5">
        <Wordmark />
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-3">
        {PUBLIC_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{section.title}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:size-[18px]',
                        isActive ? 'bg-slate-900 text-white shadow-sm [&_svg]:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 [&_svg]:text-slate-400',
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 p-3">
        <div className="relative overflow-hidden rounded-2xl bg-[#0b1120] p-4 text-white ring-1 ring-white/5">
          <div aria-hidden className="absolute -right-10 -top-10 size-28 rounded-full bg-indigo-500/30 blur-2xl" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-200">Data pipeline</p>
            <p className="mt-1 text-xs text-slate-300">Boards swept daily at 06:30 IST, tagged by AI around the clock.</p>
            <div className="mt-3"><LiveSyncPill /></div>
          </div>
        </div>
        <Link to="/admin" onClick={onNavigate} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-100">
          <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">A</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Admin console</span>
            <span className="block text-xs text-slate-500">Operations & evaluation</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

export function PublicLayout() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const title = PAGE_TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? '';
  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-white/95 backdrop-blur lg:block">
        <PublicSidebar />
      </aside>
      <Dialog open={menu} onOpenChange={setMenu} title="beep.jobs" variant="drawer" className="max-w-xs [&>div:nth-child(2)]:p-0">
        <PublicSidebar onNavigate={() => setMenu(false)} />
      </Dialog>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="lg:hidden"><Wordmark /></div>
          <h2 className="hidden truncate text-base font-semibold text-slate-900 lg:block">{title}</h2>
          <div className="ml-auto flex items-center gap-3">
            <NavSearch className="hidden w-72 md:block" />
            <div className="hidden sm:block"><LiveSyncPill /></div>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Fresher jobs and internships across India, collected daily from employers’ public job boards. Always apply on the original posting.</span>
          <span className="flex gap-4">
            <Link to="/about" className="hover:text-slate-900">Methodology</Link>
            <a href="/api/v1/openapi.json" className="hover:text-slate-900">Public API</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-ink sm:text-[1.375rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/pipeline', label: 'Pipeline', icon: Workflow },
  { to: '/admin/sources', label: 'Sources', icon: Database },
  { to: '/admin/ai', label: 'AI classification', icon: Bot },
  { to: '/admin/evaluation', label: 'Evaluation', icon: ClipboardCheck },
  { to: '/admin/costs', label: 'Costs', icon: Coins },
  { to: '/admin/logs', label: 'Logs', icon: ScrollText },
];

export function AdminLayout() {
  const session = useSession();
  const logout = useLogout();
  const [menu, setMenu] = useState(false);
  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenu(false)}
          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] text-ink-2 hover:bg-subtle hover:text-ink', isActive && 'bg-accent-soft font-semibold text-accent-ink [&_svg]:text-accent')}
        >
          <Icon className="h-3.5 w-3.5 text-muted" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-canvas px-3 py-4 lg:flex">
        <div className="px-1 pb-5">
          <Wordmark to="/admin" />
          <p className="mt-1 pl-8 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Operations</p>
        </div>
        {nav}
        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <Link to="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-subtle hover:text-ink">
            <BarChart3 className="h-3.5 w-3.5" /> Public site
          </Link>
          <button type="button" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-subtle hover:text-ink">
            <LogOut className="h-3.5 w-3.5" /> Sign out <span className="ml-auto truncate font-mono text-2xs">{session.data?.email}</span>
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-12 items-center gap-3 border-b border-line px-4 lg:hidden">
          <Button size="icon-sm" variant="ghost" onClick={() => setMenu(true)} aria-label="Open admin menu">
            <Menu className="h-4 w-4" />
          </Button>
          <Wordmark to="/admin" />
        </header>
        <Dialog open={menu} onOpenChange={setMenu} title="Operations" variant="drawer" className="max-w-xs">
          {nav}
        </Dialog>
        <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

