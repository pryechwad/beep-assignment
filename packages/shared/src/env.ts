import { z } from 'zod';

/** Server-side environment contract shared by api, worker and scheduler. Node-only. */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4100),
  WEB_ORIGIN: z.string().default('http://localhost:5180'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  AI_PROVIDER_ORDER: z.string().default('gemini,openai,groq'),
  AI_EMBEDDING_PROVIDER: z.string().default(''),
  /** Daily cap on LLM classification calls across all workers (cost/quota guard). 0 = unlimited. */
  AI_MAX_LLM_CLASSIFICATIONS_PER_DAY: z.coerce.number().int().min(0).default(400),
  /** Max LLM classifications per minute (BullMQ limiter). Free tiers allow only a few per minute. */
  AI_CLASSIFY_PER_MINUTE: z.coerce.number().int().positive().default(4),
  /** true: every posting gets an LLM pass (early-career first); false: clearly senior roles are rules-only. */
  AI_LLM_FOR_ALL: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  PIPELINE_CRON: z.string().default('30 6 * * *'),
  PIPELINE_TZ: z.string().default('Asia/Kolkata'),
  LINK_VERIFY_CRON: z.string().default('0 */6 * * *'),
  RECLASSIFY_CRON: z.string().default('15 * * * *'),
  ANALYTICS_CRON: z.string().default('55 23 * * *'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
