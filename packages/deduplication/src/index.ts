import { descriptionSimilarity, locationSimilarity, trigramSimilarity } from './similarity';

export * from './similarity';

export type DuplicateLayer = 'SOURCE_ID' | 'CANONICAL_URL' | 'NORMALIZED_KEY' | 'FUZZY' | 'SEMANTIC';
export type DuplicateDecision = 'MERGED' | 'DISTINCT' | 'NEEDS_REVIEW';

/** The minimum a dedup comparison needs to know about one posting. */
export interface DedupRecord {
  sourceId: string;
  externalId: string;
  companyKey: string;
  title: string;
  titleKey: string;
  cities: (string | null)[];
  description: string;
  canonicalUrl: string;
  dedupKey: string;
}

/** A canonical job plus the source references already merged into it. */
export interface DedupCandidate extends DedupRecord {
  jobId: string;
  /** "sourceId::externalId" of every raw record already attached to this job. */
  sourceRefs: string[];
  /** Cosine similarity of embeddings, when both sides have one. */
  semanticSimilarity?: number | null;
}

export interface DuplicateFactors {
  title: number;
  company: number;
  location: number;
  description: number;
  semantic: number | null;
  sameSource: boolean;
}

export interface DuplicateMatch {
  jobId: string;
  layer: DuplicateLayer;
  score: number;
  decision: DuplicateDecision;
  factors: DuplicateFactors;
  reason: string;
}

/** Thresholds, exported so the evaluation report can cite them. */
export const DEDUP_THRESHOLDS = {
  /** Composite score at or above which cross-source postings are merged automatically. */
  autoMerge: 0.88,
  /** Composite score at or above which a pair is recorded for human review. */
  review: 0.72,
  /** Description shingle similarity required to merge a layer-2 (same key) cross-source pair. */
  keyMatchDescription: 0.45,
  /** Same-source pairs this similar are flagged as probable re-posts (never auto-merged). */
  sameSourceRepost: 0.92,
} as const;

const WEIGHTS = { title: 0.35, company: 0.15, location: 0.15, description: 0.35 };
const WEIGHTS_WITH_SEMANTIC = { title: 0.3, company: 0.1, location: 0.15, description: 0.2, semantic: 0.25 };

function factorsFor(incoming: DedupRecord, c: DedupCandidate): DuplicateFactors {
  return {
    title: trigramSimilarity(incoming.titleKey, c.titleKey),
    company: incoming.companyKey === c.companyKey ? 1 : trigramSimilarity(incoming.companyKey, c.companyKey),
    location: locationSimilarity(incoming.cities, c.cities),
    description: descriptionSimilarity(incoming.description, c.description),
    semantic: c.semanticSimilarity ?? null,
    sameSource: c.sourceRefs.some((ref) => ref.startsWith(`${incoming.sourceId}::`)),
  };
}

export function compositeScore(f: DuplicateFactors): number {
  if (f.semantic !== null) {
    const w = WEIGHTS_WITH_SEMANTIC;
    return w.title * f.title + w.company * f.company + w.location * f.location + w.description * f.description + w.semantic * f.semantic;
  }
  return WEIGHTS.title * f.title + WEIGHTS.company * f.company + WEIGHTS.location * f.location + WEIGHTS.description * f.description;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const roundFactors = (f: DuplicateFactors): DuplicateFactors => ({
  ...f,
  title: round(f.title),
  company: round(f.company),
  location: round(f.location),
  description: round(f.description),
  semantic: f.semantic === null ? null : round(f.semantic),
});

/**
 * Compare one incoming posting against one canonical job.
 *
 * Principles:
 *  - Layer 1 (source id, canonical URL) is definitive.
 *  - Two different ids from the *same* source are, by the source's own account,
 *    separate openings — they are never auto-merged; near-identical ones are
 *    flagged NEEDS_REVIEW as probable re-posts.
 *  - Different companies are never duplicates.
 *  - Different cities for the same title are separate openings.
 */
export function compareWithCandidate(incoming: DedupRecord, c: DedupCandidate): DuplicateMatch | null {
  const ref = `${incoming.sourceId}::${incoming.externalId}`;
  const raw = factorsFor(incoming, c);
  const factors = roundFactors(raw);

  if (c.sourceRefs.includes(ref)) {
    return { jobId: c.jobId, layer: 'SOURCE_ID', score: 1, decision: 'MERGED', factors, reason: 'Same source and external id' };
  }
  if (incoming.canonicalUrl === c.canonicalUrl) {
    return { jobId: c.jobId, layer: 'CANONICAL_URL', score: 1, decision: 'MERGED', factors, reason: 'Identical canonical posting URL' };
  }
  if (incoming.companyKey !== c.companyKey) return null;

  const score = round(compositeScore(raw));

  if (raw.sameSource) {
    if (incoming.dedupKey === c.dedupKey && raw.description >= DEDUP_THRESHOLDS.sameSourceRepost) {
      return {
        jobId: c.jobId,
        layer: 'NORMALIZED_KEY',
        score,
        decision: 'NEEDS_REVIEW',
        factors,
        reason: 'Same source lists two ids with identical title, location and near-identical text — possible re-post',
      };
    }
    return null;
  }

  // Cross-source comparisons from here on.
  if (raw.location === 0) return null; // explicitly different cities → different openings

  if (incoming.dedupKey === c.dedupKey) {
    const decision: DuplicateDecision = raw.description >= DEDUP_THRESHOLDS.keyMatchDescription ? 'MERGED' : 'NEEDS_REVIEW';
    return {
      jobId: c.jobId,
      layer: 'NORMALIZED_KEY',
      score,
      decision,
      factors,
      reason: decision === 'MERGED' ? 'Same company, title and location with matching description' : 'Same company, title and location but descriptions differ',
    };
  }

  if (score >= DEDUP_THRESHOLDS.review) {
    const layer: DuplicateLayer = raw.semantic !== null ? 'SEMANTIC' : 'FUZZY';
    const decision: DuplicateDecision = score >= DEDUP_THRESHOLDS.autoMerge && raw.title >= 0.6 ? 'MERGED' : 'NEEDS_REVIEW';
    return { jobId: c.jobId, layer, score, decision, factors, reason: `Composite similarity ${score}` };
  }
  return null;
}

/**
 * Find the best match for an incoming posting among candidate canonical jobs.
 * Returns the highest-priority match (definitive layers first, then score).
 */
export function findDuplicate(incoming: DedupRecord, candidates: DedupCandidate[]): DuplicateMatch | null {
  const LAYER_RANK: Record<DuplicateLayer, number> = { SOURCE_ID: 0, CANONICAL_URL: 1, NORMALIZED_KEY: 2, SEMANTIC: 3, FUZZY: 4 };
  const DECISION_RANK: Record<DuplicateDecision, number> = { MERGED: 0, NEEDS_REVIEW: 1, DISTINCT: 2 };
  const matches = candidates.map((c) => compareWithCandidate(incoming, c)).filter((m): m is DuplicateMatch => m !== null);
  matches.sort((a, b) => DECISION_RANK[a.decision] - DECISION_RANK[b.decision] || LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || b.score - a.score);
  return matches[0] ?? null;
}
