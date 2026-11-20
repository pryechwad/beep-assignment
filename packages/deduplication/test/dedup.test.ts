import { describe, expect, it } from 'vitest';
import { compareWithCandidate, descriptionSimilarity, findDuplicate, trigramSimilarity, type DedupCandidate, type DedupRecord } from '../src';

const DESC =
  'We are looking for a backend engineer to build payment APIs in Go and PostgreSQL. You will own services end to end, ' +
  'work with product teams, write tests, review code and improve reliability of our ledger platform used by millions of merchants.';

const rec = (over: Partial<DedupRecord> = {}): DedupRecord => ({
  sourceId: 'greenhouse:acme',
  externalId: '1',
  companyKey: 'acme',
  title: 'Backend Engineer',
  titleKey: 'backend engineer',
  cities: ['Bengaluru'],
  description: DESC,
  canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/1',
  dedupKey: 'acme|backend engineer|bengaluru',
  ...over,
});
const cand = (over: Partial<DedupCandidate> = {}): DedupCandidate => ({
  ...rec(),
  jobId: 'job_1',
  sourceRefs: ['greenhouse:acme::1'],
  ...over,
});

describe('similarity primitives', () => {
  it('scores near-identical titles highly and different ones low', () => {
    expect(trigramSimilarity('backend engineer', 'backend engineer')).toBe(1);
    expect(trigramSimilarity('backend engineer', 'back-end engineer')).toBeGreaterThan(0.6);
    expect(trigramSimilarity('backend engineer', 'product designer')).toBeLessThan(0.2);
  });
  it('description similarity tolerates small edits', () => {
    expect(descriptionSimilarity(DESC, DESC + ' Apply now.')).toBeGreaterThan(0.9);
    expect(descriptionSimilarity(DESC, 'Completely unrelated role in sales and marketing.')).toBe(0);
  });
});

describe('layer 1 — definitive identity', () => {
  it('merges the same source + external id', () => {
    expect(compareWithCandidate(rec(), cand())).toMatchObject({ layer: 'SOURCE_ID', decision: 'MERGED' });
  });
  it('merges identical canonical URLs from different sources', () => {
    const m = compareWithCandidate(rec({ sourceId: 'lever:acme', externalId: 'x' }), cand());
    expect(m).toMatchObject({ layer: 'CANONICAL_URL', decision: 'MERGED' });
  });
});

describe('layer 2 — normalised key', () => {
  it('merges cross-source postings with same key and matching description', () => {
    const m = compareWithCandidate(rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x' }), cand());
    expect(m).toMatchObject({ layer: 'NORMALIZED_KEY', decision: 'MERGED' });
  });
  it('sends same-key cross-source postings with different descriptions to review', () => {
    const m = compareWithCandidate(
      rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x', description: 'Payments team. Different responsibilities entirely, in Java and Kafka for risk systems.' }),
      cand(),
    );
    expect(m?.decision).toBe('NEEDS_REVIEW');
  });
});

describe('guards against false merges', () => {
  it('never merges two ids from the same source, even if identical (flags as re-post instead)', () => {
    const m = compareWithCandidate(rec({ externalId: '2', canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/2' }), cand());
    expect(m?.decision).toBe('NEEDS_REVIEW');
  });
  it('treats the same title in a different city as a separate opening', () => {
    const m = compareWithCandidate(
      rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x', cities: ['Mumbai'], dedupKey: 'acme|backend engineer|mumbai' }),
      cand(),
    );
    expect(m).toBeNull();
  });
  it('never matches across companies', () => {
    expect(compareWithCandidate(rec({ companyKey: 'other', sourceId: 'lever:other', externalId: 'y', canonicalUrl: 'https://x.y/1' }), cand())).toBeNull();
  });
  it('ignores same-source jobs with different titles', () => {
    expect(compareWithCandidate(rec({ externalId: '3', canonicalUrl: 'https://b/3', title: 'Data Analyst', titleKey: 'data analyst', dedupKey: 'acme|data analyst|bengaluru' }), cand())).toBeNull();
  });
});

describe('layer 3 — fuzzy / semantic', () => {
  it('merges a cross-source variant title with identical text', () => {
    const m = compareWithCandidate(
      rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x', titleKey: 'backend engineer payments', dedupKey: 'acme|backend engineer payments|bengaluru' }),
      cand(),
    );
    expect(m?.layer).toBe('FUZZY');
    expect(m?.score).toBeGreaterThanOrEqual(0.72);
  });
  it('uses semantic similarity when provided', () => {
    const m = compareWithCandidate(
      rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x', titleKey: 'backend engineer payments', dedupKey: 'k2' }),
      cand({ semanticSimilarity: 0.97 }),
    );
    expect(m?.layer).toBe('SEMANTIC');
    expect(m?.factors.semantic).toBe(0.97);
  });
});

describe('findDuplicate', () => {
  it('prefers definitive matches over fuzzy ones', () => {
    const incoming = rec({ sourceId: 'lever:acme', externalId: 'x', canonicalUrl: 'https://jobs.lever.co/acme/x' });
    const fuzzy = cand({ jobId: 'job_fuzzy', sourceRefs: ['ashby:acme::z'], canonicalUrl: 'https://z', titleKey: 'backend engineer payments', dedupKey: 'k' });
    const exact = cand({ jobId: 'job_exact', sourceRefs: ['lever:acme::x'], canonicalUrl: 'https://other' });
    expect(findDuplicate(incoming, [fuzzy, exact])?.jobId).toBe('job_exact');
  });
  it('returns null when nothing matches', () => {
    expect(findDuplicate(rec(), [])).toBeNull();
  });
});
