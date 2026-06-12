-- Media-optimization pipeline (images / ZIP / STL).
--
-- NOTE: this project applies schema via `prisma db push` on container
-- start; this file exists so fresh environments and reviewers see the
-- exact DDL. It is idempotent-safe to keep alongside db push because
-- push diffs the live schema, not the migrations table.

CREATE TYPE "MediaProcessingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

ALTER TABLE "OrderFile"
  ADD COLUMN "generatedName" TEXT,
  ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "processingStatus" "MediaProcessingStatus",
  ADD COLUMN "variants" JSONB,
  ADD COLUMN "mediaMetadata" JSONB,
  ADD COLUMN "processedAt" TIMESTAMP(3);

CREATE INDEX "OrderFile_processingStatus_idx" ON "OrderFile"("processingStatus");

ALTER TABLE "TreatmentMessageAttachment"
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "processingStatus" "MediaProcessingStatus",
  ADD COLUMN "variants" JSONB,
  ADD COLUMN "mediaMetadata" JSONB;

ALTER TABLE "SupportMessage"
  ADD COLUMN "attachmentVariants" JSONB;

ALTER TABLE "SliderMedia"
  ADD COLUMN "desktopVariants" JSONB,
  ADD COLUMN "mobileVariants" JSONB;
