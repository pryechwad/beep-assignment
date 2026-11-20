/**
 * Picks a varied, relevant subset for featured sections (home, insights, live feed):
 * at most `perCompany` items per company and classified roles before "Other"/unclassified.
 * The full job explorer always shows every posting — curation only affects highlights.
 */
export function curate<T>(items: T[], limit: number, get: (item: T) => { company: string; role: string | null }, perCompany = 1): T[] {
  const picked: T[] = [];
  const perCo = new Map<string, number>();
  const pass = (allowWeakRole: boolean, cap: number) => {
    for (const it of items) {
      if (picked.length >= limit) return;
      if (picked.includes(it)) continue;
      const { company, role } = get(it);
      if (!allowWeakRole && (!role || role === 'OTHER')) continue;
      const n = perCo.get(company) ?? 0;
      if (n >= cap) continue;
      perCo.set(company, n + 1);
      picked.push(it);
    }
  };
  pass(false, perCompany); // varied companies, real roles
  pass(false, perCompany + 1); // allow a second from the same company
  pass(true, Number.POSITIVE_INFINITY); // fill if the index is small
  return picked;
}
