import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** Recreate `beep_test` from scratch and apply every migration (the same path production uses). */
export default async function setup() {
  const root = resolve(__dirname, '../..');
  const env = readFileSync(resolve(root, '.env'), 'utf8');
  const testUrl = process.env.TEST_DATABASE_URL ?? /^TEST_DATABASE_URL=(.*)$/m.exec(env)?.[1] ?? 'postgresql://beep:beep_dev_password@localhost:5442/beep_test';
  const url = new URL(testUrl);
  const dbName = url.pathname.slice(1);
  if (!/^beep_test\w*$/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  execFileSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(root, 'packages/database'),
    env: { ...process.env, DATABASE_URL: testUrl, CHECKPOINT_DISABLE: '1' },
    stdio: 'pipe',
  });
}
