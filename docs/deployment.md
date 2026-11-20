# Deployment

> **Status (2026-11-21):** deployed on a VPS at https://beep.62-72-56-109.sslip.io using `infrastructure/deployment/vps/docker-compose.yml` (Postgres, Redis, API, worker, scheduler, nginx) behind the host’s existing Caddy for HTTPS. The scheduler registered the daily 06:30 IST pipeline; health, admin sign-in and all public pages were verified end to end against the live URL.

## Topology

| Component | Recommended host | Artifact |
|---|---|---|
| Web (SPA) | Vercel | `apps/web` (static build), `apps/web/vercel.json` rewrites `/api/*` to the API so the session cookie stays first-party |
| API | Render web service / Railway / VPS | `infrastructure/docker/Dockerfile` (default command) |
| Worker | Render background worker / VPS | same image, `node apps/worker/dist/worker.js` |
| Scheduler | Render background worker / VPS | same image, `node apps/worker/dist/scheduler.js` — run exactly one (duplicates are harmless: schedulers are idempotent upserts) |
| PostgreSQL 16 + pgvector + pg_trgm | Render Postgres, Neon, Supabase Postgres, RDS | migrations: `prisma migrate deploy` |
| Redis 7 (`maxmemory-policy noeviction`) | Render Key Value, Upstash, Redis Cloud | BullMQ |

Blueprints: `infrastructure/deployment/render.yaml` (API + worker + scheduler + Postgres + Key Value) and `infrastructure/docker/docker-compose.prod.yml` (single VPS: Postgres, Redis, one-shot `migrate`, api, worker, scheduler).

## Environment variables

Validated at start-up by `packages/shared/src/env.ts` (the process exits with a list of problems if anything is missing or malformed). See `.env.example` for every variable.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | all | append `?connection_limit=10&connect_timeout=20&pool_timeout=20` |
| `REDIS_URL` | all | |
| `JWT_SECRET` | api | ≥32 random chars |
| `WEB_ORIGIN` | api | comma-separated allowed origins (CORS) |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` | worker | server-side only — **never** prefix with `VITE_` |
| `AI_PROVIDER_ORDER`, `AI_EMBEDDING_PROVIDER` | worker | |
| `AI_CLASSIFY_PER_MINUTE`, `AI_MAX_LLM_CLASSIFICATIONS_PER_DAY` | worker | pacing and daily cost cap |
| `PIPELINE_CRON`, `PIPELINE_TZ`, `LINK_VERIFY_CRON`, `RECLASSIFY_CRON`, `ANALYTICS_CRON` | scheduler | defaults: 06:30 IST daily pipeline |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed | creates the first admin if absent |

The only browser-visible variable is the optional `VITE_API_BASE` (defaults to `/api/v1`).

## Release procedure

1. Build the backend image: `docker build -f infrastructure/docker/Dockerfile -t beep-backend .`
2. Apply migrations (Render `preDeployCommand`, or the compose `migrate` service): `node node_modules/prisma/build/index.js migrate deploy --schema packages/database/prisma/schema.prisma`
3. First deploy only: seed sources and the admin — `npm run db:seed` with production env.
4. Start/roll api → worker → scheduler. Workers drain gracefully on SIGTERM (30 s).
5. Deploy the web app to Vercel with `apps/web` as the root directory; replace `REPLACE-WITH-API-HOST` in `vercel.json`.
6. Verify: `GET /health` returns `{"status":"ok","workers":≥1,"scheduler":true}`; admin → Pipeline shows the next scheduled run; trigger one manual run and confirm it finishes `SUCCEEDED`.

## Verifying daily automation in production

The scheduler publishes each schedule's next run time in its heartbeat (Admin → Overview → Processes). After the first 06:30 IST window, Admin → Pipeline must show a `scheduled` run with per-source results; `DailyMetric` gains a row each day at 23:55 IST (which is what enables day-over-day KPI comparisons on the dashboard).
