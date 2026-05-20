import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

/**
 * High-level orchestrator that translates order-lifecycle events into
 * the right set of emails sent to the right set of recipients.
 *
 * Why a dedicated service instead of MailService calls directly in
 * OrderService / TreatmentPlanService / QuotationService:
 *   1. The recipient list ("all active admins") is shared across every
 *      lifecycle hook. Centralising it here means one query, one place
 *      to add filters (e.g. notification-preference rows later).
 *   2. Each lifecycle service stays focused on its domain — they only
 *      need to know "notify this event", not the full template / URL
 *      / fan-out story.
 *   3. Every mail call is fire-and-forget at this layer — a flaky SMTP
 *      relay should NEVER break an order submission or a doctor's plan
 *      approval. Failures are logged at warn level so the operator can
 *      investigate without affecting the user-facing operation.
 *
 * The frontend dashboard URL is built from `FRONTEND_URL`. Mail clients
 * deep-link to the order detail page; doctors land on their own view
 * and admins on the admin view, both gated by the existing JwtAuthGuard.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Doctor submitted a new order → email the doctor + all admins. */
  async notifyOrderSubmitted(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.dentalOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderCode: true,
          doctor: { select: { fullName: true, email: true } },
          patient: { select: { fullName: true } },
        },
      });
      if (!order) return;

      const dashboardUrl = this.dashboardOrderUrl(order.id);
      const doctorName = order.doctor.fullName;
      const patientName = order.patient.fullName;

      // Email doctor — they want a paper trail of what they submitted.
      void this.safeSend(() =>
        this.mail.sendNewOrderForDoctorEmail({
          to: order.doctor.email,
          doctorName,
          orderCode: order.orderCode,
          patientName,
          dashboardUrl,
        }),
      );

      // Email every active admin so the team picks it up.
      const admins = await this.findAdmins();
      for (const admin of admins) {
        void this.safeSend(() =>
          this.mail.sendNewOrderForAdminEmail({
            to: admin.email,
            adminName: admin.fullName,
            orderCode: order.orderCode,
            doctorName,
            patientName,
            dashboardUrl,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `notifyOrderSubmitted(${orderId}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Treatment plan transitioned PENDING → READY → email the doctor. */
  async notifyTreatmentReady(treatmentPlanId: string): Promise<void> {
    try {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: treatmentPlanId },
        select: {
          id: true,
          name: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              doctor: { select: { fullName: true, email: true } },
            },
          },
        },
      });
      if (!plan) return;

      void this.safeSend(() =>
        this.mail.sendTreatmentReadyForDoctorEmail({
          to: plan.order.doctor.email,
          doctorName: plan.order.doctor.fullName,
          orderCode: plan.order.orderCode,
          planName: plan.name,
          dashboardUrl: this.dashboardOrderUrl(plan.order.id),
        }),
      );
    } catch (err) {
      this.logger.warn(
        `notifyTreatmentReady(${treatmentPlanId}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Doctor approved or rejected a treatment plan → email all admins. */
  async notifyTreatmentDecision(
    treatmentPlanId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    try {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: treatmentPlanId },
        select: {
          id: true,
          name: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              doctor: { select: { fullName: true } },
            },
          },
        },
      });
      if (!plan) return;

      const dashboardUrl = this.dashboardOrderUrl(plan.order.id);
      const doctorName = plan.order.doctor.fullName;
      const admins = await this.findAdmins();
      for (const admin of admins) {
        void this.safeSend(() =>
          this.mail.sendTreatmentDecisionForAdminEmail({
            to: admin.email,
            adminName: admin.fullName,
            orderCode: plan.order.orderCode,
            doctorName,
            planName: plan.name,
            decision,
            reason,
            dashboardUrl,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `notifyTreatmentDecision(${treatmentPlanId}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Admin sent a quotation → email the doctor. */
  async notifyQuoteSent(quotationId: string): Promise<void> {
    try {
      const quote = await this.prisma.quotation.findUnique({
        where: { id: quotationId },
        select: {
          id: true,
          quotationNumber: true,
          totalTtc: true,
          currency: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              doctor: { select: { fullName: true, email: true } },
            },
          },
        },
      });
      if (!quote || !quote.quotationNumber) return;

      void this.safeSend(() =>
        this.mail.sendQuoteSentForDoctorEmail({
          to: quote.order.doctor.email,
          doctorName: quote.order.doctor.fullName,
          orderCode: quote.order.orderCode,
          quotationNumber: quote.quotationNumber!,
          totalTtc: Number(quote.totalTtc ?? 0),
          currency: quote.currency,
          dashboardUrl: this.dashboardOrderUrl(quote.order.id),
        }),
      );
    } catch (err) {
      this.logger.warn(
        `notifyQuoteSent(${quotationId}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Doctor approved or rejected a quotation → email all admins. */
  async notifyQuoteDecision(
    quotationId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    try {
      const quote = await this.prisma.quotation.findUnique({
        where: { id: quotationId },
        select: {
          id: true,
          quotationNumber: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              doctor: { select: { fullName: true } },
            },
          },
        },
      });
      if (!quote || !quote.quotationNumber) return;

      const dashboardUrl = this.dashboardOrderUrl(quote.order.id);
      const doctorName = quote.order.doctor.fullName;
      const admins = await this.findAdmins();
      for (const admin of admins) {
        void this.safeSend(() =>
          this.mail.sendQuoteDecisionForAdminEmail({
            to: admin.email,
            adminName: admin.fullName,
            orderCode: quote.order.orderCode,
            doctorName,
            quotationNumber: quote.quotationNumber!,
            decision,
            reason,
            dashboardUrl,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `notifyQuoteDecision(${quotationId}) failed: ${(err as Error).message}`,
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Active (non-soft-deleted) admin / super_admin users. */
  private async findAdmins(): Promise<
    Array<{ fullName: string; email: string }>
  > {
    return this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.admin, UserRole.super_admin] },
        deletedAt: null,
        isActive: true,
      },
      select: { fullName: true, email: true },
    });
  }

  private dashboardOrderUrl(orderId: string): string {
    const base = (process.env.FRONTEND_URL ?? 'https://oralign.com.tn').replace(
      /\/$/,
      '',
    );
    return `${base}/dashboard/orders/${orderId}`;
  }

  /**
   * Wrap a single send in a promise-safe try/catch so callers can
   * `void this.safeSend(…)` and never crash the lifecycle action.
   */
  private async safeSend(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Order-lifecycle email failed: ${(err as Error).message}`,
      );
    }
  }
}
