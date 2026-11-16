-- Supplemental orders v2: the additional-aligner form as typed answers.
--
-- 1. One enum per question replaces the generic "SupplementalPolicy" (whose
--    four values fitted none of the five questions it served) and the free
--    text A-P relationship. Existing answers are converted value by value;
--    a value the new question does not offer becomes NULL (unanswered), so
--    the doctor answers it again before submitting.
-- 2. The teeth and contacts the doctor prescribes move to two request-owned
--    tables. They used to be OrderToothInstruction rows of the child order,
--    where the planner's plan editor owns the `attachment` type and rewrites
--    it on every save.
-- 3. The creator becomes an optional actor reference (SetNull) with a name
--    snapshot, like the reviewer (DELETION-POLICY rule 4).
-- 4. The transfer-template source plan gets a real foreign key; its version
--    is re-read from the plan row.
-- Forward only. Every statement either converts in place or only adds.

-- ── 1. New enums ───────────────────────────────────────────────────
CREATE TYPE "SupplementalApCorrection" AS ENUM (
  'maintain',
  'improve_canine',
  'improve_canine_molar',
  'class_one'
);
CREATE TYPE "SupplementalApOption" AS ENUM (
  'posterior_ipr',
  'elastics_simulation',
  'sequential_distalization',
  'mandibular_advancement',
  'orthognathic_surgery'
);
CREATE TYPE "SupplementalTeethScope" AS ENUM ('none', 'selected_teeth');
CREATE TYPE "SupplementalAttachmentPlan" AS ENUM (
  'as_needed',
  'avoid_selected_teeth'
);
CREATE TYPE "SupplementalExistingAttachments" AS ENUM (
  'remove_all',
  'remove_selected',
  'keep_conventional',
  'keep_all'
);
CREATE TYPE "SupplementalIprPlan" AS ENUM (
  'as_needed',
  'none',
  'avoid_selected_teeth'
);
CREATE TYPE "SupplementalPreviousIpr" AS ENUM (
  'as_prescribed',
  'none',
  'different'
);
CREATE TYPE "SupplementalCutoutPlan" AS ENUM (
  'none',
  'same_as_previous',
  'selected_teeth'
);
CREATE TYPE "SupplementalResidualSpaces" AS ENUM ('none', 'close_specified');
CREATE TYPE "SupplementalImpressionMethod" AS ENUM (
  'intraoral_scan',
  'physical_impression'
);
CREATE TYPE "SupplementalToothPurpose" AS ENUM (
  'do_not_move',
  'no_attachment',
  'remove_attachment',
  'no_ipr',
  'cutout',
  'transfer_tray'
);
CREATE TYPE "SupplementalContactPurpose" AS ENUM (
  'performed_ipr',
  'residual_space'
);

-- ── 2. Creator: optional actor reference + name snapshots ──────────
ALTER TABLE "SupplementalOrderRequest"
  DROP CONSTRAINT "SupplementalOrderRequest_createdById_fkey";
ALTER TABLE "SupplementalOrderRequest"
  ALTER COLUMN "createdById" DROP NOT NULL,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "reviewedByName" TEXT;
ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "SupplementalOrderRequest" r SET "createdByName" = u."fullName"
  FROM "User" u WHERE u.id = r."createdById";
UPDATE "SupplementalOrderRequest" r SET "reviewedByName" = u."fullName"
  FROM "User" u WHERE u.id = r."reviewedById";

-- ── 3. New answers ─────────────────────────────────────────────────
ALTER TABLE "SupplementalOrderRequest"
  ADD COLUMN "movementRestriction" "SupplementalTeethScope",
  ADD COLUMN "apOptions" "SupplementalApOption"[] NOT NULL
    DEFAULT ARRAY[]::"SupplementalApOption"[],
  ADD COLUMN "elasticCutouts" BOOLEAN,
  ADD COLUMN "previousIpr" "SupplementalPreviousIpr",
  ADD COLUMN "impressionMethod" "SupplementalImpressionMethod";

