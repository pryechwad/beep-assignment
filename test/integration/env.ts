// Runs before each integration test file's imports: point every client at the test database / Redis DB 1.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
const fromFile = Object.fromEntries(
  file
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1]!, m[2]!]),
);
const testDb = process.env.TEST_DATABASE_URL ?? fromFile.TEST_DATABASE_URL ?? 'postgresql://beep:beep_dev_password@localhost:5442/beep_test';
const redis = (process.env.REDIS_URL ?? fromFile.REDIS_URL ?? 'redis://localhost:6389').replace(/\/\d*$/, '');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDb;
process.env.REDIS_URL = `${redis}/1`;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
// No real AI keys in tests: classification falls back to rules deterministically.
process.env.GEMINI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.GROQ_API_KEY = '';
process.env.CHECKPOINT_DISABLE = '1';
