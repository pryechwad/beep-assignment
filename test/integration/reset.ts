import type { PrismaClient } from '@beep/database';

/** Empty every application table (migrations history kept) so each test file starts from a clean database. */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  if (!/beep_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('resetDatabase refused: not pointed at a test database');
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
