-- Product default language switched to English.
--
-- Only the COLUMN DEFAULT changes: every existing row keeps whatever
-- language its owner already has, so no doctor's emails or notifications
-- switch language behind their back. New accounts created without an
-- explicit preference now start in English, matching the frontend
-- DEFAULT_LANG (showcase + dashboard) and the backend i18n fallback.
ALTER TABLE "User" ALTER COLUMN "preferredLanguage" SET DEFAULT 'en';
