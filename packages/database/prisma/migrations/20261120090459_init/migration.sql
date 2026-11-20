-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SourceAdapterType" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY');

-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('FRONTEND', 'BACKEND', 'FULL_STACK', 'SOFTWARE_ENGINEERING', 'AI_ML', 'DATA_ENGINEERING', 'DATA_SCIENCE', 'ANALYTICS', 'DEVOPS', 'CLOUD', 'CYBERSECURITY', 'PRODUCT', 'DESIGN', 'MARKETING', 'SALES', 'FINANCE', 'OPERATIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('INTERNSHIP', 'FRESHER', 'ZERO_TO_ONE', 'ONE_TO_TWO', 'EXPERIENCED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'PART_TIME', 'CONTRACT', 'FREELANCE');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('CITY', 'STATE', 'REMOTE', 'MULTIPLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RawJobStatus" AS ENUM ('PENDING', 'NORMALIZED', 'MERGED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ClassificationMethod" AS ENUM ('RULES', 'LLM', 'HYBRID', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('VALID', 'REPAIRED', 'INVALID');

-- CreateEnum
CREATE TYPE "DuplicateLayer" AS ENUM ('SOURCE_ID', 'CANONICAL_URL', 'NORMALIZED_KEY', 'FUZZY', 'SEMANTIC');

-- CreateEnum
CREATE TYPE "DuplicateDecision" AS ENUM ('MERGED', 'DISTINCT', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('AUTO', 'PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIOperation" AS ENUM ('CLASSIFY', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('LIVE', 'CLOSED', 'REDIRECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'EVALUATOR');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "EvaluationErrorCategory" AS ENUM ('WRONG_ROLE', 'WRONG_CITY', 'MISSING_INFORMATION', 'INCORRECT_EXPERIENCE', 'INCORRECT_ELIGIBILITY', 'HALLUCINATED_EXTRACTION');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "adapterType" "SourceAdapterType" NOT NULL,
    "name" TEXT NOT NULL,
    "boardToken" TEXT NOT NULL,
    "companyId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 30,
    "indiaOnly" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastHealthCheckAt" TIMESTAMP(3),
    "healthy" BOOLEAN,
    "lastRecordCount" INTEGER NOT NULL DEFAULT 0,
    "totalDiscovered" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "sourcesTotal" INTEGER NOT NULL DEFAULT 0,
    "sourcesSucceeded" INTEGER NOT NULL DEFAULT 0,
    "sourcesFailed" INTEGER NOT NULL DEFAULT 0,
    "jobsFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "jobsClosed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsFiltered" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "jobsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "jobsClosed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "locations" TEXT[],
    "workplaceType" TEXT,
    "employmentType" TEXT,
    "department" TEXT,
    "descriptionHtml" TEXT,
    "descriptionText" TEXT NOT NULL,
    "postingUrl" TEXT NOT NULL,
    "applyUrl" TEXT,
    "publishedAt" TEXT,
    "compensationText" TEXT,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "RawJobStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "correlationId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "jobId" TEXT,

    CONSTRAINT "RawJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionHtml" TEXT,
    "locationType" "LocationType" NOT NULL DEFAULT 'UNKNOWN',
    "primaryCity" TEXT,
    "primaryState" TEXT,
    "workMode" "WorkMode",
    "employmentType" "EmploymentType",
    "salaryText" TEXT,
    "department" TEXT,
    "postingUrl" TEXT NOT NULL,
    "applyUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastVerifiedAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,
    "roleCategory" "RoleCategory",
    "experienceLevel" "ExperienceLevel",
    "isFresherEligible" BOOLEAN,
    "confidenceLevel" "ConfidenceLevel",
    "classifiedAt" TIMESTAMP(3),
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLocation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("jobId","skillId")
);

-- CreateTable
CREATE TABLE "JobClassification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "method" "ClassificationMethod" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "roleCategory" "RoleCategory" NOT NULL,
    "experienceLevel" "ExperienceLevel" NOT NULL,
    "employmentType" "EmploymentType",
    "workMode" "WorkMode",
    "locationType" "LocationType" NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "isFresherEligible" BOOLEAN NOT NULL,
    "eligibilityReasoning" TEXT NOT NULL,
    "eligibilityEvidence" TEXT[],
    "educationRequirement" TEXT,
    "salaryText" TEXT,
    "summary" TEXT,
    "skills" TEXT[],
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "confidenceFactors" JSONB NOT NULL,
    "validationStatus" "ValidationStatus" NOT NULL,
    "validationErrors" TEXT[],
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "processingMs" INTEGER,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "operation" "AIOperation" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "jobId" TEXT,
    "classificationId" TEXT,
    "correlationId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "tokensMeasured" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "costUsd" DECIMAL(12,8) NOT NULL,
    "pricingVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDuplicate" (
    "id" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "rawJobId" TEXT NOT NULL,
    "candidateJobId" TEXT,
    "layer" "DuplicateLayer" NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "decision" "DuplicateDecision" NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'AUTO',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobVerification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "httpStatus" INTEGER,
    "finalUrl" TEXT,
    "latencyMs" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationAudit" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "trueRole" "RoleCategory" NOT NULL,
    "trueCity" TEXT,
    "trueExperience" "ExperienceLevel" NOT NULL,
    "trueEmployment" "EmploymentType",
    "trueFresherEligible" BOOLEAN NOT NULL,
    "roleCorrect" BOOLEAN NOT NULL,
    "cityCorrect" BOOLEAN NOT NULL,
    "experienceCorrect" BOOLEAN NOT NULL,
    "employmentCorrect" BOOLEAN NOT NULL,
    "eligibilityCorrect" BOOLEAN NOT NULL,
    "errorCategories" "EvaluationErrorCategory"[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassificationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "correlationId" TEXT,
    "runId" TEXT,
    "sourceId" TEXT,
    "jobId" TEXT,
    "rawJobId" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "date" DATE NOT NULL,
    "activeJobs" INTEGER NOT NULL,
    "fresherEligible" INTEGER NOT NULL,
    "internships" INTEGER NOT NULL,
    "companies" INTEGER NOT NULL,
    "cities" INTEGER NOT NULL,
    "addedToday" INTEGER NOT NULL,
    "closedToday" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_adapterType_boardToken_key" ON "JobSource"("adapterType", "boardToken");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeRun_correlationId_key" ON "ScrapeRun"("correlationId");

-- CreateIndex
CREATE INDEX "ScrapeRun_createdAt_idx" ON "ScrapeRun"("createdAt");

-- CreateIndex
CREATE INDEX "ScrapeTask_sourceId_startedAt_idx" ON "ScrapeTask"("sourceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeTask_runId_sourceId_key" ON "ScrapeTask"("runId", "sourceId");

-- CreateIndex
CREATE INDEX "RawJob_jobId_idx" ON "RawJob"("jobId");

-- CreateIndex
CREATE INDEX "RawJob_status_idx" ON "RawJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RawJob_sourceId_externalId_key" ON "RawJob"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalUrl_key" ON "Job"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Job_status_firstSeenAt_idx" ON "Job"("status", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_idx" ON "Job"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_dedupKey_idx" ON "Job"("dedupKey");

-- CreateIndex
CREATE INDEX "Job_roleCategory_idx" ON "Job"("roleCategory");

-- CreateIndex
CREATE INDEX "Job_experienceLevel_idx" ON "Job"("experienceLevel");

-- CreateIndex
CREATE INDEX "Job_employmentType_idx" ON "Job"("employmentType");

-- CreateIndex
CREATE INDEX "Job_primaryCity_idx" ON "Job"("primaryCity");

-- CreateIndex
CREATE INDEX "Job_isFresherEligible_idx" ON "Job"("isFresherEligible");

-- CreateIndex
CREATE INDEX "JobLocation_city_idx" ON "JobLocation"("city");

-- CreateIndex
CREATE INDEX "JobLocation_state_idx" ON "JobLocation"("state");

-- CreateIndex
CREATE UNIQUE INDEX "JobLocation_jobId_raw_key" ON "JobLocation"("jobId", "raw");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_key_key" ON "Skill"("key");

-- CreateIndex
CREATE INDEX "JobSkill_skillId_idx" ON "JobSkill"("skillId");

-- CreateIndex
CREATE INDEX "JobClassification_jobId_isCurrent_idx" ON "JobClassification"("jobId", "isCurrent");

-- CreateIndex
CREATE INDEX "JobClassification_needsReview_isCurrent_idx" ON "JobClassification"("needsReview", "isCurrent");

-- CreateIndex
CREATE INDEX "JobClassification_createdAt_idx" ON "JobClassification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobClassification_jobId_version_key" ON "JobClassification"("jobId", "version");

-- CreateIndex
CREATE INDEX "AIUsage_createdAt_idx" ON "AIUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_provider_model_idx" ON "AIUsage"("provider", "model");

-- CreateIndex
CREATE INDEX "AIUsage_jobId_idx" ON "AIUsage"("jobId");

-- CreateIndex
CREATE INDEX "JobDuplicate_decision_reviewStatus_idx" ON "JobDuplicate"("decision", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "JobDuplicate_canonicalJobId_rawJobId_key" ON "JobDuplicate"("canonicalJobId", "rawJobId");

-- CreateIndex
CREATE INDEX "JobVerification_jobId_checkedAt_idx" ON "JobVerification"("jobId", "checkedAt");

-- CreateIndex
CREATE INDEX "ClassificationAudit_jobId_idx" ON "ClassificationAudit"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationAudit_classificationId_evaluatorId_key" ON "ClassificationAudit"("classificationId", "evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "PipelineLog_createdAt_idx" ON "PipelineLog"("createdAt");

-- CreateIndex
CREATE INDEX "PipelineLog_level_createdAt_idx" ON "PipelineLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineLog_correlationId_idx" ON "PipelineLog"("correlationId");

-- AddForeignKey
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeTask" ADD CONSTRAINT "ScrapeTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeTask" ADD CONSTRAINT "ScrapeTask_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawJob" ADD CONSTRAINT "RawJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawJob" ADD CONSTRAINT "RawJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLocation" ADD CONSTRAINT "JobLocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "JobClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDuplicate" ADD CONSTRAINT "JobDuplicate_canonicalJobId_fkey" FOREIGN KEY ("canonicalJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDuplicate" ADD CONSTRAINT "JobDuplicate_rawJobId_fkey" FOREIGN KEY ("rawJobId") REFERENCES "RawJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDuplicate" ADD CONSTRAINT "JobDuplicate_candidateJobId_fkey" FOREIGN KEY ("candidateJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDuplicate" ADD CONSTRAINT "JobDuplicate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobVerification" ADD CONSTRAINT "JobVerification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationAudit" ADD CONSTRAINT "ClassificationAudit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationAudit" ADD CONSTRAINT "ClassificationAudit_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "JobClassification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationAudit" ADD CONSTRAINT "ClassificationAudit_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Hand-written additions (not expressible in Prisma schema) ─────────────

-- Server-side full-text search over title (A), company/department (B) and description (C).
ALTER TABLE "Job" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("department", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;
CREATE INDEX "Job_searchVector_idx" ON "Job" USING GIN ("searchVector");

-- Trigram indexes: fuzzy duplicate candidates and substring company/title search.
CREATE INDEX "Job_titleKey_trgm_idx" ON "Job" USING GIN ("titleKey" gin_trgm_ops);
CREATE INDEX "Company_name_trgm_idx" ON "Company" USING GIN ("name" gin_trgm_ops);

-- Approximate nearest-neighbour index for semantic duplicate detection.
CREATE INDEX "Job_embedding_hnsw_idx" ON "Job" USING hnsw ("embedding" vector_cosine_ops);
