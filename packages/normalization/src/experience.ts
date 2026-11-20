/**
 * Deterministic extraction of explicitly stated experience requirements.
 * Nothing here infers: if the posting does not state years or a fresher
 * signal, the result says so (null / empty evidence).
 */

export interface YearsRequirement {
  min: number;
  max: number | null;
  /** The sentence fragment the numbers came from. */
  evidence: string;
}

export interface ExperienceSignals {
  years: YearsRequirement | null;
  /** Explicit statements that freshers / new graduates are welcome. */
  fresherEvidence: string[];
  /** Explicit statements requiring seniority beyond entry level. */
  seniorTitle: boolean;
  /** Title explicitly marks an entry-level / junior position. */
  juniorTitle: boolean;
  internTitle: boolean;
  /** Graduation-year batches mentioned ("2025 batch", "graduating in 2026"). */
  graduationYears: number[];
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15,
};
const NUM = '(\\d{1,2}(?:\\.\\d)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)';
const toNum = (s: string): number => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);

// Each pattern must sit near the word "experience"/"exp"/"years of" to avoid matching "5 years old company".
const YEAR_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => { min: number; max: number | null } }[] = [
  {
    // "0-2 years", "2 to 4 yrs", "1 – 3 years of experience"
    re: new RegExp(`${NUM}\\s*(?:-|–|—|to)\\s*${NUM}\\+?\\s*(?:years?|yrs?)\\b`, 'i'),
    build: (m) => ({ min: toNum(m[1]!), max: toNum(m[2]!) }),
  },
  {
    // "3+ years", "5 + yrs"
    re: new RegExp(`${NUM}\\s*\\+\\s*(?:years?|yrs?)\\b`, 'i'),
    build: (m) => ({ min: toNum(m[1]!), max: null }),
  },
  {
    // "minimum 2 years", "at least three years", "min. 4 yrs"
    re: new RegExp(`(?:minimum(?: of)?|min\\.?|at least|atleast)\\s*${NUM}\\s*(?:years?|yrs?)\\b`, 'i'),
    build: (m) => ({ min: toNum(m[1]!), max: null }),
  },
  {
    // "2 years of experience", "4 yrs experience"
    re: new RegExp(`${NUM}\\s*(?:years?|yrs?)(?:\\s+of)?(?:\\s+\\w+){0,4}?\\s+(?:experience|exp\\b)`, 'i'),
    build: (m) => ({ min: toNum(m[1]!), max: null }),
  },
];

const FRESHER_PATTERNS: RegExp[] = [
  /\bfreshers?\b/i,
  /\bfresh (?:graduates?|grads?)\b/i,
  /\bnew (?:grads?|graduates?)\b/i,
  /\brecent (?:graduates?|grads?)\b/i,
  /\b(?:no|zero) (?:prior |previous |professional |work )?experience (?:is )?(?:required|necessary|needed)\b/i,
  /\bentry[- ]level\b/i,
  /\bcampus (?:hire|hiring|recruitment|program)\b/i,
  /\b(?:graduate|early[- ]career) (?:program|programme|trainee)\b/i,
  /\b(?:currently )?(?:pursuing|enrolled in) (?:a |an |your )?(?:bachelor|master|b\.?tech|m\.?tech|degree|undergraduate|graduate)/i,
  /\bfinal[- ]year students?\b/i,
];

const SENIOR_TITLE_RE =
  /\b(senior|sr\.?|staff|principal|lead|head|director|vp|vice president|manager|architect|chief|distinguished|expert)\b|\b(engineer|developer|analyst|scientist)\s+(iii|iv|v|3|4|5)\b/i;
const JUNIOR_TITLE_RE =
  /\b(junior|jr\.?|associate|graduate|entry[- ]level|trainee|apprentice|new grad|fresher)\b|\b(engineer|developer|analyst|sde|swe)\s*[-–]?\s*(i|1)\b|\bsde[- ]?(i|1)\b/i;
const INTERN_TITLE_RE = /\b(intern|internship|co-?op)\b/i;

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf('.', index) + 1, index - 160, 0);
  const endDot = text.indexOf('.', index + length);
  const end = Math.min(endDot === -1 ? text.length : endDot + 1, index + length + 160);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function extractExperienceSignals(title: string, description: string): ExperienceSignals {
  const text = description.replace(/\s+/g, ' ');
  let years: YearsRequirement | null = null;

  // Prefer matches that appear in an "experience" context.
  for (const { re, build } of YEAR_PATTERNS) {
    const global = new RegExp(re.source, 'gi');
    for (const m of text.matchAll(global)) {
      const idx = m.index ?? 0;
      const window = text.slice(Math.max(0, idx - 80), idx + m[0].length + 80).toLowerCase();
      if (!/experience|exp\b|work(ing)? in|industry/.test(window)) continue;
      // ignore company-age phrases ("over 10 years, we have...")
      if (/(founded|company|we have been|since|journey|history)/.test(window) && !/experience/.test(window)) continue;
      const { min, max } = build(m);
      if (min > 30 || (max !== null && (max > 40 || max < min))) continue;
      years = { min, max, evidence: sentenceAround(text, idx, m[0].length) };
      break;
    }
    if (years) break;
  }

  const fresherEvidence: string[] = [];
  for (const re of FRESHER_PATTERNS) {
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      const sentence = sentenceAround(text, m.index, m[0].length);
      if (!fresherEvidence.includes(sentence)) fresherEvidence.push(sentence);
    }
  }

  const graduationYears = [
    ...new Set(
      [...text.matchAll(/\b(20[2-3]\d)\s*(?:batch|graduates?|pass(?:ing)?[- ]?outs?)\b|\b(?:batch of|graduating in|class of|graduation year[:\s]+)\s*(20[2-3]\d)\b/gi)].map(
        (m) => Number(m[1] ?? m[2]),
      ),
    ),
  ];

  return {
    years,
    fresherEvidence: fresherEvidence.slice(0, 4),
    seniorTitle: SENIOR_TITLE_RE.test(title),
    juniorTitle: JUNIOR_TITLE_RE.test(title),
    internTitle: INTERN_TITLE_RE.test(title),
    graduationYears,
  };
}
