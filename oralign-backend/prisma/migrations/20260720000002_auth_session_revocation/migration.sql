-- Security audit Phase 2 (M-6 token revocation, M-7 verify-email lockout).
-- Additive, idempotent columns with safe defaults; no data backfill needed.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "failedVerificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
