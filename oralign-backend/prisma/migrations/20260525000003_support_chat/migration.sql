-- ────────────────────────────────────────────────────────────────
-- Support chat module — doctor ↔ admin direct messaging with
-- image attachments. Soft-deletable, admin-only deletion.
--
-- Two tables (SupportConversation + SupportMessage), three enums
-- (status, priority, plus the existing UserRole on the message
-- sender). Aggregate unread counters live on the conversation so
-- the doctor's bubble badge can render without scanning messages.
--
-- Idempotent — every CREATE has IF NOT EXISTS and enum creation is
-- wrapped in a DO block so a re-run on a partially-applied DB
-- doesn't error.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "SupportConversationStatus" AS ENUM (
    'open', 'pending', 'resolved', 'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SupportPriority" AS ENUM (
    'low', 'normal', 'high', 'urgent'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupportConversation" (
  "id"                  TEXT NOT NULL,
  "doctorId"            TEXT NOT NULL,
  "subject"             TEXT,
  "status"              "SupportConversationStatus" NOT NULL DEFAULT 'open',
  "priority"            "SupportPriority" NOT NULL DEFAULT 'normal',
  "assignedAdminId"     TEXT,
  "unreadByAdmin"       INTEGER NOT NULL DEFAULT 0,
  "unreadByDoctor"      INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessagePreview"  TEXT,
  "resolvedAt"          TIMESTAMP(3),
  "closedAt"            TIMESTAMP(3),
  "deletedAt"           TIMESTAMP(3),
  "deletedById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id"                     TEXT NOT NULL,
  "conversationId"         TEXT NOT NULL,
  "senderId"               TEXT NOT NULL,
  "senderRole"             "UserRole" NOT NULL,
  "body"                   TEXT,
  "attachmentRelativePath" TEXT,
  "attachmentMime"         TEXT,
  "attachmentName"         TEXT,
  "attachmentSize"         INTEGER,
  "readAt"                 TIMESTAMP(3),
  "deletedAt"              TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "SupportConversation"
  ADD CONSTRAINT "SupportConversation_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportConversation"
  ADD CONSTRAINT "SupportConversation_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Hot-path indexes
CREATE INDEX IF NOT EXISTS "SupportConversation_doctorId_deletedAt_lastMessageAt_idx"
  ON "SupportConversation" ("doctorId", "deletedAt", "lastMessageAt" DESC);

CREATE INDEX IF NOT EXISTS "SupportConversation_status_deletedAt_lastMessageAt_idx"
  ON "SupportConversation" ("status", "deletedAt", "lastMessageAt" DESC);

CREATE INDEX IF NOT EXISTS "SupportConversation_assignedAdminId_idx"
  ON "SupportConversation" ("assignedAdminId");

CREATE INDEX IF NOT EXISTS "SupportConversation_deletedAt_idx"
  ON "SupportConversation" ("deletedAt");

CREATE INDEX IF NOT EXISTS "SupportMessage_conversationId_createdAt_idx"
  ON "SupportMessage" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportMessage_senderId_idx"
  ON "SupportMessage" ("senderId");

CREATE INDEX IF NOT EXISTS "SupportMessage_conversationId_readAt_idx"
  ON "SupportMessage" ("conversationId", "readAt");
