# AI classification and prompts

## Workflow (per job)

1. **Deterministic preprocessing** — normalised title, locations, employment type, skills (dictionary), and experience signals (explicit year ranges, "freshers welcome" statements, graduation batches, intern/junior/senior title markers), each with the sentence it came from.
2. **Rule classification** — role from title patterns (precedence-ordered, `strong`/`weak`/`none`), experience from the signals, eligibility from experience.
3. **Routing** — the LLM is skipped only when the rules say the job is clearly *experienced* (senior title or >2 years stated) *and* the role is strongly determined. Every potentially fresher-relevant posting goes to the LLM.
4. **LLM call** — one structured-output request per job covering all dimensions (see prompt below), via the first available provider in `AI_PROVIDER_ORDER`. Providers enforce the JSON Schema where supported (OpenAI `json_schema` strict, Gemini `responseJsonSchema`, Groq `json_schema`).
5. **Validation** — Zod parses the response; on failure one repair attempt feeds the errors back. Still invalid → rules fallback, `validationStatus=INVALID`.
6. **Merge + grounding** — see precedence below. Every quote is checked to appear (whitespace/dash/quote-normalised) in the posting; a city, salary, skill, work mode or years figure that is not in the text is discarded and counted as an error.
7. **Confidence** — computed, then `LOW` (or any hallucinated city) ⇒ `needsReview`.
8. **Persist** — new `JobClassification` version (provider, model as reported by the API, prompt version, tokens, latency, retries, cost, validation status, factor breakdown).

## Merge precedence

| Field | Winner |
|---|---|
| Location | the deterministic normalisation of the structured source location; the LLM may only fill an unknown city if the city literally appears in the posting |
| Employment type | source value (an explicit "Intern" in the title beats a generic ATS "Full-time" default); LLM fills only when the source is silent |
| Experience | explicit intern/senior title markers; otherwise the LLM (disagreement with a strong rule ⇒ low confidence) |
| Role | the LLM, **except** an LLM "OTHER" never overrides a strong, specific title match (added after live data showed gpt-oss-20b labelling "Associate Recruiter" as OTHER) |
| Eligibility | the LLM, corrected (and marked REPAIRED) if it contradicts the final experience level |
| Salary | only text explicitly in the posting |
| Skills | dictionary matches first, then LLM skills that are actually mentioned |

## Confidence

Per-field scores: agreement with a strong rule 1.0, with a weak rule 0.85, LLM-only 0.7, disagreement 0.35–0.55; location 0.95 when structured; employment 1.0 when the source states it; evidence grounding contributes `0.5 + 0.5 × grounded fraction`. The overall score is `0.6 × mean + 0.4 × min` (one weak field drags it down). Levels: HIGH ≥ 0.80, MEDIUM ≥ 0.60, else LOW. These thresholds are hypotheses until checked: the evaluation tool reports exact-match accuracy per level (calibration).

## Prompt versioning

Prompts live in `packages/ai-engine/prompts/` — never inline in business logic:

| File | Version | Covers |
|---|---|---|
| `role-classification.v1.ts` | role.v1 | 18 role categories with boundary rules |
| `experience-classification.v1.ts` | experience.v1 | 6 experience bands, "never guess" |
| `location-extraction.v1.ts` | location.v1 | location type/city/state, work mode, employment |
| `eligibility-detection.v1.ts` | eligibility.v1 | fresher eligibility, verbatim evidence, education, salary |
| `job-summary.v1.ts` | summary.v1 | ≤45-word factual summary, mentioned skills only |
| `job-intelligence.v1.ts` | composite | system prompt, JSON Schema + Zod schema, input builder |

The stored `promptVersion` is the composite string, e.g. `job-intel.v1(role.v1,experience.v1,location.v1,eligibility.v1,summary.v1)`, so every prediction can be traced to the exact instructions. To change a prompt: copy the fragment to `.v2`, import it in a new composite, and keep the old files. Tests assert the version string and that the JSON Schema requires every property (strict mode).

### Input trimming

Descriptions longer than 4,500 characters are reduced to the paragraphs that carry classification signal: blocks under requirement-like headings and blocks mentioning years/degree/freshers are kept first; company boilerplate (benefits, EEO, "about us") is dropped first. Measured average input: ≈2,400 tokens per call.

## Providers and models

| Provider | Default model (env override) | Notes |
|---|---|---|
| Gemini | `gemini-2.5-flash-lite` (`AI_GEMINI_MODEL`); embeddings `gemini-embedding-001` | cheapest per post; key not yet supplied |
| OpenAI | `gpt-5-nano` (`AI_OPENAI_MODEL`); embeddings `text-embedding-3-small` @768 dims | key not yet supplied |
| Groq | `openai/gpt-oss-20b` (`AI_GROQ_MODEL`) | used for all measurements so far; requires `reasoning_effort: low` |

**Operational constraint observed:** Groq's free tier allows 8,000 tokens/minute for gpt-oss-20b and has a daily token cap. At ≈2.9k tokens per call that is ~2 calls/minute and the cap was exhausted after ~87 successful classifications on day one. The pipeline degrades gracefully (rules result + `llmPending`, retried hourly), but classifying the whole index with an LLM in one day needs a paid or higher-quota key (Gemini/OpenAI), configured via `.env`.

Known model weakness recorded: gpt-oss-20b over-uses `OTHER` for HR/recruiting and some sales titles (mitigated by the merge rule above) and sometimes quotes prompt metadata as "evidence" (caught by grounding).
