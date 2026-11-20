import { classifyByRules, rulesSufficient } from '@beep/classification';
import type { PrismaClient } from '@beep/database';

/**
 * BullMQ priority (1 = highest). Under a tight LLM budget, early-career
 * candidates are classified first — they are what this product is for.
 */
export async function classifyPriority(db: PrismaClient, jobId: string): Promise<number> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { title: true, description: true, department: true, employmentType: true } });
  if (!job) return 10;
  const r = classifyByRules(job);
  if (rulesSufficient(r)) return 8; // clearly senior: LLM pass last
  if (r.experience.value === 'INTERNSHIP' || r.experience.value === 'FRESHER' || r.experience.value === 'ZERO_TO_ONE') return 1;
  if (r.experience.value === 'UNKNOWN') return 3;
  return 5;
}
