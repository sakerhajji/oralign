-- A ClicToPay hosted session dies a few minutes after register.do, but the
-- attempt row stayed `pending` forever, so a customer who came back later was
-- handed the same dead formUrl. Two additions fix that:
--
--   • expiresAt / expiredAt — our own conservative deadline for the hosted
--     session, so an abandoned attempt can be retired without asking the
--     gateway first;
--   • the `expired` status — terminal, distinct from `failed` (nothing was
--     ever declined) and from `cancelled` (the customer did not refuse).
--
-- Additive only: existing rows keep NULL deadlines and are reconciled by the
-- sweep, which asks the gateway before retiring anything.

-- PostgreSQL requires a newly-added enum value to be committed before a
-- later transaction can reference it from indexes or constraints.
ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'expired' AFTER 'cancelled';
