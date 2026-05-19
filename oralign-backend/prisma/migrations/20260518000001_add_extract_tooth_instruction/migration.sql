-- AlterEnum: add 'extract' to ToothInstructionType
-- Additive, non-destructive. Existing rows are unaffected.
ALTER TYPE "ToothInstructionType" ADD VALUE 'extract';
