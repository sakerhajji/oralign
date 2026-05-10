-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "PatientStage" AS ENUM ('initial', 'refinement', 'retainer');

-- CreateEnum
CREATE TYPE "ArchTreatment" AS ENUM ('upper', 'lower', 'both');

-- CreateEnum
CREATE TYPE "ToothInstructionType" AS ENUM ('no_attachments', 'do_not_move', 'no_ipr');

-- CreateEnum
CREATE TYPE "OrderFileCategory" AS ENUM ('right_photo', 'front_photo', 'left_photo', 'upper_photo', 'lower_photo', 'orthopantomography', 'stl', 'ply', 'obj', 'zip', 'pdf', 'image', 'video', 'other');

-- CreateTable
CREATE TABLE "DentalOrder" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assignedDesignerId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "patientStage" "PatientStage",
    "chiefComplaint" TEXT,
    "archTreatment" "ArchTreatment",
    "treatBothArch" BOOLEAN NOT NULL DEFAULT false,
    "treatmentPlan" TEXT,
    "dontMoveOption" TEXT,
    "apRelationship" TEXT,
    "anteroposteriorRelationship" TEXT,
    "elastics" TEXT,
    "openBite" TEXT,
    "midline" TEXT,
    "ipr" TEXT,
    "biteRamps" TEXT,
    "crossbite" TEXT,
    "spaces" TEXT,
    "extractions" TEXT,
    "specialInstructions" TEXT,
    "additionalInstructions" TEXT,
    "useCbctWithScans" BOOLEAN NOT NULL DEFAULT false,
    "wantsManufacturing" BOOLEAN NOT NULL DEFAULT false,
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DentalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderToothInstruction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "toothNumber" INTEGER NOT NULL,
    "type" "ToothInstructionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderToothInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "category" "OrderFileCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DentalOrder_orderCode_key" ON "DentalOrder"("orderCode");

-- CreateIndex
CREATE INDEX "DentalOrder_doctorId_idx" ON "DentalOrder"("doctorId");

-- CreateIndex
CREATE INDEX "DentalOrder_patientId_idx" ON "DentalOrder"("patientId");

-- CreateIndex
CREATE INDEX "DentalOrder_assignedDesignerId_idx" ON "DentalOrder"("assignedDesignerId");

-- CreateIndex
CREATE INDEX "DentalOrder_status_idx" ON "DentalOrder"("status");

-- CreateIndex
CREATE INDEX "DentalOrder_orderCode_idx" ON "DentalOrder"("orderCode");

-- CreateIndex
CREATE INDEX "DentalOrder_deletedAt_idx" ON "DentalOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "DentalOrder_createdAt_idx" ON "DentalOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderToothInstruction_orderId_toothNumber_type_key" ON "OrderToothInstruction"("orderId", "toothNumber", "type");

-- CreateIndex
CREATE INDEX "OrderToothInstruction_orderId_idx" ON "OrderToothInstruction"("orderId");

-- CreateIndex
CREATE INDEX "OrderToothInstruction_toothNumber_idx" ON "OrderToothInstruction"("toothNumber");

-- CreateIndex
CREATE INDEX "OrderFile_orderId_idx" ON "OrderFile"("orderId");

-- CreateIndex
CREATE INDEX "OrderFile_category_idx" ON "OrderFile"("category");

-- CreateIndex
CREATE INDEX "OrderFile_deletedAt_idx" ON "OrderFile"("deletedAt");

-- AddForeignKey
ALTER TABLE "DentalOrder" ADD CONSTRAINT "DentalOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalOrder" ADD CONSTRAINT "DentalOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalOrder" ADD CONSTRAINT "DentalOrder_assignedDesignerId_fkey" FOREIGN KEY ("assignedDesignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderToothInstruction" ADD CONSTRAINT "OrderToothInstruction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
