/**
 * Single source of truth for domain-event names + payload types.
 *
 * Every business service emits one of these via `EventEmitter2`; the
 * `NotificationsListener` is the only consumer that knows how to turn
 * them into Notification rows. Adding a new event:
 *
 *   1. Add the name + payload to `NotificationEvents`
 *   2. Add a `@OnEvent` handler in the listener
 *   3. Emit it from the relevant service with a fire-and-forget
 *      try/catch wrapper so a notification failure can never block
 *      the business operation
 *
 * Naming convention: `<aggregate>.<past-tense-verb>` — matches the
 * @nestjs/event-emitter "shell glob" pattern so we can listen with
 * wildcards later (`payment.*`).
 */

import type { PaymentMethod, UserRole } from '@prisma/client';

export const NotificationEvents = {
  UserRegistered: 'user.registered',
  /**
   * A dentist finished onboarding (saved their clinic) and is now a
   * COMPLETE account awaiting admin approval. This — not UserRegistered —
   * is the moment admins get the "please review & approve" email, because
   * the profile is only worth reviewing once it's filled in.
   */
  DentistOnboardingCompleted: 'dentist.onboardingCompleted',
  OrderCreated: 'order.created',
  OrderSubmitted: 'order.submitted',
  OrderStatusChanged: 'order.statusChanged',
  TreatmentPlanReady: 'treatmentPlan.ready',
  TreatmentPlanUpdated: 'treatmentPlan.updated',
  /** Doctor approved the treatment plan — fans out to the admin team. */
  TreatmentPlanApproved: 'treatmentPlan.approved',
  /** Doctor rejected the plan — fans out to the admin team. */
  TreatmentPlanRejected: 'treatmentPlan.rejected',
  QuotationSent: 'quotation.sent',
  QuotationCanceled: 'quotation.canceled',
  /** Admin pulled a sent quote back to draft for correction — doctor
   *  is notified so they don't act on the stale copy. The bell entry
   *  flips into a "revision coming" wait state until the admin
   *  re-sends. */
  QuotationRecalled: 'quotation.recalled',
  /** Doctor (or admin on their behalf) accepted / declined a sent quote.
   *  Drives the admin e-mail fan-out; emitted by QuotationService so the
   *  notification listener is the ONLY subscriber to business events. */
  QuotationApproved: 'quotation.approved',
  QuotationRejected: 'quotation.rejected',
  PaymentReceived: 'payment.received',
  PaymentDeclared: 'payment.declared',
  PaymentConfirmed: 'payment.confirmed',
  PaymentRejected: 'payment.rejected',
  CashPaymentRecorded: 'payment.cashRecorded',
  /**
   * Doctor uploaded a bank-transfer receipt for the treatment fee.
   * Fans out to admins so they can review the proof and confirm the
   * wire once funds land.
   */
  TreatmentFeeDeclared: 'treatmentFee.declared',
  /**
   * Treatment fee paid instantly — doctor paid by card OR an admin
   * recorded cash. Fans out to admins as an audit ping.
   */
  TreatmentFeePaid: 'treatmentFee.paid',
  /**
   * Admin confirmed a previously-declared bank transfer for the
   * treatment fee. Notifies the doctor that the treatment plan can
   * now be prepared.
   */
  TreatmentFeeConfirmed: 'treatmentFee.confirmed',
  BatchUnlocked: 'batch.unlocked',
  BatchDelivered: 'batch.delivered',
} as const;

// ─── Payload types ──────────────────────────────────────────────────

export interface UserRegisteredEvent {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface DentistOnboardingCompletedEvent {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  /** The clinic name they just saved — surfaced in the admin bell body. */
  clinicName?: string | null;
}

export interface OrderEvent {
  orderId: string;
  orderCode: string;
  doctorId: string;
  /** Snapshot of the doctor at event time — surfaced verbatim in
   *  admin-facing notifications so the bell row reads as
   *  "Dr. Foulen submitted order ORD-…" instead of a bare code. */
  doctorName?: string | null;
  /** Snapshot of the patient at event time — same idea. */
  patientName?: string | null;
}

export interface OrderStatusChangedEvent extends OrderEvent {
  previousStatus: string;
  nextStatus: string;
}

export interface TreatmentPlanEvent {
  treatmentPlanId: string;
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  /** Patient the plan is for — surfaced in every notification body
   *  so the doctor / admin can scan the bell list without opening
   *  each row ("Treatment plan for patient X is ready."). */
  patientName?: string | null;
  planName?: string | null;
}

export interface TreatmentPlanDecisionEvent extends TreatmentPlanEvent {
  decision: 'approved' | 'rejected';
  /** Doctor-supplied rejection reason (rejected only). */
  reason?: string | null;
}

export interface QuotationEvent {
  quotationId: string;
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  patientName?: string | null;
  /** Document language at event time — surfaces in the doctor's bell
   *  so they know whether the team sent FR/EN/AR before opening it. */
  language?: string | null;
  quotationNumber?: string | null;
}

export interface QuotationDecisionEvent extends QuotationEvent {
  decision: 'approved' | 'rejected';
  /** Doctor-supplied rejection reason (rejected only). */
  reason?: string | null;
}

export interface PaymentEvent {
  paymentId: string;
  quotationId: string;
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  patientName?: string | null;
  amount: string;     // Decimal-as-string
  currency: string;
  method: PaymentMethod;
  installmentNumber?: number;
}

/**
 * Treatment-fee lifecycle event. Lives at the ORDER level (not the
 * installment Payment level), so we intentionally don't share the
 * PaymentEvent shape — no quotationId, no installmentNumber, no
 * paymentId. The amount + method are the doctor's stated values,
 * verified by the admin at confirm time.
 */
export interface TreatmentFeeEvent {
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  patientName?: string | null;
  amount: string;     // Decimal-as-string at event time
  currency: string;
  method: PaymentMethod;
}

export interface BatchEvent {
  batchId: string;
  quotationId: string;
  orderId: string;
  /** Order code snapshot — admin notification bodies read "ORD-… —
   *  steps X–Y unlocked" so the row is actionable without opening
   *  the case. Optional for legacy events that pre-date the field. */
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  patientName?: string | null;
  fromStep: number;
  toStep: number;
  batchNumber: number;
}
