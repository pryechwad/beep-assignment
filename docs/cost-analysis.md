# Cost analysis

All figures below are **computed from measured usage**: token counts come from each provider's `usage` field on every API response (stored per call in `AIUsage`), multiplied by the list prices in the dated table `packages/ai-engine/src/pricing.ts` (version `2026-11-20`). They are not invoice figures. Prices marked *unverified* came from third-party trackers and must be confirmed against the provider's pricing page; the admin Costs page flags this next to every affected figure.

## Measured (2026-11-20, Groq `openai/gpt-oss-20b`)

| Metric | Value |
|---|---|
| LLM API calls | 130 (87 succeeded, 43 failed — per-minute 429s before pacing was fixed, and the daily cap) |
| Input / output tokens | 230,664 / 50,199 (all measured; 0 estimated) |
| Average per successful call | ≈2,400 input / ≈530 output tokens |
| Average latency | ≈1.1 s |
| Price used | $0.075 / $0.30 per 1M tokens (unverified, source: morphllm.com/groq-pricing) |
| Total computed cost | **$0.0324** (includes tokens billed on failed attempts) |
| Classifications written | 272 (87 LLM-assisted, 185 rules-only/fallback) |
| **Cost per 1,000 processed posts** | **$0.0324 ÷ 272 × 1,000 ≈ $0.12** |
| Cost per 1,000 LLM-classified posts | $0.0324 ÷ 87 × 1,000 ≈ $0.37 |

Definition used (spec): *Cost per 1,000 processed posts = actual total processing cost ÷ successfully processed posts × 1,000*, where "processed" counts every classification written (rules-only posts cost $0). The live value is shown on **Admin → Costs** and can be exported per call as CSV (`/api/v1/admin/ai-usage/export.csv`).

Embedding cost so far: $0 — no embedding provider is configured (semantic dedup activates with a Gemini or OpenAI key).

## Projection (estimate, clearly not measured)

Using the measured ≈2,400 / ≈530 tokens per LLM call and the price table:

| Model | Est. cost per 1,000 LLM-classified posts |
|---|---|
| Groq gpt-oss-20b ($0.075 / $0.30) | ≈ $0.34 (measured $0.37 incl. failed attempts) |
| Gemini 2.5 Flash-Lite ($0.10 / $0.40) | ≈ $0.45 |
| OpenAI gpt-5-nano ($0.05 / $0.40) | ≈ $0.33 + reasoning tokens |

With the current routing (~65% of postings need the LLM; the rest are clearly senior and rules-only), the blended cost is roughly **$0.25–0.35 per 1,000 posts**, i.e. well under $1/day for the current index. These projections must be replaced by measured values once the respective keys are configured.

## Cost controls in the code

- Rules-first routing: clearly senior roles never reach the LLM.
- Description trimming to signal-bearing paragraphs (4,500-char budget).
- Output cap of 900 tokens; `reasoning_effort` low/minimal for reasoning models.
- Daily cap `AI_MAX_LLM_CLASSIFICATIONS_PER_DAY` (Redis counter shared by all workers) and per-minute pacing `AI_CLASSIFY_PER_MINUTE`.
- Re-classification only when classification-relevant content changes (content hash).
- Embeddings only for ambiguous duplicate candidates.
