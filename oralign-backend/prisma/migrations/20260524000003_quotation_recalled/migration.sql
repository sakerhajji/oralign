-- ────────────────────────────────────────────────────────────────
-- Add `quotation_recalled` to NotificationType.
--
-- Used when an admin pulls a sent quote back to draft for
-- correction. Distinct from `quotation_canceled` so the doctor's
-- bell list can render a "revision incoming" tone instead of
-- "this quote is gone."
--
-- Idempotent: ALTER TYPE … ADD VALUE IF NOT EXISTS is supported
-- on Postgres 12+, which matches the rest of the app's migration
-- baseline.
-- ────────────────────────────────────────────────────────────────

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'quotation_recalled';
