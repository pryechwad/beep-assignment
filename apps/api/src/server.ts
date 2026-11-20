import { prisma } from '@beep/database';
import { createQueues, createRedis } from '@beep/queues';
import { loadServerEnv } from '@beep/shared/env';
import { logger } from '@beep/shared/logger';
import { createApp } from './app';

const env = loadServerEnv();
const redis = createRedis(env.REDIS_URL);
const queues = createQueues(redis);
const app = createApp({
  db: prisma,
  redis,
  queues,
  jwtSecret: env.JWT_SECRET,
  webOrigins: env.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  production: env.NODE_ENV === 'production',
});

const server = app.listen(env.API_PORT, () => logger.info({ port: env.API_PORT }, 'API listening'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'API shutting down');
  server.close();
  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
