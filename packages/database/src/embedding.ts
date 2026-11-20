import type { PrismaClient } from '@prisma/client';

/**
 * pgvector helpers. Prisma has no native vector type, so embeddings are read
 * and written through parameterised raw SQL here — the only place in the
 * codebase that touches the `embedding` column.
 */

export const EMBEDDING_DIMENSIONS = 768;

const toVectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;

export async function setJobEmbedding(db: PrismaClient, jobId: string, vector: number[]): Promise<void> {
  if (vector.length !== EMBEDDING_DIMENSIONS) throw new Error(`Embedding must have ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
  await db.$executeRaw`UPDATE "Job" SET "embedding" = ${toVectorLiteral(vector)}::vector WHERE "id" = ${jobId}`;
}

export interface SemanticNeighbour {
  jobId: string;
  similarity: number;
}

/** Nearest active jobs of the same company by cosine similarity. */
export async function findSemanticNeighbours(
  db: PrismaClient,
  vector: number[],
  companyId: string,
  excludeJobId: string | null,
  limit = 5,
): Promise<SemanticNeighbour[]> {
  const rows = await db.$queryRaw<{ id: string; similarity: number }[]>`
    SELECT "id", 1 - ("embedding" <=> ${toVectorLiteral(vector)}::vector) AS similarity
    FROM "Job"
    WHERE "companyId" = ${companyId} AND "embedding" IS NOT NULL AND "id" <> ${excludeJobId ?? ''}
    ORDER BY "embedding" <=> ${toVectorLiteral(vector)}::vector
    LIMIT ${limit}`;
  return rows.map((r) => ({ jobId: r.id, similarity: Number(r.similarity) }));
}

export async function hasEmbedding(db: PrismaClient, jobId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ ok: boolean }[]>`SELECT "embedding" IS NOT NULL AS ok FROM "Job" WHERE "id" = ${jobId}`;
  return rows[0]?.ok ?? false;
}
