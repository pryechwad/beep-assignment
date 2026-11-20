import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';

/**
 * Structured JSON logger shared by api, worker and scheduler. Every pipeline
 * record carries a `correlationId` so a single job can be traced from discovery
 * through classification across processes.
 */
export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: process.env.SERVICE_NAME ?? 'beep' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.password', '*.passwordHash'],
    censor: '[redacted]',
  },
});

export function newCorrelationId(prefix = 'cor'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export type { Logger };
