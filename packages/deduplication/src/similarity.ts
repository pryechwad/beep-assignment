/** Similarity primitives used by duplicate detection. All return values in [0, 1]. */

function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** pg_trgm-style trigram similarity — robust to small spelling/ordering differences in titles. */
export function trigramSimilarity(a: string, b: string): number {
  return jaccard(trigrams(a), trigrams(b));
}

const STOP = new Set('a an and the of to in for with on at by is are be as or we you our your will from this that it'.split(' '));

function shingles(text: string, size = 4, maxWords = 600): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .slice(0, maxWords);
  const out = new Set<string>();
  if (words.length < size) {
    if (words.length) out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i <= words.length - size; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

/** Word-shingle Jaccard: high only when descriptions share long runs of identical text. */
export function descriptionSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  return jaccard(shingles(a), shingles(b));
}

/** Overlap of city sets. Two postings without any city are "unknown", scored neutrally. */
export function locationSimilarity(a: (string | null)[], b: (string | null)[]): number {
  const sa = new Set(a.filter((x): x is string => !!x).map((x) => x.toLowerCase()));
  const sb = new Set(b.filter((x): x is string => !!x).map((x) => x.toLowerCase()));
  if (sa.size === 0 && sb.size === 0) return 0.5;
  if (sa.size === 0 || sb.size === 0) return 0.25;
  return jaccard(sa, sb);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
