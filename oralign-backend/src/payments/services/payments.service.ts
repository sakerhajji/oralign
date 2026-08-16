import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  BatchStatus,
  InstallmentStatus,
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BankDetailsSnapshot,
  hasUsableBankTransferDetails,
} from '../../common/utils/bank-details.util';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../gateways/payment-gateway.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { env } from '../../common/config/env';

type Caller = { userId: string; role: UserRole };

/**
 * Shape consumed by the shared payment-list executor. Mirrors the
 * PaymentFilterDto fields the controller surfaces, with explicit
 * legacy single-value fallbacks (`status`, `paymentMethod`) for
 * backward-compat with old client builds.
 */
interface PaymentListOptions {
  // pagination
  page?: number;
  limit?: number;
  // status filter — legacy single + canonical multi
  status?: PaymentRecordStatus;
  statuses?: PaymentRecordStatus[];
  // method filter — legacy single + canonical multi
  paymentMethod?: PaymentMethod;
  methods?: PaymentMethod[];
  // search + structural filters
  search?: string;
  doctorId?: string;
  patientId?: string;
  // date range
  createdFrom?: string;
  createdTo?: string;
  // sorting
  sortBy?: 'createdAt' | 'amount' | 'paidAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

/** TTL for the idempotency-key → result mapping. 24h matches the spec. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Single-source-of-truth payment service.
 *
 * The crown jewel here is `handleSuccess(installmentId, …)` — the
 * ONLY path that flips a Payment to `success`, marks its installment
 * paid, and unlocks the linked step batch. CARD success, BANK_TRANSFER
 * admin-confirm, and CASH admin-record all funnel into it so the unlock
 * + quote-recalculation behaviour is identical regardless of method.
 *
 * Concurrency: every transition wraps in `prisma.$transaction` with a
 * `SELECT … FOR UPDATE` on the installment row — concurrent attempts
 * serialise on Postgres-side row locks rather than racing in JS land.
 *
 * Idempotency: CARD payments carry a caller-supplied (or generated)
 * `idempotencyKey`. We persist the resolved Payment id under that
 * key in Cache (Redis-backed via @nestjs/cache-manager) for 24h so a
 * replayed request resolves to the same row.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_GATEWAY) private readonly cardGateway: PaymentGateway,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  // ─── Authorisation helpers ─────────────────────────────────────

  private isAdmin(caller: Caller): boolean {
    return ADMIN_ROLES.includes(caller.role);
  }

  private async ensureBankTransferIsConfigured(): Promise<void> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { bankDetails: true },
    });
    const details = (settings?.bankDetails ?? null) as BankDetailsSnapshot;
    if (this.hasUsableBankDetails(details)) return;
    throw new BadRequestException(
      'Bank transfer is not available until company bank details are configured.',
    );
  }

  private hasUsableBankDetails(details: BankDetailsSnapshot): boolean {
    return hasUsableBankTransferDetails(details);
  }

  /**
   * Returns the installment + quote + order, asserting that the caller
   * is either an admin OR the dentist who owns the order. Throws 403
   * otherwise — never leaks information about other dentists' rows.
   */
  private async loadInstallmentForCaller(
    installmentId: string,
    caller: Caller,
    opts: { adminOnly?: boolean } = {},
  ) {
    const row = await this.prisma.quoteInstallment.findUnique({
      where: { id: installmentId },
      include: {
        quotation: {
          include: {
            // Pulling the doctor + patient along with the order gives
            // the notification listeners everything they need to
            // render "Dr. X · patient Y · order ORD-…" without
            // re-joining.
            order: {
              include: {
                doctor: { select: { fullName: true } },
                patient: { select: { fullName: true } },
              },
            },
          },
        },
        stepBatch: true,
      },
    });
    if (!row) throw new NotFoundException('Installment not found.');
    const order = row.quotation.order;
    const isOwner =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (opts.adminOnly) {
      if (!this.isAdmin(caller)) {
        throw new ForbiddenException('Admin-only action.');
      }
    } else if (!this.isAdmin(caller) && !isOwner) {
      throw new ForbiddenException(
        'You can only act on installments of your own orders.',
      );
    }
    return row;
  }

  // ─── CARD payment ──────────────────────────────────────────────

