-- Link an automatically generated invoice back to its payment.
--
-- Additive only: one nullable column + a UNIQUE index + one FK.
-- The UNIQUE is the idempotency guarantee: a replayed gateway
-- callback or a retried listener cannot mint a second invoice for
-- the same payment. SetNull so an invoice outlives its payment.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

