#!/usr/bin/env bash
# Dev helper: one-screen pipeline status straight from Postgres.
q() { docker exec beep-dev-postgres-1 psql -U beep -d beep -tA -F ' | ' -c "$1"; }
echo "== latest run";  q 'select status, "sourcesTotal", "sourcesSucceeded", "sourcesFailed", "jobsFetched", "jobsNew", "jobsClosed", "startedAt", "finishedAt" from "ScrapeRun" order by "createdAt" desc limit 1'
echo "== raw jobs";    q 'select status, count(*) from "RawJob" group by status order by 1'
echo "== jobs";        q 'select count(*) as total, count(*) filter (where status = $$ACTIVE$$) as active, count(*) filter (where "classifiedAt" is not null) as classified, count(*) filter (where "llmPending") as llm_pending, count(*) filter (where "isFresherEligible") as fresher from "Job"'
echo "== classification routes"; q 'select method, "confidenceLevel", count(*) from "JobClassification" where "isCurrent" group by 1,2 order by 1,2'
echo "== ai usage";    q 'select provider, model, count(*), sum(case when success then 1 else 0 end) ok, sum("inputTokens"), sum("outputTokens"), round(sum("costUsd")::numeric, 5) from "AIUsage" group by 1,2'
echo "== duplicates";  q 'select layer, decision, count(*) from "JobDuplicate" group by 1,2'
echo "== recent warn/error logs"; q 'select level, scope, left(message, 160) from "PipelineLog" order by "createdAt" desc limit 8'
