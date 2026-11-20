import { estimateTokens } from '../pricing';
import { parseRetryAfter, ProviderError, type ChatJsonRequest, type ChatJsonResponse, type EmbedResponse, type LLMProvider, type ProviderName } from '../types';

interface Options {
  name: Extract<ProviderName, 'openai' | 'groq'>;
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string | null;
  /** Reasoning models (gpt-5*, gpt-oss*) accept reasoning_effort; low keeps token use down. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | null;
  /** Some OpenAI-compatible hosts reject strict json_schema; fall back to json_object + validation. */
  supportsJsonSchema: boolean;
  timeoutMs?: number;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** OpenAI Chat Completions API — also used for Groq's OpenAI-compatible endpoint. */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: Options['name'];
  readonly chatModel: string;
  readonly embeddingModel: string | null;

  constructor(private readonly o: Options) {
    this.name = o.name;
    this.chatModel = o.chatModel;
    this.embeddingModel = o.embeddingModel;
  }

  private async post<T>(path: string, body: unknown): Promise<{ data: T; latencyMs: number }> {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.o.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.o.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 60_000),
      });
    } catch (e) {
      throw new ProviderError(this.name, `network error: ${(e as Error).message}`, null, true, false);
    }
    const text = await res.text();
    if (!res.ok) {
      const quota = res.status === 429 && /quota|insufficient|exceeded your|tokens per day|TPD|RPD/i.test(text);
      throw new ProviderError(
        this.name,
        `HTTP ${res.status}: ${text.slice(0, 300)}`,
        res.status,
        (res.status === 429 && !quota) || res.status >= 500,
        quota || res.status === 401 || res.status === 403,
        parseRetryAfter(res.headers.get('retry-after'), text),
      );
    }
    return { data: JSON.parse(text) as T, latencyMs: Date.now() - started };
  }

  async chatJson(req: ChatJsonRequest): Promise<ChatJsonResponse> {
    const body: Record<string, unknown> = {
      model: this.chatModel,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_completion_tokens: req.maxOutputTokens,
      response_format: this.o.supportsJsonSchema
        ? { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.jsonSchema, strict: true } }
        : { type: 'json_object' },
    };
    if (this.o.reasoningEffort) body.reasoning_effort = this.o.reasoningEffort;
    else if (req.temperature !== undefined) body.temperature = req.temperature;

    const { data, latencyMs } = await this.post<ChatCompletion>('/chat/completions', body);
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    const measured = data.usage?.prompt_tokens !== undefined && data.usage?.completion_tokens !== undefined;
    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(req.system + req.user),
      outputTokens: data.usage?.completion_tokens ?? estimateTokens(content),
      measured,
    };
    if (!content.trim()) {
      throw Object.assign(new ProviderError(this.name, `empty completion (finish_reason=${choice?.finish_reason ?? 'unknown'})`, 200, true, false), { usage, model: data.model ?? this.chatModel, latencyMs });
    }
    return { text: content, usage, model: data.model ?? this.chatModel, latencyMs };
  }

  async embed(texts: string[], dimensions: number): Promise<EmbedResponse> {
    if (!this.embeddingModel) throw new ProviderError(this.name, 'no embedding model configured', null, false, false);
    const { data, latencyMs } = await this.post<{ data: { embedding: number[]; index: number }[]; model?: string; usage?: { prompt_tokens?: number } }>('/embeddings', {
      model: this.embeddingModel,
      input: texts,
      dimensions,
    });
    const vectors = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return {
      vectors,
      usage: { inputTokens: data.usage?.prompt_tokens ?? texts.reduce((n, t) => n + estimateTokens(t), 0), outputTokens: 0, measured: data.usage?.prompt_tokens !== undefined },
      model: data.model ?? this.embeddingModel,
      latencyMs,
    };
  }
}
