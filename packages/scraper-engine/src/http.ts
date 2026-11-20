import axios, { AxiosError, type AxiosInstance } from 'axios';

export const USER_AGENT = 'BeepJobIntelligenceBot/0.1 (+public job board aggregation; respects robots.txt)';

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SourceHttpError';
  }
}

/**
 * Simple token-interval limiter: guarantees at most `perMinute` requests per
 * key (per source host/board) from this process.
 */
export class RateLimiter {
  private nextAllowed = new Map<string, number>();
  constructor(private readonly perMinute: number) {}

  async wait(key: string): Promise<void> {
    const interval = 60_000 / Math.max(1, this.perMinute);
    const now = Date.now();
    const at = Math.max(now, this.nextAllowed.get(key) ?? 0);
    this.nextAllowed.set(key, at + interval);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export interface HttpClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  rateLimitPerMinute?: number;
}

export class HttpClient {
  private readonly axios: AxiosInstance;
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;

  constructor(opts: HttpClientOptions = {}) {
    this.axios = axios.create({
      timeout: opts.timeoutMs ?? 20_000,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      maxRedirects: 3,
      validateStatus: () => true,
    });
    this.limiter = new RateLimiter(opts.rateLimitPerMinute ?? 30);
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /** GET JSON with rate limiting and exponential backoff on 429/5xx/network errors. */
  async getJson<T>(url: string, limiterKey = new URL(url).host): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.limiter.wait(limiterKey);
      try {
        const res = await this.axios.get<T>(url);
        if (res.status >= 200 && res.status < 300) return res.data;
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= this.maxRetries) {
          throw new SourceHttpError(`GET ${url} → HTTP ${res.status}`, res.status, retryable);
        }
        const retryAfter = Number(res.headers['retry-after']);
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      } catch (err) {
        if (err instanceof SourceHttpError) throw err;
        const ax = err as AxiosError;
        if (attempt >= this.maxRetries) throw new SourceHttpError(`GET ${url} failed: ${ax.code ?? ax.message}`, null, true);
        await sleep(backoff(attempt));
      }
      attempt++;
    }
  }

  async getText(url: string): Promise<{ status: number; body: string }> {
    await this.limiter.wait(new URL(url).host);
    const res = await this.axios.get<string>(url, { responseType: 'text', headers: { Accept: 'text/plain,*/*' } });
    return { status: res.status, body: typeof res.data === 'string' ? res.data : '' };
  }
}

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
