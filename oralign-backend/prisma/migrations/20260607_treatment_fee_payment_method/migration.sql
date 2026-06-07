-- Treatment-fee payment method + lifecycle.
-- Reuses the existing PaymentMethod + PaymentRecordStatus enums so
-- admin payment-queue tooling can read both surfaces identically.
-- All three columns are nullable so existing orders default to "no
-- payment method recorded yet" (legacy behaviour preserved).

ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "treatmentFeePaymentMethod" "PaymentMethod",
  ADD COLUMN IF NOT EXISTS "treatmentFeePaymentStatus" "PaymentRecordStatus",
  ADD COLUMN IF NOT EXISTS "treatmentFeeProofPath" TEXT;
