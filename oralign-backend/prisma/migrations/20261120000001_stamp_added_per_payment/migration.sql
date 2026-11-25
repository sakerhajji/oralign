-- Owner decision 2026-11-20: the droit de timbre is ADDED to every payment
-- (each payment gets its own facture, so a plan in N installments carries
-- N stamps paid by the practitioner). Prices stay TTC with TVA included.
-- The stamp charged is snapshotted on the payment, and on the order for
-- the treatment fee, so settlement can subtract it from the cash.
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "stampAmount" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "treatmentFeeStampAmount" DECIMAL(12,3);
