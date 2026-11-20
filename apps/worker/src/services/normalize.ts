import type { LLMProvider, UsageRecord } from '@beep/ai-engine';
import { computeCost, PRICING_VERSION } from '@beep/ai-engine';
import { EMBEDDING_DIMENSIONS, findSemanticNeighbours, setJobEmbedding, type Prisma, type PrismaClient } from '@beep/database';
import { findDuplicate, trigramSimilarity, type DedupCandidate, type DedupRecord, type DuplicateMatch } from '@beep/deduplication';
import { normalizeJob, skillKey, type NormalizedJob } from '@beep/normalization';
import type { RawJob as RawJobContract } from '@beep/shared';

export interface NormalizeOutcome {
  jobId: string | null;
  action: 'created' | 'updated' | 'merged' | 'unchanged' | 'skipped';
  /** Classification must (re)run: new job or classification-relevant content changed. */
  needsClassification: boolean;
  duplicate: DuplicateMatch | null;
  usage: UsageRecord[];
}

export interface NormalizeDeps {
  embedder?: LLMProvider | null;
  now?: Date;
}

function toContract(r: Prisma.RawJobGetPayload<object>): RawJobContract {
  return {
    externalId: r.externalId,
    title: r.title,
    companyName: r.companyName,
    locations: r.locations,
    workplaceType: r.workplaceType,
    employmentType: r.employmentType,
    department: r.department,
    descriptionHtml: r.descriptionHtml,
    descriptionText: r.descriptionText,
    postingUrl: r.postingUrl,
    applyUrl: r.applyUrl,
    publishedAt: r.publishedAt,
    compensationText: r.compensationText,
    payload: r.payload,
  };
}

const jobFields = (n: NormalizedJob, companyId: string, correlationId: string) => ({
  companyId,
  title: n.title,
  titleKey: n.titleKey,
  description: n.description,
  descriptionHtml: n.descriptionHtml,
  locationType: n.locationType,
  primaryCity: n.primaryCity,
  primaryState: n.primaryState,
  workMode: n.workMode,
  employmentType: n.employmentType,
  salaryText: n.salaryText,
  department: n.department,
  postingUrl: n.postingUrl,
  applyUrl: n.applyUrl,
  canonicalUrl: n.canonicalUrl,
  dedupKey: n.dedupKey,
  publishedAt: n.publishedAt,
  correlationId,
});

async function writeFacets(tx: Prisma.TransactionClient, jobId: string, n: NormalizedJob) {
  await tx.jobLocation.deleteMany({ where: { jobId } });
  if (n.locations.length) {
    await tx.jobLocation.createMany({
      data: n.locations.map((l, i) => ({ jobId, raw: l.raw, city: l.city, state: l.state, country: l.country, isRemote: l.isRemote, position: i })),
      skipDuplicates: true,
    });
  }
  await tx.jobSkill.deleteMany({ where: { jobId, origin: 'RULES' } });
  await linkSkills(tx, jobId, n.skills, 'RULES');
}

/** Batched skill linking: 3 queries regardless of skill count (keeps transactions short). */
export async function linkSkills(tx: Prisma.TransactionClient, jobId: string, names: string[], origin: 'RULES' | 'LLM'): Promise<void> {
  if (!names.length) return;
  const keyed = names.map((name, rank) => ({ name, key: skillKey(name), rank }));
  await tx.skill.createMany({ data: keyed.map(({ name, key }) => ({ name, key })), skipDuplicates: true });
  const skills = await tx.skill.findMany({ where: { key: { in: keyed.map((k) => k.key) } }, select: { id: true, key: true } });
  const idByKey = new Map(skills.map((s) => [s.key, s.id]));
  await tx.jobSkill.createMany({
    data: keyed.flatMap((k) => (idByKey.has(k.key) ? [{ jobId, skillId: idByKey.get(k.key)!, origin, rank: k.rank }] : [])),
    skipDuplicates: true,
  });
}

export const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

