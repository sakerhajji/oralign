-- Treatment-fee gate: track whether the clinical/professional fee has
-- been collected before the admin is allowed to start the treatment
-- plan. Both columns are nullable so existing orders default to
-- "unpaid" and the gate only fires when a tenant has actually
-- configured CompanyBillingSettings.defaultTreatmentFee > 0.

ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "treatmentFeePaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "treatmentFeeAmount" DECIMAL(12, 3);
