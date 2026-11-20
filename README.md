# beep.jobs — Job Intelligence

**India's Opportunity Intelligence Engine.** A web tool that collects real fresher jobs and internships across India from employers' public job boards, removes duplicates, tags every post with a role and city using an LLM, and serves them on a searchable portal that refreshes itself every day.

## Live demo

| | Link |
|---|---|
| Web app | _add after deployment (Vercel)_ |
| API health | _add after deployment_ — `/health` |
| Public API reference | _add after deployment_ — `/api/v1/openapi.json` |

Running locally: web `http://localhost:5181` (production build) or `:5180` (dev), API `http://localhost:4100`.

## What it does

| Assignment requirement | How it is met |
|---|---|
| 200+ real fresher / internship posts in India from public sources | **1,010** unique India postings from **40** employer boards via the official public APIs of Greenhouse, Lever and Ashby. robots.txt and rate limits respected; nothing generated or padded. |
| Removes duplicates | Three layers: same source id / canonical URL → same company + title + city → fuzzy (and optional semantic) similarity. Copies on the same board are never auto-merged; near-identical ones go to human review. |
| LLM tags each post by role and city | Every post is sent to an LLM (early-career posts first) with a versioned prompt and strict JSON output. City comes from the structured source location; the LLM may only fill it if the city literally appears in the post. Every quote the model returns is checked against the original text. |
| Searchable page | Server-side full-text search (Postgres `tsvector`) plus filters for role, city, state, experience, employment type, work mode, source, fresher-only, internships and date posted. Filters live in the URL. |
| Refreshes every day on its own | A dedicated scheduler process runs the full pipeline at **06:30 IST** daily, re-checks links every 6 hours, and re-tags pending posts hourly. No one presses a button. |
| Accuracy on 50 hand-checked posts | Built-in evaluation tool (Admin → Evaluation): stratified sample of 50, blank labelling form (no anchoring on the AI's answer), per-field accuracy, calibration by confidence, CSV export. See `docs/evaluation-report.md`. |
| Cost per 1,000 posts | Every LLM call logs measured tokens and cost. Measured ≈ **$0.33 (≈₹28) per 1,000 posts** at list price; actual spend ₹0 on Groq's free tier. See `docs/cost-analysis.md`. |

## Pages

**Public portal**
- **Home** — search, explore by field, "How it works" with live numbers at each pipeline step, live AI-tagging feed, fresher picks, companies hiring.
- **Jobs** — the searchable explorer; **Job detail** separates what the source said from what the AI inferred and links to the employer's original posting.
- **Companies**, **Insights** (KPIs and charts), **Analytics**, **About** (methodology and data limits).
- The navbar shows a **Live** indicator: the site polls `/api/v1/live/activity` every 5–10 seconds (visible in the browser's Network tab) and shows the last sync, next automatic run and AI-tagging progress.

**Admin console** (`/admin`) — pipeline runs and queues, dead-letter retry, source enable/disable, low-confidence review and duplicate review, human evaluation, AI cost analytics, logs and per-record tracing.

## Architecture

```
scheduler (cron, IST) ──▶ Redis / BullMQ queues ──▶ worker
                               pipeline → discovery (per source) → normalize + dedup → classify (LLM)
public job-board APIs ──▶ RawJob (verbatim) ──▶ Job (canonical) ──▶ JobClassification (versioned) + AIUsage (tokens, cost)
browser ──▶ React SPA ──▶ /api/v1 (Express) ──▶ PostgreSQL (pgvector, pg_trgm, full-text) + Redis
```

Monorepo (npm workspaces): `apps/web` (React 18, Vite, Tailwind, Radix, TanStack Query), `apps/api` (Express, JWT admin auth, OpenAPI), `apps/worker` (BullMQ worker + separate scheduler), and `packages/*` — `scraper-engine`, `normalization`, `deduplication`, `ai-engine` (Gemini / OpenAI / Groq behind one interface, versioned prompts in `prompts/`), `classification`, `evaluation`, `database` (Prisma), `queues`, `shared`. Details: [docs/architecture.md](docs/architecture.md).

## What broke and how it was fixed

| Problem found on real data | Fix |
|---|---|
| "Lafayette, IN" (Indiana) and "Nashville, TN" counted as Indian jobs | Two-letter codes only trusted next to "India"; regression tests |
| Small cities ("Aligarh, Uttar Pradesh") lost | Explicit "City, State" extraction |
| Intern roles shown as Full-time (job-board default) | An explicit "Intern" title outranks a generic Full-time |
| LLM tagged clear roles ("Associate Recruiter") as Other | An LLM "Other" can't override a strong title match |
| LLM quoted prompt text as evidence | Every quote is verified against the post; unverified ones removed |
| Groq free tier: 8k tokens/min and a daily cap | Per-call pacing shared by all workers, quota detection, fallback to a second Groq model, hourly re-queue of pending posts |
| A Prisma migration silently dropped the full-text search column | Column declared in the schema; a test asserts it exists |
| BullMQ rejected job ids containing `:` | Id format changed; covered by the live pipeline run |
| API returned 500s under load (Docker on 8 GB RAM) | 30 s server cache for aggregates, single-query daily stats, pool timeouts |

## Run locally

Prerequisites: Node ≥ 20.11, Docker.

```bash
cp .env.example .env            # set JWT_SECRET, ADMIN_PASSWORD and at least one AI key (GROQ / GEMINI / OPENAI)
npm install
npm run infra:up                # Postgres (pgvector) :5442, Redis :6389
npm run db:deploy               # migrations
npm run db:seed                 # 40 verified sources + first admin account

npm run dev:api                 # http://localhost:4100
npm run dev:worker
npm run dev:scheduler
npm run dev:web                 # http://localhost:5180
npm run pipeline:run            # collect now (otherwise it runs at 06:30 IST)
```

## Deploy

| Part | Where | How |
|---|---|---|
| Web | Vercel | root `apps/web`; set the API host in `apps/web/vercel.json` (`/api/*` rewrite) |
| API, worker, scheduler | Render / Railway / VPS | one Docker image (`infrastructure/docker/Dockerfile`), three start commands; Render blueprint in `infrastructure/deployment/render.yaml` |
| Database / Redis | Managed Postgres 16 (pgvector) + Redis 7 | `npm run db:deploy`, then `npm run db:seed` once |

Single-server alternative: `docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env.production up -d --build`. Full steps and environment variables: [docs/deployment.md](docs/deployment.md).

## Tests

```bash
npm test                        # 135 unit tests
npm run test:integration        # 31 API + pipeline tests on a real Postgres
npm run test:e2e                # 7 Playwright tests (Edge) against the running app
npm run typecheck               # TypeScript strict, all workspaces
```

## Docs

[Architecture](docs/architecture.md) · [Data sources](docs/data-sources.md) · [AI & prompts](docs/ai-prompts.md) · [Evaluation](docs/evaluation-report.md) · [Cost](docs/cost-analysis.md) · [Deployment](docs/deployment.md)

## Known limitations

- Coverage is limited to companies on Greenhouse, Lever and Ashby, so it leans toward tech companies and Bengaluru; mass campus recruiters are mostly absent.
- On Groq's free tier about 110 posts are AI-tagged per hour; a Gemini or OpenAI key removes that limit.
- Chat-model prices are from third-party trackers until confirmed on the providers' pages (flagged in the Costs page).
