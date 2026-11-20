import type { ProviderName, TokenUsage } from './types';

/**
 * Dated price table (USD per 1M tokens). Costs in reports are *computed*:
 * measured token counts from provider usage reports × these list prices.
 *
 * `verified: false` means the price came from a third-party tracker and has
 * not yet been confirmed against the provider's official pricing page — the
 * cost report surfaces this flag next to every figure that depends on it.
 * Update the entry (and PRICING_VERSION) when prices are confirmed or change.
 */
export const PRICING_VERSION = '2026-11-20';

export interface PriceEntry {
  provider: ProviderName;
  /** Prefix match against the model id the provider reports (handles dated snapshots). */
  modelPrefix: string;
  inputPerMTok: number;
  outputPerMTok: number;
  verified: boolean;
  source: string;
}

export const PRICE_TABLE: PriceEntry[] = [
  // Groq — third-party trackers citing Groq docs (Oct 2026), consistent across sources.
  { provider: 'groq', modelPrefix: 'openai/gpt-oss-20b', inputPerMTok: 0.075, outputPerMTok: 0.3, verified: false, source: 'https://www.morphllm.com/groq-pricing' },
  { provider: 'groq', modelPrefix: 'openai/gpt-oss-120b', inputPerMTok: 0.15, outputPerMTok: 0.6, verified: false, source: 'https://www.morphllm.com/groq-pricing' },
  // OpenAI
  { provider: 'openai', modelPrefix: 'text-embedding-3-small', inputPerMTok: 0.02, outputPerMTok: 0, verified: true, source: 'https://developers.openai.com/api/docs/models/text-embedding-3-small' },
  { provider: 'openai', modelPrefix: 'gpt-5-nano', inputPerMTok: 0.05, outputPerMTok: 0.4, verified: false, source: 'https://www.nops.io/blog/openai-api-pricing/' },
  { provider: 'openai', modelPrefix: 'gpt-5-mini', inputPerMTok: 0.25, outputPerMTok: 2.0, verified: false, source: 'https://www.nops.io/blog/openai-api-pricing/' },
  { provider: 'openai', modelPrefix: 'gpt-4o-mini', inputPerMTok: 0.15, outputPerMTok: 0.6, verified: false, source: 'https://www.silicondata.com/use-cases/openai-api-pricing-per-1m-tokens' },
  // Gemini — sources disagree by model generation; confirm at https://ai.google.dev/gemini-api/docs/pricing
  { provider: 'gemini', modelPrefix: 'gemini-2.5-flash-lite', inputPerMTok: 0.1, outputPerMTok: 0.4, verified: false, source: 'https://developer.puter.com/tutorials/gemini-api-pricing/' },
  { provider: 'gemini', modelPrefix: 'gemini-3.5-flash-lite', inputPerMTok: 0.15, outputPerMTok: 1.25, verified: false, source: 'https://cloudprice.net/models/google-gemini-3-5-flash-lite' },
  { provider: 'gemini', modelPrefix: 'gemini-2.5-flash', inputPerMTok: 0.3, outputPerMTok: 2.5, verified: false, source: 'https://www.finout.io/blog/gemini-pricing-in-2026' },
  { provider: 'gemini', modelPrefix: 'gemini-embedding', inputPerMTok: 0.15, outputPerMTok: 0, verified: false, source: 'unconfirmed — no current official rate found on 2026-11-20' },
];

export interface CostResult {
  costUsd: number;
  /** null when no price entry matches the model — cost is then reported as unknown, not zero. */
  price: PriceEntry | null;
}

export function findPrice(provider: ProviderName, model: string): PriceEntry | null {
  const m = model.replace(/^models\//, '');
  return PRICE_TABLE.filter((p) => p.provider === provider && m.startsWith(p.modelPrefix)).sort((a, b) => b.modelPrefix.length - a.modelPrefix.length)[0] ?? null;
}

export function computeCost(provider: ProviderName, model: string, usage: Pick<TokenUsage, 'inputTokens' | 'outputTokens'>): CostResult {
  const price = findPrice(provider, model);
  if (!price) return { costUsd: 0, price: null };
  return { costUsd: (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000, price };
}

/** Rough local token estimate (≈4 chars/token) — used only when a provider omits usage. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
