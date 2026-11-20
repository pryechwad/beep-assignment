import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EMPLOYMENT_LABELS, EXPERIENCE_LABELS, ROLE_LABELS, SOURCE_ADAPTER_LABELS, WORK_MODE_LABELS } from '@beep/shared';
import type { EmploymentType, ExperienceLevel, JobListItem, RoleCategory, SourceAdapterType, WorkMode } from '@beep/shared';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const nf = new Intl.NumberFormat('en-IN');
export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? '—' : nf.format(n));
export const fmtUsd = (n: number | null | undefined, digits = 4) =>
  n === null || n === undefined ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? `${dateTimeFmt.format(new Date(iso))} IST` : '—');

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d}d ago`;
  return fmtDate(iso);
}

export const roleLabel = (r: RoleCategory | null | undefined) => (r ? ROLE_LABELS[r] : 'Unclassified');
export const expLabel = (e: ExperienceLevel | null | undefined) => (e ? EXPERIENCE_LABELS[e] : 'Not yet classified');
export const empLabel = (e: EmploymentType | null | undefined) => (e ? EMPLOYMENT_LABELS[e] : 'Not stated');
export const modeLabel = (w: WorkMode | null | undefined) => (w ? WORK_MODE_LABELS[w] : null);
export const sourceLabel = (s: SourceAdapterType) => SOURCE_ADAPTER_LABELS[s];

export function locationLabel(j: Pick<JobListItem, 'locationType' | 'primaryCity' | 'primaryState' | 'cities'>): string {
  if (j.cities.length > 1) return `${j.cities[0]} +${j.cities.length - 1}`;
  if (j.primaryCity) return j.primaryCity;
  if (j.locationType === 'REMOTE') return 'Remote · India';
  if (j.primaryState) return j.primaryState;
  return 'India · city not stated';
}

/** Two-letter monogram for a company — a neutral identity mark, never a fabricated logo. */
export function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
