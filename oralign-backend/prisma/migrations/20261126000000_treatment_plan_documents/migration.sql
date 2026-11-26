-- ─────────────────────────────────────────────────────────────────
-- TreatmentPlanDocument: the analysis PDFs of a treatment plan version
-- ─────────────────────────────────────────────────────────────────
-- Two slots per plan version, the CBCT analysis and the cephalometric
-- analysis (one row per kind, unique). A renewal after a rejection
-- copies the rows to the new version and the copies share the file
-- (storagePath, indexed for the "is this file still referenced" check
-- before a file is removed from disk).
--
-- Additive only: a new enum, a new table, no change to existing rows.

-- CreateEnum
CREATE TYPE "TreatmentPlanDocumentKind" AS ENUM ('cbct_analysis', 'cephalometric_analysis');

-- CreateTable
CREATE TABLE "TreatmentPlanDocument" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "kind" "TreatmentPlanDocumentKind" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlanDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentPlanDocument_storagePath_idx" ON "TreatmentPlanDocument"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanDocument_treatmentPlanId_kind_key" ON "TreatmentPlanDocument"("treatmentPlanId", "kind");

-- AddForeignKey
ALTER TABLE "TreatmentPlanDocument" ADD CONSTRAINT "TreatmentPlanDocument_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanDocument" ADD CONSTRAINT "TreatmentPlanDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
