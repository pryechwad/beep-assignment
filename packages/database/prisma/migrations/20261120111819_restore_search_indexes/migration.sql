-- AlterTable
-- Hand-edited: generated (not writable) column. Declared in schema.prisma as Unsupported("tsvector") so later
-- migrations keep it. Regression: migration 20261120103012 dropped the undeclared column and its indexes.
ALTER TABLE "Job" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("department", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;

-- CreateIndex
CREATE INDEX "Company_name_trgm_idx" ON "Company" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Job_searchVector_idx" ON "Job" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Job_titleKey_trgm_idx" ON "Job" USING GIN ("titleKey" gin_trgm_ops);
