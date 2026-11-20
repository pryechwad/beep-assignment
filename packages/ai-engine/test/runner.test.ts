import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { computeCost, findPrice, jobIntelligencePrompt, ProviderError, StructuredRunner, type ChatJsonResponse, type LLMProvider } from '../src';

const schema = z.object({ answer: z.string() });
const call = { promptVersion: 'test.v1', schema, request: { system: 's', user: 'u', jsonSchema: {}, schemaName: 't', maxOutputTokens: 10 } };
const ok = (text: string): ChatJsonResponse => ({ text, usage: { inputTokens: 100, outputTokens: 20, measured: true }, model: 'openai/gpt-oss-20b', latencyMs: 5 });

function fake(name: 'groq' | 'gemini' | 'openai', script: (() => ChatJsonResponse)[]): LLMProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    chatModel: 'openai/gpt-oss-20b',
    embeddingModel: null,
    calls,
    async chatJson(req) {
      calls.push(req.user);
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return next();
    },
  };
}
const noSleep = { sleep: async () => {} };

describe('StructuredRunner', () => {
  it('returns validated output and records measured usage + cost', async () => {
    const p = fake('groq', [() => ok('{"answer":"x"}')]);
    const r = await new StructuredRunner([p], noSleep).run(call);
    expect(r.value).toEqual({ answer: 'x' });
    expect(r.usage).toHaveLength(1);
    expect(r.usage[0]).toMatchObject({ success: true, inputTokens: 100, outputTokens: 20, tokensMeasured: true, promptVersion: 'test.v1' });
    expect(r.usage[0]!.costUsd).toBeCloseTo((100 * 0.075 + 20 * 0.3) / 1e6, 12);
  });

  it('repairs invalid JSON once, feeding the error back', async () => {
    const p = fake('groq', [() => ok('{"wrong":1}'), () => ok('{"answer":"fixed"}')]);
    const r = await new StructuredRunner([p], noSleep).run(call);
    expect(r.repaired).toBe(true);
    expect(p.calls[1]).toMatch(/previous response was invalid/);
    expect(r.usage.map((u) => u.success)).toEqual([false, true]);
  });

  it('retries transient errors with backoff then succeeds', async () => {
    const p = fake('groq', [
      () => {
        throw new ProviderError('groq', 'HTTP 503', 503, true, false);
      },
      () => ok('{"answer":"y"}'),
    ]);
    const r = await new StructuredRunner([p], noSleep).run(call);
    expect(r.value.answer).toBe('y');
    expect(r.usage[1]!.retryCount).toBe(1);
  });

  it('fails over to the next provider and disables a quota-exhausted one', async () => {
    const a = fake('gemini', [
      () => {
        throw new ProviderError('gemini', 'HTTP 429 quota exhausted', 429, false, true);
      },
    ]);
    const b = fake('groq', [() => ok('{"answer":"z"}'), () => ok('{"answer":"z2"}')]);
    const runner = new StructuredRunner([a, b], noSleep);
    expect((await runner.run(call)).provider).toBe('groq');
    expect(runner.availableProviders).toEqual(['groq:openai/gpt-oss-20b']);
    await runner.run(call);
    expect(a.calls).toHaveLength(1); // not retried after being disabled
  });

  it('disables only the exhausted model, so a sibling model of the same provider still serves (per-model quotas)', async () => {
    const small = { ...fake('groq', [() => { throw new ProviderError('groq', 'HTTP 429 tokens per day (TPD)', 429, false, true); }]), chatModel: 'openai/gpt-oss-20b' };
    const big = { ...fake('groq', [() => ok('{"answer":"big"}')]), chatModel: 'openai/gpt-oss-120b' };
    const runner = new StructuredRunner([small, big], noSleep);
    expect((await runner.run(call)).value.answer).toBe('big');
    expect(runner.availableProviders).toEqual(['groq:openai/gpt-oss-120b']);
  });

  it('throws with all usage attached when every provider fails', async () => {
    const p = fake('groq', [() => ok('nope'), () => ok('still nope')]);
    await expect(new StructuredRunner([p], noSleep).run(call)).rejects.toMatchObject({ usage: expect.arrayContaining([expect.objectContaining({ success: false })]) });
  });

  it('reports a clear error when no providers are configured', async () => {
    await expect(new StructuredRunner([], noSleep).run(call)).rejects.toThrow(/no AI provider available/);
  });
});

describe('pricing', () => {
  it('matches dated model snapshots by prefix and prefers the longest prefix', () => {
    expect(findPrice('gemini', 'gemini-2.5-flash-lite-preview-09-2025')?.modelPrefix).toBe('gemini-2.5-flash-lite');
    expect(findPrice('gemini', 'models/gemini-2.5-flash')?.modelPrefix).toBe('gemini-2.5-flash');
  });
  it('reports unknown models as unpriced rather than guessing', () => {
    expect(computeCost('openai', 'some-future-model', { inputTokens: 1000, outputTokens: 1000 }).price).toBeNull();
  });
});

describe('job intelligence prompt', () => {
  it('pins every fragment version', () => {
    expect(jobIntelligencePrompt.PROMPT_VERSION).toBe('job-intel.v1(role.v1,experience.v1,location.v1,eligibility.v1,summary.v1)');
  });
  it('keeps requirement sections and drops boilerplate when trimming', () => {
    const desc = ['About Us', 'x'.repeat(3000), 'Requirements', 'You have 0-1 years of experience in Python.', 'Benefits', 'y'.repeat(4000)].join('\n\n');
    const out = jobIntelligencePrompt.selectRelevantText(desc, 2000);
    expect(out).toContain('0-1 years');
    expect(out).not.toContain('yyyy');
  });
  it('JSON schema requires every property (strict mode)', () => {
    const s = jobIntelligencePrompt.jsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(new Set(s.required)).toEqual(new Set(Object.keys(s.properties)));
  });
});
