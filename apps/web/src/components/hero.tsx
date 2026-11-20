import type { RoleCategory } from '@beep/shared';
import { ArrowRight, GraduationCap, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFilters } from '@/hooks/queries';
import { HUES, ROLE_FAMILIES } from '@/lib/colors';
import { fmtNumber } from '@/lib/format';
import { useLiveActivity } from './live';
import { ScoutConsole } from './scout';
import { LivePill, NavyBackdrop } from './showcase';

/** Landing hero: headline, search, field shortcuts, and the live AI Scout console. */
export function Hero() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const filters = useFilters();
  const live = useLiveActivity(10_000);
  const roleCount = (roles: RoleCategory[]) => (filters.data?.roles ?? []).filter((r) => roles.includes(r.value)).reduce((n, r) => n + r.count, 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : '/jobs');
  };
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[#0b1120] px-6 py-10 text-white ring-1 ring-white/5 sm:px-10 sm:py-14">
      <NavyBackdrop />
      <div className="relative grid items-center gap-10 xl:grid-cols-[1.05fr_1fr]">
        <div>
          <LivePill tone={live.data?.pipeline.status === 'offline' ? 'amber' : 'emerald'}>{live.data ? `${fmtNumber(live.data.ai.total)} live roles · refreshed daily` : 'Live'}</LivePill>
          <h1 className="mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3.25rem]">
            Your first job,
            <br />
            found by <span className="text-indigo-300">AI</span>.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:text-[1.0625rem]">
            Fresher jobs and internships from India’s leading companies — collected from their own job boards every morning, de-duplicated, and tagged by role and city.
          </p>
          <form onSubmit={submit} className="mt-8 flex max-w-lg items-center gap-2 rounded-2xl bg-white p-1.5 shadow-[0_20px_50px_-20px_rgb(79_70_229/0.6)]" role="search">
            <Search className="ml-3 size-4 shrink-0 text-slate-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Role, skill or company — e.g. data analyst" aria-label="Search jobs" className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[0.9375rem] text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            <button type="submit" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500">
              Search <ArrowRight className="size-4" />
            </button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            {ROLE_FAMILIES.map((f) => (
              <Link key={f.key} to={`/jobs?role=${f.roles.join(',')}`} className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[0.8125rem] text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.12]">
                <span className="size-1.5 rounded-full" style={{ background: HUES[f.hue].solid }} aria-hidden />
                {f.label}
                {filters.data && <span className="text-xs text-slate-400 tabular">{fmtNumber(roleCount(f.roles))}</span>}
              </Link>
            ))}
            <Link to="/jobs?internship=true" className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1.5 text-[0.8125rem] font-medium text-indigo-200 ring-1 ring-inset ring-indigo-400/30 transition hover:bg-indigo-500/25">
              <GraduationCap className="size-3.5" /> Internships
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-400" /> Official public job boards only</span>
            <span className="flex items-center gap-1.5"><Sparkles className="size-4 text-indigo-300" /> AI tags verified against the source</span>
          </div>
        </div>
        <ScoutConsole rows={5} compact />
      </div>
    </section>
  );
}
