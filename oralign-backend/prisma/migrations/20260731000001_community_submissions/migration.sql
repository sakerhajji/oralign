-- CreateEnum
CREATE TYPE "CommunitySubmissionFormat" AS ENUM ('video', 'photo', 'text');

-- CreateEnum
CREATE TYPE "CommunitySubmissionRole" AS ENUM ('adult', 'parent', 'teen');

-- CreateEnum
CREATE TYPE "CommunitySubmissionTreatmentStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "CommunitySubmissionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "CommunitySubmission" (
    "id" TEXT NOT NULL,
    "format" "CommunitySubmissionFormat" NOT NULL,
    "status" "CommunitySubmissionStatus" NOT NULL DEFAULT 'pending',
    "firstName" VARCHAR(80) NOT NULL,
    "lastNameInitial" VARCHAR(2) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "city" VARCHAR(120),
    "role" "CommunitySubmissionRole" NOT NULL,
    "childName" VARCHAR(80),
    "childAge" INTEGER,
    "treatmentStatus" "CommunitySubmissionTreatmentStatus" NOT NULL,
    "why" TEXT NOT NULL,
    "journey" TEXT NOT NULL,
    "satisfied" TEXT,
    "message" TEXT,
    "consent" BOOLEAN NOT NULL,
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySubmissionMedia" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "originalName" VARCHAR(255),
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunitySubmissionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunitySubmission_status_deletedAt_createdAt_idx" ON "CommunitySubmission"("status", "deletedAt", "createdAt" DESC);
CREATE INDEX "CommunitySubmission_createdAt_idx" ON "CommunitySubmission"("createdAt" DESC);
CREATE INDEX "CommunitySubmission_reviewedById_idx" ON "CommunitySubmission"("reviewedById");
CREATE INDEX "CommunitySubmissionMedia_submissionId_idx" ON "CommunitySubmissionMedia"("submissionId");

-- AddForeignKey
ALTER TABLE "CommunitySubmission" ADD CONSTRAINT "CommunitySubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunitySubmissionMedia" ADD CONSTRAINT "CommunitySubmissionMedia_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CommunitySubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
