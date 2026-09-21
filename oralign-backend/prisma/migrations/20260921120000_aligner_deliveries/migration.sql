-- Aligner delivery tracking. Additive only: one nullable column on
-- DentalOrder and one new table — no existing row is touched, and orders
-- without deliveries keep working unchanged (totalAligners stays NULL).
--
-- AlignerDelivery is an append-only log: the order's delivered set is
-- derived from its rows. Overlap is prevented in the service under a
-- FOR UPDATE lock; the (orderId, fromAligner) unique index is the
-- DB-level backstop. The order FK is RESTRICT: delivery history is
-- clinical record and must block a permanent order purge.

-- AlterTable
ALTER TABLE "DentalOrder" ADD COLUMN     "totalAligners" INTEGER;

-- CreateTable
CREATE TABLE "AlignerDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromAligner" INTEGER NOT NULL,
    "toAligner" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveredAt" DATE NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlignerDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlignerDelivery_orderId_deliveredAt_idx" ON "AlignerDelivery"("orderId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlignerDelivery_orderId_fromAligner_key" ON "AlignerDelivery"("orderId", "fromAligner");

-- AddForeignKey
ALTER TABLE "AlignerDelivery" ADD CONSTRAINT "AlignerDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlignerDelivery" ADD CONSTRAINT "AlignerDelivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