async function loadCandidates(db: PrismaClient, companyId: string, n: NormalizedJob, linkedJobId: string | null): Promise<DedupCandidate[]> {
  const fuzzyIds = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Job"
    WHERE "companyId" = ${companyId} AND "status" = 'ACTIVE' AND similarity("titleKey", ${n.titleKey}) > 0.45
    ORDER BY similarity("titleKey", ${n.titleKey}) DESC LIMIT 15`;
  const jobs = await db.job.findMany({
    where: {
      OR: [
        { canonicalUrl: n.canonicalUrl },
        { companyId, dedupKey: n.dedupKey },
        { id: { in: fuzzyIds.map((f) => f.id) } },
        ...(linkedJobId ? [{ id: linkedJobId }] : []),
      ],
    },
    include: { company: { select: { normalizedName: true } }, locations: { select: { city: true } }, rawJobs: { select: { sourceId: true, externalId: true } } },
  });
  return jobs.map((j) => ({
    jobId: j.id,
    sourceId: j.rawJobs[0]?.sourceId ?? '',
    externalId: j.rawJobs[0]?.externalId ?? '',
    companyKey: j.company.normalizedName,
    title: j.title,
    titleKey: j.titleKey,
    cities: j.locations.map((l) => l.city),
    description: j.description,
    canonicalUrl: j.canonicalUrl,
    dedupKey: j.dedupKey,
    sourceRefs: j.rawJobs.map((r) => `${r.sourceId}::${r.externalId}`),
  }));
}

const embeddingText = (title: string, description: string) => `${title}\n\n${description.slice(0, 2000)}`;

/**
 * Layer-3 semantic signal, computed only in the ambiguous zone: there are
 * fuzzy title candidates but no definitive (URL / key) match. This keeps
 * embedding cost proportional to genuinely uncertain cases.
 */
async function addSemanticSignal(db: PrismaClient, embedder: LLMProvider, companyId: string, n: NormalizedJob, candidates: DedupCandidate[], usage: UsageRecord[]): Promise<void> {
  const ambiguous = candidates.filter((c) => c.canonicalUrl !== n.canonicalUrl && c.dedupKey !== n.dedupKey && trigramSimilarity(c.titleKey, n.titleKey) >= 0.6);
  if (!ambiguous.length || !embedder.embed) return;
  const missing = await db.$queryRaw<{ id: string; title: string; description: string }[]>`
    SELECT "id", "title", "description" FROM "Job" WHERE "id" = ANY(${ambiguous.map((c) => c.jobId)}) AND "embedding" IS NULL`;
  const texts = [embeddingText(n.title, n.description), ...missing.map((m) => embeddingText(m.title, m.description))];
  try {
    const res = await embedder.embed(texts, EMBEDDING_DIMENSIONS);
    const cost = computeCost(embedder.name, res.model, res.usage);
    usage.push({ operation: 'EMBEDDING', provider: embedder.name, model: res.model, promptVersion: null, inputTokens: res.usage.inputTokens, outputTokens: 0, tokensMeasured: res.usage.measured, latencyMs: res.latencyMs, retryCount: 0, success: true, errorMessage: null, costUsd: cost.costUsd, pricingVersion: PRICING_VERSION });
    for (const [i, m] of missing.entries()) await setJobEmbedding(db, m.id, res.vectors[i + 1]!);
    const neighbours = await findSemanticNeighbours(db, res.vectors[0]!, companyId, null, 10);
    for (const c of candidates) {
      const hit = neighbours.find((nb) => nb.jobId === c.jobId);
      if (hit) c.semanticSimilarity = hit.similarity;
    }
  } catch (e) {
    usage.push({ operation: 'EMBEDDING', provider: embedder.name, model: embedder.embeddingModel ?? 'unknown', promptVersion: null, inputTokens: 0, outputTokens: 0, tokensMeasured: true, latencyMs: 0, retryCount: 0, success: false, errorMessage: (e as Error).message.slice(0, 500), costUsd: 0, pricingVersion: PRICING_VERSION });
  }
}

export async function normalizeRawJob(db: PrismaClient, rawJobId: string, deps: NormalizeDeps = {}): Promise<NormalizeOutcome> {
  const usage: UsageRecord[] = [];
  const raw = await db.rawJob.findUnique({ where: { id: rawJobId }, include: { source: true } });
  if (!raw) return { jobId: null, action: 'skipped', needsClassification: false, duplicate: null, usage };
  const companyId = raw.source.companyId;
  if (!companyId) throw new Error(`source ${raw.sourceId} has no company`);

  const n = normalizeJob(toContract(raw), deps.now);
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const record: DedupRecord = {
    sourceId: raw.sourceId,
    externalId: raw.externalId,
    companyKey: company.normalizedName,
    title: n.title,
    titleKey: n.titleKey,
    cities: n.locations.map((l) => l.city),
    description: n.description,
    canonicalUrl: n.canonicalUrl,
    dedupKey: n.dedupKey,
  };

  const candidates = await loadCandidates(db, companyId, n, raw.jobId);
  if (deps.embedder) await addSemanticSignal(db, deps.embedder, companyId, n, candidates, usage);
  const match = findDuplicate(record, candidates);

  // 1) Already linked (same source + id): refresh the canonical job if this raw record is its primary source.
  if (match && match.layer === 'SOURCE_ID') {
    const job = await db.job.findUniqueOrThrow({ where: { id: match.jobId }, include: { rawJobs: { orderBy: { firstSeenAt: 'asc' }, take: 1, select: { id: true } } } });
    const isPrimary = job.rawJobs[0]?.id === raw.id;
    const changed = isPrimary && (job.description !== n.description || job.title !== n.title || job.canonicalUrl !== n.canonicalUrl || job.dedupKey !== n.dedupKey);
    await db.$transaction(async (tx) => {
      if (isPrimary) {
        // Where the source is silent (null), keep values the classifier filled in earlier rather than wiping them.
        const fields = jobFields(n, companyId, job.correlationId);
        await tx.job.update({
          where: { id: job.id },
          data: {
            ...fields,
            employmentType: fields.employmentType ?? job.employmentType,
            workMode: fields.workMode ?? job.workMode,
            salaryText: fields.salaryText ?? job.salaryText,
            ...(fields.primaryCity === null && job.primaryCity !== null ? { primaryCity: job.primaryCity, primaryState: job.primaryState, locationType: job.locationType } : {}),
            status: 'ACTIVE',
            closedAt: null,
            lastSeenAt: new Date(),
          },
        });
        await writeFacets(tx, job.id, n);
      } else if (job.status === 'CLOSED') {
        await tx.job.update({ where: { id: job.id }, data: { status: 'ACTIVE', closedAt: null } });
      }
      await tx.rawJob.update({ where: { id: raw.id }, data: { status: isPrimary ? 'NORMALIZED' : 'MERGED', processingError: null } });
    }, TX_OPTIONS);
    return { jobId: job.id, action: changed ? 'updated' : 'unchanged', needsClassification: changed || job.classifiedAt === null, duplicate: null, usage };
  }

  // 2) Cross-source duplicate → attach this raw record to the existing canonical job.
  if (match && match.decision === 'MERGED') {
    await db.$transaction(async (tx) => {
      await tx.rawJob.update({ where: { id: raw.id }, data: { jobId: match.jobId, status: 'MERGED', processingError: null } });
      await tx.jobDuplicate.upsert({
        where: { canonicalJobId_rawJobId: { canonicalJobId: match.jobId, rawJobId: raw.id } },
        create: { canonicalJobId: match.jobId, rawJobId: raw.id, layer: match.layer, similarityScore: match.score, factors: match.factors as unknown as Prisma.InputJsonValue, decision: 'MERGED', reviewStatus: 'AUTO' },
        update: { layer: match.layer, similarityScore: match.score, factors: match.factors as unknown as Prisma.InputJsonValue, decision: 'MERGED' },
      });
      await tx.job.update({ where: { id: match.jobId }, data: { status: 'ACTIVE', closedAt: null, lastSeenAt: new Date() } });
    }, TX_OPTIONS);
    return { jobId: match.jobId, action: 'merged', needsClassification: false, duplicate: match, usage };
  }

  // 3) New canonical job (possibly flagged as a probable duplicate for review).
  const jobId = await db.$transaction(async (tx) => {
    const job = await tx.job.create({ data: { ...jobFields(n, companyId, raw.correlationId), firstSeenAt: raw.firstSeenAt, lastSeenAt: new Date() } });
    await writeFacets(tx, job.id, n);
    await tx.rawJob.update({ where: { id: raw.id }, data: { jobId: job.id, status: 'NORMALIZED', processingError: null } });
    if (match && match.decision === 'NEEDS_REVIEW') {
      await tx.jobDuplicate.create({
        data: { canonicalJobId: match.jobId, rawJobId: raw.id, candidateJobId: job.id, layer: match.layer, similarityScore: match.score, factors: match.factors as unknown as Prisma.InputJsonValue, decision: 'NEEDS_REVIEW', reviewStatus: 'PENDING' },
      });
    }
    return job.id;
  }, TX_OPTIONS);
  return { jobId, action: 'created', needsClassification: true, duplicate: match, usage };
}

export async function persistUsage(db: PrismaClient, usage: UsageRecord[], ctx: { jobId: string | null; classificationId?: string | null; correlationId: string }) {
  if (!usage.length) return;
  await db.aIUsage.createMany({
    data: usage.map((u) => ({
      operation: u.operation,
      provider: u.provider,
      model: u.model,
      promptVersion: u.promptVersion,
      jobId: ctx.jobId,
      classificationId: ctx.classificationId ?? null,
      correlationId: ctx.correlationId,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      tokensMeasured: u.tokensMeasured,
      latencyMs: u.latencyMs,
      retryCount: u.retryCount,
      success: u.success,
      errorMessage: u.errorMessage,
      costUsd: u.costUsd,
      pricingVersion: u.pricingVersion,
    })),
  });
}
