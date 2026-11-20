/** Dev smoke check: run every registered adapter live (no DB writes) and print counts. */
import { SOURCE_REGISTRY } from '@beep/database';
import { sourceIdFor } from '../packages/database/src/source-registry';
import { collectFromSource } from '@beep/scraper-engine';
import { normalizeJob } from '@beep/normalization';

let total = 0; const byCity = new Map<string, number>();
const results = await Promise.allSettled(SOURCE_REGISTRY.map(async (s) => {
  const r = await collectFromSource({ adapterType: s.adapterType, boardToken: s.boardToken, companyName: s.companyName, sourceId: sourceIdFor(s.adapterType, s.boardToken), sourceName: s.companyName, rateLimitPerMinute: 30, indiaOnly: true });
  for (const j of r.jobs) { const n = normalizeJob(j); byCity.set(n.primaryCity ?? `(${n.locationType})`, (byCity.get(n.primaryCity ?? `(${n.locationType})`) ?? 0) + 1); }
  return `${s.adapterType.padEnd(10)} ${s.boardToken.padEnd(32)} fetched=${r.fetched} india=${r.jobs.length} invalid=${r.invalid.length} pages=${r.pagesFetched}`;
}));
for (const r of results) { if (r.status === 'fulfilled') { console.log(r.value); total += Number(/india=(\d+)/.exec(r.value)![1]); } else console.log('FAILED', r.reason?.message); }
console.log('TOTAL India postings:', total);
console.log('Cities:', [...byCity.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(', '));