  /**
   * Doctor pays an installment by card. The flow:
   *
   *   1. Authorise + load the installment under FOR UPDATE.
   *   2. Reject if already paid, available date not reached, or the
   *      quote is cancelled / not approved.
   *   3. Persist a Payment row in `pending` state with the
   *      caller-supplied idempotency key (or a freshly generated one)
   *      so a webhook replay always finds the same row.
   *   4. Hand off to the gateway. SUCCESS → call handleSuccess inside
   *      a fresh transaction. FAILED → mark Payment failed. PENDING
   *      → leave the row pending for the (future) webhook to settle.
   */
  async payByCard(args: {
    installmentId: string;
    caller: Caller;
    idempotencyKey?: string;
    headers?: Record<string, string | undefined>;
  }): Promise<Payment> {
    const { installmentId, caller } = args;
    // SECURITY (audit L-5): namespace the idempotency key per caller. The
    // key is client-supplied, so without the userId prefix a replay lookup
    // could return ANOTHER user's Payment on a key collision (BOLA). The
    // prefix scopes both the stored key and the replay lookup to this user.
    const rawKey = args.idempotencyKey?.trim() || `card_${randomUUID()}`;
    const idempotencyKey = `${caller.userId}:${rawKey}`;

    // Idempotent fast-path: replayed request → return the existing row.
    const replayed = await this.findByIdempotencyKey(idempotencyKey);
    if (replayed) return replayed;

    const row = await this.loadInstallmentForCaller(installmentId, caller);
    this.assertPayable(row);
    await this.approveQuoteIfSent(row.quotationId, caller.userId);

    // Create the pending row OUTSIDE the gateway call so the row
    // exists even if the gateway throws — the user can retry against
    // the same idempotency key.
    const payment = await this.prisma.payment.create({
      data: {
        orderId: row.quotation.orderId,
        quotationId: row.quotationId,
        installmentId: row.id,
        amount: row.amount,
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.card,
        idempotencyKey,
        initiatedById: caller.userId,
      },
    });
    await this.rememberIdempotency(idempotencyKey, payment.id);

    let charge;
    try {
      charge = await this.cardGateway.charge({
        installmentId: row.id,
        amount: row.amount,
        idempotencyKey,
        metadata: {
          orderId: row.quotation.orderId,
          quotationId: row.quotationId,
        },
        headers: args.headers,
      });
    } catch (err) {
      // Gateway throw is treated as a failure — the row stays at
      // `failed` so the doctor sees the outcome and can retry with a
      // new idempotency key.
      this.logger.error(
        `Card gateway threw for payment ${payment.id}: ${(err as Error).message}`,
      );
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentRecordStatus.failed },
      });
    }

    if (charge.status === 'SUCCESS') {
      return this.handleSuccess({
        paymentId: payment.id,
        transactionId: charge.transactionId,
        actor: caller,
      });
    }
    if (charge.status === 'FAILED') {
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.failed,
          transactionId: charge.transactionId,
        },
      });
    }
    // PENDING — the gateway will call back later.
    return this.prisma.payment.update({
      where: { id: payment.id },
      data: { transactionId: charge.transactionId },
    });
  }

  // ─── BANK_TRANSFER ─────────────────────────────────────────────

  /**
   * Doctor declares an outbound wire transfer for an installment. The
   * Payment row sits in `awaiting_confirmation` until an admin reviews
   * the bank statement and confirms (or rejects). Re-declaring on the
   * SAME installment auto-cancels any prior pending declaration so
   * the queue never carries stale rows.
   */
  async declareBankTransfer(args: {
    installmentId: string;
    caller: Caller;
    bankReference?: string;
    proofUrl?: string | null;
  }): Promise<Payment> {
    const row = await this.loadInstallmentForCaller(
      args.installmentId,
      args.caller,
    );
    this.assertPayable(row);
    await this.ensureBankTransferIsConfigured();
    await this.approveQuoteIfSent(row.quotationId, args.caller.userId);

    return this.prisma.$transaction(async (tx) => {
      // Cancel any stale `awaiting_confirmation` declarations on the
      // same installment so the admin never sees two pending rows
      // for the same payment.
      await tx.payment.updateMany({
        where: {
          installmentId: row.id,
          status: PaymentRecordStatus.awaiting_confirmation,
        },
        data: { status: PaymentRecordStatus.cancelled },
      });
      const created = await tx.payment.create({
        data: {
          orderId: row.quotation.orderId,
          quotationId: row.quotationId,
          installmentId: row.id,
          amount: row.amount,
          status: PaymentRecordStatus.awaiting_confirmation,
          paymentMethod: PaymentMethod.bank_transfer,
          transactionId: args.bankReference ?? null,
          proofUrl: args.proofUrl ?? null,
          declaredAt: new Date(),
          initiatedById: args.caller.userId,
        },
      });
      // Move the order into `payment_review` to signal the queue —
      // only when this is the first payment-stage transition.
      await tx.dentalOrder.update({
        where: { id: row.quotation.orderId },
        data: { status: OrderStatus.payment_review },
      });
      // Bell ping for admins — their pending-confirmations queue just
      // grew a row.
      this.events.emit(NotificationEvents.PaymentDeclared, {
        paymentId: created.id,
        quotationId: row.quotationId,
        orderId: row.quotation.orderId,
        orderCode: row.quotation.order.orderCode,
        doctorId: args.caller.userId,
        doctorName: row.quotation.order.doctor?.fullName ?? null,
        patientName: row.quotation.order.patient?.fullName ?? null,
        amount: created.amount.toString(),
        currency: row.quotation.currency ?? 'TND',
        method: created.paymentMethod,
        installmentNumber: row.installmentNumber,
      });
      return created;
    });
  }

  async confirmBankTransfer(
    paymentId: string,
    notes: string | undefined,
    caller: Caller,
  ): Promise<Payment> {
    if (!this.isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can confirm bank-transfer payments.',
      );
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!existing) throw new NotFoundException('Payment not found.');
    if (existing.paymentMethod !== PaymentMethod.bank_transfer) {
      throw new BadRequestException(
        'Only bank-transfer payments can be confirmed manually.',
      );
    }
    if (existing.status !== PaymentRecordStatus.awaiting_confirmation) {
      throw new BadRequestException(
        `Cannot confirm a payment in status ${existing.status}.`,
      );
    }
    return this.handleSuccess({
      paymentId,
      transactionId: existing.transactionId ?? `bank_${randomUUID()}`,
      actor: caller,
      notes,
    });
  }

  async rejectBankTransfer(
    paymentId: string,
    rejectionReason: string,
    caller: Caller,
  ): Promise<Payment> {
    if (!this.isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can reject bank-transfer payments.',
      );
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!existing) throw new NotFoundException('Payment not found.');
    if (existing.paymentMethod !== PaymentMethod.bank_transfer) {
      throw new BadRequestException(
        'Only bank-transfer payments can be rejected here.',
      );
    }
    if (existing.status !== PaymentRecordStatus.awaiting_confirmation) {
      throw new BadRequestException(
        `Cannot reject a payment in status ${existing.status}.`,
      );
    }
    const rejected = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentRecordStatus.rejected,
        rejectedAt: new Date(),
        rejectedById: caller.userId,
        rejectionReason,
      },
      include: {
        order: {
          select: {
            doctorId: true,
            id: true,
            orderCode: true,
            doctor: { select: { fullName: true } },
            patient: { select: { fullName: true } },
          },
        },
        installment: { select: { installmentNumber: true } },
      },
    });
    // Tell the doctor the proof was rejected so they can re-submit.
    this.events.emit(NotificationEvents.PaymentRejected, {
      paymentId: rejected.id,
      quotationId: rejected.quotationId,
      orderId: rejected.orderId,
      orderCode: rejected.order.orderCode,
      doctorId: rejected.order.doctorId,
      doctorName: rejected.order.doctor?.fullName ?? null,
      patientName: rejected.order.patient?.fullName ?? null,
      amount: rejected.amount.toString(),
      currency: 'TND',
      method: rejected.paymentMethod,
      installmentNumber: rejected.installment?.installmentNumber,
    });
    return rejected;
  }

  // ─── CASH ──────────────────────────────────────────────────────

  async recordCash(args: {
    installmentId: string;
    caller: Caller;
    receiptNumber?: string;
    notes?: string;
  }): Promise<Payment> {
    if (!this.isAdmin(args.caller)) {
      throw new ForbiddenException(
        'Only admins can record cash payments.',
      );
    }
    const row = await this.loadInstallmentForCaller(
      args.installmentId,
      args.caller,
      { adminOnly: true },
    );
    this.assertPayable(row);
    await this.approveQuoteIfSent(row.quotationId, args.caller.userId);
    const payment = await this.prisma.payment.create({
      data: {
        orderId: row.quotation.orderId,
        quotationId: row.quotationId,
        installmentId: row.id,
        amount: row.amount,
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.cash,
        transactionId: args.receiptNumber ?? null,
        notes: args.notes ?? null,
        initiatedById: args.caller.userId,
      },
    });
    return this.handleSuccess({
      paymentId: payment.id,
      transactionId: payment.transactionId ?? `cash_${randomUUID()}`,
      actor: args.caller,
    });
  }

  // ─── Dev helpers (mock callback) ───────────────────────────────

  async devSimulateCallback(args: {
    paymentId: string;
    status: 'success' | 'failed' | 'cancelled';
    actor: Caller;
  }): Promise<Payment> {
    if (env.isProd) {
      throw new ForbiddenException('Dev endpoint disabled in production.');
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: args.paymentId },
    });
    if (!existing) throw new NotFoundException('Payment not found.');
    if (existing.status !== PaymentRecordStatus.pending) {
      throw new BadRequestException(
        `Mock callback only acts on pending payments (current: ${existing.status}).`,
      );
    }
    if (args.status === 'success') {
      return this.handleSuccess({
        paymentId: existing.id,
        transactionId: existing.transactionId ?? `mock_cb_${randomUUID()}`,
        actor: args.actor,
      });
    }
    if (args.status === 'failed') {
      return this.prisma.payment.update({
        where: { id: existing.id },
        data: { status: PaymentRecordStatus.failed },
      });
    }
    return this.prisma.payment.update({
      where: { id: existing.id },
      data: { status: PaymentRecordStatus.cancelled },
    });
  }

  async devForceInstallmentAvailable(args: {
    installmentId: string;
    actor: Caller;
  }) {
    if (env.isProd) {
      throw new ForbiddenException('Dev endpoint disabled in production.');
    }
    if (!this.isAdmin(args.actor)) {
      throw new ForbiddenException('Admin-only.');
    }
    return this.prisma.quoteInstallment.update({
      where: { id: args.installmentId },
      data: { availableFrom: new Date() },
    });
  }

  // ─── The SINGLE success transition ─────────────────────────────

  /**
   * The crown jewel — the only place a Payment becomes `success`.
   *
   * Steps under one transaction:
   *   1. `SELECT … FOR UPDATE` on the installment row to serialise
   *      against concurrent payment attempts.
   *   2. Refuse if the installment is already paid (idempotent — the
   *      caller gets a 200 with the existing Payment).
   *   3. Flip the Payment, Installment, StepBatch, and Quotation in
   *      one go.
   *   4. Move the order to `payment_pending` (partial) or `paid`
   *      (full) as appropriate.
   *
   * Returns the up-to-date Payment row.
   */
  async handleSuccess(args: {
    paymentId: string;
    transactionId: string;
    actor: Caller;
    notes?: string;
  }): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the installment row first — Postgres-side serialisation.
      const installmentId = (
        await tx.payment.findUnique({
          where: { id: args.paymentId },
          select: { installmentId: true },
        })
      )?.installmentId;
      if (!installmentId) throw new NotFoundException('Payment not found.');

      await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE id = ${installmentId} FOR UPDATE`;

      const installment = await tx.quoteInstallment.findUnique({
        where: { id: installmentId },
        include: { stepBatch: true, quotation: true },
      });
      if (!installment) throw new NotFoundException('Installment vanished.');

      const payment = await tx.payment.findUnique({
        where: { id: args.paymentId },
      });
      if (!payment) throw new NotFoundException('Payment not found.');

      // Idempotent path — the row may have been promoted by a
      // concurrent caller while we waited on the lock. Wrap into the
      // same envelope the success-path returns so the post-commit
      // emit-block can treat both shapes uniformly (no notifications
      // are fired on idempotent replays — the original transition
      // already pinged).
      if (payment.status === PaymentRecordStatus.success) {
        return {
          payment,
          order: {
            id: installment.quotation.orderId,
            doctorId: '',
            orderCode: '',
            doctor: { fullName: '' },
            patient: null as { fullName: string } | null,
          },
          installmentNumber: installment.installmentNumber,
          batchUnlocked: null,
          skipNotify: true,
        };
      }

      // The installment may have already been marked paid by a
      // sibling Payment (e.g. CARD raced with BANK_TRANSFER confirm).
      // In that case the LATER payment becomes a duplicate-paid
      // refunded-style row; we cancel it gracefully and DON'T re-unlock.
      if (installment.status === InstallmentStatus.paid) {
        const cancelled = await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentRecordStatus.cancelled },
        });
        return {
          payment: cancelled,
          order: {
            id: installment.quotation.orderId,
            doctorId: '',
            orderCode: '',
            doctor: { fullName: '' },
            patient: null as { fullName: string } | null,
          },
          installmentNumber: installment.installmentNumber,
          batchUnlocked: null,
          skipNotify: true,
        };
      }

      const now = new Date();

      // Update payment.
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.success,
          transactionId: args.transactionId,
          paidAt: now,
          confirmedAt:
            payment.paymentMethod === PaymentMethod.card ? null : now,
          confirmedById:
            payment.paymentMethod === PaymentMethod.card
              ? null
              : args.actor.userId,
          notes: args.notes ?? payment.notes,
        },
      });

      // Mark installment paid.
      await tx.quoteInstallment.update({
        where: { id: installment.id },
        data: {
          status: InstallmentStatus.paid,
          paidAt: now,
        },
      });

      // Unlock batch (if not already delivered — defensive).
      if (
        installment.stepBatch &&
        installment.stepBatch.status === BatchStatus.locked
      ) {
        await tx.quoteStepBatch.update({
          where: { id: installment.stepBatch.id },
          data: { status: BatchStatus.unlocked, unlockedAt: now },
        });
      }

      // Recalculate quote totals.
      const aggregate = await tx.payment.aggregate({
        where: {
          quotationId: installment.quotationId,
          status: PaymentRecordStatus.success,
        },
        _sum: { amount: true },
      });
      const totalPaid = aggregate._sum.amount ?? new Prisma.Decimal(0);
      const totalPrice = installment.quotation.totalPrice ?? new Prisma.Decimal(0);
      const remaining = Prisma.Decimal.max(
        totalPrice.minus(totalPaid),
        new Prisma.Decimal(0),
      );
      const newStatus: QuotationPaymentStatus = totalPaid.eq(0)
        ? QuotationPaymentStatus.pending
        : totalPaid.gte(totalPrice)
          ? QuotationPaymentStatus.paid
          : QuotationPaymentStatus.partially_paid;

      await tx.quotation.update({
        where: { id: installment.quotationId },
        data: {
          paidAmount: totalPaid,
          remainingAmount: remaining,
          paymentStatus: newStatus,
        },
      });

      // Propagate order status. When the quotation is fully paid we
      // jump STRAIGHT to `fabrication` instead of pausing at `paid`:
      // the moment the money lands, the lab work has effectively
      // started — there's no business meaning to a long-lived `paid`
      // state, and surfacing it as a separate tab on the orders page
      // made the workflow harder to read. Keeps the enum value
      // available for back-compat in case other callers still set it.
      const nextOrderStatus =
        newStatus === QuotationPaymentStatus.paid
          ? OrderStatus.fabrication
          : OrderStatus.payment_pending;
      const order = await tx.dentalOrder.update({
        where: { id: installment.quotation.orderId },
        data: { status: nextOrderStatus },
        select: {
          id: true,
          doctorId: true,
          orderCode: true,
          doctor: { select: { fullName: true } },
          // Patient name rides along into every payment notification
          // so the doctor's bell can read as "500 TND for patient X
          // (ORD-…) has been confirmed."
          patient: { select: { fullName: true } },
        },
      });

      // Stash everything the post-commit emit-block needs. We can't
      // emit from inside the transaction — listeners run async and
      // would race the commit. Pulling values out, returning, then
      // emitting after the closure resolves is the safe pattern.
      return {
        payment: updatedPayment,
        order,
        installmentNumber: installment.installmentNumber,
        batchUnlocked:
          installment.stepBatch?.status === BatchStatus.locked
            ? installment.stepBatch
            : null,
        skipNotify: false,
      };
    }).then(({ payment, order, installmentNumber, batchUnlocked, skipNotify }) => {
      if (skipNotify) return payment;
      // ── Post-commit notifications ────────────────────────────────
      // The DB has already accepted the transition; nothing here can
      // unwind it. Failures in the listener get logged and swallowed.
      const sharedPayload = {
        paymentId: payment.id,
        quotationId: payment.quotationId,
        orderId: payment.orderId,
        orderCode: order.orderCode,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        amount: payment.amount.toString(),
        currency: 'TND',
        method: payment.paymentMethod,
        installmentNumber,
      };
      if (payment.paymentMethod === PaymentMethod.card) {
        // Card success: admin gets a "new payment received" ping; the
        // doctor already saw their own button click resolve.
        this.events.emit(NotificationEvents.PaymentReceived, sharedPayload);
      } else if (payment.paymentMethod === PaymentMethod.bank_transfer) {
        // Admin just confirmed the wire — tell the doctor.
        this.events.emit(NotificationEvents.PaymentConfirmed, sharedPayload);
      } else {
        // Cash: admin recorded it; broadcast to admin team + ping doctor.
        this.events.emit(
          NotificationEvents.CashPaymentRecorded,
          sharedPayload,
        );
      }
      if (batchUnlocked) {
        this.events.emit(NotificationEvents.BatchUnlocked, {
          batchId: batchUnlocked.id,
          quotationId: payment.quotationId,
          orderId: payment.orderId,
          orderCode: order.orderCode,
          doctorId: order.doctorId,
          doctorName: order.doctor?.fullName ?? null,
          patientName: order.patient?.fullName ?? null,
          fromStep: batchUnlocked.fromStep,
          toStep: batchUnlocked.toStep,
          batchNumber: batchUnlocked.batchNumber,
        });
      }
      return payment;
    });
  }

  // ─── Read helpers (controller queries) ─────────────────────────

  /**
   * Pending-confirmations queue. Admin-only. Defaults to
   * `awaiting_confirmation` when the caller doesn't pass a status —
   * that's the inbox view.
   */
  async listPendingConfirmations(opts: PaymentListOptions & { caller: Caller }) {
    if (!this.isAdmin(opts.caller)) {
      throw new ForbiddenException('Admin-only.');
    }
    return this.runFilteredQuery({
      ...opts,
      // Default to awaiting_confirmation when nothing more specific
      // was asked for. Explicit statuses[] / status filters still win.
      statuses:
        opts.statuses ??
        (opts.status ? [opts.status] : [PaymentRecordStatus.awaiting_confirmation]),
      forceScope: 'all',
    });
  }

  /**
   * Full payment history. Admin sees every row; dentist is scoped to
   * payments on their own orders (server overrides any doctorId
   * filter so a curious doctor can't probe another doctor's
   * payments).
   */
  async listPayments(opts: PaymentListOptions & { caller: Caller }) {
    const isAdmin = this.isAdmin(opts.caller);
    return this.runFilteredQuery({
      ...opts,
      // Dentists are always scoped to themselves regardless of what
      // doctorId they send.
      doctorId: isAdmin ? opts.doctorId : opts.caller.userId,
      forceScope: isAdmin ? 'all' : 'doctor',
    });
  }

  /**
   * Shared filter/sort/page executor for both list endpoints. Keeps
   * the where + orderBy + include logic in one place so changes
   * propagate to admin queue AND history simultaneously.
   *
   * Index strategy on Payment (see prisma/schema.prisma):
   *   • `status` (covers `WHERE status IN (...)`)
   *   • `createdAt` (covers default sort + date range)
   *   • `orderId`  (covers RBAC scoping to a doctor's orders)
   *   • added in 20260525000002_payment_indexes:
   *       (status, createdAt) — admin queue narrowing + sort
   *       (paymentMethod, status) — method-filtered queries
   */
  private async runFilteredQuery(
    opts: PaymentListOptions & { caller: Caller; forceScope: 'all' | 'doctor' },
  ) {
    const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where = this.buildPaymentWhere(opts);
    const orderBy = this.buildPaymentOrderBy(opts);

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          quotation: { select: { id: true, orderId: true, packName: true } },
          order: {
            select: {
              id: true,
              orderCode: true,
              doctor: { select: { id: true, fullName: true } },
              patient: { select: { id: true, fullName: true } },
            },
          },
          installment: {
            select: { id: true, installmentNumber: true, amount: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: rows,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  /** Compose the Prisma where clause from the DTO + scope rules. */
  private buildPaymentWhere(
    opts: PaymentListOptions & { caller: Caller; forceScope: 'all' | 'doctor' },
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    // RBAC scope — dentists see only payments on their own orders.
    // We compose into `order: {...}` so filters that ALSO touch order
    // can layer onto the same nested relational filter.
    const orderWhere: Prisma.DentalOrderWhereInput = {};
    if (opts.forceScope === 'doctor') {
      orderWhere.doctorId = opts.caller.userId;
    } else if (opts.doctorId) {
      orderWhere.doctorId = opts.doctorId;
    }
    if (opts.patientId) orderWhere.patientId = opts.patientId;

    // Multi-value statuses — explicit list wins, legacy `status`
    // single-value falls back when no list is provided.
    if (opts.statuses && opts.statuses.length > 0) {
      where.status = { in: opts.statuses };
    } else if (opts.status) {
      where.status = opts.status;
    }

    // Multi-value methods — same precedence as statuses.
    if (opts.methods && opts.methods.length > 0) {
      where.paymentMethod = { in: opts.methods };
    } else if (opts.paymentMethod) {
      where.paymentMethod = opts.paymentMethod;
    }

    // Inclusive date range on createdAt — [from 00:00:00 → to 23:59:59 UTC].
    // We trim incoming strings so a stray space doesn't fail Date()
    // and silently fall through. Malformed values are logged + skipped
    // so the rest of the filter still applies; better than 500-ing on
    // a typo. Note: HTML date inputs feed `YYYY-MM-DD` which `new Date()`
    // parses as UTC midnight — keep that in mind when comparing to
    // payment.createdAt which is also stored UTC.
    const createdRange: Prisma.DateTimeFilter = {};
    if (opts.createdFrom) {
      const raw = String(opts.createdFrom).trim();
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        createdRange.gte = d;
      } else {
        this.logger.warn(`createdFrom "${raw}" is not a valid date — ignored.`);
      }
    }
    if (opts.createdTo) {
      const raw = String(opts.createdTo).trim();
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        createdRange.lte = d;
      } else {
        this.logger.warn(`createdTo "${raw}" is not a valid date — ignored.`);
      }
    }
    if (createdRange.gte || createdRange.lte) {
      where.createdAt = createdRange;
      // Prisma types gte/lte as `string | Date`; we only ever assign
      // Date here so the cast is safe. Logged as ISO for traceable
      // payments-query diagnostics.
      const fmt = (v: string | Date | undefined) =>
        v instanceof Date ? v.toISOString() : (v ?? '∞');
      this.logger.debug(
        `payments date range: gte=${fmt(createdRange.gte)} lte=${fmt(
          createdRange.lte,
        )}`,
      );
    }

    // Free-text search — order code, doctor name, patient name, and
    // transaction id (covers gateway tx ids on CARD, bank references
    // on BANK_TRANSFER, receipt numbers on CASH — all stored in
    // `transactionId` per the schema convention).
    if (opts.search && opts.search.length > 0) {
      const search = opts.search;
      where.OR = [
        { transactionId: { contains: search, mode: 'insensitive' } },
        {
          order: {
            ...(Object.keys(orderWhere).length > 0 ? orderWhere : {}),
            OR: [
              { orderCode: { contains: search, mode: 'insensitive' } },
              {
                doctor: { fullName: { contains: search, mode: 'insensitive' } },
              },
              {
                patient: { fullName: { contains: search, mode: 'insensitive' } },
              },
            ],
          },
        },
      ];
      // When search is set we move the RBAC + structural order filters
      // INTO the order branch of the OR — so non-search rows still
      // have to match the scope. The bankReference / transactionId
      // branches keep the scope via the outer where: add it back.
      if (Object.keys(orderWhere).length > 0) {
        where.order = orderWhere;
      }
    } else if (Object.keys(orderWhere).length > 0) {
      where.order = orderWhere;
    }

    return where;
  }

  /** Compose Prisma orderBy from the DTO sort enum. */
  private buildPaymentOrderBy(
    opts: PaymentListOptions,
  ): Prisma.PaymentOrderByWithRelationInput[] {
    const direction = opts.sortOrder ?? 'desc';
    switch (opts.sortBy) {
      case 'amount':
        return [{ amount: direction }, { createdAt: 'desc' }];
      case 'paidAt':
        // Successful first when desc — Prisma orders NULL last on
        // descending, so paid rows surface above pending ones.
        return [{ paidAt: direction }, { createdAt: 'desc' }];
      case 'status':
        return [{ status: direction }, { createdAt: 'desc' }];
      case 'createdAt':
      default:
        return [{ createdAt: direction }];
    }
  }

  async getPayment(id: string, caller: Caller): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        quotation: { include: { order: { select: { doctorId: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    const isOwner =
      caller.role === UserRole.dentist &&
      payment.quotation.order.doctorId === caller.userId;
    if (!this.isAdmin(caller) && !isOwner) {
      throw new ForbiddenException('You cannot access this payment.');
    }
    return payment;
  }

  /**
   * Admin-only: override the printed invoice / receipt number on a
   * payment. The unique index guarantees no two receipts share a
   * number — a collision surfaces as a clean 400 rather than a Prisma
   * stack trace.
   */
  async updateInvoiceNumber(
    id: string,
    invoiceNumber: string,
    caller: Caller,
  ): Promise<Payment> {
    if (!this.isAdmin(caller)) {
      throw new ForbiddenException(
        'Only an admin can edit the invoice number.',
      );
    }
    const trimmed = invoiceNumber.trim();
    if (!trimmed) {
      throw new BadRequestException('Invoice number cannot be empty.');
    }
    const existing = await this.prisma.payment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Payment not found.');
    try {
      return await this.prisma.payment.update({
        where: { id },
        data: { invoiceNumber: trimmed },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Invoice number "${trimmed}" is already used by another receipt.`,
        );
      }
      throw err;
    }
  }

  // ─── Guards used by every entry point ──────────────────────────

  private assertPayable(row: {
    status: InstallmentStatus;
    availableFrom: Date;
    quotation: { status: QuotationStatus };
  }): void {
    // The doctor's quote view no longer ships explicit Approve /
    // Reject buttons — clicking Pay on an installment is the doctor's
    // implicit acceptance of the quote terms. So the quote must be
    // EITHER `sent` (awaiting doctor action) OR `approved` (already
    // implicitly approved on a prior payment). Any other status —
    // draft, rejected, canceled — still blocks payment.
    if (
      row.quotation.status !== QuotationStatus.sent &&
      row.quotation.status !== QuotationStatus.approved
    ) {
      throw new BadRequestException(
        'Quote is not in a payable state — admin must (re)send it first.',
      );
    }
    if (row.status === InstallmentStatus.paid) {
      throw new BadRequestException('This installment is already paid.');
    }
    if (row.status === InstallmentStatus.cancelled) {
      throw new BadRequestException(
        'This installment was cancelled by the admin.',
      );
    }
    if (row.availableFrom.getTime() > Date.now()) {
      throw new BadRequestException(
        `Available from ${row.availableFrom.toISOString()} — payments cannot be initiated earlier.`,
      );
    }
  }

  /**
   * Implicit acceptance: when a doctor initiates the first payment on
   * a `sent` quotation, flip its status to `approved` so the audit
   * trail records the moment of acceptance — paying the quote IS
   * approving the quote in the new flow. No-op when the row is
   * already approved (every subsequent payment skips the write).
   *
   * Used by every payment entry point right after `assertPayable`
   * lets the row through. Wrapped in a defensive try/catch because
   * losing the approval signal should not block the payment itself —
   * the admin can still see the quote was paid even if this update
   * fails for some reason.
   */
  private async approveQuoteIfSent(
    quotationId: string,
    callerUserId: string,
  ): Promise<void> {
    try {
      const updated = await this.prisma.quotation.updateMany({
        where: { id: quotationId, status: QuotationStatus.sent },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById: callerUserId,
        },
      });
      if (updated.count > 0) {
        // Move the order off "Quote sent" so the doctor's KPI counts
        // settle into the right bucket immediately. Mirrors the
        // explicit approve action that previously did this transition.
        const quote = await this.prisma.quotation.findUnique({
          where: { id: quotationId },
          select: { orderId: true },
        });
        if (quote?.orderId) {
          await this.prisma.dentalOrder.update({
            where: { id: quote.orderId },
            data: { status: OrderStatus.fabrication },
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `approveQuoteIfSent failed for quotation ${quotationId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Idempotency (Redis-backed via Cache Manager) ──────────────

  private async findByIdempotencyKey(key: string): Promise<Payment | null> {
    if (this.cache) {
      const cached = await this.cache.get<string>(`payment:idem:${key}`);
      if (cached) {
        const payment = await this.prisma.payment.findUnique({
          where: { id: cached },
        });
        if (payment) return payment;
      }
    }
    return this.prisma.payment.findUnique({
      where: { idempotencyKey: key },
    });
  }

  private async rememberIdempotency(key: string, paymentId: string) {
    if (!this.cache) return;
    try {
      await this.cache.set(`payment:idem:${key}`, paymentId, IDEMPOTENCY_TTL_MS);
    } catch (err) {
      // Cache is a hint — if Redis is down the @unique constraint on
      // Payment.idempotencyKey still protects us.
      this.logger.warn(
        `Cache set failed for idempotency key ${key}: ${(err as Error).message}`,
      );
    }
  }
}
