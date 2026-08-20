-- Manual / admin invoicing: Invoice + InvoiceLine + InvoiceAuditLog.
--
-- Purely ADDITIVE: one enum, three new tables, their indexes and FKs.
-- No column is dropped, no existing row is touched, and the two original
-- invoice flows (Payment receipt, treatment-fee invoice) are untouched.
--
-- Referential actions follow DELETION-POLICY.md: an invoice is a financial
-- document, so order/patient are Restrict (a parent carrying an invoice can
-- be archived but never purged) and the actor refs are SetNull with a name
-- snapshot. Only InvoiceLine/InvoiceAuditLog cascade, from their own invoice.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "orderId" TEXT,
    "patientId" TEXT,
    "doctorId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "clientCity" TEXT,
    "clientCountry" TEXT,
    "clientTaxId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "tvaRate" DOUBLE PRECISION NOT NULL DEFAULT 19,
    "discountAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "subTotalHt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "tvaAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "totalTtc" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "companySnapshot" JSONB,
    "createdById" TEXT,
    "createdByName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "tvaRate" DOUBLE PRECISION,
    "lineHt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_deletedAt_issueDate_idx" ON "Invoice"("status", "deletedAt", "issueDate" DESC);

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate" DESC);

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_doctorId_idx" ON "Invoice"("doctorId");

-- CreateIndex
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_position_idx" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_invoiceId_createdAt_idx" ON "InvoiceAuditLog"("invoiceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_actorId_idx" ON "InvoiceAuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

