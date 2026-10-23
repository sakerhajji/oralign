-- Immutable per-order audit trail. Additive only.
-- Actor references are SetNull while name/role snapshots preserve readability.

CREATE TABLE "OrderAuditLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderAuditLog_orderId_createdAt_idx"
    ON "OrderAuditLog"("orderId", "createdAt" DESC);
CREATE INDEX "OrderAuditLog_actorId_idx" ON "OrderAuditLog"("actorId");

ALTER TABLE "OrderAuditLog"
    ADD CONSTRAINT "OrderAuditLog_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderAuditLog"
    ADD CONSTRAINT "OrderAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing orders get a baseline creation event. The owning dentist is the
-- best actor available for legacy rows; metadata marks that inference.
INSERT INTO "OrderAuditLog" (
    "id", "orderId", "actorId", "actorName", "actorRole",
    "action", "metadata", "createdAt"
)
SELECT
    'order-created-' || o."id",
    o."id",
    o."doctorId",
    u."fullName",
    u."role",
    'created',
    '{"legacyBackfill":true}'::jsonb,
    o."createdAt"
FROM "DentalOrder" o
LEFT JOIN "User" u ON u."id" = o."doctorId";
