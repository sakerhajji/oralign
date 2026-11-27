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
 *
 * Exception on purpose: the lab delivery notices
 * (`production_delivered` / `production_delivery_cancelled`) skip this
 * bus. An in-process event dies with its process, and those must survive
 * a crash, wait out a grace delay and be retried: they go through the
 * ProductionNotice outbox (src/production/notifications), whose
 * dispatcher calls NotificationsService directly.
 */

import type {
  AccountActivityEventKind,
  BatchUnlockSource,
  OrderType,
  PaymentMethod,
  SupplementalCoverageStatus,
  UserRole,
} from '@prisma/client';

export const NotificationEvents = {
  UserRegistered: 'user.registered',
  /**
   * A dentist finished onboarding (saved their clinic) and is now a
   * COMPLETE account awaiting admin approval. UserRegistered sends the
   * immediate admin email; this later event sharpens the in-app notification
   * once the profile is ready for review.
   */
  DentistOnboardingCompleted: 'dentist.onboardingCompleted',
  OrderCreated: 'order.created',
  OrderSubmitted: 'order.submitted',
  OrderStatusChanged: 'order.statusChanged',
  /** A doctor (or an admin) submitted a supplemental request — admins review it. */
  SupplementalOrderSubmitted: 'supplementalOrder.submitted',
  /** An admin approved or rejected a supplemental request — the doctor hears. */
  SupplementalOrderReviewed: 'supplementalOrder.reviewed',
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
   * The doctor (or an admin for him) withdrew a transfer declaration still
   * awaiting confirmation: status cancelled + cancelledAt/By, file kept.
   * Resolves the subject for every admin. Payload: TransferClosedEvent.
   */
  PaymentWithdrawn: 'payment.withdrawn',
  /**
   * A new declaration on the same installment replaced one still awaiting
   * confirmation (status cancelled + cancelledAt/By). Resolves the old
   * subject for every admin. Payload: TransferClosedEvent.
   */
  PaymentSuperseded: 'payment.superseded',
  /**
   * An admin opened a transfer receipt (pack installment or treatment fee).
   * Stamps the global reviewOpenedAt the FIRST time only and marks THAT
   * admin's own subject rows read. Payload: TransferReviewOpenedEvent.
   */
  TransferReviewOpened: 'transfer.reviewOpened',
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
  /**
   * Admin refused the treatment-fee transfer with a reason (status
   * rejected + treatmentFeeRejectedAt/By/Reason). The doctor is notified
   * in-app with « Motif : … »; the subject is resolved for every admin.
   * Payload: TreatmentFeeRejectedEvent.
   */
  TreatmentFeeRejected: 'treatmentFee.rejected',
  /**
   * The doctor removed the treatment-fee receipt while it awaited
   * confirmation (DELETE orders/:id/treatment-fee/proof). Resolves the
   * subject for every admin. Payload: TransferClosedEvent.
   */
  TreatmentFeeWithdrawn: 'treatmentFee.withdrawn',
  /**
   * A new treatment-fee upload replaced a declaration still awaiting
   * confirmation (new treatmentFeeDeclaredAt, hence a new subject). The
   * OLD subject is resolved for every admin; TreatmentFeeDeclared follows
   * for the new one. Payload: TransferClosedEvent.
   */
  TreatmentFeeSuperseded: 'treatmentFee.superseded',
  BatchUnlocked: 'batch.unlocked',
  BatchDelivered: 'batch.delivered',
  /**
   * The inactivity sweep warned a doctor (30 or 7 days before his account
   * turns dormant). E-mail + in-app account_inactivity_warning, FR/EN.
   * Payload: AccountActivityNoticeEvent (kind warning_30d | warning_7d).
   */
  AccountInactivityWarning: 'account.inactivityWarning',
  /**
   * The sweep turned a doctor dormant (User.inactiveSince set). Doctor:
   * e-mail + in-app account_deactivated; admins: in-app
   * doctor_deactivated_inactivity. Payload: AccountActivityNoticeEvent
   * (kind deactivated).
   */
  AccountDeactivated: 'account.deactivated',
  /**
   * An admin reactivated a dormant doctor with a reason. Doctor: e-mail +
   * in-app account_reactivated. Payload: AccountActivityNoticeEvent (kind
   * reactivated).
   */
  AccountReactivated: 'account.reactivated',
  /**
   * A user's identity or clinic changed (UserService.update, the avatar
   * upload, the clinic profile writes). DentistProfileService drops its
   * cached profile; nothing is notified. Payload: UserProfileChangedEvent.
   */
  UserProfileChanged: 'user.profileChanged',
} as const;

export type NotificationEventName =
  (typeof NotificationEvents)[keyof typeof NotificationEvents];

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

export interface SupplementalOrderEvent extends OrderEvent {
  /** The initial case the request belongs to. */
  parentOrderId: string;
  requestType: Exclude<OrderType, 'initial'>;
}

export interface SupplementalOrderReviewedEvent extends SupplementalOrderEvent {
  decision: 'approved' | 'rejected';
  coverageStatus: SupplementalCoverageStatus;
  /** The admin's reason (always set on a rejection). */
  reason: string | null;
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
  /**
   * The cash charged or received (installment + stamp - retenue),
   * Decimal-as-string.
   */
  amount: string;
  /**
   * The retenue à la source the practitioner kept back ("0" when none),
   * Decimal-as-string, computed on the installment (stamp excluded).
   */
  withholdingAmount: string;
  /**
   * The droit de timbre charged on top with this payment ("0" on payments
   * made before 2026-11-20), Decimal-as-string.
   * amount + withholdingAmount - stampAmount = the installment paid.
   */
  stampAmount: string;
  currency: string;
  method: PaymentMethod;
  installmentNumber?: number;
  /**
   * PaymentRejected only: the admin's reason (trimmed, 3-500 characters).
   * The doctor's message appends « Motif : <reason> ». The subject of every
   * Payment event is installmentSubjectKey(paymentId).
   */
  rejectionReason?: string | null;
}

