import type { JobIntelligenceOutput } from '@beep/ai-engine';
import { describe, expect, it } from 'vitest';
import { classifyByRules, classifyJob, classifyRoleByTitle, finalizeFromRules, isQuoteGrounded, mergeWithLLM, rulesSufficient, type NormalizedFacts } from '../src';

const facts = (over: Partial<NormalizedFacts> = {}): NormalizedFacts => ({
  title: 'Software Engineer',
  description: 'We build payments. Requirements: 0-1 years of experience with Python and SQL. Freshers are welcome to apply. B.Tech in CS preferred.',
  locationsRaw: ['Bengaluru, India'],
  department: 'Engineering',
  employmentType: 'FULL_TIME',
  workMode: null,
  locationType: 'CITY',
  primaryCity: 'Bengaluru',
  primaryState: 'Karnataka',
  salaryText: null,
  skills: ['Python', 'SQL'],
  ...over,
});

const llm = (over: Partial<JobIntelligenceOutput> = {}): JobIntelligenceOutput => ({
  role_category: 'SOFTWARE_ENGINEERING',
  role_evidence: 'Software Engineer',
  experience_level: 'FRESHER',
  experience_evidence: '0-1 years of experience',
  min_years_required: 0,
  employment_type: 'FULL_TIME',
  work_mode: null,
  location: { type: 'CITY', city: 'Bengaluru', state: 'Karnataka' },
  is_fresher_eligible: true,
  eligibility_reasoning: 'Freshers are explicitly welcome.',
  eligibility_evidence: ['Freshers are welcome to apply.'],
  education_requirement: 'B.Tech in CS preferred',
  salary_text: null,
  skills: ['Python', 'SQL'],
  summary: 'Build payment systems in Python.',
  ...over,
});

describe('role rules', () => {
  it.each([
    ['Security Analyst', 'CYBERSECURITY'],
    ['Product Designer', 'DESIGN'],
    ['Associate Product Manager', 'PRODUCT'],
    ['Senior Data Engineer', 'DATA_ENGINEERING'],
    ['Machine Learning Engineer', 'AI_ML'],
    ['Frontend Developer (React)', 'FRONTEND'],
    ['Full Stack Engineer', 'FULL_STACK'],
    ['Account Executive', 'SALES'],
    ['Assistant Manager - Internal Audit', 'FINANCE'],
    ['Business Analyst', 'ANALYTICS'],
    ['Site Reliability Engineer', 'DEVOPS'],
    ['SDE 1', 'SOFTWARE_ENGINEERING'],
    ['People Operations Intern', 'OPERATIONS'],
    // regressions from live data (2026-11-20)
    ['Senior Content Marketer', 'MARKETING'],
    ['Account Director, Digital Natives', 'SALES'],
    ['Account Development Representative', 'SALES'],
    ['ML Researcher, Foundational Models', 'AI_ML'],
    ['Applied AI Architect', 'AI_ML'],
    ['Talent Acquisition Intern - IT Recruitment', 'OPERATIONS'],
  ])('%s → %s', (title, role) => {
    expect(classifyRoleByTitle(title, null).value).toBe(role);
  });
  it('marks a bare "Engineer" as weak', () => {
    expect(classifyRoleByTitle('Engineer', null).strength).toBe('weak');
  });
  it('falls back to OTHER with no evidence', () => {
    expect(classifyRoleByTitle('Chef', null)).toMatchObject({ value: 'OTHER', strength: 'none' });
  });
});

describe('experience rules', () => {
  const exp = (title: string, description: string, emp: NormalizedFacts['employmentType'] = null) => classifyByRules({ title, description, department: null, employmentType: emp }).experience;
  it('detects internships from title or source type', () => {
    expect(exp('Backend Intern', '').value).toBe('INTERNSHIP');
    expect(exp('Backend Engineer', '', 'INTERNSHIP').value).toBe('INTERNSHIP');
  });
  it('maps explicit years', () => {
    expect(exp('Engineer', 'Requires 0-1 years of experience.').value).toBe('ZERO_TO_ONE');
    expect(exp('Engineer', 'Requires 1-2 years of experience.').value).toBe('ONE_TO_TWO');
    expect(exp('Engineer', 'You need 4+ years of experience.').value).toBe('EXPERIENCED');
  });
  it('senior titles are experienced; unknown stays unknown', () => {
    expect(exp('Staff Engineer', '').value).toBe('EXPERIENCED');
    expect(exp('Engineer', 'Build things.').value).toBe('UNKNOWN');
  });
});

describe('routing', () => {
  it('skips the LLM only for clearly experienced roles with a clear discipline', () => {
    expect(rulesSufficient(classifyByRules({ title: 'Senior Backend Engineer', description: '', department: null, employmentType: null }))).toBe(true);
    expect(rulesSufficient(classifyByRules({ title: 'Backend Engineer', description: '', department: null, employmentType: null }))).toBe(false);
    expect(rulesSufficient(classifyByRules({ title: 'Senior Engineer', description: '', department: null, employmentType: null }))).toBe(false);
  });

  it('falls back to rules and flags review when no provider is available', async () => {
    const out = await classifyJob(facts(), { runner: null, company: 'Acme', sourceEmploymentType: null, sourceWorkplaceType: null });
    expect(out.route).toBe('llm-unavailable');
    expect(out.result.needsReview).toBe(true);
    expect(out.result.method).toBe('RULES');
  });
});

