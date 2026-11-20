import type { ZodType } from 'zod';
import { computeCost, PRICING_VERSION } from './pricing';
import { ProviderError, type ChatJsonRequest, type LLMProvider, type ProviderName, type TokenUsage, type UsageRecord } from './types';

export interface StructuredCall<T> {
  promptVersion: string;
  request: ChatJsonRequest;
  schema: ZodType<T>;
}

export interface StructuredResult<T> {
  value: T;
  provider: ProviderName;
  model: string;
  /** true when the first response failed validation and the repair attempt succeeded */
  repaired: boolean;
  usage: UsageRecord[];
  totalLatencyMs: number;
}

export class StructuredCallError extends Error {
  constructor(
    message: string,
    readonly usage: UsageRecord[],
  ) {
    super(message);
    this.name = 'StructuredCallError';
  }
}

export interface RunnerOptions {
  maxRetriesPerProvider?: number;
  baseBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Tries providers in order. Per provider: transient errors are retried with
 * exponential backoff; a response that fails schema validation gets one
 * repair attempt with the validation errors fed back. Quota/auth failures
 * disable the provider for the lifetime of this runner (i.e. the worker run).
 */
export class StructuredRunner {
  /** Keyed by "provider:model" — quotas are per model, so one exhausted model must not disable its siblings. */
  private disabled = new Map<string, string>();
  private readonly maxRetries: number;
  private readonly baseBackoff: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly providers: LLMProvider[],
    opts: RunnerOptions = {},
  ) {
    this.maxRetries = opts.maxRetriesPerProvider ?? 2;
    this.baseBackoff = opts.baseBackoffMs ?? 1500;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get availableProviders(): string[] {
    return this.providers.filter((p) => !this.disabled.has(keyOf(p))).map(keyOf);
  }

  get disabledProviders(): { provider: string; reason: string }[] {
    return [...this.disabled.entries()].map(([provider, reason]) => ({ provider, reason }));
  }

  async run<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const usage: UsageRecord[] = [];
    const errors: string[] = [];
    const started = Date.now();

    for (const provider of this.providers) {
      if (this.disabled.has(keyOf(provider))) continue;
      let retry = 0;
      let request = call.request;
      let repairing = false;

      while (retry <= this.maxRetries) {
        try {
          const res = await provider.chatJson(request);
          const record = this.record(call, provider.name, res.model, res.usage, res.latencyMs, retry, true, null);
          usage.push(record);
          const parsed = parseJson(res.text);
          const validated = parsed.ok ? call.schema.safeParse(parsed.value) : null;
          if (validated?.success) {
            return { value: validated.data, provider: provider.name, model: res.model, repaired: repairing, usage, totalLatencyMs: Date.now() - started };
          }
          const issue = parsed.ok ? validated!.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') : parsed.error;
          record.success = false;
          record.errorMessage = `validation: ${issue}`.slice(0, 500);
          if (repairing) {
            errors.push(`${provider.name}: invalid output after repair (${issue})`);
            break;
          }
          repairing = true;
          retry++;
          request = {
            ...call.request,
            user: `${call.request.user}\n\nYour previous response was invalid: ${issue}\nReturn ONLY a JSON object that satisfies the schema exactly.`,
          };
        } catch (e) {
          const err = e as ProviderError & { usage?: TokenUsage; model?: string; latencyMs?: number };
          if (err.usage) usage.push(this.record(call, provider.name, err.model ?? provider.chatModel, err.usage, err.latencyMs ?? 0, retry, false, err.message));
          else usage.push(this.record(call, provider.name, provider.chatModel, { inputTokens: 0, outputTokens: 0, measured: true }, 0, retry, false, err.message));
          if (err instanceof ProviderError && err.disableProvider) {
            this.disabled.set(keyOf(provider), err.message.slice(0, 200));
            errors.push(err.message);
            break;
          }
          const retryable = err instanceof ProviderError ? err.retryable : false;
          if (!retryable || retry >= this.maxRetries) {
            errors.push(err.message);
            break;
          }
          const backoff = this.baseBackoff * 2 ** retry + Math.floor(Math.random() * 300);
          const hint = err instanceof ProviderError && err.retryAfterMs !== null ? Math.min(err.retryAfterMs + 250, 65_000) : 0;
          await this.sleep(Math.max(backoff, hint));
          retry++;
        }
      }
    }
    throw new StructuredCallError(errors.length ? errors.join(' | ') : 'no AI provider available (missing API keys or all disabled)', usage);
  }

  private record(call: StructuredCall<unknown>, provider: ProviderName, model: string, u: TokenUsage, latencyMs: number, retryCount: number, success: boolean, errorMessage: string | null): UsageRecord {
    return {
      operation: 'CLASSIFY',
      provider,
      model,
      promptVersion: call.promptVersion,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      tokensMeasured: u.measured,
      latencyMs,
      retryCount,
      success,
      errorMessage: errorMessage?.slice(0, 500) ?? null,
      costUsd: computeCost(provider, model, u).costUsd,
      pricingVersion: PRICING_VERSION,
    };
  }
}

const keyOf = (p: LLMProvider) => `${p.name}:${p.chatModel}`;

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message.slice(0, 80)})` };
  }
}
