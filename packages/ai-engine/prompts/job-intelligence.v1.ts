import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, LOCATION_TYPES, ROLE_CATEGORIES, WORK_MODES } from '@beep/shared';
import { z } from 'zod';
import type { ChatJsonRequest } from '../src/types';
import * as eligibility from './eligibility-detection.v1';
import * as experience from './experience-classification.v1';
import * as location from './location-extraction.v1';
import * as role from './role-classification.v1';
import * as summary from './job-summary.v1';

/**
 * Composite prompt: one LLM call per job covering every classification
 * dimension. The version string pins every fragment so a stored prediction can
 * always be traced back to the exact instructions that produced it.
 */
export const PROMPT_VERSION = `job-intel.v1(${[role, experience, location, eligibility, summary].map((p) => p.version).join(',')})`;

export const outputSchema = z.object({
  role_category: z.enum(ROLE_CATEGORIES),
  role_evidence: z.string().max(300),
  experience_level: z.enum(EXPERIENCE_LEVELS),
  experience_evidence: z.string().max(400).nullable(),
  min_years_required: z.number().min(0).max(40).nullable(),
  employment_type: z.enum(EMPLOYMENT_TYPES).nullable(),
  work_mode: z.enum(WORK_MODES).nullable(),
  location: z.object({ type: z.enum(LOCATION_TYPES), city: z.string().max(80).nullable(), state: z.string().max(80).nullable() }),
  is_fresher_eligible: z.boolean(),
  eligibility_reasoning: z.string().min(1).max(600),
  eligibility_evidence: z.array(z.string().max(400)).max(3),
  education_requirement: z.string().max(300).nullable(),
  salary_text: z.string().max(200).nullable(),
  skills: z.array(z.string().max(60)).max(10),
  summary: z.string().min(1).max(400),
});
export type JobIntelligenceOutput = z.infer<typeof outputSchema>;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };

/** JSON Schema mirror of `outputSchema` for provider-side constrained decoding (strict mode: all keys required). */
export const jsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'role_category', 'role_evidence', 'experience_level', 'experience_evidence', 'min_years_required', 'employment_type', 'work_mode',
    'location', 'is_fresher_eligible', 'eligibility_reasoning', 'eligibility_evidence', 'education_requirement', 'salary_text', 'skills', 'summary',
  ],
  properties: {
    role_category: { type: 'string', enum: [...ROLE_CATEGORIES] },
    role_evidence: str,
    experience_level: { type: 'string', enum: [...EXPERIENCE_LEVELS] },
    experience_evidence: nullable(str),
    min_years_required: nullable({ type: 'number' }),
    employment_type: nullable({ type: 'string', enum: [...EMPLOYMENT_TYPES] }),
    work_mode: nullable({ type: 'string', enum: [...WORK_MODES] }),
    location: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'city', 'state'],
      properties: { type: { type: 'string', enum: [...LOCATION_TYPES] }, city: nullable(str), state: nullable(str) },
    },
    is_fresher_eligible: { type: 'boolean' },
    eligibility_reasoning: str,
    eligibility_evidence: { type: 'array', items: str },
    education_requirement: nullable(str),
    salary_text: nullable(str),
    skills: { type: 'array', items: str },
    summary: str,
  },
};

export const SYSTEM_PROMPT = `You classify Indian job postings for an early-career job search product.
You extract facts from the posting; you never invent them. When the posting does not state something, return null or UNKNOWN.
Quotes you return as evidence must be copied character-for-character from the posting.
Return a single JSON object matching the provided schema.

${role.instructions}

${experience.instructions}

${location.instructions}

${eligibility.instructions}

${summary.instructions}`;

export interface JobPromptInput {
  title: string;
  company: string;
  locations: string[];
  department: string | null;
  sourceEmploymentType: string | null;
  sourceWorkplaceType: string | null;
  description: string;
}

const RELEVANT_HEADING = /(requirement|qualification|what you|who you|you will|you'll|responsibilit|about the role|the role|experience|eligib|skills|must[- ]have|nice to have|preferred|basic|minimum|education|what we're looking|looking for|day to day|job description|role overview)/i;
const BOILERPLATE_HEADING = /(about (us|the company|[A-Z][a-z]+)$|benefits|perks|why join|equal opportunity|eeo|diversity|privacy|our values|life at|culture)/i;

/**
 * Keep the parts of a description that carry classification signal, within a
 * character budget. Paragraphs under requirement-like headings are prioritised;
 * company boilerplate (benefits, EEO statements) is dropped first.
 */
export function selectRelevantText(description: string, budget = 4500): string {
  if (description.length <= budget) return description;
  const blocks = description.split(/\n{2,}|\n(?=[A-Z][^\n]{2,60}:?\n)/);
  type Block = { text: string; score: number; index: number };
  let section: 'relevant' | 'boiler' | 'neutral' = 'neutral';
  const scored: Block[] = blocks.map((text, index) => {
    const firstLine = text.split('\n')[0] ?? '';
    if (firstLine.length < 80 && RELEVANT_HEADING.test(firstLine)) section = 'relevant';
    else if (firstLine.length < 80 && BOILERPLATE_HEADING.test(firstLine)) section = 'boiler';
    const score = (section === 'relevant' ? 3 : section === 'boiler' ? 0 : 1) + (/\b(years?|freshers?|graduate|intern|degree|b\.?tech|experience)\b/i.test(text) ? 2 : 0);
    return { text, score, index };
  });
  const chosen: Block[] = [];
  let used = 0;
  for (const b of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (b.score === 0) continue;
    if (used + b.text.length > budget) continue;
    chosen.push(b);
    used += b.text.length + 2;
  }
  return chosen.sort((a, b) => a.index - b.index).map((b) => b.text).join('\n\n');
}

export function buildRequest(input: JobPromptInput): ChatJsonRequest {
  const user = [
    `Title: ${input.title}`,
    `Company: ${input.company}`,
    `Source locations: ${input.locations.length ? input.locations.join(' | ') : '(none stated)'}`,
    `Department: ${input.department ?? '(not stated)'}`,
    `Source employment type: ${input.sourceEmploymentType ?? '(not stated)'}`,
    `Source workplace type: ${input.sourceWorkplaceType ?? '(not stated)'}`,
    '',
    'Posting text:',
    '"""',
    selectRelevantText(input.description),
    '"""',
  ].join('\n');
  return { system: SYSTEM_PROMPT, user, jsonSchema, schemaName: 'job_intelligence', maxOutputTokens: 900, temperature: 0 };
}