/**
 * Treatment-fee lifecycle event. Lives at the ORDER level (not the
 * installment Payment level), so we intentionally don't share the
 * PaymentEvent shape — no quotationId, no installmentNumber. The amount
 * + method are the doctor's stated values, verified by the admin at
 * confirm time.
 */
export interface TreatmentFeeEvent {
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  doctorName?: string | null;
  patientName?: string | null;
  /**
   * The cash charged or received (fee due + stamp - retenue),
   * Decimal-as-string.
   */
  amount: string;
  /**
   * The retenue à la source the practitioner kept back ("0" when none),
   * computed on the fee due (stamp excluded). Absent on legacy emitters.
   */
  withholdingAmount?: string;
  /**
   * The droit de timbre charged on top ("0" when none, e.g. a fee paid
   * before 2026-11-20). amount + withholdingAmount - stampAmount = the fee
   * due. Absent on legacy emitters.
   */
  stampAmount?: string;
  currency: string;
  method: PaymentMethod;
  /** The settled ClicToPay attempt, for a fee paid by card. */
  paymentId?: string;
  /**
   * The declaration's identity, DentalOrder.treatmentFeeDeclaredAt as ISO
   * 8601: set on TreatmentFeeDeclared / Confirmed / Rejected of a bank
   * transfer (the subject is treatmentFeeSubjectKey(orderId, declaredAt)).
   * Null / absent for card and cash fees, which are never queued.
   */
  declaredAt?: string | null;
}

/** TreatmentFeeRejected: the refused declaration and the admin's reason. */
export interface TreatmentFeeRejectedEvent extends TreatmentFeeEvent {
  declaredAt: string;
  /** Trimmed, 3-500 characters; the doctor reads « Motif : <reason> ». */
  rejectionReason: string;
  rejectedById: string;
}

/** The two queues a bank-transfer declaration sits in. */
export type TransferKind = 'installment' | 'treatment_fee';

/**
 * PaymentWithdrawn / PaymentSuperseded / TreatmentFeeWithdrawn /
 * TreatmentFeeSuperseded: a declaration left the queue without being
 * processed. Carries the CLOSED declaration's subject explicitly (for a
 * treatment fee the order already holds the next declaredAt).
 */
export interface TransferClosedEvent {
  kind: TransferKind;
  /** notification-subject.ts key of the declaration that was closed. */
  subjectKey: string;
  reason: 'withdrawn' | 'superseded';
  orderId: string;
  orderCode?: string | null;
  doctorId: string;
  /** installment only */
  paymentId?: string | null;
  quotationId?: string | null;
  installmentNumber?: number | null;
  /** Who withdrew or re-declared (the doctor, or an admin for him). */
  actorId: string | null;
  /** superseded only: the subject of the declaration that replaced it. */
  replacedBySubjectKey?: string | null;
}

/** TransferReviewOpened: an admin opened a receipt. */
export interface TransferReviewOpenedEvent {
  kind: TransferKind;
  subjectKey: string;
  orderId: string;
  /** installment only */
  paymentId?: string | null;
  /** The admin who opened it: HIS subject rows are marked read. */
  adminId: string;
  /** True when this call stamped reviewOpenedAt (the first admin). */
  firstOpen: boolean;
  /** The global stamp (ISO 8601), the first opening's instant. */
  reviewOpenedAt: string;
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

/**
 * BatchUnlocked: what released the steps (production/batch-unlock.ts).
 * Listeners never notify the doctor of a `manual` unlock, and nobody
 * notifies the technician.
 */
export interface BatchUnlockedEvent extends BatchEvent {
  source: BatchUnlockSource;
  /** source payment: the settled payment. */
  paymentId?: string | null;
  installmentNumber?: number | null;
  /** The admin who unlocked or confirmed; null = the system (card). */
  actorId?: string | null;
}

/**
 * AccountInactivityWarning / AccountDeactivated / AccountReactivated
 * (users/activity). Emitted after the AccountActivityEvent row commits.
 */
export interface AccountActivityNoticeEvent {
  /** The AccountActivityEvent row (the journal entry and idempotency key). */
  eventId: string;
  userId: string;
  fullName: string;
  /** Delivery address of the e-mail (User.email, never the clinic e-mail). */
  email: string;
  /** 'fr' | 'en': language of the e-mail and the in-app row. */
  preferredLanguage: string;
  kind: AccountActivityEventKind;
  /** The activity anchor of the cycle (ISO 8601). */
  anchorAt: string;
  /** anchorAt + inactivityMonths, the deactivation date (ISO 8601). */
  deadlineAt: string;
  /** Warnings only: whole days left until deadlineAt. */
  daysLeft?: number | null;
  /** reactivated only: the admin and his reason. */
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
}

/** UserProfileChanged: drop the cached identity of this user. */
export interface UserProfileChangedEvent {
  userId: string;
  /** The user's DentistProfile row, when he has one (cache key byId). */
  dentistProfileId?: string | null;
  /** The fields written, for logs only: consumers never branch on them. */
  fields: string[];
  /** Who made the change (the user himself or an admin). */
  actorId: string;
}
