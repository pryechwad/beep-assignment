import { GeminiProvider } from './providers/gemini';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import type { LLMProvider, ProviderName } from './types';

/** Model choices are configuration, not code. Defaults are cheap, structured-output-capable models. */
export const DEFAULT_MODELS = {
  gemini: { chat: 'gemini-2.5-flash-lite', embedding: 'gemini-embedding-001' },
  openai: { chat: 'gpt-5-nano', embedding: 'text-embedding-3-small' },
  groq: { chat: 'openai/gpt-oss-20b', embedding: null },
} as const;

export interface AIConfig {
  providers: LLMProvider[];
  embeddingProvider: LLMProvider | null;
  /** Providers listed in AI_PROVIDER_ORDER that were skipped because no key is set. */
  missingKeys: ProviderName[];
}

export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): AIConfig {
  const order = (env.AI_PROVIDER_ORDER ?? 'gemini,openai,groq')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName => s === 'gemini' || s === 'openai' || s === 'groq');

  const build = (name: ProviderName): LLMProvider | LLMProvider[] | null => {
    switch (name) {
      case 'gemini':
        return env.GEMINI_API_KEY
          ? new GeminiProvider(env.GEMINI_API_KEY, env.AI_GEMINI_MODEL || DEFAULT_MODELS.gemini.chat, env.AI_GEMINI_EMBEDDING_MODEL || DEFAULT_MODELS.gemini.embedding)
          : null;
      case 'openai':
        return env.OPENAI_API_KEY
          ? new OpenAICompatibleProvider({
              name: 'openai',
              apiKey: env.OPENAI_API_KEY,
              baseUrl: 'https://api.openai.com/v1',
              chatModel: env.AI_OPENAI_MODEL || DEFAULT_MODELS.openai.chat,
              embeddingModel: env.AI_OPENAI_EMBEDDING_MODEL || DEFAULT_MODELS.openai.embedding,
              reasoningEffort: /^gpt-5|^o\d/.test(env.AI_OPENAI_MODEL || DEFAULT_MODELS.openai.chat) ? 'minimal' : null,
              supportsJsonSchema: true,
            })
          : null;
      case 'groq':
        return env.GROQ_API_KEY
          ? (env.AI_GROQ_MODELS || env.AI_GROQ_MODEL || `${DEFAULT_MODELS.groq.chat},openai/gpt-oss-120b`)
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean)
              .map(
                (model) =>
                  new OpenAICompatibleProvider({
                    name: 'groq',
                    apiKey: env.GROQ_API_KEY!,
                    baseUrl: 'https://api.groq.com/openai/v1',
                    chatModel: model,
                    embeddingModel: null,
                    // gpt-oss on Groq can spend the whole budget on reasoning without this
                    reasoningEffort: 'low',
                    supportsJsonSchema: true,
                  }),
              )
          : null;
    }
  };

  const providers: LLMProvider[] = [];
  const missingKeys: ProviderName[] = [];
  for (const name of order) {
    const p = build(name);
    if (Array.isArray(p)) providers.push(...p);
    else if (p) providers.push(p);
    else missingKeys.push(name);
  }
  const embName = (env.AI_EMBEDDING_PROVIDER ?? '').trim().toLowerCase();
  const embeddingProvider = providers.find((p) => p.name === embName && p.embeddingModel && p.embed) ?? null;
  return { providers, embeddingProvider, missingKeys };
}
