import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../services/notifications.service';
import {
  BatchEvent,
  NotificationEvents,
  OrderEvent,
  OrderStatusChangedEvent,
  PaymentEvent,
  QuotationEvent,
  TreatmentFeeEvent,
  TreatmentPlanDecisionEvent,
  TreatmentPlanEvent,
  UserRegisteredEvent,
} from '../events/notification-events';

/**
 * Build a `Dr. X · patient Y · order ORD-…` byline used in the body
 * of every admin-facing notification so the row reads as a single
 * legible line without forcing the admin to open the order detail.
 * Falls back gracefully when any piece is missing (legacy events,
 * deleted patients, etc.). Returns both language renderings (French
 * drops the dot after `Dr` and says `commande` instead of `order`);
 * the two sides are empty together, so truthiness checks use `.en`.
 */
function adminByline(parts: {
  doctorName?: string | null;
  orderCode?: string | null;
  patientName?: string | null;
}): { en: string; fr: string } {
  const en: string[] = [];
  const fr: string[] = [];
  if (parts.doctorName) {
    en.push(`Dr. ${parts.doctorName}`);
    fr.push(`Dr ${parts.doctorName}`);
  }
  if (parts.patientName) {
    en.push(`patient ${parts.patientName}`);
    fr.push(`patient ${parts.patientName}`);
  }
  if (parts.orderCode) {
    en.push(`order ${parts.orderCode}`);
    fr.push(`commande ${parts.orderCode}`);
  }
  return { en: en.join(' · '), fr: fr.join(' · ') };
}

/**
 * Doctor-facing equivalent: a `patient X · ORD-…` tail you can append
 * to any notification body so the doctor instantly sees which case
 * the ping belongs to. We drop the "Dr." prefix because the doctor
 * IS the recipient — repeating their own name reads weird.
 */
function doctorByline(parts: {
  patientName?: string | null;
  orderCode?: string | null;
}): string {
  const segments: string[] = [];
  if (parts.patientName) segments.push(`patient ${parts.patientName}`);
  if (parts.orderCode) segments.push(parts.orderCode);
  return segments.join(' · ');
}

/**
 * Human-readable language label for the bell — the document language
 * lives on every QuotationEvent and we surface it so the doctor knows
 * whether to expect FR/EN/AR before clicking through. Falls back to
 * an empty string when the event predates the field so legacy events
 * still render cleanly.
 */
function languageLabel(lang?: string | null): string {
  if (!lang) return '';
  switch (lang.toLowerCase()) {
    case 'fr':
      return 'Français';
    case 'en':
      return 'English';
    case 'ar':
      return 'العربية';
    default:
      return lang.toUpperCase();
  }
}

