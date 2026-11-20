import { estimateTokens } from '../pricing';
import { parseRetryAfter, ProviderError, type ChatJsonRequest, type ChatJsonResponse, type EmbedResponse, type LLMProvider } from '../types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

/** Google Gemini API (generateContent with JSON-schema constrained output). */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    readonly chatModel: string,
    readonly embeddingModel: string | null,
    private readonly timeoutMs = 60_000,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<{ data: T; latencyMs: number }> {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ProviderError('gemini', `network error: ${(e as Error).message}`, null, true, false);
    }
    const text = await res.text();
    if (!res.ok) {
      const quota = res.status === 429 && /quota|exhausted|per day|PerDay/i.test(text);
      throw new ProviderError('gemini', `HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, (res.status === 429 && !quota) || res.status >= 500, quota || res.status === 401 || res.status === 403, parseRetryAfter(res.headers.get('retry-after'), text));
    }
    return { data: JSON.parse(text) as T, latencyMs: Date.now() - started };
  }

  async chatJson(req: ChatJsonRequest): Promise<ChatJsonResponse> {
    const { data, latencyMs } = await this.post<GenerateResponse>(`models/${this.chatModel}:generateContent`, {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: req.jsonSchema,
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature ?? 0,
      },
    });
    const cand = data.candidates?.[0];
    const content = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const u = data.usageMetadata;
    const measured = u?.promptTokenCount !== undefined;
    const usage = {
      inputTokens: u?.promptTokenCount ?? estimateTokens(req.system + req.user),
      // "thinking" tokens are billed as output on Gemini
      outputTokens: (u?.candidatesTokenCount ?? estimateTokens(content)) + (u?.thoughtsTokenCount ?? 0),
      measured,
    };
    const model = data.modelVersion ?? this.chatModel;
    if (!content.trim()) {
      throw Object.assign(new ProviderError('gemini', `empty completion (finishReason=${cand?.finishReason ?? 'unknown'})`, 200, true, false), { usage, model, latencyMs });
    }
    return { text: content, usage, model, latencyMs };
  }

  async embed(texts: string[], dimensions: number): Promise<EmbedResponse> {
    if (!this.embeddingModel) throw new ProviderError('gemini', 'no embedding model configured', null, false, false);
    const { data, latencyMs } = await this.post<{ embeddings: { values: number[] }[] }>(`models/${this.embeddingModel}:batchEmbedContents`, {
      requests: texts.map((t) => ({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text: t }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: dimensions,
      })),
    });
    // batchEmbedContents does not report token usage → estimated, flagged as such.
    return {
      vectors: data.embeddings.map((e) => e.values),
      usage: { inputTokens: texts.reduce((n, t) => n + estimateTokens(t), 0), outputTokens: 0, measured: false },
      model: this.embeddingModel,
      latencyMs,
    };
  }
}
