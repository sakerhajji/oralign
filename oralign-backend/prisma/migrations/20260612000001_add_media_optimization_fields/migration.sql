-- Media-optimization pipeline (images / ZIP / STL).
--
-- NOTE: this project applies schema via `prisma db push` on container
-- start; this file exists so fresh environments and reviewers see the
-- exact DDL. It is written to be IDEMPOTENT (DO-block enum guard +
-- ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS) so it can be
-- safely re-applied after a partially-applied/failed run — Prisma does
-- not transactionally roll back a failed migration, and
-- `migrate resolve --rolled-back` only updates bookkeeping, not the DB.

DO $$ BEGIN
  CREATE TYPE "MediaProcessingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "OrderFile"
  ADD COLUMN IF NOT EXISTS "generatedName" TEXT,
  ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "width" INTEGER,
  ADD COLUMN IF NOT EXISTS "height" INTEGER,
  ADD COLUMN IF NOT EXISTS "processingStatus" "MediaProcessingStatus",
  ADD COLUMN IF NOT EXISTS "variants" JSONB,
  ADD COLUMN IF NOT EXISTS "mediaMetadata" JSONB,
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OrderFile_processingStatus_idx" ON "OrderFile"("processingStatus");

ALTER TABLE "TreatmentMessageAttachment"
  ADD COLUMN IF NOT EXISTS "width" INTEGER,
  ADD COLUMN IF NOT EXISTS "height" INTEGER,
  ADD COLUMN IF NOT EXISTS "processingStatus" "MediaProcessingStatus",
  ADD COLUMN IF NOT EXISTS "variants" JSONB,
  ADD COLUMN IF NOT EXISTS "mediaMetadata" JSONB;

ALTER TABLE "SupportMessage"
  ADD COLUMN IF NOT EXISTS "attachmentVariants" JSONB;

ALTER TABLE "SliderMedia"
  ADD COLUMN IF NOT EXISTS "desktopVariants" JSONB,
  ADD COLUMN IF NOT EXISTS "mobileVariants" JSONB;
