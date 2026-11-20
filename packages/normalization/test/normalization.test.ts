import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  extractExperienceSignals,
  extractSkills,
  normalizeCompanyName,
  normalizeEmploymentType,
  normalizeJob,
  normalizeTitle,
  normalizeWorkMode,
  parseLocation,
  parseSourceDate,
  summarizeLocations,
  isIndiaLocated,
} from '../src';

describe('location normalisation', () => {
  it.each([
    ['Bangalore', 'Bengaluru', 'Karnataka'],
    ['Bombay', 'Mumbai', 'Maharashtra'],
    ['Gurgaon, Haryana', 'Gurugram', 'Haryana'],
    ['Bengaluru, Karnataka, India', 'Bengaluru', 'Karnataka'],
    ['IN-KA-Bangalore', 'Bengaluru', 'Karnataka'],
    ['Navi Mumbai', 'Mumbai', 'Maharashtra'],
    ['New Delhi, India', 'New Delhi', 'Delhi'],
    ['Trivandrum', 'Thiruvananthapuram', 'Kerala'],
  ])('%s → %s', (raw, city, state) => {
    const [loc] = parseLocation(raw);
    expect(loc).toMatchObject({ city, state, country: 'India', isIndia: true });
  });

  it('keeps the original string on every parsed location', () => {
    expect(parseLocation('Bangalore')[0]?.raw).toBe('Bangalore');
  });

  it('splits multi-city strings', () => {
    const s = summarizeLocations(['Bangalore / Mumbai', 'Pune']);
    expect(s.locations.map((l) => l.city)).toEqual(['Bengaluru', 'Mumbai', 'Pune']);
    expect(s.locationType).toBe('MULTIPLE');
    expect(s.primaryCity).toBe('Bengaluru');
  });

  it('treats comma-separated city lists as multiple cities', () => {
    expect(summarizeLocations(['Bengaluru, Hyderabad, Chennai']).locations).toHaveLength(3);
  });

  it('recognises remote India without inventing a city', () => {
    const s = summarizeLocations(['Remote - India']);
    expect(s).toMatchObject({ locationType: 'REMOTE', primaryCity: null, hasIndia: true, workModeHint: 'REMOTE' });
  });

  it('does not treat a bare "Remote" as India', () => {
    expect(isIndiaLocated(['Remote'])).toBe(false);
    expect(summarizeLocations(['Remote']).locationType).toBe('REMOTE');
  });

  it('drops foreign locations when an Indian one exists', () => {
    const s = summarizeLocations(['San Francisco, CA', 'Bengaluru, India']);
    expect(s.locations.map((l) => l.city)).toEqual(['Bengaluru']);
  });

  it('does not map foreign cities to Indian ones', () => {
    expect(isIndiaLocated(['London, United Kingdom'])).toBe(false);
    expect(isIndiaLocated(['Hyderabad, Pakistan'])).toBe(false);
  });

  it('only honours two-letter state codes as standalone components alongside India', () => {
    expect(parseLocation('Remote, KA, India')[0]?.state).toBe('Karnataka');
    expect(parseLocation('Mapleton')[0]?.state).toBeNull();
  });

  // Regression: US state codes collided with Indian ones in live Greenhouse data (2026-11-20).
  it.each(['Lafayette, IN', 'Evansville, IN', 'Nashville, TN', 'Newburgh, IN'])('does not treat %s as India', (raw) => {
    expect(isIndiaLocated([raw])).toBe(false);
  });

  it('extracts an explicitly stated city that is not in the dictionary', () => {
    expect(parseLocation('Aligarh, Uttar Pradesh')[0]).toMatchObject({ city: 'Aligarh', state: 'Uttar Pradesh', isIndia: true });
    expect(parseLocation('Sonipat, Haryana')[0]?.city).toBe('Sonipat');
  });

  it('does not turn placeholder text into a city', () => {
    expect(parseLocation('India Locations')[0]?.city).toBeNull();
  });

  it('handles source typos via aliases', () => {
    expect(parseLocation('Hyderbad, India')[0]?.city).toBe('Hyderabad');
  });

  it('treats "Remote, India" plus a bare "India" as a remote role', () => {
    expect(summarizeLocations(['Remote, India', 'India']).locationType).toBe('REMOTE');
  });

  it('keeps a bare country as UNKNOWN city rather than guessing', () => {
    expect(summarizeLocations(['India'])).toMatchObject({ locationType: 'UNKNOWN', primaryCity: null, hasIndia: true });
  });

  it('returns UNKNOWN for empty input instead of guessing', () => {
    expect(summarizeLocations([])).toMatchObject({ locationType: 'UNKNOWN', primaryCity: null, hasIndia: false });
  });

  it('detects hybrid hint in location text', () => {
    expect(summarizeLocations(['Hybrid - Pune']).workModeHint).toBe('HYBRID');
  });
});

