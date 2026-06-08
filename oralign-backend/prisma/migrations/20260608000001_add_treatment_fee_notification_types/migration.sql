-- Three new NotificationType values for the treatment-fee lifecycle:
--   • treatment_fee_declared  → admin: doctor uploaded a bank-transfer receipt
--   • treatment_fee_paid      → admin: doctor settled the fee instantly (card / admin cash)
--   • treatment_fee_confirmed → doctor: admin verified the bank transfer
--
-- ALTER TYPE … ADD VALUE is the safe Postgres enum extension — existing
-- rows stay untouched and the catalog grows by three labels.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'treatment_fee_declared';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'treatment_fee_paid';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'treatment_fee_confirmed';
