-- Deletion policy: no cascade may reach clinical or financial history.
--
--   * Patient.doctor, DentalOrder.doctor/patient, TreatmentPlan.order,
--     Quotation.order, Payment.order/quotation:  Cascade -> RESTRICT
--     (a doctor / patient / order that owns history can only be
--     soft-deleted; hard delete is refused by the DB itself).
--   * Actor references (TreatmentPlan.createdBy, TreatmentMessage.sender,
--     TreatmentMessageAttachment.uploadedBy, Quotation.createdBy,
--     SupportMessage.sender): Cascade -> SET NULL, column made nullable,
--     with a *Name snapshot column so the audit trail still reads after
--     an account is removed. Payment.installment: Cascade -> SET NULL
--     (re-planning installments never destroys a payment record).
--
-- Non-destructive: no table or column is dropped; only constraints are
-- swapped, five columns become nullable and four nullable snapshot
-- columns are added + backfilled from "User". Safe on production data.

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "DentalOrder" DROP CONSTRAINT "DentalOrder_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "DentalOrder" DROP CONSTRAINT "DentalOrder_patientId_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT "TreatmentPlan_orderId_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT "TreatmentPlan_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentMessage" DROP CONSTRAINT "TreatmentMessage_senderId_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentMessageAttachment" DROP CONSTRAINT "TreatmentMessageAttachment_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_installmentId_fkey";

-- DropForeignKey
ALTER TABLE "SupportMessage" DROP CONSTRAINT "SupportMessage_senderId_fkey";

-- AlterTable
ALTER TABLE "TreatmentPlan" ADD COLUMN     "createdByName" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TreatmentMessage" ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderRole" "UserRole",
ALTER COLUMN "senderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TreatmentMessageAttachment" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "createdByName" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "installmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "senderName" TEXT,
ALTER COLUMN "senderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalOrder" ADD CONSTRAINT "DentalOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalOrder" ADD CONSTRAINT "DentalOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentMessage" ADD CONSTRAINT "TreatmentMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentMessageAttachment" ADD CONSTRAINT "TreatmentMessageAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "QuoteInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill actor-name snapshots from the still-existing User rows so
-- history written before this migration is not blank.
UPDATE "TreatmentPlan" tp SET "createdByName" = u."fullName"
  FROM "User" u WHERE u.id = tp."createdById" AND tp."createdByName" IS NULL;

UPDATE "TreatmentMessage" tm SET "senderName" = u."fullName", "senderRole" = u."role"
  FROM "User" u WHERE u.id = tm."senderId" AND tm."senderName" IS NULL;

UPDATE "Quotation" q SET "createdByName" = u."fullName"
  FROM "User" u WHERE u.id = q."createdById" AND q."createdByName" IS NULL;

UPDATE "SupportMessage" sm SET "senderName" = u."fullName"
  FROM "User" u WHERE u.id = sm."senderId" AND sm."senderName" IS NULL;
