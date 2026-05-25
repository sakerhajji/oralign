-- ────────────────────────────────────────────────────────────────
-- Composite indexes for the payment-history filter UI.
--
-- The Payment table already has single-column indexes on status,
-- createdAt, orderId, and idempotencyKey. The new filter surface
-- combines these in ways that single-column indexes can't cover
-- with one scan:
--
--   • Admin queue narrowing + sort:  WHERE status IN (...) ORDER BY createdAt DESC
--   • Method-filtered queries:       WHERE paymentMethod = X AND status = Y
--   • Date-range narrowing on a doctor's history:
--       WHERE orderId IN (...) AND createdAt BETWEEN ...
--
-- IF NOT EXISTS keeps re-runs safe across environments.
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx"
  ON "Payment" ("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Payment_paymentMethod_status_idx"
  ON "Payment" ("paymentMethod", "status");

CREATE INDEX IF NOT EXISTS "Payment_orderId_createdAt_idx"
  ON "Payment" ("orderId", "createdAt" DESC);