-- ── 4. Converted answers (anything the new question lacks → NULL) ──
ALTER TABLE "SupplementalOrderRequest"
  ALTER COLUMN "apRelationshipRight" TYPE "SupplementalApCorrection" USING (
    CASE WHEN "apRelationshipRight" IN
      ('maintain', 'improve_canine', 'improve_canine_molar', 'class_one')
    THEN "apRelationshipRight"::"SupplementalApCorrection" END
  ),
  ALTER COLUMN "apRelationshipLeft" TYPE "SupplementalApCorrection" USING (
    CASE WHEN "apRelationshipLeft" IN
      ('maintain', 'improve_canine', 'improve_canine_molar', 'class_one')
    THEN "apRelationshipLeft"::"SupplementalApCorrection" END
  ),
  ALTER COLUMN "attachmentPolicy" TYPE "SupplementalAttachmentPlan" USING (
    CASE "attachmentPolicy"::text
      WHEN 'as_needed' THEN 'as_needed'
      WHEN 'avoid' THEN 'avoid_selected_teeth'
      WHEN 'selected_teeth' THEN 'avoid_selected_teeth'
    END::"SupplementalAttachmentPlan"
  ),
  ALTER COLUMN "existingAttachmentPolicy" TYPE "SupplementalExistingAttachments" USING (
    CASE "existingAttachmentPolicy"::text
      WHEN 'selected_teeth' THEN 'remove_selected'
      WHEN 'preserve_previous' THEN 'keep_all'
    END::"SupplementalExistingAttachments"
  ),
  ALTER COLUMN "iprPolicy" TYPE "SupplementalIprPlan" USING (
    CASE "iprPolicy"::text
      WHEN 'as_needed' THEN 'as_needed'
      WHEN 'avoid' THEN 'none'
      WHEN 'selected_teeth' THEN 'avoid_selected_teeth'
    END::"SupplementalIprPlan"
  ),
  ALTER COLUMN "precisionCutPolicy" TYPE "SupplementalCutoutPlan" USING (
    CASE "precisionCutPolicy"::text
      WHEN 'avoid' THEN 'none'
      WHEN 'preserve_previous' THEN 'same_as_previous'
      WHEN 'selected_teeth' THEN 'selected_teeth'
    END::"SupplementalCutoutPlan"
  ),
  ALTER COLUMN "residualSpacePolicy" TYPE "SupplementalResidualSpaces" USING (
    CASE "residualSpacePolicy"::text
      WHEN 'avoid' THEN 'none'
      WHEN 'selected_teeth' THEN 'close_specified'
    END::"SupplementalResidualSpaces"
  );

DROP TYPE "SupplementalPolicy";

-- ── 5. Request-owned teeth and contacts ────────────────────────────
CREATE TABLE "SupplementalToothSelection" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "purpose" "SupplementalToothPurpose" NOT NULL,
  "toothNumber" INTEGER NOT NULL,
  CONSTRAINT "SupplementalToothSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplementalToothContact" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "purpose" "SupplementalContactPurpose" NOT NULL,
  "fromTooth" INTEGER NOT NULL,
  "toTooth" INTEGER NOT NULL,
  "amountMm" DECIMAL(4,2) NOT NULL,
  CONSTRAINT "SupplementalToothContact_pkey" PRIMARY KEY ("id"),
  -- Stored normalised (lower FDI number first) with a positive amount.
  CONSTRAINT "SupplementalToothContact_pair_check"
    CHECK ("fromTooth" < "toTooth" AND "amountMm" > 0)
);

CREATE UNIQUE INDEX "SupplementalToothSelection_requestId_purpose_toothNumber_key"
  ON "SupplementalToothSelection"("requestId", "purpose", "toothNumber");
-- Prisma's default name, truncated to Postgres' 63-character limit.
CREATE UNIQUE INDEX "SupplementalToothContact_requestId_purpose_fromTooth_toToot_key"
  ON "SupplementalToothContact"("requestId", "purpose", "fromTooth", "toTooth");

ALTER TABLE "SupplementalToothSelection"
  ADD CONSTRAINT "SupplementalToothSelection_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupplementalOrderRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplementalToothContact"
  ADD CONSTRAINT "SupplementalToothContact_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupplementalOrderRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- v1 children kept the doctor's teeth in OrderToothInstruction. Doctor
