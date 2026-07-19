-- CBCT paid supplement + chunked/resumable upload sessions.
-- Idempotent: safe under `prisma migrate deploy` on prod AND on dev DBs
-- that already received the schema via `db push`.

-- ── CompanyBillingSettings: CBCT supplement configuration ──────────
ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN IF NOT EXISTS "cbctSupplementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cbctSupplementFee" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- ── DentalOrder: per-order CBCT price snapshot ─────────────────────
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "cbctFeeAmount" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "cbctFeeCurrency" TEXT;

-- ── UploadSession (chunked / resumable uploads) ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UploadSessionStatus') THEN
    CREATE TYPE "UploadSessionStatus" AS ENUM ('active', 'assembling', 'completed', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "UploadSession" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "uploaderId"     TEXT NOT NULL,
  "category"       "OrderFileCategory" NOT NULL,
  "originalName"   TEXT NOT NULL,
  "mimeType"       TEXT,
  "totalBytes"     BIGINT NOT NULL,
  "chunkSize"      INTEGER NOT NULL,
  "totalChunks"    INTEGER NOT NULL,
  "receivedChunks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "status"         "UploadSessionStatus" NOT NULL DEFAULT 'active',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UploadSession_orderId_idx" ON "UploadSession"("orderId");
CREATE INDEX IF NOT EXISTS "UploadSession_status_updatedAt_idx" ON "UploadSession"("status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UploadSession_orderId_fkey'
  ) THEN
    ALTER TABLE "UploadSession"
      ADD CONSTRAINT "UploadSession_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
