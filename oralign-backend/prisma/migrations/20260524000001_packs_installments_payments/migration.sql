-- ─────────────────────────────────────────────────────────────────
-- 20260524000001 — Packs · Installments · Step batches · Payments
-- ─────────────────────────────────────────────────────────────────
-- Adds the commercial-pack catalogue, the per-quote payment plan
-- (installments) + delivery plan (step batches), and the unified
-- Payment table that handles all three payment methods (CARD,
-- BANK_TRANSFER, CASH). All new tables; only Quotation gains nullable
-- columns so legacy quotes keep rendering through the Float
-- totalTtc path.
--
-- The whole migration is IF-NOT-EXISTS-guarded so a partial apply on
-- a VPS can be retried without manual cleanup.

-- ─── New enums ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ArchType" AS ENUM ('single_arch', 'two_arches');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMode" AS ENUM ('full_payment', 'installments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "QuotationPaymentStatus" AS ENUM (
    'pending', 'partially_paid', 'paid', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InstallmentStatus" AS ENUM (
    'pending', 'paid', 'overdue', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BatchStatus" AS ENUM ('locked', 'unlocked', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('card', 'bank_transfer', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentRecordStatus" AS ENUM (
    'pending', 'awaiting_confirmation', 'success', 'failed', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Pack catalogue ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Pack" (
  "id"                        TEXT PRIMARY KEY,
  "name"                      TEXT NOT NULL,
  "description"               TEXT,
  "maxStepsPerArch"           INTEGER,
  "includedCorrections"       INTEGER,
  "isUnlimitedSteps"          BOOLEAN NOT NULL DEFAULT false,
  "isUnlimitedCorrections"    BOOLEAN NOT NULL DEFAULT false,
  "isForOrthodontists"        BOOLEAN NOT NULL DEFAULT false,
  "isActive"                  BOOLEAN NOT NULL DEFAULT true,
  "deletedAt"                 TIMESTAMP(3),
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Pack_isActive_deletedAt_idx" ON "Pack"("isActive", "deletedAt");
CREATE INDEX IF NOT EXISTS "Pack_name_idx" ON "Pack"("name");

CREATE TABLE IF NOT EXISTS "PackPrice" (
  "id"        TEXT PRIMARY KEY,
  "packId"    TEXT NOT NULL,
  "archType"  "ArchType" NOT NULL,
  "price"     DECIMAL(12, 3) NOT NULL,
  "currency"  TEXT NOT NULL DEFAULT 'TND',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PackPrice_packId_idx" ON "PackPrice"("packId");
-- Soft-uniqueness: at most one ACTIVE price per (pack, arch). Archived
-- prices (isActive=false) can co-exist with the active one because the
-- composite unique key includes isActive in its column list.
CREATE UNIQUE INDEX IF NOT EXISTS "PackPrice_packId_archType_isActive_key"
  ON "PackPrice"("packId", "archType", "isActive");

DO $$ BEGIN
  ALTER TABLE "PackPrice"
    ADD CONSTRAINT "PackPrice_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "Pack"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Quotation extension (pack snapshot + new Decimal money) ─────
ALTER TABLE "Quotation"
  ADD COLUMN IF NOT EXISTS "packId"                 TEXT,
  ADD COLUMN IF NOT EXISTS "packName"               TEXT,
  ADD COLUMN IF NOT EXISTS "archType"               "ArchType",
  ADD COLUMN IF NOT EXISTS "maxStepsPerArch"        INTEGER,
  ADD COLUMN IF NOT EXISTS "includedCorrections"    INTEGER,
  ADD COLUMN IF NOT EXISTS "isUnlimitedSteps"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isUnlimitedCorrections" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isForOrthodontists"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "totalPrice"             DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "paidAmount"             DECIMAL(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remainingAmount"        DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "paymentMode"            "PaymentMode",
  ADD COLUMN IF NOT EXISTS "paymentStatus"          "QuotationPaymentStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "doctorApprovedAt"       TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Quotation_packId_idx" ON "Quotation"("packId");
CREATE INDEX IF NOT EXISTS "Quotation_paymentStatus_idx" ON "Quotation"("paymentStatus");

DO $$ BEGIN
  ALTER TABLE "Quotation"
    ADD CONSTRAINT "Quotation_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "Pack"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Installments + step batches ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "QuoteInstallment" (
  "id"                TEXT PRIMARY KEY,
  "quotationId"       TEXT NOT NULL,
  "installmentNumber" INTEGER NOT NULL,
  "amount"            DECIMAL(12, 3) NOT NULL,
  "availableFrom"     TIMESTAMP(3) NOT NULL,
  "dueDate"           TIMESTAMP(3),
  "status"            "InstallmentStatus" NOT NULL DEFAULT 'pending',
  "paidAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteInstallment_quotationId_installmentNumber_key"
  ON "QuoteInstallment"("quotationId", "installmentNumber");
CREATE INDEX IF NOT EXISTS "QuoteInstallment_status_idx" ON "QuoteInstallment"("status");

DO $$ BEGIN
  ALTER TABLE "QuoteInstallment"
    ADD CONSTRAINT "QuoteInstallment_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "QuoteStepBatch" (
  "id"             TEXT PRIMARY KEY,
  "quotationId"    TEXT NOT NULL,
  "installmentId"  TEXT NOT NULL UNIQUE,
  "batchNumber"    INTEGER NOT NULL,
  "fromStep"       INTEGER NOT NULL,
  "toStep"         INTEGER NOT NULL,
  "status"         "BatchStatus" NOT NULL DEFAULT 'locked',
  "unlockedAt"     TIMESTAMP(3),
  "deliveredAt"    TIMESTAMP(3),
  "deliveredById"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteStepBatch_quotationId_batchNumber_key"
  ON "QuoteStepBatch"("quotationId", "batchNumber");
CREATE INDEX IF NOT EXISTS "QuoteStepBatch_status_idx" ON "QuoteStepBatch"("status");

DO $$ BEGIN
  ALTER TABLE "QuoteStepBatch"
    ADD CONSTRAINT "QuoteStepBatch_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuoteStepBatch"
    ADD CONSTRAINT "QuoteStepBatch_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "QuoteInstallment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuoteStepBatch"
    ADD CONSTRAINT "QuoteStepBatch_deliveredById_fkey"
    FOREIGN KEY ("deliveredById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Unified Payments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Payment" (
  "id"              TEXT PRIMARY KEY,
  "orderId"         TEXT NOT NULL,
  "quotationId"     TEXT NOT NULL,
  "installmentId"   TEXT NOT NULL,
  "amount"          DECIMAL(12, 3) NOT NULL,
  "status"          "PaymentRecordStatus" NOT NULL,
  "paymentMethod"   "PaymentMethod" NOT NULL,
  "transactionId"   TEXT,
  "idempotencyKey"  TEXT UNIQUE,
  "proofUrl"        TEXT,
  "notes"           TEXT,
  "declaredAt"      TIMESTAMP(3),
  "paidAt"          TIMESTAMP(3),
  "confirmedAt"     TIMESTAMP(3),
  "confirmedById"   TEXT,
  "rejectedAt"      TIMESTAMP(3),
  "rejectedById"    TEXT,
  "rejectionReason" TEXT,
  "initiatedById"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX IF NOT EXISTS "Payment_quotationId_idx" ON "Payment"("quotationId");
CREATE INDEX IF NOT EXISTS "Payment_installmentId_idx" ON "Payment"("installmentId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Payment_paymentMethod_idx" ON "Payment"("paymentMethod");

DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "QuoteInstallment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_rejectedById_fkey"
    FOREIGN KEY ("rejectedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_initiatedById_fkey"
    FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
