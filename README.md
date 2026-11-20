# BEEP Job Intelligence

**India's Opportunity Intelligence Engine.** A live, auditable index of fresher jobs and internships across India: collected from employers' public job boards, normalised, de-duplicated, classified by rules + LLMs with measured confidence, and served through a fast search experience and an operations console.

- 1,010 real, unique India-located postings from 40 public Greenhouse / Lever / Ashby boards (first run, 2026-11-20) — no generated data.
- Rules-first classification; LLM only where it adds value; every AI claim checked against the source text.
- Daily pipeline on BullMQ with retries, dead-letter queue, heartbeats and per-record tracing.
- Human-evaluation tool, calibration report and measured cost per 1,000 posts.

Docs: [architecture](docs/architecture.md) · [data sources](docs/data-sources.md) · [AI & prompts](docs/ai-prompts.md) · [evaluation](docs/evaluation-report.md) · [cost](docs/cost-analysis.md) · [deployment](docs/deployment.md)

## Stack

React 18 · Vite · TypeScript (strict) · Tailwind v4 · Radix (shadcn-style components) · TanStack Query · React Router · React Hook Form + Zod · Recharts · Zustand (toast store) · CSS keyframe motion (Framer Motion was evaluated and left out: no interaction needed more than CSS) — Node 20 · Express · Prisma · PostgreSQL 16 (pgvector, pg_trgm, generated tsvector) · Redis + BullMQ — Gemini / OpenAI / Groq behind one provider interface — Vitest · Supertest · Playwright.

## Quick start (local)

Prerequisites: Node ≥ 20.11, Docker.

```bash
cp .env.example .env            # fill JWT_SECRET, ADMIN_PASSWORD and at least one AI key
npm install
npm run infra:up                # Postgres (pgvector) on :5442, Redis on :6389
npm run db:deploy               # apply migrations
npm run db:seed                 # 40 verified sources + first admin account
```

Run each process in its own terminal:

```bash
npm run dev:api                 # http://localhost:4100  (OpenAPI: /api/v1/openapi.json)
npm run dev:worker              # consumes all queues
npm run dev:scheduler           # registers cron schedules (06:30 IST daily pipeline)
npm run dev:web                 # http://localhost:5180
npm run pipeline:run            # trigger a collection run now (or Admin → Run collection now)
npm run status                  # one-screen pipeline status from the database
```

Admin console: `/admin` (sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`).

## Tests

```bash
npm test                        # unit: normalisation, scraper adapters, dedup, AI runner, classification, evaluation
npm run test:integration        # API (supertest) + worker pipeline on a real Postgres (beep_test, rebuilt per run)
npm run build -w @beep/web && (cd apps/web && npx vite preview --port 5181) &
npm run test:e2e                # Playwright on the installed Edge against the running stack
npm run typecheck
```

Current results: **134 unit**, **31 integration**, **6 end-to-end** — all passing; `tsc --strict` clean in every workspace.

## Scripts worth knowing

| Command | Purpose |
|---|---|
| `npm run reprocess -- --normalize` | re-apply normalisation to every raw record after a normaliser fix (no refetch, no LLM) |
| `npm run reprocess -- --reclassify-other` | re-classify jobs currently labelled OTHER |
| `npx tsx --env-file=.env scripts/smoke-collect.ts` | fetch every source live without writing (coverage check) |
| `npx tsx --env-file=.env scripts/smoke-llm.ts` | one live structured classification with the configured providers |

## Definition of done — status with evidence

| Item | Status | Evidence |
|---|---|---|
| Frontend runs | ✅ | production build + preview; Playwright suite passes, no console errors |
| Backend runs | ✅ | `/health` ok; 31 integration tests |
| Database migrations work | ✅ | `migrate deploy` from scratch in every integration run; drift check "No difference detected" |
| Real public sources integrated | ✅ | 3 adapters, 40 boards, official APIs, robots.txt honoured |
| Genuine opportunities collected | ✅ | 7,479 fetched → 1,010 India postings |
| 200+ unique records | ✅ | 1,010 unique canonical jobs |
| Duplicate detection works | ✅ | 3 layers, unit + integration tests; 20 same-source re-posts queued for review on live data |
| LLM classification works | ✅ | 87 live LLM-assisted classifications (Groq gpt-oss-20b) |
| Classification results validated | ✅ | Zod + repair, evidence grounding, consistency checks |
| Background jobs execute | ✅ | full live run 40/40 sources SUCCEEDED; retries/DLQ exercised |
| Daily automation deployed & verified | ⚠️ partial | scheduler verified **locally** (4 cron schedules registered, next-run times live); not deployed — see docs/deployment.md |
| Job explorer, search & filters | ✅ | server-side FTS + facets, URL state; e2e tested |
| Admin monitoring | ✅ | overview, pipeline, sources, AI review, duplicates, costs, logs, tracing |
| 50 records manually audited | ❌ pending | tool complete; requires a **human** evaluator (AI labels are not ground truth) |
| Accuracy metrics calculated | ⚠️ pipeline ready | computed automatically once labels exist |
| Cost per 1,000 from real usage | ✅ | $0.12 per 1,000 processed posts ($0.37 per 1,000 LLM-classified), measured tokens × dated prices (Groq prices unverified) |
| Tests pass | ✅ | 134 + 31 + 6 |
| README complete | ✅ | this file + docs/ |
| Deployment verified | ❌ | configuration written (Dockerfile, compose, Render, Vercel); not deployed |

## Known limitations

- Coverage is limited to Greenhouse/Lever/Ashby employers — tech-heavy, Bengaluru-heavy; mass campus recruiters are largely absent.
- The only AI key available during the build was Groq's free tier (8k tokens/min, daily cap): on day one ~87 jobs got an LLM pass; the rest carry a rules-only classification marked "LLM pending" and are re-queued hourly. A Gemini or OpenAI key removes this bottleneck.
- Prices for Groq/Gemini/OpenAI chat models are from third-party trackers (flagged *unverified* in the UI) until confirmed.
- Ashby pages are client-rendered, so link verification cannot detect closures there; closure is detected from the source API instead.
