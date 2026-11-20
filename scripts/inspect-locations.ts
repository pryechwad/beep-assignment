import { SOURCE_REGISTRY } from '@beep/database';
import { sourceIdFor } from '../packages/database/src/source-registry';
import { collectFromSource } from '@beep/scraper-engine';
import { summarizeLocations } from '@beep/normalization';
const counts = new Map<string, number>();
for (const s of SOURCE_REGISTRY) {
  const r = await collectFromSource({ adapterType: s.adapterType, boardToken: s.boardToken, companyName: s.companyName, sourceId: sourceIdFor(s.adapterType, s.boardToken), sourceName: s.companyName, rateLimitPerMinute: 60, indiaOnly: true });
  if (r.invalid.length) console.log('INVALID', s.boardToken, JSON.stringify(r.invalid).slice(0, 400));
  for (const j of r.jobs) { const l = summarizeLocations(j.locations); if (l.locationType === 'UNKNOWN' || l.locationType === 'STATE') { const k = `${l.locationType} :: ${j.locations.join(' || ')}`; counts.set(k, (counts.get(k) ?? 0) + 1); } }
}
for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(n, k);
