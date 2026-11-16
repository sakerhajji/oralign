-- Typed supplemental requests linked to their immutable initial case.
CREATE TYPE "OrderType" AS ENUM (
  'initial',
  'additional_aligners',
  'replacement',
  'transfer_template',
  'warranty'
);

CREATE TYPE "SupplementalCoverageStatus" AS ENUM (
  'review_required',
  'included',
  'chargeable',
  'warranty_approved',
  'warranty_rejected'
);

CREATE TYPE "SupplementalReviewStatus" AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE "SupplementalRequestReason" AS ENUM (
  'finishing',
  'tracking_problem',
  'treatment_plan_change',
  'dental_restoration',
  'non_compliance',
  'other'
);

CREATE TYPE "SupplementalClinicalObjective" AS ENUM (
  'adjust_current_position',
  'preserve_previous_goal',
  'new_goal'
);

CREATE TYPE "SupplementalPolicy" AS ENUM (
  'as_needed',
  'preserve_previous',
  'avoid',
  'selected_teeth'
);

CREATE TYPE "ReplacementReason" AS ENUM ('lost', 'broken', 'deformed', 'other');
CREATE TYPE "SupplementalUrgency" AS ENUM ('standard', 'urgent');
CREATE TYPE "TransferTemplatePurpose" AS ENUM (
  'attachment_placement',
  'auxiliary_placement',
  'attachment_and_auxiliary',
  'other'
);
CREATE TYPE "WarrantyDefectCategory" AS ENUM (
  'fit',
  'crack',
  'deformation',
  'trim',
  'material',
  'labeling',
  'other'
);

ALTER TYPE "ToothInstructionType" ADD VALUE IF NOT EXISTS 'precision_cut';

ALTER TABLE "DentalOrder"
  ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'initial',
  ADD COLUMN "parentOrderId" TEXT,
  ADD COLUMN "coverageStartedAt" TIMESTAMP(3),
  ADD COLUMN "coverageExpiresAt" TIMESTAMP(3);

ALTER TABLE "Pack" ADD COLUMN "treatmentValidityMonths" INTEGER;
ALTER TABLE "Quotation" ADD COLUMN "treatmentValidityMonths" INTEGER;

CREATE TABLE "SupplementalOrderRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "coverageStatus" "SupplementalCoverageStatus" NOT NULL DEFAULT 'review_required',
  "coverageReason" TEXT,
  "reviewStatus" "SupplementalReviewStatus" NOT NULL DEFAULT 'draft',
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "correctionNumber" INTEGER,
  "reason" "SupplementalRequestReason",
  "reasonDetails" TEXT,
  "currentUpperAligner" INTEGER,
  "currentLowerAligner" INTEGER,
  "passiveOppositeArch" BOOLEAN,
  "newUpperScan" BOOLEAN,
  "newLowerScan" BOOLEAN,
  "clinicalObjective" "SupplementalClinicalObjective",
  "apRelationshipRight" TEXT,
  "apRelationshipLeft" TEXT,
  "attachmentPolicy" "SupplementalPolicy",
  "existingAttachmentPolicy" "SupplementalPolicy",
  "iprPolicy" "SupplementalPolicy",
  "precisionCutPolicy" "SupplementalPolicy",
  "residualSpacePolicy" "SupplementalPolicy",
  "upperInstructions" TEXT,
  "lowerInstructions" TEXT,
  "replacementFromAligner" INTEGER,
  "replacementToAligner" INTEGER,
  "quantity" INTEGER,
  "replacementReason" "ReplacementReason",
  "urgency" "SupplementalUrgency",
  "sourceTreatmentPlanId" TEXT,
  "sourceTreatmentPlanVersion" INTEGER,
  "transferPurpose" "TransferTemplatePurpose",
  "transferNotes" TEXT,
  "warrantyDefectCategory" "WarrantyDefectCategory",
  "warrantyDiscoveredAt" TIMESTAMP(3),
  "warrantyLotReference" TEXT,
  "warrantyComments" TEXT,
  "convertedReplacementOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplementalOrderRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplementalOrderRequest_orderId_key"
  ON "SupplementalOrderRequest"("orderId");
CREATE UNIQUE INDEX "SupplementalOrderRequest_convertedReplacementOrderId_key"
  ON "SupplementalOrderRequest"("convertedReplacementOrderId");
CREATE UNIQUE INDEX "SupplementalOrderRequest_createdById_idempotencyKey_key"
  ON "SupplementalOrderRequest"("createdById", "idempotencyKey");
CREATE INDEX "SupplementalOrderRequest_reviewStatus_submittedAt_idx"
  ON "SupplementalOrderRequest"("reviewStatus", "submittedAt");
CREATE INDEX "SupplementalOrderRequest_coverageStatus_idx"
  ON "SupplementalOrderRequest"("coverageStatus");
CREATE INDEX "DentalOrder_parentOrderId_idx" ON "DentalOrder"("parentOrderId");
CREATE INDEX "DentalOrder_orderType_idx" ON "DentalOrder"("orderType");

ALTER TABLE "DentalOrder"
  ADD CONSTRAINT "DentalOrder_parentOrderId_fkey"
  FOREIGN KEY ("parentOrderId") REFERENCES "DentalOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_convertedReplacementOrderId_fkey"
  FOREIGN KEY ("convertedReplacementOrderId") REFERENCES "DentalOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
