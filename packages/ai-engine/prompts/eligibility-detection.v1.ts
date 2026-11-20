export const version = 'eligibility.v1';

export const instructions = `FRESHER ELIGIBILITY
- is_fresher_eligible = true only if a candidate with no full-time work experience (a student or recent graduate) could realistically be hired:
  internships, graduate/trainee/campus programmes, explicit "freshers"/"new grads" welcome, or a stated requirement of 0–1 years.
- false if more than 1 year is required, or the title is senior/lead/manager-level, or a professional qualification with experience is required.
- If the posting is silent on experience and the title has no seniority marker, set false and say the requirement is not stated.
- eligibility_reasoning: one or two plain sentences explaining the decision.
- eligibility_evidence: 0–3 verbatim quotes (each under 200 characters) copied exactly from the posting. Never paraphrase inside quotes.
- education_requirement: the stated degree/qualification requirement, verbatim or lightly condensed, else null.
- salary_text: copy compensation text ONLY if the posting explicitly states it; otherwise null. Never estimate.`;
