export type ProviderName = 'openai' | 'gemini' | 'groq';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** true when counts come from the provider's usage report, false when estimated locally. */
  measured: boolean;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** JSON Schema (draft 2020-12 subset) the response must satisfy. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface ChatJsonResponse {
  text: string;
  usage: TokenUsage;
  /** Model version the provider reports having used (may differ from the requested alias). */
  model: string;
  latencyMs: number;
}

export interface EmbedResponse {
  vectors: number[][];
  usage: TokenUsage;
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly chatModel: string;
  readonly embeddingModel: string | null;
  chatJson(req: ChatJsonRequest): Promise<ChatJsonResponse>;
  embed?(texts: string[], dimensions: number): Promise<EmbedResponse>;
}

/** Provider error with enough information to decide whether to retry or fail over. */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    message: string,
    readonly status: number | null,
    /** Transient: rate limit, 5xx, timeout — worth retrying with backoff. */
    readonly retryable: boolean,
    /** Quota exhausted / auth failure — skip this provider for the rest of the run. */
    readonly disableProvider: boolean,
    /** Provider-suggested wait before retrying (Retry-After header or "try again in Xs"). */
    readonly retryAfterMs: number | null = null,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

/** One recorded API attempt; the caller persists these as AIUsage rows. */
export interface UsageRecord {
  operation: 'CLASSIFY' | 'EMBEDDING';
  provider: ProviderName;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  tokensMeasured: boolean;
  latencyMs: number;
  retryCount: number;
  success: boolean;
  errorMessage: string | null;
  costUsd: number;
  pricingVersion: string;
}

/** Extract a provider retry hint from a Retry-After header or an error body ("Please try again in 7.25s" / "1m2.5s"). */
export function parseRetryAfter(header: string | null, body: string): number | null {
  if (header && /^\d+(\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header) * 1000);
  const m = /try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i.exec(body);
  if (m) return Math.ceil((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000);
  const r = /retry in (\d+(?:\.\d+)?)s/i.exec(body);
  return r ? Math.ceil(Number(r[1]) * 1000) : null;
}