describe('evidence grounding', () => {
  const src = 'Requirements:\n• 0–1 years of experience\n• Freshers are   welcome to apply.';
  it('accepts verbatim quotes despite whitespace/dash/bullet differences', () => {
    expect(isQuoteGrounded('0-1 years of experience', src)).toBe(true);
    expect(isQuoteGrounded('“Freshers are welcome to apply.”', src)).toBe(true);
  });
  it('rejects text that is not in the posting (e.g. prompt labels)', () => {
    expect(isQuoteGrounded('Source employment type: Intern', src)).toBe(false);
    expect(isQuoteGrounded('Candidates with 5 years in Java are preferred', src)).toBe(false);
  });
});

describe('mergeWithLLM', () => {
  it('produces a HIGH-confidence hybrid result when rules and LLM agree with grounded evidence', () => {
    const f = facts();
    const r = mergeWithLLM(classifyByRules({ ...f, employmentType: f.employmentType }), f, llm(), false);
    expect(r).toMatchObject({ method: 'HYBRID', experienceLevel: 'FRESHER', isFresherEligible: true, confidenceLevel: 'HIGH', needsReview: false, validationStatus: 'VALID' });
    expect(r.eligibilityEvidence).toEqual(['Freshers are welcome to apply.']);
  });

  it('removes ungrounded quotes and lowers confidence', () => {
    const f = facts();
    const r = mergeWithLLM(classifyByRules(f), f, llm({ eligibility_evidence: ['Source employment type: Intern'] }), false);
    expect(r.eligibilityEvidence).toEqual([]);
    expect(r.validationErrors.join()).toMatch(/not found in posting/);
    expect(r.confidenceFactors.evidenceGrounding).toBeLessThan(1);
  });

  it('discards a hallucinated city and forces review', () => {
    const f = facts({ locationType: 'UNKNOWN', primaryCity: null, primaryState: null, locationsRaw: ['India'] });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ location: { type: 'CITY', city: 'Pune', state: 'Maharashtra' } }), false);
    expect(r.city).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it('accepts an LLM city that the description actually states', () => {
    const f = facts({ locationType: 'UNKNOWN', primaryCity: null, primaryState: null, locationsRaw: ['India'], description: 'This role is based in our Pune office. 0-1 years of experience.' });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ location: { type: 'CITY', city: 'Pune', state: 'Maharashtra' }, eligibility_evidence: [] }), false);
    expect(r.city).toBe('Pune');
  });

  it('does not let an LLM OTHER override a strong specific rule (regression)', () => {
    const f = facts({ title: 'Associate Recruiter', description: 'Hire engineers. 0-1 years of experience.' });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ role_category: 'OTHER', eligibility_evidence: [] }), false);
    expect(r.roleCategory).toBe('OPERATIONS');
    expect(r.confidenceFactors.notes.join()).toMatch(/LLM said OTHER/);
  });

  it('keeps the source employment type over the LLM', () => {
    const f = facts({ employmentType: 'CONTRACT' });
    expect(mergeWithLLM(classifyByRules(f), f, llm({ employment_type: 'FULL_TIME' }), false).employmentType).toBe('CONTRACT');
  });

  it('lets an explicit intern title override the LLM experience level', () => {
    const f = facts({ title: 'Data Analyst Intern', employmentType: null });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ experience_level: 'ZERO_TO_ONE', role_category: 'ANALYTICS' }), false);
    expect(r.experienceLevel).toBe('INTERNSHIP');
    expect(r.employmentType).toBe('INTERNSHIP');
  });

  it('corrects eligibility that contradicts the experience level', () => {
    const f = facts({ description: 'You need 4+ years of experience in Go.' });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ experience_level: 'EXPERIENCED', is_fresher_eligible: true, eligibility_evidence: [], experience_evidence: null }), false);
    expect(r.isFresherEligible).toBe(false);
    expect(r.validationStatus).toBe('REPAIRED');
  });

  it('flags disagreement with a strong rule as lower confidence', () => {
    const f = facts({ description: 'You need 5+ years of experience.' });
    const r = mergeWithLLM(classifyByRules(f), f, llm({ experience_level: 'FRESHER', eligibility_evidence: [], experience_evidence: null }), false);
    expect(r.confidenceFactors.experience).toBeLessThan(0.5);
  });

  it('drops LLM salary and skills that are not in the posting', () => {
    const f = facts();
    const r = mergeWithLLM(classifyByRules(f), f, llm({ salary_text: '₹12 LPA', skills: ['Python', 'Kubernetes'] }), false);
    expect(r.salaryText).toBeNull();
    expect(r.skills.map((s) => s.name)).not.toContain('Kubernetes');
  });
});

describe('finalizeFromRules', () => {
  it('never produces a summary or invented fields', () => {
    const f = facts();
    const r = finalizeFromRules(classifyByRules(f), f);
    expect(r.summary).toBeNull();
    expect(r.educationRequirement).toBeNull();
    expect(r.method).toBe('RULES');
  });
});
