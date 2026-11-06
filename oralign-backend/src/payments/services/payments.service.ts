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
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
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
import { QuotationService } from '../../quotations/services/quotation.service';
import { isAdmin, type Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import {
  assertInvoiceNumberFree,
  invoiceNumberTaken,
} from '../../common/billing/invoice-number';
import {
  compareIds,
  paymentEventDate,
  paymentListWhere,
  type PaymentListFilters,
} from './payment-list-query';

/**
 * Shape consumed by the shared payment-list executor. Mirrors the
 * PaymentFilterDto fields the controller surfaces, with explicit
 * legacy single-value fallbacks (`status`, `paymentMethod`) for
 * backward-compat with old client builds. The filters themselves are
 * built by `paymentListWhere`, which the payments report shares.
 */
interface PaymentListOptions extends PaymentListFilters {
  // pagination
  page?: number;
  limit?: number;
  // the dentist to list (admins only: a dentist is always scoped to themselves)
  doctorId?: string;
  // sorting; eventAt = the date the payment happened (paidAt ?? createdAt)
  sortBy?: 'createdAt' | 'amount' | 'paidAt' | 'status' | 'eventAt';
  sortOrder?: 'asc' | 'desc';
}

/** TTL for the idempotency-key → result mapping. 24h matches the spec. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Payment columns a dentist never reads, in their history or on one
 * payment: the admin's notes, which admin recorded, confirmed or rejected
 * the payment, and the idempotency key. Admins keep every column.
 */
const HIDDEN_FROM_DENTISTS = {
  notes: true,
  idempotencyKey: true,
  initiatedById: true,
  confirmedById: true,
  rejectedById: true,
} satisfies Prisma.PaymentOmit;

/** The relations every row of a payment list carries. */
const PAYMENT_LIST_INCLUDE = {
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
} satisfies Prisma.PaymentInclude;

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
    private readonly quotations: QuotationService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  // ─── Authorisation helpers ─────────────────────────────────────

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
    // An archived order or quotation is frozen: nothing can be paid,
    // declared or recorded against it until it is restored.
    if (row.quotation.deletedAt || row.quotation.order.deletedAt) {
      throw new NotFoundException('Installment not found.');
    }
    const order = row.quotation.order;
    const isOwner =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (opts.adminOnly) {
      if (!isAdmin(caller)) {
        throw new ForbiddenException('Admin-only action.');
      }
    } else if (!isAdmin(caller) && !isOwner) {
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
    await this.quotations.approveOnFirstPayment(row.quotationId, caller);

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
    await this.quotations.approveOnFirstPayment(row.quotationId, args.caller);

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
    if (!isAdmin(caller)) {
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
    if (!isAdmin(caller)) {
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
    if (!isAdmin(args.caller)) {
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
    await this.quotations.approveOnFirstPayment(row.quotationId, args.caller);
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
    if (!isAdmin(args.actor)) {
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
      // The plan validator accepts installments within 0.001 of the
      // total (MONEY_EPSILON in quotation-payment-plan.service.ts), so
      // settlement must honor the same tolerance — otherwise a plan one
      // millime short of a fractional loyalty net can never reach
      // `paid`. A tolerated shortfall reports remainingAmount 0.
      const settled = totalPaid.gte(totalPrice.minus(new Prisma.Decimal('0.001')));
      const remaining = settled
        ? new Prisma.Decimal(0)
        : Prisma.Decimal.max(totalPrice.minus(totalPaid), new Prisma.Decimal(0));
      const newStatus: QuotationPaymentStatus = totalPaid.eq(0)
        ? QuotationPaymentStatus.pending
        : settled
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
        quotationId: payment.quotationId!,
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
          quotationId: payment.quotationId!,
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
    if (!isAdmin(opts.caller)) {
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
    const callerIsAdmin = isAdmin(opts.caller);
    return this.runFilteredQuery({
      ...opts,
      // Dentists are always scoped to themselves regardless of what
      // doctorId they send.
      doctorId: callerIsAdmin ? opts.doctorId : opts.caller.userId,
      forceScope: callerIsAdmin ? 'all' : 'doctor',
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
   *   • (status, paidAt) — the takings of a period (PaymentsSummaryService)
   */
  private async runFilteredQuery(
    opts: PaymentListOptions & { caller: Caller; forceScope: 'all' | 'doctor' },
  ) {
    const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where = this.buildPaymentWhere(opts);
    const omit = isAdmin(opts.caller) ? undefined : HIDDEN_FROM_DENTISTS;

    const [rows, total] = await Promise.all([
      opts.sortBy === 'eventAt'
        ? this.findPageByEventDate(
            where,
            opts.sortOrder ?? 'desc',
            skip,
            take,
            omit,
          )
        : this.prisma.payment.findMany({
            where,
            skip,
            take,
            orderBy: this.buildPaymentOrderBy(opts),
            include: PAYMENT_LIST_INCLUDE,
            omit,
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

  /**
   * One page in the order of the date each payment happened: when it was
   * paid, otherwise when it was made. The list shows that date and the
   * period filters on it (eventDateFilter), but Prisma cannot sort on
   * COALESCE(paidAt, createdAt). So the page is cut from the merge of two
   * runs the database sorts, the paid rows by paidAt and the others by
   * createdAt, each ending on the id: the first skip + take rows of the
   * merge are always among the first skip + take rows of each run.
   */
  private async findPageByEventDate(
    where: Prisma.PaymentWhereInput,
    direction: Prisma.SortOrder,
    skip: number,
    take: number,
    omit: typeof HIDDEN_FROM_DENTISTS | undefined,
  ) {
    const window = skip + take;
    const dates = { id: true, paidAt: true, createdAt: true } as const;
    const [paid, unpaid] = await Promise.all([
      this.prisma.payment.findMany({
        where: { AND: [where, { paidAt: { not: null } }] },
        orderBy: [{ paidAt: direction }, { id: direction }],
        take: window,
        select: dates,
      }),
      this.prisma.payment.findMany({
        where: { AND: [where, { paidAt: null }] },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: window,
        select: dates,
      }),
    ]);
    const sign = direction === 'asc' ? 1 : -1;
    const ids = [...paid, ...unpaid]
      .map((row) => ({
        id: row.id,
        at: paymentEventDate(row).getTime(),
      }))
      .sort((a, b) => sign * (a.at - b.at || compareIds(a.id, b.id)))
      .slice(skip, window)
      .map((row) => row.id);
    if (ids.length === 0) return [];

    const rows = await this.prisma.payment.findMany({
      where: { id: { in: ids } },
      include: PAYMENT_LIST_INCLUDE,
      omit,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /**
   * Compose the Prisma where clause from the DTO + scope rules: a dentist
   * only ever reads their own orders' payments; payments of archived
   * orders stay in the ledger but leave the working lists (see
   * paymentListWhere).
   */
  private buildPaymentWhere(
    opts: PaymentListOptions & { caller: Caller; forceScope: 'all' | 'doctor' },
  ): Prisma.PaymentWhereInput {
    const doctorId =
      opts.forceScope === 'doctor' ? opts.caller.userId : opts.doctorId;
    return paymentListWhere(opts, doctorId);
  }

  /**
   * Compose Prisma orderBy from the DTO sort enum (eventAt is paged by
   * findPageByEventDate). Every sort ends on the id, in the sort's
   * direction: rows sharing a sort value keep one stable order, so none
   * shows on two pages or on none.
   */
  private buildPaymentOrderBy(
    opts: PaymentListOptions,
  ): Prisma.PaymentOrderByWithRelationInput[] {
    const direction = opts.sortOrder ?? 'desc';
    const byId = { id: direction };
    switch (opts.sortBy) {
      case 'amount':
        return [{ amount: direction }, { createdAt: 'desc' }, byId];
      case 'paidAt':
        // Postgres sorts NULLs first in a descending sort: without
        // `nulls: 'last'` every unpaid attempt would top a "recently
        // paid" list. Last in both directions.
        return [
          { paidAt: { sort: direction, nulls: 'last' } },
          { createdAt: 'desc' },
          byId,
        ];
      case 'status':
        return [{ status: direction }, { createdAt: 'desc' }, byId];
      case 'createdAt':
      default:
        return [{ createdAt: direction }, byId];
    }
  }

  /**
   * One payment: an admin reads any, a dentist only one of their own
   * orders, without the admin-internal columns (as in their history).
   */
  async getPayment(id: string, caller: Caller) {
    const callerIsAdmin = isAdmin(caller);
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: { select: { doctorId: true } },
      },
      omit: callerIsAdmin ? undefined : HIDDEN_FROM_DENTISTS,
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    const isOwner =
      caller.role === UserRole.dentist &&
      payment.order.doctorId === caller.userId;
    if (!callerIsAdmin && !isOwner) {
      throw new ForbiddenException('You cannot access this payment.');
    }
    return payment;
  }

  /**
   * Admin-only: override the printed receipt number of a successful
   * installment payment. The receipt and its automatic invoice print one
   * number (InvoiceService.update keeps the same rule from the invoice
   * side), so a new number follows the invoice desk's rules
   * (assertInvoiceNumberFree: free on every document, outside the future
   * range of the automatic counters) and both rows are renamed in one
   * transaction; the invoice's audit trail records it, as an edit from
   * the invoice desk would.
   */
  async updateInvoiceNumber(
    id: string,
    invoiceNumber: string,
    caller: Caller,
  ): Promise<Payment> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only an admin can edit the invoice number.',
      );
    }
    const trimmed = invoiceNumber.trim();
    if (!trimmed) {
      throw new BadRequestException('Invoice number cannot be empty.');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        purpose: true,
        invoiceNumber: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    assertReceiptNumberEditable(payment);

    const invoice =
      payment.invoice && payment.invoice.invoiceNumber !== trimmed
        ? payment.invoice
        : null;
    // Saving again the number the receipt and its invoice already print
    // renames nothing, so there is nothing to check.
    if (payment.invoiceNumber !== trimmed || invoice) {
      await assertInvoiceNumberFree(this.prisma, trimmed, {
        paymentId: payment.id,
        invoiceId: payment.invoice?.id,
      });
    }
    const actorName = invoice
      ? await lookupActorName(this.prisma, caller.userId)
      : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id },
          data: { invoiceNumber: trimmed },
        });
        if (invoice) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { invoiceNumber: trimmed },
          });
          await tx.invoiceAuditLog.create({
            data: {
              invoiceId: invoice.id,
              actorId: caller.userId,
              actorName,
              action: 'updated',
              changes: {
                invoiceNumber: { from: invoice.invoiceNumber, to: trimmed },
              },
            },
          });
        }
        return updated;
      });
    } catch (err) {
      // A concurrent writer took the number between the check and the commit.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw invoiceNumberTaken(trimmed);
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
  // Implicit "first payment approves the quote" lives in
  // QuotationService.approveOnFirstPayment — one owner of the transition.

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

/**
 * Only a settled installment has a FAC- receipt. A treatment-fee card
 * attempt is receipted on the order (TF-…), and an unsettled payment has
 * no receipt at all.
 */
function assertReceiptNumberEditable(payment: {
  status: PaymentRecordStatus;
  purpose: PaymentPurpose;
}): void {
  if (payment.purpose !== PaymentPurpose.installment) {
    throw new ConflictException(
      "This is a treatment-fee card payment: its receipt is the order's treatment-fee receipt (TF-…), not an installment receipt.",
      'INVOICE_NUMBER_NOT_EDITABLE',
    );
  }
  if (payment.status !== PaymentRecordStatus.success) {
    throw new ConflictException(
      `Only a successful payment has a receipt number; this one is ${payment.status}.`,
      'INVOICE_NUMBER_NOT_EDITABLE',
    );
  }
}
