-- Second step: the columns and the sweep index. Kept in a separate migration
-- because the `expired` enum value added just before must be committed first.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3);

-- CreateIndex
-- Reconciliation sweep: live attempts of one provider, least-recently checked
-- first. Without it the sweep sequentially scans the whole ledger.
CREATE INDEX "Payment_provider_status_lastProviderCheckAt_idx" ON "Payment"("provider", "status", "lastProviderCheckAt");
