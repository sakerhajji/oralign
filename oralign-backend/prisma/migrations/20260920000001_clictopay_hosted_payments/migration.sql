-- ClicToPay hosted-payment metadata. Existing ledger rows remain manual
-- installment payments; no historical amount or status is rewritten.

DO $$ BEGIN
  CREATE TYPE "PaymentPurpose" AS ENUM ('installment', 'treatment_fee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentProvider" AS ENUM ('manual', 'mock', 'clictopay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Payment"
  ALTER COLUMN "quotationId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TND',
  ADD COLUMN IF NOT EXISTS "purpose" "PaymentPurpose" NOT NULL DEFAULT 'installment',
  ADD COLUMN IF NOT EXISTS "provider" "PaymentProvider" NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "merchantOrderNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "providerStatus" INTEGER,
  ADD COLUMN IF NOT EXISTS "providerErrorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "providerErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "lastProviderCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_merchantOrderNumber_key"
  ON "Payment"("merchantOrderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerOrderId_key"
  ON "Payment"("providerOrderId");
CREATE INDEX IF NOT EXISTS "Payment_provider_merchantOrderNumber_idx"
  ON "Payment"("provider", "merchantOrderNumber");
CREATE INDEX IF NOT EXISTS "Payment_purpose_orderId_status_idx"
  ON "Payment"("purpose", "orderId", "status");

-- A target can have historical failed/cancelled attempts, but never two
-- unresolved hosted sessions. These partial indexes close the race even
-- when requests hit different application instances.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_clictopay_live_installment_key"
  ON "Payment"("installmentId")
  WHERE "provider" = 'clictopay'
    AND "status" IN ('pending', 'unknown')
    AND "installmentId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_clictopay_live_treatment_fee_key"
  ON "Payment"("orderId")
  WHERE "provider" = 'clictopay'
    AND "purpose" = 'treatment_fee'
    AND "status" IN ('pending', 'unknown');
