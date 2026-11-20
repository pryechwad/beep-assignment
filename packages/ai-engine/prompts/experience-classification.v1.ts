export const version = 'experience.v1';

export const instructions = `EXPERIENCE LEVEL — choose exactly one of: INTERNSHIP, FRESHER, ZERO_TO_ONE, ONE_TO_TWO, EXPERIENCED, UNKNOWN.
- INTERNSHIP: the position is an internship / co-op / apprenticeship.
- FRESHER: explicitly open to freshers, new graduates or candidates with no prior experience.
- ZERO_TO_ONE: requires at most ~1 year (e.g. "0-1 years", "up to 1 year").
- ONE_TO_TWO: requires 1–2 years (e.g. "1-2 years", "1+ years", "2 years").
- EXPERIENCED: requires more than 2 years, or the title is senior/staff/lead/principal/manager-level.
- UNKNOWN: the posting does not state an experience requirement and the title gives no seniority signal. Do NOT guess.
- min_years_required: the minimum years explicitly stated, else null.
- experience_evidence: verbatim phrase stating the requirement, else null.`;
