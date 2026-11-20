import { describe, expect, it } from 'vitest';
import { computeMetrics, impliedErrorCategories, scorePrediction, stratifiedSample, toCsv, type AuditRow } from '../src';

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  roleCorrect: true, cityCorrect: true, experienceCorrect: true, employmentCorrect: true, eligibilityCorrect: true,
  confidenceLevel: 'HIGH', method: 'HYBRID', errorCategories: [], ...over,
});

describe('scorePrediction', () => {
  it('compares each field; city is case-insensitive and null==null', () => {
    const c = scorePrediction(
      { roleCategory: 'BACKEND', city: 'Bengaluru', experienceLevel: 'FRESHER', employmentType: null, isFresherEligible: true },
      { trueRole: 'BACKEND', trueCity: 'bengaluru', trueExperience: 'ZERO_TO_ONE', trueEmployment: null, trueFresherEligible: true },
    );
    expect(c).toEqual({ roleCorrect: true, cityCorrect: true, experienceCorrect: false, employmentCorrect: true, eligibilityCorrect: true });
    expect(impliedErrorCategories(c)).toEqual(['INCORRECT_EXPERIENCE']);
  });
});

describe('computeMetrics', () => {
  it('applies Accuracy = correct / total × 100 and reports sample size', () => {
    const m = computeMetrics([row(), row({ roleCorrect: false, errorCategories: ['WRONG_ROLE'] }), row(), row({ confidenceLevel: 'LOW', cityCorrect: false })]);
    expect(m.sampleSize).toBe(4);
    expect(m.fields.role).toEqual({ correct: 3, total: 4, accuracy: 75 });
    expect(m.exactMatch).toEqual({ correct: 2, total: 4, accuracy: 50 });
    expect(m.byConfidence.HIGH).toEqual({ correct: 2, total: 3, accuracy: 66.7 });
    expect(m.byConfidence.MEDIUM.accuracy).toBeNull();
    expect(m.errorCategories.WRONG_ROLE).toBe(1);
  });
  it('returns null accuracy (not 0 or 100) when nothing is evaluated', () => {
    expect(computeMetrics([]).exactMatch.accuracy).toBeNull();
  });
});

describe('stratifiedSample', () => {
  const cands = Array.from({ length: 200 }, (_, i) => ({ classificationId: `c${i}`, roleCategory: i % 10 === 0 ? 'DESIGN' : 'SALES', confidenceLevel: (['HIGH', 'MEDIUM', 'LOW'] as const)[i % 3]!, method: 'HYBRID' }));
  it('is deterministic and covers minority strata', () => {
    const a = stratifiedSample(cands, 50);
    expect(a).toHaveLength(50);
    expect(stratifiedSample(cands, 50).map((x) => x.classificationId)).toEqual(a.map((x) => x.classificationId));
    expect(a.filter((x) => x.roleCategory === 'DESIGN').length).toBeGreaterThanOrEqual(15);
  });
  it('returns everything when fewer candidates than requested', () => {
    expect(stratifiedSample(cands.slice(0, 7), 50)).toHaveLength(7);
  });
});

describe('toCsv', () => {
  it('escapes quotes/commas and neutralises formula injection', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: '=HYPERLINK("evil")', d: ['p', 'q'] }]);
    expect(csv).toBe('a,b,c,d\n"x,y","say ""hi""","\'=HYPERLINK(""evil"")",p; q');
  });
});
