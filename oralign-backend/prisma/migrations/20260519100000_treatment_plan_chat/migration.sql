-- Treatment Plan, Messages & Attachments + extended Order lifecycle.
--
-- Adds:
--   • New enum values on OrderStatus (extended lifecycle)
--   • New enum value on ToothInstructionType (ipr_value)
--   • New enums: TreatmentPlanStatus, TreatmentMessageType, TreatmentAttachmentCategory
--   • Columns on OrderToothInstruction (value, note, createdById, updatedAt)
--   • Column on DentalOrder (approvedTreatmentPlanId)
--   • New tables: TreatmentPlan, TreatmentMessage, TreatmentMessageAttachment
--
-- All additive; no destructive changes to existing rows.

-- ─── Enum: OrderStatus — add new lifecycle values ──────────────────────────
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'treatment_planning';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'treatment_plan_ready';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'revision_requested';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'treatment_approved';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'quotation_sent';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'payment_plan_selected';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'payment_review';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'fabrication';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ready_to_ship';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'shipped';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'finished';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'canceled';

-- ─── Enum: ToothInstructionType — add ipr_value ────────────────────────────
ALTER TYPE "ToothInstructionType" ADD VALUE IF NOT EXISTS 'ipr_value';

-- ─── New enums ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TreatmentPlanStatus" AS ENUM ('pending', 'ready', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TreatmentMessageType" AS ENUM ('message', 'system', 'approval', 'rejection', 'file', 'treatment_result');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TreatmentAttachmentCategory" AS ENUM ('image', 'xray', 'stl', 'ply', 'obj', 'zip', 'pdf', 'video', 'treatment_file', 'treatment_result', 'container', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── OrderToothInstruction — add value/note/createdById/updatedAt ──────────
ALTER TABLE "OrderToothInstruction"
  ADD COLUMN IF NOT EXISTS "value" TEXT,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "OrderToothInstruction"
    ADD CONSTRAINT "OrderToothInstruction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── DentalOrder — track approved treatment plan ───────────────────────────
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "approvedTreatmentPlanId" TEXT;

-- ─── TreatmentPlan ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TreatmentPlan" (
  "id"                          TEXT NOT NULL,
  "orderId"                     TEXT NOT NULL,
  "version"                     INT  NOT NULL,
  "name"                        TEXT NOT NULL,
  "status"                      "TreatmentPlanStatus" NOT NULL DEFAULT 'pending',
  "resultViewUrl"               TEXT,
  "filePath"                    TEXT,
  "movementTableImagePath"      TEXT,
  "movementTableImageName"      TEXT,
  "movementTableImageMimeType"  TEXT,
  "movementTableImageSizeBytes" INT,
  "totalUpperAligners"          INT,
  "totalLowerAligners"          INT,
  "issuedUpperAligners"         INT,
  "issuedLowerAligners"         INT,
  "createdById"                 TEXT NOT NULL,
  "approvedAt"                  TIMESTAMP(3),
  "rejectedAt"                  TIMESTAMP(3),
  "publicToken"                 TEXT,
  "publicExpiresAt"             TIMESTAMP(3),
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,
  "deletedAt"                   TIMESTAMP(3),
  CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlan_publicToken_key" ON "TreatmentPlan"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlan_orderId_version_key" ON "TreatmentPlan"("orderId", "version");
CREATE INDEX IF NOT EXISTS "TreatmentPlan_orderId_idx" ON "TreatmentPlan"("orderId");
CREATE INDEX IF NOT EXISTS "TreatmentPlan_status_idx" ON "TreatmentPlan"("status");
CREATE INDEX IF NOT EXISTS "TreatmentPlan_publicToken_idx" ON "TreatmentPlan"("publicToken");
CREATE INDEX IF NOT EXISTS "TreatmentPlan_deletedAt_idx" ON "TreatmentPlan"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "TreatmentPlan"
    ADD CONSTRAINT "TreatmentPlan_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TreatmentPlan"
    ADD CONSTRAINT "TreatmentPlan_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── TreatmentMessage ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TreatmentMessage" (
  "id"              TEXT NOT NULL,
  "treatmentPlanId" TEXT NOT NULL,
  "senderId"        TEXT NOT NULL,
  "message"         TEXT,
  "type"            "TreatmentMessageType" NOT NULL DEFAULT 'message',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3),
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "TreatmentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TreatmentMessage_treatmentPlanId_idx" ON "TreatmentMessage"("treatmentPlanId");
CREATE INDEX IF NOT EXISTS "TreatmentMessage_senderId_idx" ON "TreatmentMessage"("senderId");
CREATE INDEX IF NOT EXISTS "TreatmentMessage_deletedAt_idx" ON "TreatmentMessage"("deletedAt");
CREATE INDEX IF NOT EXISTS "TreatmentMessage_createdAt_idx" ON "TreatmentMessage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "TreatmentMessage"
    ADD CONSTRAINT "TreatmentMessage_treatmentPlanId_fkey"
    FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TreatmentMessage"
    ADD CONSTRAINT "TreatmentMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── TreatmentMessageAttachment ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TreatmentMessageAttachment" (
  "id"           TEXT NOT NULL,
  "messageId"    TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "filePath"     TEXT NOT NULL,
  "mimeType"     TEXT,
  "sizeBytes"    INT,
  "category"     "TreatmentAttachmentCategory" NOT NULL DEFAULT 'other',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "TreatmentMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TreatmentMessageAttachment_messageId_idx" ON "TreatmentMessageAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "TreatmentMessageAttachment_category_idx" ON "TreatmentMessageAttachment"("category");
CREATE INDEX IF NOT EXISTS "TreatmentMessageAttachment_deletedAt_idx" ON "TreatmentMessageAttachment"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "TreatmentMessageAttachment"
    ADD CONSTRAINT "TreatmentMessageAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "TreatmentMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TreatmentMessageAttachment"
    ADD CONSTRAINT "TreatmentMessageAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
