-- ────────────────────────────────────────────────────────────────
-- Notifications module — single ledger of in-app messages keyed
-- to the recipient user. The enum is created here so any later
-- migration can `ALTER TYPE NotificationType ADD VALUE` without
-- having to drop + recreate the column.
--
-- Idempotent: every CREATE has IF NOT EXISTS, and the enum is
-- guarded by a DO block so a re-run on a partially-applied DB
-- won't error.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'user_registered',
    'order_created',
    'order_submitted',
    'payment_received',
    'payment_declared',
    'cash_payment_recorded',
    'order_status_changed',
    'treatment_plan_ready',
    'treatment_plan_updated',
    'quotation_sent',
    'quotation_canceled',
    'payment_confirmed',
    'payment_rejected',
    'batch_unlocked',
    'batch_delivered',
    'installment_overdue',
    'system_message'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"          TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "type"        "NotificationType" NOT NULL,
  "title"       TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "link"        TEXT,
  "metadata"    JSONB,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- "List unread for this user, newest first" and "any-state list for
-- this user" — both indexes are read-heavy and cheap to maintain.
CREATE INDEX IF NOT EXISTS "Notification_recipientId_readAt_idx"
  ON "Notification" ("recipientId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_recipientId_createdAt_idx"
  ON "Notification" ("recipientId", "createdAt");
