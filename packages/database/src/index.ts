import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __beepPrisma?: PrismaClient };

/** Process-wide Prisma client (reused across hot reloads in development). */
export const prisma: PrismaClient =
  globalForPrisma.__beepPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__beepPrisma = prisma;

export { SOURCE_REGISTRY, type SourceSeed } from './source-registry';
export * from './embedding';