describe('company names', () => {
  it('strips legal suffixes and builds stable keys', () => {
    expect(normalizeCompanyName('Razorpay Software Private Limited')).toMatchObject({ display: 'Razorpay Software', key: 'razorpaysoftware' });
    expect(normalizeCompanyName('Okta, Inc.').display).toBe('Okta');
    expect(normalizeCompanyName('Zeta Pvt. Ltd.').key).toBe('zeta');
    expect(normalizeCompanyName('AT&T').key).toBe('atandt');
  });
});

describe('titles', () => {
  it('removes requisition ids and trailing location tags', () => {
    expect(normalizeTitle('Software Engineer (JR123456)').display).toBe('Software Engineer');
    expect(normalizeTitle('Backend Engineer - Bangalore').display).toBe('Backend Engineer');
    expect(normalizeTitle('Data Analyst (Remote)').display).toBe('Data Analyst');
  });
  it('expands abbreviations in the matching key', () => {
    expect(normalizeTitle('Sr. SDE').key).toBe(normalizeTitle('Senior Software Development Engineer').key);
    expect(normalizeTitle('SDE I').key).toBe(normalizeTitle('SDE-1').key);
    expect(normalizeTitle('Software Engineer II').key).toBe('software engineer lvl2');
  });
  it('keeps the title display otherwise intact', () => {
    expect(normalizeTitle('  Product   Designer ').display).toBe('Product Designer');
  });
});

describe('employment type', () => {
  it.each([
    ['Full-time', 'Engineer', 'FULL_TIME'],
    ['Intern', 'Engineer', 'INTERNSHIP'],
    ['FullTime', 'Engineer', 'FULL_TIME'],
    ['Contract', 'Engineer', 'CONTRACT'],
    ['Part Time', 'Engineer', 'PART_TIME'],
    [null, 'Software Engineering Intern', 'INTERNSHIP'],
  ] as const)('%s / %s → %s', (src, title, expected) => {
    expect(normalizeEmploymentType(src, title)).toBe(expected);
  });
  it('lets an explicit intern title beat a generic source Full-time (regression)', () => {
    expect(normalizeEmploymentType('Full Time', 'Security Engineer Intern')).toBe('INTERNSHIP');
    expect(normalizeEmploymentType('FullTime', 'Marketing internship (brand)')).toBe('INTERNSHIP');
    expect(normalizeEmploymentType('Part-time', 'Design Intern')).toBe('PART_TIME');
    // word boundary: "Internal" is not "intern"
    expect(normalizeEmploymentType('Full-time', 'Internal Audit Manager')).toBe('FULL_TIME');
  });
  it('returns null when nothing explicit is stated', () => {
    expect(normalizeEmploymentType(null, 'Backend Engineer')).toBeNull();
  });
});

describe('work mode', () => {
  it('prefers the source value then the location hint, else null', () => {
    expect(normalizeWorkMode('remote', null)).toBe('REMOTE');
    expect(normalizeWorkMode('On-site', 'REMOTE')).toBe('ONSITE');
    expect(normalizeWorkMode(null, 'HYBRID')).toBe('HYBRID');
    expect(normalizeWorkMode(null, null)).toBeNull();
  });
});

describe('urls', () => {
  it('removes tracking params, fragments and trailing slashes', () => {
    expect(canonicalizeUrl('http://www.Jobs.Lever.co/paytm/abc/?lever-source=linkedin&utm_source=x#apply')).toBe('https://jobs.lever.co/paytm/abc');
  });
  it('keeps identifying params such as gh_jid', () => {
    expect(canonicalizeUrl('https://boards.greenhouse.io/x/jobs?gh_jid=123&gh_src=abc')).toBe('https://boards.greenhouse.io/x/jobs?gh_jid=123');
  });
});