-- types move with their meaning; `attachment` meant "tooth in the tray" only
-- on a transfer template. Every other type has no v2 equivalent.
INSERT INTO "SupplementalToothSelection" ("id", "requestId", "purpose", "toothNumber")
SELECT gen_random_uuid()::text, r."id", mapped."purpose", t."toothNumber"
  FROM "OrderToothInstruction" t
  JOIN "DentalOrder" o ON o."id" = t."orderId" AND o."orderType" <> 'initial'
  JOIN "SupplementalOrderRequest" r ON r."orderId" = o."id"
  CROSS JOIN LATERAL (
    SELECT (CASE
      WHEN t."type" = 'do_not_move' THEN 'do_not_move'
      WHEN t."type" = 'no_attachments' THEN 'no_attachment'
      WHEN t."type" = 'no_ipr' THEN 'no_ipr'
      WHEN t."type" = 'precision_cut' THEN 'cutout'
      WHEN t."type" = 'attachment' AND o."orderType" = 'transfer_template'
        THEN 'transfer_tray'
    END)::"SupplementalToothPurpose" AS "purpose"
  ) mapped
 WHERE mapped."purpose" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Then the child rows go. Exception: planner-owned types on a child that
-- already has a treatment plan may have been written by the plan editor,
-- so they stay where the planner reads them.
DELETE FROM "OrderToothInstruction" t
 USING "DentalOrder" o
 WHERE o."id" = t."orderId"
   AND o."orderType" <> 'initial'
   AND NOT (
     t."type" IN ('attachment', 'ipr_value')
     AND EXISTS (SELECT 1 FROM "TreatmentPlan" p WHERE p."orderId" = o."id")
   );

-- A moved selection implies the answer that owns it when that answer was
-- never given (otherwise the next draft save would drop the teeth).
UPDATE "SupplementalOrderRequest" r SET "movementRestriction" = 'selected_teeth'
 WHERE r."movementRestriction" IS NULL
   AND EXISTS (SELECT 1 FROM "SupplementalToothSelection" s
                WHERE s."requestId" = r."id" AND s."purpose" = 'do_not_move');
UPDATE "SupplementalOrderRequest" r SET "attachmentPolicy" = 'avoid_selected_teeth'
 WHERE r."attachmentPolicy" IS NULL
   AND EXISTS (SELECT 1 FROM "SupplementalToothSelection" s
                WHERE s."requestId" = r."id" AND s."purpose" = 'no_attachment');
UPDATE "SupplementalOrderRequest" r SET "iprPolicy" = 'avoid_selected_teeth'
 WHERE r."iprPolicy" IS NULL
   AND EXISTS (SELECT 1 FROM "SupplementalToothSelection" s
                WHERE s."requestId" = r."id" AND s."purpose" = 'no_ipr');
UPDATE "SupplementalOrderRequest" r SET "precisionCutPolicy" = 'selected_teeth'
 WHERE r."precisionCutPolicy" IS NULL
   AND EXISTS (SELECT 1 FROM "SupplementalToothSelection" s
                WHERE s."requestId" = r."id" AND s."purpose" = 'cutout');

-- ── 6. Transfer-template source plan: a real reference ─────────────
-- A draft could hold any client-sent id: drop the ones that name no plan,
-- and re-read the version of the others from the plan row.
UPDATE "SupplementalOrderRequest" r
   SET "sourceTreatmentPlanId" = NULL, "sourceTreatmentPlanVersion" = NULL
 WHERE r."sourceTreatmentPlanId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "TreatmentPlan" p
                    WHERE p."id" = r."sourceTreatmentPlanId");
UPDATE "SupplementalOrderRequest" r SET "sourceTreatmentPlanVersion" = p."version"
  FROM "TreatmentPlan" p WHERE p."id" = r."sourceTreatmentPlanId";

ALTER TABLE "SupplementalOrderRequest"
  ADD CONSTRAINT "SupplementalOrderRequest_sourceTreatmentPlanId_fkey"
  FOREIGN KEY ("sourceTreatmentPlanId") REFERENCES "TreatmentPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 7. Initial case ⇔ no parent ────────────────────────────────────
-- SQL-only (Prisma cannot express it); see the comment on
-- DentalOrder.orderType in schema.prisma.
ALTER TABLE "DentalOrder"
  ADD CONSTRAINT "DentalOrder_order_type_parent_check"
  CHECK (("orderType" = 'initial') = ("parentOrderId" IS NULL));
