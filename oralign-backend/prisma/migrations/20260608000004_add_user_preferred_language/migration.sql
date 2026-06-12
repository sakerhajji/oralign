-- Per-user content language ("fr" | "en"). Drives notifications,
-- emails and any backend-generated copy addressed to the user.
-- Default mirrors the app's default UI language (French).
ALTER TABLE "User" ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'fr';