describe('dates', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  it('parses ISO and epoch values', () => {
    expect(parseSourceDate('2026-11-01T10:00:00Z', now)?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(parseSourceDate(1761955200000, now)?.getUTCFullYear()).toBe(2025);
  });
  it('rejects garbage, ancient and future dates', () => {
    expect(parseSourceDate('not a date', now)).toBeNull();
    expect(parseSourceDate('1999-01-01', now)).toBeNull();
    expect(parseSourceDate('2027-06-01', now)).toBeNull();
    expect(parseSourceDate(null, now)).toBeNull();
  });
});

describe('experience signals', () => {
  it('extracts explicit year ranges with evidence', () => {
    const s = extractExperienceSignals('Backend Engineer', 'You have 0-2 years of experience building APIs.');
    expect(s.years).toMatchObject({ min: 0, max: 2 });
    expect(s.years?.evidence).toContain('0-2 years');
  });
  it('handles "3+ years" and "at least two years"', () => {
    expect(extractExperienceSignals('X', 'Requires 3+ years of professional experience.').years).toMatchObject({ min: 3, max: null });
    expect(extractExperienceSignals('X', 'At least two years of experience in sales.').years?.min).toBe(2);
  });
  it('ignores company-age numbers', () => {
    expect(extractExperienceSignals('X', 'Founded 10 years ago, our company serves millions.').years).toBeNull();
  });
  it('captures fresher evidence and graduation batches', () => {
    const s = extractExperienceSignals('Graduate Engineer Trainee', 'Freshers from the 2025 batch are welcome to apply.');
    expect(s.fresherEvidence.length).toBeGreaterThan(0);
    expect(s.graduationYears).toEqual([2025]);
    expect(s.juniorTitle).toBe(true);
  });
  it('flags senior and intern titles', () => {
    expect(extractExperienceSignals('Senior Software Engineer', '').seniorTitle).toBe(true);
    expect(extractExperienceSignals('Software Engineer III', '').seniorTitle).toBe(true);
    expect(extractExperienceSignals('Data Science Intern', '').internTitle).toBe(true);
    expect(extractExperienceSignals('SDE-1', '').juniorTitle).toBe(true);
  });
});

describe('skills', () => {
  it('extracts dictionary skills, title first', () => {
    const names = extractSkills('React Developer', 'Experience with TypeScript, Node.js and PostgreSQL. React hooks.').map((s) => s.name);
    expect(names[0]).toBe('React');
    expect(names).toEqual(expect.arrayContaining(['TypeScript', 'Node.js', 'PostgreSQL']));
  });
  it('does not match ambiguous prose', () => {
    const names = extractSkills('Sales Associate', 'You will go to market, excel in communication, express ideas and rest well. Each node of the team.').map((s) => s.name);
    expect(names).not.toEqual(expect.arrayContaining(['Go']));
    expect(names).not.toContain('Excel');
    expect(names).not.toContain('Express');
    expect(names).not.toContain('REST APIs');
    expect(names).not.toContain('Node.js');
  });
  it('does not confuse Java with JavaScript', () => {
    expect(extractSkills('', 'JavaScript only').map((s) => s.name)).toEqual(['JavaScript']);
  });
});

describe('normalizeJob', () => {
  it('normalises a full raw record and preserves nulls', () => {
    const job = normalizeJob(
      {
        externalId: '1',
        title: 'Software Engineer Intern (Bangalore)',
        companyName: 'Example Technologies Pvt Ltd',
        locations: ['Bangalore, India'],
        workplaceType: null,
        employmentType: null,
        department: null,
        descriptionHtml: null,
        descriptionText: 'Build things with Python.',
        postingUrl: 'https://jobs.lever.co/example/1?lever-source=x',
        applyUrl: null,
        publishedAt: null,
        compensationText: null,
        payload: {},
      },
      new Date('2026-11-20'),
    );
    expect(job).toMatchObject({
      title: 'Software Engineer Intern',
      company: { display: 'Example Technologies', key: 'exampletechnologies' },
      primaryCity: 'Bengaluru',
      locationType: 'CITY',
      employmentType: 'INTERNSHIP',
      workMode: null,
      salaryText: null,
      publishedAt: null,
      canonicalUrl: 'https://jobs.lever.co/example/1',
      applyUrl: 'https://jobs.lever.co/example/1?lever-source=x',
      skills: ['Python'],
    });
    expect(job.dedupKey).toBe('exampletechnologies|software engineer intern|bengaluru');
  });
});