/**
 * Translates business-domain events into Notification rows.
 *
 * Every handler is async, isolated, and swallowed by a try/catch —
 * a notification failure must NEVER bubble back up and unwind the
 * business transaction that fired the event. The original write
 * (order created, payment confirmed, …) already committed by the
 * time the listener runs, so the worst case here is a missing bell
 * ping, not a corrupted database.
 *
 * Audience routing lives here, not in the service: each event knows
 * the doctorId in its payload, and admin fan-out goes through
 * `broadcastToAdmins`. That keeps emitters dumb ("a thing happened")
 * and listeners smart ("who should hear about it").
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  // ─── User lifecycle ─────────────────────────────────────────────────

  @OnEvent(NotificationEvents.UserRegistered, { async: true })
  async onUserRegistered(payload: UserRegisteredEvent): Promise<void> {
    await this.safe('user.registered', async () => {
      await this.notifications.broadcastToAdmins({
        type: NotificationType.user_registered,
        title: {
          en: 'New user registered',
          fr: 'Nouvel utilisateur inscrit',
        },
        message: {
          en: `${payload.fullName} (${payload.email}) just signed up as ${payload.role}.`,
          fr: `${payload.fullName} (${payload.email}) vient de s'inscrire en tant que ${payload.role}.`,
        },
        link: `/dashboard/users`,
        metadata: {
          userId: payload.userId,
          role: payload.role,
        },
      });
    });
  }

  // ─── Orders ─────────────────────────────────────────────────────────

  // `order.created` (doctor opens a draft) intentionally has NO handler.
  // Admins shouldn't be pinged for every draft a doctor opens — that's
  // just noise. The bell first fires when the order is actually
  // submitted for review (handler below). The event constant is kept
  // exported so future code can opt in to it without a schema change.

  @OnEvent(NotificationEvents.OrderSubmitted, { async: true })
  async onOrderSubmitted(payload: OrderEvent): Promise<void> {
    await this.safe('order.submitted', async () => {
      // Headline message — clean, one-line, names the doctor + the
      // order code explicitly so the admin can act without opening
      // the row first.
      const doctorEn = payload.doctorName
        ? `Dr. ${payload.doctorName}`
        : 'A doctor';
      const doctorFr = payload.doctorName
        ? `Dr ${payload.doctorName}`
        : 'Un praticien';
      const message = {
        en: `Order ${payload.orderCode} created by ${doctorEn}${
          payload.patientName ? ` for patient ${payload.patientName}` : ''
        } — ready for review.`,
        fr: `Commande ${payload.orderCode} créée par ${doctorFr}${
          payload.patientName ? ` pour le patient ${payload.patientName}` : ''
        } — prête pour examen.`,
      };
      await this.notifications.broadcastToAdmins({
        type: NotificationType.order_submitted,
        title: {
          en: 'New order to review',
          fr: 'Nouvelle commande à examiner',
        },
        message,
        link: `/dashboard/orders/${payload.orderId}`,
        metadata: {
          orderId: payload.orderId,
          orderCode: payload.orderCode,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.OrderStatusChanged, { async: true })
  async onOrderStatusChanged(
    payload: OrderStatusChangedEvent,
  ): Promise<void> {
    await this.safe('order.statusChanged', async () => {
      // Notify the doctor — the admin sees the transition because
      // they performed it, no point pinging them back.
      const tail = doctorByline({
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.order_status_changed,
        title: {
          en: 'Order status updated',
          fr: 'Statut de la commande mis à jour',
        },
        message: {
          en: `Order ${payload.orderCode}${
            payload.patientName ? ` for patient ${payload.patientName}` : ''
          }: ${payload.previousStatus} → ${payload.nextStatus}.`,
          fr: `Commande ${payload.orderCode}${
            payload.patientName ? ` pour le patient ${payload.patientName}` : ''
          } : ${payload.previousStatus} → ${payload.nextStatus}.`,
        },
        link: `/dashboard/orders/${payload.orderId}`,
        metadata: {
          orderId: payload.orderId,
          orderCode: payload.orderCode,
          patientName: payload.patientName ?? null,
          previousStatus: payload.previousStatus,
          nextStatus: payload.nextStatus,
          tail,
        },
      });
    });
  }

  // ─── Treatment plans ────────────────────────────────────────────────

  @OnEvent(NotificationEvents.TreatmentPlanReady, { async: true })
  async onTreatmentPlanReady(payload: TreatmentPlanEvent): Promise<void> {
    await this.safe('treatmentPlan.ready', async () => {
      // Body weaves patient + order code so the bell reads as a
      // standalone line: "Treatment plan for patient Foulen Ben Foulen
      // (ORD-2025-0042) is ready for review."
      const subjectEn = payload.patientName
        ? `Treatment plan for patient ${payload.patientName}`
        : payload.planName
          ? `Your treatment plan "${payload.planName}"`
          : 'Your treatment plan';
      const subjectFr = payload.patientName
        ? `Le plan de traitement du patient ${payload.patientName}`
        : payload.planName
          ? `Votre plan de traitement « ${payload.planName} »`
          : 'Votre plan de traitement';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.treatment_plan_ready,
        title: {
          en: 'Treatment plan ready',
          fr: 'Plan de traitement prêt',
        },
        message: {
          en: `${subjectEn}${code} is ready for review.`,
          fr: `${subjectFr}${code} est prêt pour examen.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=treatment`,
        metadata: {
          treatmentPlanId: payload.treatmentPlanId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          planName: payload.planName ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.TreatmentPlanUpdated, { async: true })
  async onTreatmentPlanUpdated(
    payload: TreatmentPlanEvent,
  ): Promise<void> {
    await this.safe('treatmentPlan.updated', async () => {
      const subjectEn = payload.patientName
        ? `The treatment plan for patient ${payload.patientName}`
        : 'Your treatment plan';
      const subjectFr = payload.patientName
        ? `Le plan de traitement du patient ${payload.patientName}`
        : 'Votre plan de traitement';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.treatment_plan_updated,
        title: {
          en: 'Treatment plan updated',
          fr: 'Plan de traitement mis à jour',
        },
        message: {
          en: `${subjectEn}${code} was updated by the planner — please re-review.`,
          fr: `${subjectFr}${code} a été mis à jour par le planificateur — veuillez le réexaminer.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=treatment`,
        metadata: {
          treatmentPlanId: payload.treatmentPlanId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
        },
      });
    });
  }

  /**
   * Doctor approved (or rejected) the plan the admin had marked ready.
   * Fans out to the whole admin team so the next idle admin picks up
   * the case without polling — the message body carries the doctor's
   * name + order code so the bell row stands on its own. One handler
   * for both decisions because the message body is the only meaningful
   * difference; the type/title diverge to keep filters trivial.
   */
  @OnEvent(NotificationEvents.TreatmentPlanApproved, { async: true })
  async onTreatmentPlanApproved(
    payload: TreatmentPlanDecisionEvent,
  ): Promise<void> {
    await this.safe('treatmentPlan.approved', async () => {
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      await this.notifications.broadcastToAdmins({
        type: NotificationType.system_message,
        title: {
          en: 'Treatment plan approved by doctor',
          fr: 'Plan de traitement approuvé par le praticien',
        },
        message: byline.en
          ? {
              en: `${byline.en} — plan approved. Move the case forward.`,
              fr: `${byline.fr} — plan approuvé. Faites avancer le dossier.`,
            }
          : {
              en: 'A doctor approved their treatment plan.',
              fr: 'Un praticien a approuvé son plan de traitement.',
            },
        link: `/dashboard/orders/${payload.orderId}?tab=treatment`,
        metadata: {
          treatmentPlanId: payload.treatmentPlanId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          decision: 'approved',
        },
      });
    });
  }

  @OnEvent(NotificationEvents.TreatmentPlanRejected, { async: true })
  async onTreatmentPlanRejected(
    payload: TreatmentPlanDecisionEvent,
  ): Promise<void> {
    await this.safe('treatmentPlan.rejected', async () => {
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      await this.notifications.broadcastToAdmins({
        type: NotificationType.system_message,
        title: {
          en: 'Treatment plan rejected by doctor',
          fr: 'Plan de traitement rejeté par le praticien',
        },
        message: byline.en
          ? {
              en: `${byline.en} — plan rejected. Replan and resend.`,
              fr: `${byline.fr} — plan rejeté. À replanifier et renvoyer.`,
            }
          : {
              en: 'A doctor rejected their treatment plan — re-planning needed.',
              fr: 'Un praticien a rejeté son plan de traitement — replanification nécessaire.',
            },
        link: `/dashboard/orders/${payload.orderId}?tab=treatment`,
        metadata: {
          treatmentPlanId: payload.treatmentPlanId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          decision: 'rejected',
        },
      });
    });
  }

  // ─── Quotations ─────────────────────────────────────────────────────

  @OnEvent(NotificationEvents.QuotationSent, { async: true })
  async onQuotationSent(payload: QuotationEvent): Promise<void> {
    await this.safe('quotation.sent', async () => {
      // Compose: "Quotation Q-… for patient X (ORD-…) is ready for
      // your approval (Français)." Every piece is optional so legacy
      // events still produce a clean sentence.
      const headlineEn = payload.quotationNumber
        ? `Quotation ${payload.quotationNumber}`
        : 'A quotation';
      const headlineFr = payload.quotationNumber
        ? `Le devis ${payload.quotationNumber}`
        : 'Un devis';
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      const lang = languageLabel(payload.language ?? null);
      const langTailEn = lang ? ` — document in ${lang}` : '';
      const langTailFr = lang ? ` — document en ${lang}` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.quotation_sent,
        title: {
          en: 'New quotation received',
          fr: 'Nouveau devis reçu',
        },
        message: {
          en: `${headlineEn}${subjectEn}${code} is ready for your approval${langTailEn}.`,
          fr: `${headlineFr}${subjectFr}${code} est prêt pour votre approbation${langTailFr}.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          quotationId: payload.quotationId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          quotationNumber: payload.quotationNumber ?? null,
          language: payload.language ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.QuotationRecalled, { async: true })
  async onQuotationRecalled(payload: QuotationEvent): Promise<void> {
    await this.safe('quotation.recalled', async () => {
      // Distinct from `canceled` — recall implies "a corrected
      // version is coming." We want the doctor to NOT act on the
      // stale quote (approve/reject), but also not panic that the
      // case is gone.
      const headlineEn = payload.quotationNumber
        ? `Quotation ${payload.quotationNumber}`
        : 'A quotation';
      const headlineFr = payload.quotationNumber
        ? `Le devis ${payload.quotationNumber}`
        : 'Un devis';
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.quotation_recalled,
        title: {
          en: 'Quotation recalled for revision',
          fr: 'Devis rappelé pour révision',
        },
        message: {
          en: `${headlineEn}${subjectEn}${code} was recalled by the team for correction. A revised version will be sent shortly.`,
          fr: `${headlineFr}${subjectFr}${code} a été rappelé par l'équipe pour correction. Une version révisée vous sera envoyée prochainement.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          quotationId: payload.quotationId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          quotationNumber: payload.quotationNumber ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.QuotationCanceled, { async: true })
  async onQuotationCanceled(payload: QuotationEvent): Promise<void> {
    await this.safe('quotation.canceled', async () => {
      const headlineEn = payload.quotationNumber
        ? `Quotation ${payload.quotationNumber}`
        : 'A quotation';
      const headlineFr = payload.quotationNumber
        ? `Le devis ${payload.quotationNumber}`
        : 'Un devis';
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.quotation_canceled,
        title: {
          en: 'Quotation canceled',
          fr: 'Devis annulé',
        },
        message: {
          en: `${headlineEn}${subjectEn}${code} was canceled by the team.`,
          fr: `${headlineFr}${subjectFr}${code} a été annulé par l'équipe.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          quotationId: payload.quotationId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          quotationNumber: payload.quotationNumber ?? null,
        },
      });
    });
  }

  // ─── Payments ───────────────────────────────────────────────────────

  @OnEvent(NotificationEvents.PaymentReceived, { async: true })
  async onPaymentReceived(payload: PaymentEvent): Promise<void> {
    await this.safe('payment.received', async () => {
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      const tailEn = payload.installmentNumber
        ? ` for installment #${payload.installmentNumber}`
        : '';
      const tailFr = payload.installmentNumber
        ? ` pour l'échéance n°${payload.installmentNumber}`
        : '';
      await this.notifications.broadcastToAdmins({
        type: NotificationType.payment_received,
        title: {
          en: 'New card payment',
          fr: 'Nouveau paiement par carte',
        },
        message: byline.en
          ? {
              en: `${byline.en} — ${payload.amount} ${payload.currency} received by card${tailEn}.`,
              fr: `${byline.fr} — ${payload.amount} ${payload.currency} reçus par carte${tailFr}.`,
            }
          : {
              en: `${payload.amount} ${payload.currency} received via card${tailEn}.`,
              fr: `${payload.amount} ${payload.currency} reçus par carte${tailFr}.`,
            },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          paymentId: payload.paymentId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          installmentNumber: payload.installmentNumber ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.PaymentDeclared, { async: true })
  async onPaymentDeclared(payload: PaymentEvent): Promise<void> {
    await this.safe('payment.declared', async () => {
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      const tailEn = payload.installmentNumber
        ? ` (installment #${payload.installmentNumber})`
        : '';
      const tailFr = payload.installmentNumber
        ? ` (échéance n°${payload.installmentNumber})`
        : '';
      await this.notifications.broadcastToAdmins({
        type: NotificationType.payment_declared,
        title: {
          en: 'Bank transfer awaiting confirmation',
          fr: 'Virement bancaire en attente de confirmation',
        },
        message: byline.en
          ? {
              en: `${byline.en} — ${payload.amount} ${payload.currency} declared${tailEn}. Verify the proof.`,
              fr: `${byline.fr} — ${payload.amount} ${payload.currency} déclarés${tailFr}. Vérifiez le justificatif.`,
            }
          : {
              en: `${payload.amount} ${payload.currency} declared by the doctor${tailEn} — please verify the proof.`,
              fr: `${payload.amount} ${payload.currency} déclarés par le praticien${tailFr} — veuillez vérifier le justificatif.`,
            },
        link: `/dashboard/payments/pending`,
        metadata: {
          paymentId: payload.paymentId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          installmentNumber: payload.installmentNumber ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.PaymentConfirmed, { async: true })
  async onPaymentConfirmed(payload: PaymentEvent): Promise<void> {
    await this.safe('payment.confirmed', async () => {
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      const installmentEn = payload.installmentNumber
        ? ` — installment #${payload.installmentNumber} is now paid`
        : '';
      const installmentFr = payload.installmentNumber
        ? ` — l'échéance n°${payload.installmentNumber} est désormais payée`
        : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.payment_confirmed,
        title: {
          en: 'Payment confirmed',
          fr: 'Paiement confirmé',
        },
        message: {
          en: `${payload.amount} ${payload.currency}${subjectEn}${code} has been confirmed${installmentEn}.`,
          fr: `${payload.amount} ${payload.currency}${subjectFr}${code} ont été confirmés${installmentFr}.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          paymentId: payload.paymentId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          installmentNumber: payload.installmentNumber ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.PaymentRejected, { async: true })
  async onPaymentRejected(payload: PaymentEvent): Promise<void> {
    await this.safe('payment.rejected', async () => {
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      const installmentEn = payload.installmentNumber
        ? ` (installment #${payload.installmentNumber})`
        : '';
      const installmentFr = payload.installmentNumber
        ? ` (échéance n°${payload.installmentNumber})`
        : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.payment_rejected,
        title: {
          en: 'Bank transfer rejected',
          fr: 'Virement bancaire rejeté',
        },
        message: {
          en: `Your bank-transfer proof for ${payload.amount} ${payload.currency}${subjectEn}${code}${installmentEn} was rejected. Please review and submit again.`,
          fr: `Votre justificatif de virement de ${payload.amount} ${payload.currency}${subjectFr}${code}${installmentFr} a été rejeté. Veuillez le vérifier et le soumettre à nouveau.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          paymentId: payload.paymentId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          installmentNumber: payload.installmentNumber ?? null,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.CashPaymentRecorded, { async: true })
  async onCashPaymentRecorded(payload: PaymentEvent): Promise<void> {
    await this.safe('payment.cashRecorded', async () => {
      // Both audiences care: admin colleagues should see that a peer
      // already booked the cash; the doctor sees it as a confirmation.
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      const installmentTailEn = payload.installmentNumber
        ? ` — installment #${payload.installmentNumber}`
        : '';
      const installmentTailFr = payload.installmentNumber
        ? ` — échéance n°${payload.installmentNumber}`
        : '';
      await Promise.all([
        this.notifications.broadcastToAdmins({
          type: NotificationType.cash_payment_recorded,
          title: {
            en: 'Cash payment recorded',
            fr: 'Paiement en espèces enregistré',
          },
          message: byline.en
            ? {
                en: `${byline.en} — ${payload.amount} ${payload.currency} cash recorded${installmentTailEn}.`,
                fr: `${byline.fr} — ${payload.amount} ${payload.currency} en espèces enregistrés${installmentTailFr}.`,
              }
            : {
                en: `${payload.amount} ${payload.currency} cash recorded${installmentTailEn}.`,
                fr: `${payload.amount} ${payload.currency} en espèces enregistrés${installmentTailFr}.`,
              },
          link: `/dashboard/orders/${payload.orderId}?tab=quote`,
          metadata: {
            paymentId: payload.paymentId,
            orderId: payload.orderId,
            orderCode: payload.orderCode ?? null,
            doctorId: payload.doctorId,
            doctorName: payload.doctorName ?? null,
            patientName: payload.patientName ?? null,
            installmentNumber: payload.installmentNumber ?? null,
          },
        }),
        this.notifications.create({
          recipientId: payload.doctorId,
          type: NotificationType.payment_confirmed,
          title: {
            en: 'Cash payment confirmed',
            fr: 'Paiement en espèces confirmé',
          },
          message: {
            en: `${payload.amount} ${payload.currency} cash${subjectEn}${code} has been recorded by the team${installmentTailEn}.`,
            fr: `${payload.amount} ${payload.currency} en espèces${subjectFr}${code} ont été enregistrés par l'équipe${installmentTailFr}.`,
          },
          link: `/dashboard/orders/${payload.orderId}?tab=quote`,
          metadata: {
            paymentId: payload.paymentId,
            orderId: payload.orderId,
            orderCode: payload.orderCode ?? null,
            patientName: payload.patientName ?? null,
            installmentNumber: payload.installmentNumber ?? null,
          },
        }),
      ]);
    });
  }

  // ─── Treatment fee (order-level professional fee) ───────────────────

  @OnEvent(NotificationEvents.TreatmentFeeDeclared, { async: true })
  async onTreatmentFeeDeclared(
    payload: TreatmentFeeEvent,
  ): Promise<void> {
    await this.safe('treatmentFee.declared', async () => {
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      await this.notifications.broadcastToAdmins({
        type: NotificationType.treatment_fee_declared,
        title: {
          en: 'Treatment-fee bank transfer awaiting confirmation',
          fr: 'Virement des honoraires de traitement en attente de confirmation',
        },
        message: byline.en
          ? {
              en: `${byline.en} — ${payload.amount} ${payload.currency} treatment-fee receipt uploaded. Verify and confirm.`,
              fr: `${byline.fr} — reçu des honoraires de traitement de ${payload.amount} ${payload.currency} téléversé. Vérifiez et confirmez.`,
            }
          : {
              en: `${payload.amount} ${payload.currency} treatment-fee receipt uploaded by the doctor — please verify the proof.`,
              fr: `Reçu des honoraires de traitement de ${payload.amount} ${payload.currency} téléversé par le praticien — veuillez vérifier le justificatif.`,
            },
        link: `/dashboard/payments/pending`,
        metadata: {
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          amount: payload.amount,
          currency: payload.currency,
          method: payload.method,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.TreatmentFeePaid, { async: true })
  async onTreatmentFeePaid(payload: TreatmentFeeEvent): Promise<void> {
    await this.safe('treatmentFee.paid', async () => {
      // Card / cash → instant success. Admin team gets the audit ping
      // so it shows up in the bell + history. We DO NOT ping the
      // doctor here — they performed the action themselves and saw
      // the success state in the dialog.
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      const methodLabelEn =
        payload.method === 'card'
          ? 'card'
          : payload.method === 'cash'
            ? 'cash'
            : 'bank transfer';
      const methodLabelFr =
        payload.method === 'card'
          ? 'par carte'
          : payload.method === 'cash'
            ? 'en espèces'
            : 'par virement bancaire';
      await this.notifications.broadcastToAdmins({
        type: NotificationType.treatment_fee_paid,
        title: {
          en: 'Treatment fee paid',
          fr: 'Honoraires de traitement payés',
        },
        message: byline.en
          ? {
              en: `${byline.en} — ${payload.amount} ${payload.currency} treatment fee paid by ${methodLabelEn}.`,
              fr: `${byline.fr} — honoraires de traitement de ${payload.amount} ${payload.currency} payés ${methodLabelFr}.`,
            }
          : {
              en: `${payload.amount} ${payload.currency} treatment fee paid by ${methodLabelEn}.`,
              fr: `Honoraires de traitement de ${payload.amount} ${payload.currency} payés ${methodLabelFr}.`,
            },
        link: `/dashboard/orders/${payload.orderId}`,
        metadata: {
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          amount: payload.amount,
          currency: payload.currency,
          method: payload.method,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.TreatmentFeeConfirmed, { async: true })
  async onTreatmentFeeConfirmed(
    payload: TreatmentFeeEvent,
  ): Promise<void> {
    await this.safe('treatmentFee.confirmed', async () => {
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.treatment_fee_confirmed,
        title: {
          en: 'Treatment fee confirmed',
          fr: 'Honoraires de traitement confirmés',
        },
        message: {
          en: `Your ${payload.amount} ${payload.currency} treatment fee${subjectEn}${code} has been confirmed — the treatment plan can now be prepared.`,
          fr: `Vos honoraires de traitement de ${payload.amount} ${payload.currency}${subjectFr}${code} ont été confirmés — le plan de traitement peut maintenant être préparé.`,
        },
        link: `/dashboard/orders/${payload.orderId}`,
        metadata: {
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          amount: payload.amount,
          currency: payload.currency,
          method: payload.method,
        },
      });
    });
  }

  // ─── Step batches ───────────────────────────────────────────────────

  @OnEvent(NotificationEvents.BatchUnlocked, { async: true })
  async onBatchUnlocked(payload: BatchEvent): Promise<void> {
    await this.safe('batch.unlocked', async () => {
      // Admins get the actionable item (they need to deliver). The
      // doctor already saw the payment confirmation a beat earlier,
      // so we skip them here to avoid double-pinging.
      const byline = adminByline({
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        orderCode: payload.orderCode,
      });
      const headEn = byline.en ? `${byline.en} — ` : '';
      const headFr = byline.fr ? `${byline.fr} — ` : '';
      await this.notifications.broadcastToAdmins({
        type: NotificationType.batch_unlocked,
        title: {
          en: 'Step batch unlocked',
          fr: "Lot d'étapes débloqué",
        },
        message: {
          en: `${headEn}steps ${payload.fromStep}–${payload.toStep} are ready to deliver.`,
          fr: `${headFr}les étapes ${payload.fromStep}–${payload.toStep} sont prêtes à livrer.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          batchId: payload.batchId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          doctorId: payload.doctorId,
          doctorName: payload.doctorName ?? null,
          patientName: payload.patientName ?? null,
          fromStep: payload.fromStep,
          toStep: payload.toStep,
        },
      });
    });
  }

  @OnEvent(NotificationEvents.BatchDelivered, { async: true })
  async onBatchDelivered(payload: BatchEvent): Promise<void> {
    await this.safe('batch.delivered', async () => {
      const subjectEn = payload.patientName
        ? ` for patient ${payload.patientName}`
        : '';
      const subjectFr = payload.patientName
        ? ` pour le patient ${payload.patientName}`
        : '';
      const code = payload.orderCode ? ` (${payload.orderCode})` : '';
      await this.notifications.create({
        recipientId: payload.doctorId,
        type: NotificationType.batch_delivered,
        title: {
          en: 'Steps delivered',
          fr: 'Étapes livrées',
        },
        message: {
          en: `Steps ${payload.fromStep}–${payload.toStep}${subjectEn}${code} have been marked delivered by the team.`,
          fr: `Les étapes ${payload.fromStep}–${payload.toStep}${subjectFr}${code} ont été marquées comme livrées par l'équipe.`,
        },
        link: `/dashboard/orders/${payload.orderId}?tab=quote`,
        metadata: {
          batchId: payload.batchId,
          orderId: payload.orderId,
          orderCode: payload.orderCode ?? null,
          patientName: payload.patientName ?? null,
          fromStep: payload.fromStep,
          toStep: payload.toStep,
        },
      });
    });
  }

  // ─── Safety wrapper ─────────────────────────────────────────────────

  /**
   * All handlers run under this so a Prisma hiccup, a missing user,
   * or any other exception NEVER unwinds the listener execution and
   * never bubbles back up to the emitting service. We log and move on
   * — the business write is already committed.
   */
  private async safe(
    eventName: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        `Notification handler failed for ${eventName}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
