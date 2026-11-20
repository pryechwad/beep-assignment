import type { StructuredRunner } from '@beep/ai-engine';
import { classifyByRules, classifyJob, rulesSufficient, type ClassifyOutcome, type NormalizedFacts } from '@beep/classification';
import type { Prisma, PrismaClient } from '@beep/database';
import { linkSkills, persistUsage, TX_OPTIONS } from './normalize';

export interface ClassifyServiceOptions {
  runner: StructuredRunner | null;
  /** Reserve one unit of the shared daily LLM budget; false when exhausted. */
  reserveLLMBudget: () => Promise<boolean>;
  forceLLM?: boolean;
  llmForAll?: boolean;
}

export async function classifyAndPersist(db: PrismaClient, jobId: string, opts: ClassifyServiceOptions): Promise<ClassifyOutcome & { classificationId: string }> {
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      company: true,
      skills: { where: { origin: 'RULES' }, include: { skill: true }, orderBy: { rank: 'asc' } },
      rawJobs: { orderBy: { firstSeenAt: 'asc' }, take: 1 },
    },
  });
  const primary = job.rawJobs[0];
  const facts: NormalizedFacts = {
    title: job.title,
    description: job.description,
    locationsRaw: primary?.locations ?? [],
    department: job.department,
    employmentType: job.employmentType,
    workMode: job.workMode,
    locationType: job.locationType,
    primaryCity: job.primaryCity,
    primaryState: job.primaryState,
    salaryText: job.salaryText,
    skills: job.skills.map((s) => s.skill.name),
  };

  // Reserve budget only if the LLM would actually be called.
  let llmAllowed = true;
  const willNeedLLM = opts.forceLLM || opts.llmForAll || !rulesSufficient(classifyByRules({ title: facts.title, description: facts.description, department: facts.department, employmentType: facts.employmentType }));
  if (willNeedLLM && opts.runner && opts.runner.availableProviders.length) llmAllowed = await opts.reserveLLMBudget();

  const outcome = await classifyJob(facts, {
    runner: opts.runner,
    company: job.company.name,
    sourceEmploymentType: primary?.employmentType ?? null,
    sourceWorkplaceType: primary?.workplaceType ?? null,
    forceLLM: opts.forceLLM,
    llmForAll: opts.llmForAll,
    llmAllowed,
  });
  const r = outcome.result;
  const llmPending = outcome.route !== 'llm' && outcome.route !== 'rules-sufficient';

  const classificationId = await db.$transaction(async (tx) => {
    const last = await tx.jobClassification.findFirst({ where: { jobId }, orderBy: { version: 'desc' }, select: { version: true } });
    await tx.jobClassification.updateMany({ where: { jobId, isCurrent: true }, data: { isCurrent: false } });
    const c = await tx.jobClassification.create({
      data: {
        jobId,
        version: (last?.version ?? 0) + 1,
        isCurrent: true,
        method: r.method,
        provider: outcome.llm?.provider ?? null,
        model: outcome.llm?.model ?? null,
        promptVersion: outcome.llm?.promptVersion ?? null,
        roleCategory: r.roleCategory,
        experienceLevel: r.experienceLevel,
        employmentType: r.employmentType,
        workMode: r.workMode,
        locationType: r.locationType,
        city: r.city,
        state: r.state,
        isFresherEligible: r.isFresherEligible,
        eligibilityReasoning: r.eligibilityReasoning,
        eligibilityEvidence: r.eligibilityEvidence,
        educationRequirement: r.educationRequirement,
        salaryText: r.salaryText,
        summary: r.summary,
        skills: r.skills.map((s) => s.name),
        confidenceScore: r.confidenceScore,
        confidenceLevel: r.confidenceLevel,
        confidenceFactors: { ...r.confidenceFactors, route: outcome.route } as unknown as Prisma.InputJsonValue,
        validationStatus: r.validationStatus,
        validationErrors: r.validationErrors,
        needsReview: r.needsReview,
        processingMs: outcome.processingMs,
        correlationId: job.correlationId,
      },
    });
    // Denormalise for filtering. Source-stated facts on the Job are only filled in, never overwritten.
    await tx.job.update({
      where: { id: jobId },
      data: {
        roleCategory: r.roleCategory,
        experienceLevel: r.experienceLevel,
        isFresherEligible: r.isFresherEligible,
        confidenceLevel: r.confidenceLevel,
        classifiedAt: new Date(),
        llmPending,
        employmentType: job.employmentType ?? r.employmentType,
        workMode: job.workMode ?? r.workMode,
        ...(job.primaryCity === null && r.city ? { primaryCity: r.city, primaryState: r.state, locationType: r.locationType } : {}),
        salaryText: job.salaryText ?? r.salaryText,
      },
    });
    await linkSkills(tx, jobId, r.skills.filter((s) => s.origin === 'LLM').map((s) => s.name), 'LLM');
    return c.id;
  }, TX_OPTIONS);

  await persistUsage(db, outcome.usage, { jobId, classificationId, correlationId: job.correlationId });
  return { ...outcome, classificationId };
}
