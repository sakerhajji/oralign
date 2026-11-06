-- CreateIndex
CREATE INDEX "DentalOrder_treatmentFeePaymentStatus_treatmentFeePaidAt_idx" ON "DentalOrder"("treatmentFeePaymentStatus", "treatmentFeePaidAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
