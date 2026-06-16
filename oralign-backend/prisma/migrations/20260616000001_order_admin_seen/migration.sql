-- Track when an admin first opened an order so the sidebar "new orders"
-- badge can clear once the order has been checked (NULL = unseen).
-- Idempotent so it is safe to (re)apply on environments where the column
-- was already created via `prisma db push` in development.
ALTER TABLE "DentalOrder" ADD COLUMN IF NOT EXISTS "adminSeenAt" TIMESTAMP(3);
