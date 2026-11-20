# Architecture

BEEP Job Intelligence is a TypeScript monorepo (npm workspaces) with three deployable processes: an HTTP API, a queue worker and a scheduler. A React SPA consumes the API. PostgreSQL holds all durable state and Redis carries the BullMQ queues.

```
                 ┌──────────── scheduler (cron, IST) ────────────┐
                 │  daily-pipeline · reclassify-pending ·          │
                 │  link-verify · daily-analytics                  │
                 └──────────────┬─────────────────────────────────┘
                                ▼ Redis / BullMQ
 pipeline ─▶ discovery (×4, 1 job per source) ─▶ normalize (×1) ─▶ classify (×1, LLM-paced)
                │                                   │                 │
   Greenhouse / Lever / Ashby                 dedup layers 1–3     rules → LLM → validate
   public posting APIs                        (+ embeddings)       → evidence check → confidence
                ▼                                   ▼                 ▼
            RawJob (verbatim)  ───────────────▶  Job (canonical)  ─▶ JobClassification (versioned)
                                                                      └▶ AIUsage (tokens, cost)
 failed after retries ─▶ dead-letter queue (admin re-queue)

 Browser ─▶ Vercel (static SPA) ─ /api/* rewrite ─▶ API (Express) ─▶ Postgres / Redis
```

## Repository layout

| Path | Responsibility |
|---|---|
| `apps/api` | Express REST API (`/api/v1`), JWT admin auth (httpOnly cookie), OpenAPI document, response cache for aggregates |
| `apps/worker` | `worker.ts` consumes every queue; `scheduler.ts` registers cron job schedulers. Pipeline services in `src/services/*` are plain functions over Prisma and are integration-tested |
| `apps/web` | React 18 + Vite SPA: public explorer and analytics, admin console |
| `packages/shared` | Taxonomy enums, API DTO types, `RawJob` adapter contract; Node-only `logger` and `env` subpaths |
| `packages/database` | Prisma schema + migrations, client singleton, pgvector helpers, verified source registry, seed |
| `packages/scraper-engine` | `JobSourceAdapter` implementations, HTTP client with rate limiting/backoff, robots.txt evaluation |
| `packages/normalization` | Pure normalisation: locations, titles, companies, employment, work mode, URLs, dates, skills, experience signals |
| `packages/deduplication` | Three-layer duplicate detection (pure, no I/O) |
| `packages/ai-engine` | Provider abstraction (Gemini, OpenAI, Groq), structured-output runner, dated price table, versioned prompts |
| `packages/classification` | Rule classifier, LLM routing, rule/LLM merge, evidence grounding, confidence |
| `packages/evaluation` | Accuracy metrics, calibration, stratified sampling, CSV |
| `packages/queues` | Queue names, payload types, retry policy, heartbeats (shared by API and worker) |

Dependencies point inwards only (`apps → packages`, `classification → ai-engine/normalization → shared`); no package imports an app and there are no cycles.

## Key decisions

- **Raw vs canonical separation.** `RawJob` stores what the source said, untouched (plus the full payload as JSON for audit). `Job` holds normalised facts. A job page shows both ("Source facts" vs "AI interpretation").
- **Rules first, LLM second.** Deterministic rules classify every job. The LLM is called only when the job could be early-career or the rules are unsure; senior roles with a clear discipline never cost a token. See `ai-prompts.md`.
- **Confidence is derived, not self-reported.** It combines rule/LLM agreement, evidence grounding and validation repairs, and is checked empirically against human labels (`evaluation-report.md`).
- **Classification history is append-only.** Every (re)classification or human override creates a new `JobClassification` version; only one is `isCurrent`. Denormalised columns on `Job` (role, experience, eligibility) exist purely for fast filtering.
- **Idempotency.** Raw records are unique per `(sourceId, externalId)`; a content hash decides whether re-normalisation is needed; BullMQ job ids are deterministic per run/record; run finalisation is a conditional update.
- **Concurrency.** Discovery runs 4 sources in parallel (each source is rate-limited independently). Normalisation runs with concurrency 1 so dedup candidate lookup + insert cannot race. LLM calls are paced by a Redis-backed slot shared by all worker processes.
- **Full-text search** uses a generated, weighted `tsvector` column with a GIN index (title A, department B, description C) and `websearch_to_tsquery`; trigram indexes back fuzzy dedup and company search. These objects are declared in `schema.prisma` (as `Unsupported` + `dbgenerated`) so Prisma migrations never drop them — a regression test asserts they exist.
- **Semantic dedup** uses pgvector embeddings, computed only for ambiguous same-company pairs (fuzzy title match without a definitive match). At this scale an exact per-company scan is faster than an ANN index, so no HNSW index is kept.

## Observability

- Structured JSON logs (pino) from every process, each pipeline record carrying a `correlationId` from discovery onwards; warnings/errors are also persisted to `PipelineLog`.
- `GET /api/v1/admin/trace/:correlationId` returns the raw record, canonical job, every classification version, AI usage and logs for one record.
- Worker and scheduler publish Redis heartbeats (45 s TTL); `/health` and the admin overview report them alongside queue depths, dead letters, source health and LLM success rate.

## Failure handling

| Failure | Behaviour |
|---|---|
| Source 429/5xx/network | exponential backoff + `Retry-After`; discovery job retried 3× (15 s base); then task FAILED, source marked unhealthy, run PARTIAL |
| robots.txt disallow | adapter refuses to fetch; recorded as a source failure |
| Truncated pagination | ingest runs with `complete=false`: nothing is closed |
| LLM transient error / per-minute limit | retried with backoff, honouring "try again in Xs" hints |
| LLM daily quota / auth | provider disabled for the day; job stored with a rules result and `llmPending=true`, re-queued hourly by `reclassify-pending` |
| Invalid LLM JSON | one repair attempt with the validation errors; otherwise rules fallback (`validationStatus=INVALID`) |
| Exhausted retries (any queue) | job copied to `dead-letter` with reason; admin can re-queue |
| Process shutdown | SIGTERM: workers finish active jobs (30 s grace), then close queues, Prisma and Redis |
