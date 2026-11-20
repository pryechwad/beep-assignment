import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@beep/database';
import { readHeartbeats, type Queue, type QueueName, type Redis } from '@beep/queues';
import { logger } from '@beep/shared/logger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, HttpError } from './lib/http';
import { openApiDocument } from './openapi';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { liveRouter } from './routes/live';
import { logoRouter } from './routes/logo';
import { publicRouter } from './routes/public';

export interface AppDeps {
  db: PrismaClient;
  redis: Redis;
  queues: Record<QueueName, Queue>;
  jwtSecret: string;
  webOrigins: string[];
  production: boolean;
  /** TTL for cached public aggregates (default 30s; 0 disables, e.g. in tests). */
  cacheTtlMs?: number;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  // Number of reverse proxies in front of the API (e.g. Caddy + nginx = 2), so rate limits see the real client IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{6,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: deps.webOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Liveness/readiness: checks the database and Redis, reports worker/scheduler heartbeats.
  app.get('/health', async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
      deps.db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      deps.redis.ping().then((p) => p === 'PONG').catch(() => false),
    ]);
    const hb = redisOk ? await readHeartbeats(deps.redis).catch(() => []) : [];
    res.status(dbOk && redisOk ? 200 : 503).json({
      status: dbOk && redisOk ? 'ok' : 'degraded',
      database: dbOk,
      redis: redisOk,
      workers: hb.filter((h) => h.role === 'worker').length,
      scheduler: hb.some((h) => h.role === 'scheduler'),
      time: new Date().toISOString(),
    });
  });

  const v1 = express.Router();
  v1.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } }));
  v1.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  v1.use('/auth', authRouter(deps.db, deps.jwtSecret, deps.production));
  v1.use('/admin', adminRouter(deps.db, deps.redis, deps.queues, deps.jwtSecret));
  v1.use(liveRouter(deps.db, deps.redis, deps.queues));
  v1.use(logoRouter());
  v1.use(publicRouter(deps.db, deps.redis, { cacheTtlMs: deps.cacheTtlMs }));
  app.use('/api/v1', v1);

  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}
