import type { RoleCategory } from '@beep/shared';
import { GraduationCap, Search, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFilters } from '@/hooks/queries';
import { HUES, ROLE_FAMILIES } from '@/lib/colors';
import { fmtNumber } from '@/lib/format';
import { Button } from './ui/button';

/** Hero: search + one-click shortcuts into each field, with live counts. */
export function Hero() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const filters = useFilters();
  const roleCount = (roles: RoleCategory[]) => (filters.data?.roles ?? []).filter((r) => roles.includes(r.value)).reduce((n, r) => n + r.count, 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : '/jobs');
  };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface px-5 py-6 shadow-card sm:px-8 sm:py-8">
      {/* soft colour wash — decorative, behind content */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(600px 220px at 0% 0%, ${HUES.blue.soft}, transparent 70%), radial-gradient(520px 220px at 100% 0%, ${HUES.violet.soft}, transparent 70%), radial-gradient(420px 200px at 60% 120%, ${HUES.teal.soft}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-accent-ink ring-1 ring-accent/20">
            <Sparkles className="h-3 w-3" /> India · early-career jobs
          </span>
        </div>
        <h1 className="mt-4 max-w-2xl text-[1.625rem] font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[2rem]">
          Find your first job or internship — <span style={{ color: HUES.blue.solid }}>straight from employers</span>.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-2">Live openings from company career boards across India, cleaned up, de-duplicated and tagged for freshers.</p>
        <form onSubmit={submit} className="mt-5 flex max-w-xl gap-2" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try “data analyst”, “intern”, “React”…"
              aria-label="Search jobs"
              className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-ink shadow-card placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
            />
          </div>
          <Button type="submit" variant="accent" size="lg" className="h-11 rounded-xl px-5">
            Search
          </Button>
        </form>
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-ink-2">Explore by field</p>
          <div className="flex flex-wrap gap-2">
            {ROLE_FAMILIES.map((f) => {
              const h = HUES[f.hue];
              const n = roleCount(f.roles);
              return (
                <Link
                  key={f.key}
                  to={`/jobs?role=${f.roles.join(',')}`}
                  className="group inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-[0.8125rem] font-medium transition-all hover:-translate-y-px hover:shadow-card"
                  style={{ borderColor: h.ring, color: h.ink }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: h.solid }} aria-hidden />
                  {f.label}
                  {filters.data && <span className="rounded-full px-1.5 text-2xs tabular" style={{ background: h.soft }}>{fmtNumber(n)}</span>}
                </Link>
              );
            })}
            <Link to="/jobs?internship=true" className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-white transition-all hover:-translate-y-px hover:shadow-card" style={{ background: HUES.violet.solid }}>
              <GraduationCap className="h-3.5 w-3.5" /> Internships
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
