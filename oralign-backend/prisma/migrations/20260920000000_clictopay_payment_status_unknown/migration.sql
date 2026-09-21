-- PostgreSQL requires a newly-added enum value to be committed before a
-- later transaction can reference it from indexes or constraints.
ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'unknown' AFTER 'pending';
