-- A cheque can be recorded by an administrator and printed on the invoice.
-- PostgreSQL requires a newly-added enum value to be committed before a
-- later transaction can reference it, so this stays alone in its migration.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cheque' AFTER 'cash';
