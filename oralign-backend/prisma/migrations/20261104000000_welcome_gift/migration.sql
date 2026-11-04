-- First-case welcome gift: the treatment fee + the order's CBCT supplement
-- snapshot are waived on each practitioner's FIRST submitted case
-- (WelcomeGiftService, applied inside the submit transaction). The waived
-- amounts are frozen on the order; nothing is written to the treatment-fee
-- payment columns, so revenue, receipts and invoices are untouched.
-- Additive and idempotent: safe under `prisma migrate deploy` on prod and on
-- dev databases that already received the columns.

-- ── DentalOrder: welcome-gift snapshot ──────────────────────────────
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "welcomeGiftAppliedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "welcomeGiftTreatmentFee" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "welcomeGiftCbctFee" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "welcomeGiftCurrency" TEXT;

-- ── CompanyBillingSettings: master switch (on by default) ──────────
ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN IF NOT EXISTS "welcomeGiftEnabled" BOOLEAN NOT NULL DEFAULT true;

-- One gift per doctor, ever. The service already serializes per doctor
-- with an advisory lock and re-checks under it; this partial unique index
-- is the last line of defence when requests hit different instances.
-- SQL-only (like the ClicToPay live-attempt indexes): Prisma cannot
-- declare a partial index, so schema.prisma only mentions it in a comment.
CREATE UNIQUE INDEX IF NOT EXISTS "DentalOrder_welcome_gift_doctor_key"
  ON "DentalOrder"("doctorId")
  WHERE "welcomeGiftAppliedAt" IS NOT NULL;
