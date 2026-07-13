-- Public practitioner directory + appointments (idempotent, prod-safe).

-- DentistProfile: public directory fields
ALTER TABLE "DentistProfile" ADD COLUMN IF NOT EXISTS "specialty" TEXT;
ALTER TABLE "DentistProfile" ADD COLUMN IF NOT EXISTS "isListedPublicly" BOOLEAN NOT NULL DEFAULT false;

-- AppointmentStatus enum
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Appointment table
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" TEXT NOT NULL,
  "dentistProfileId" TEXT NOT NULL,
  "patientName" TEXT NOT NULL,
  "patientEmail" TEXT NOT NULL,
  "patientPhone" TEXT,
  "patientAddress" TEXT,
  "message" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
  "actionToken" TEXT NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "patientLang" TEXT NOT NULL DEFAULT 'fr',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_actionToken_key" ON "Appointment"("actionToken");
CREATE INDEX IF NOT EXISTS "Appointment_dentistProfileId_requestedAt_idx" ON "Appointment"("dentistProfileId", "requestedAt");
CREATE INDEX IF NOT EXISTS "Appointment_status_idx" ON "Appointment"("status");
CREATE INDEX IF NOT EXISTS "Appointment_actionToken_idx" ON "Appointment"("actionToken");
CREATE INDEX IF NOT EXISTS "DentistProfile_isListedPublicly_idx" ON "DentistProfile"("isListedPublicly");

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dentistProfileId_fkey"
    FOREIGN KEY ("dentistProfileId") REFERENCES "DentistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
