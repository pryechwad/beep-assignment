/*
  Warnings:

  - You are about to drop the column `searchVector` on the `Job` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Company_name_trgm_idx";

-- DropIndex
DROP INDEX "Job_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Job_searchVector_idx";

-- DropIndex
DROP INDEX "Job_titleKey_trgm_idx";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "searchVector",
ADD COLUMN     "llmPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Job_llmPending_idx" ON "Job"("llmPending");
