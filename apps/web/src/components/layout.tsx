import { BarChart3, Bot, ClipboardCheck, Coins, Database, LayoutDashboard, LogOut, Menu, Search, ScrollText, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession, useLogout } from '@/hooks/use-session';
import { cn } from '@/lib/format';
import { LiveSyncPill } from './live';
import { Button } from './ui/button';
import { Dialog } from './ui/overlay';

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2.5 text-ink" aria-label="Beep Job Intelligence home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg shadow-card" style={{ background: 'linear-gradient(135deg, #315CF5 0%, #7C5CE6 100%)' }}>
        <span className="text-sm font-extrabold text-white">B</span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[0.9375rem] font-extrabold tracking-tight">beep<span style={{ color: '#315CF5' }}>.</span>jobs</span>
        <span className="mt-0.5 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted">Job Intelligence</span>
      </span>
    </Link>
  );
}

const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/jobs', label: 'Jobs', end: false },
  { to: '/companies', label: 'Companies', end: false },
  { to: '/insights', label: 'Insights', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/about', label: 'About', end: false },
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search jobs, skills, companies"
        aria-label="Search jobs"
        className="h-9 w-full rounded-full border border-line bg-subtle pl-8 pr-3 text-[0.8125rem] text-ink placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/12"
      />
    </form>
  );
}

export function PublicLayout() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 shadow-[0_1px_0_rgb(23_25_31/0.02)] backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:px-6 lg:gap-8">
          <Wordmark />
          <nav aria-label="Primary" className="hidden h-16 items-stretch gap-1 lg:flex">
            {PUBLIC_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center px-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink',
                    'after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity',
                    isActive && 'text-accent-ink after:opacity-100',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <NavSearch className="hidden w-60 xl:block" />
            <LiveSyncPill />
            <Button asChild size="md" variant="primary" className="hidden rounded-full px-4 sm:inline-flex">
              <Link to="/admin">Admin</Link>
            </Button>
            <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <Dialog open={menu} onOpenChange={setMenu} title="Menu" variant="drawer" className="max-w-xs">
        <NavSearch className="mb-4" onDone={() => setMenu(false)} />
        <nav aria-label="Mobile" className="flex flex-col gap-0.5">
          {[...PUBLIC_NAV, { to: '/admin', label: 'Admin', end: false }].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenu(false)} className={({ isActive }) => cn('rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2', isActive && 'bg-accent-soft text-accent-ink')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </Dialog>
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-8 text-sm sm:grid-cols-[1fr_auto_auto] sm:px-6">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted">Fresher jobs and internships across India, collected daily from employers’ public job boards and tagged by AI. Always apply on the original posting.</p>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <span className="font-semibold text-ink">Explore</span>
            <Link to="/jobs?fresher=true" className="text-muted hover:text-ink">Fresher jobs</Link>
            <Link to="/jobs?internship=true" className="text-muted hover:text-ink">Internships</Link>
            <Link to="/companies" className="text-muted hover:text-ink">Companies</Link>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <span className="font-semibold text-ink">Transparency</span>
            <Link to="/about" className="text-muted hover:text-ink">How data is collected</Link>
            <Link to="/insights" className="text-muted hover:text-ink">Live insights</Link>
            <a href="/api/v1/openapi.json" className="text-muted hover:text-ink">Public API</a>
          </div>
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

