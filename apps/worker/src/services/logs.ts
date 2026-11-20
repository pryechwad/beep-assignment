import type { Prisma, PrismaClient } from '@beep/database';
import { logger } from '@beep/shared/logger';

export interface LogContext {
  correlationId?: string | null;
  runId?: string | null;
  sourceId?: string | null;
  jobId?: string | null;
  rawJobId?: string | null;
  [key: string]: unknown;
}

/**
 * Warnings and errors go to stdout (structured JSON) AND the PipelineLog table
 * so the admin console can show them. Info only goes to stdout.
 */
export async function pipelineLog(db: PrismaClient, level: 'INFO' | 'WARN' | 'ERROR', scope: string, message: string, ctx: LogContext = {}): Promise<void> {
  const { correlationId, runId, sourceId, jobId, rawJobId, ...rest } = ctx;
  const line = { scope, correlationId, runId, sourceId, jobId, rawJobId, ...rest };
  if (level === 'ERROR') logger.error(line, message);
  else if (level === 'WARN') logger.warn(line, message);
  else logger.info(line, message);
  if (level === 'INFO') return;
  try {
    await db.pipelineLog.create({
      data: {
        level,
        scope,
        message: message.slice(0, 2000),
        correlationId: correlationId ?? null,
        runId: runId ?? null,
        sourceId: sourceId ?? null,
        jobId: jobId ?? null,
        rawJobId: rawJobId ?? null,
        context: Object.keys(rest).length ? (JSON.parse(JSON.stringify(rest)) as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    logger.error({ err: e, scope }, 'failed to persist pipeline log');
  }
}
