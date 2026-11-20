import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from '../src';

describe('parseRetryAfter', () => {
  it('reads numeric Retry-After headers', () => {
    expect(parseRetryAfter('12', '')).toBe(12000);
  });
  it('reads Groq-style hints from the error body (regression: TPM 429s on 2026-11-20)', () => {
    expect(parseRetryAfter(null, 'Rate limit reached ... Please try again in 7.25s. Need more tokens?')).toBe(7250);
    expect(parseRetryAfter(null, 'Please try again in 1m2.5s.')).toBe(62500);
  });
  it('returns null when there is no hint', () => {
    expect(parseRetryAfter(null, 'internal error')).toBeNull();
  });
});
