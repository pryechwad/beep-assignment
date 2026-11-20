const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—‑]/g, '-')
    .replace(/[•·▪]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s: string) => norm(s).replace(/[^a-z0-9+#. ]+/g, ' ').split(' ').filter(Boolean);

/**
 * Is `quote` actually present in the posting? Exact match after whitespace /
 * punctuation normalisation, or — to tolerate ellipses and minor trimming — at
 * least 90% of the quote's words appearing contiguously-in-order in a window.
 */
export function isQuoteGrounded(quote: string, source: string): boolean {
  const q = norm(quote).replace(/^["']|["']$/g, '').replace(/\.\.\.|…/g, ' ');
  if (!q) return false;
  const s = norm(source);
  if (s.includes(q)) return true;
  const qw = words(q);
  if (qw.length < 3) return false;
  const sw = words(source);
  const need = Math.ceil(qw.length * 0.9);
  // Greedy in-order match inside windows starting at each occurrence of the first matching word.
  for (let start = 0; start < sw.length; start++) {
    if (sw[start] !== qw[0] && sw[start] !== qw[1]) continue;
    let qi = 0;
    let hits = 0;
    for (let si = start; si < Math.min(sw.length, start + qw.length * 2) && qi < qw.length; si++) {
      if (sw[si] === qw[qi]) {
        hits++;
        qi++;
      } else if (sw[si] === qw[qi + 1]) {
        qi += 2;
        hits++;
      }
    }
    if (hits >= need) return true;
  }
  return false;
}

/** Does `value` (e.g. an extracted city or skill) literally appear in the source text? */
export function appearsIn(value: string, source: string): boolean {
  const v = norm(value);
  if (!v) return false;
  return new RegExp(`(?<![a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(norm(source));
}
