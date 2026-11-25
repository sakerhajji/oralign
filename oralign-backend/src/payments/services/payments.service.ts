import { Inject, Injectable } from '@nestjs/common';
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
  QuoteStepBatch as StepBatch,
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
import {
  NotificationEvents,
  type PaymentEvent,
} from '../../notifications/events/notification-events';
import { env } from '../../common/config/env';
import { QuotationService } from '../../quotations/services/quotation.service';
import { projectBatches } from '../../production/production-batch-projection';
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
import {
  assertNoOtherPaymentInFlight,
  isAdminRecordedMethod,
  paymentChargeData,
  readChargeSettings,
  resolvePaymentCharge,
} from './payment-rules';
import {
  advanceOrderWhenPaid,
  QUOTE_PHASE_ORDER_STATUSES,
} from '../../quotations/quote-money';

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

interface SettleArgs {
  paymentId: string;
  transactionId: string;
  actor: Caller;
  notes?: string;
  /** Under the lock, the payment must still be in this status (400 otherwise). */
  expectStatus?: PaymentRecordStatus;
  /** An installment already paid is a 409, not a silently cancelled payment. */
  conflictIfPaid?: boolean;
}

/** What a settlement hands its post-commit notifications. */
interface Settlement {
  payment: Payment;
  order: {
    id: string;
    doctorId: string;
    orderCode: string;
    doctor: { fullName: string } | null;
    patient: { fullName: string } | null;
  };
  installmentNumber: number;
  batchUnlocked: StepBatch | null;
  skipNotify: boolean;
}

/**
 * What a quote's successful payments settle: the cash received plus the
 * retenue the practitioner kept back, minus the stamps charged on top
 * (Payment.amount alone is the cash). Payments made before the stamp was
 * added have stampAmount 0.
 */
export function settledTotal(sum: {
  amount: Prisma.Decimal | null;
  withholdingAmount: Prisma.Decimal | null;
  stampAmount?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const zero = new Prisma.Decimal(0);
  return (sum.amount ?? zero)
    .plus(sum.withholdingAmount ?? zero)
    .minus(sum.stampAmount ?? zero);
}

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
 * The same lock guards "one payment at a time": no entry point opens a
 * payment while another kind is still in flight on that installment.
 *
 * Charge of a payment (payment-rules): the droit de timbre is added on
 * top (Payment.stampAmount: every payment has its own facture) and the
 * retenue à la source, on the installment, comes off
 * (Payment.withholdingAmount). Payment.amount is the cash charged or
 * received. The quote is settled by amount + withholding - stamp (= the
 * installment), never by the cash alone.
 *
 * Card payments live in ClicToPayPaymentsService (hosted checkout, its
 * own idempotency on Payment.idempotencyKey); they settle through
 * handleSuccess like every other method.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    // Kept bound (PaymentsModule still provides the mock gateway) so the
    // DI signature is stable; no live path charges through it any more —
    // cards go through ClicToPay.
    @Inject(PAYMENT_GATEWAY) _cardGateway: PaymentGateway,
    private readonly quotations: QuotationService,
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

  /**
   * Lock the installment row (FOR UPDATE) and re-check it is still
   * payable: a concurrent settlement may have paid it since the caller
   * loaded it. Every installment entry point opens its payment under this
   * lock, which is what makes the in-flight guard and the insert one step.
   */
  private async lockPayableInstallment(
    tx: Prisma.TransactionClient,
    installmentId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE id = ${installmentId} FOR UPDATE`;
    const installment = await tx.quoteInstallment.findUnique({
      where: { id: installmentId },
      select: {
        id: true,
        amount: true,
        status: true,
        availableFrom: true,
        quotation: { select: { status: true } },
      },
    });
    if (!installment) throw new NotFoundException('Installment not found.');
    this.assertPayable(installment);
    return installment;
  }

  // ─── BANK_TRANSFER ─────────────────────────────────────────────

  /**
   * Doctor declares an outbound wire transfer for an installment. The
   * Payment row sits in `awaiting_confirmation` until an admin reviews
   * the bank statement and confirms (or rejects). Re-declaring on the
   * SAME installment auto-cancels any prior pending declaration so
   * the queue never carries stale rows; a card attempt still in flight
   * blocks the declaration (409) so the installment is never paid twice.
   *
   * The transfer is the cash: the installment + the stamp, minus the
   * retenue when the practitioner applies it. The row stores that cash as
   * `amount`, the retenue and the stamp beside it.
   */
  async declareBankTransfer(args: {
    installmentId: string;
    caller: Caller;
    bankReference?: string;
    proofUrl?: string | null;
    applyWithholding?: boolean;
  }): Promise<Payment> {
    const row = await this.loadInstallmentForCaller(
      args.installmentId,
      args.caller,
    );
    this.assertPayable(row);
    await this.ensureBankTransferIsConfigured();
    await this.quotations.approveOnFirstPayment(row.quotationId, args.caller);

    const created = await this.prisma.$transaction(async (tx) => {
      const installment = await this.lockPayableInstallment(tx, row.id);
      await assertNoOtherPaymentInFlight(
        tx,
        installment.id,
        PaymentMethod.bank_transfer,
      );
      const charge = resolvePaymentCharge(
        args.applyWithholding,
        installment.amount,
        await readChargeSettings(tx),
      );
      // Cancel any stale `awaiting_confirmation` declarations on the
      // same installment so the admin never sees two pending rows
      // for the same payment.
      await tx.payment.updateMany({
        where: {
          installmentId: installment.id,
          status: PaymentRecordStatus.awaiting_confirmation,
        },
        data: { status: PaymentRecordStatus.cancelled },
      });
      const payment = await tx.payment.create({
        data: {
          orderId: row.quotation.orderId,
          quotationId: row.quotationId,
          installmentId: installment.id,
          ...paymentChargeData(charge),
          status: PaymentRecordStatus.awaiting_confirmation,
          paymentMethod: PaymentMethod.bank_transfer,
          transactionId: args.bankReference ?? null,
          proofUrl: args.proofUrl ?? null,
          declaredAt: new Date(),
          initiatedById: args.caller.userId,
        },
      });
      // Move the order into `payment_review` to signal the queue, but
      // only from the quote / payment phase: an extra installment added
      // after a total edit can be paid on a case already in fabrication,
      // shipped or finished, and that case must never go back. One
      // conditional write, so the status check and the write are one step.
      await moveOrderWithinPaymentPhase(
        tx,
        row.quotation.orderId,
        OrderStatus.payment_review,
      );
      return payment;
    });
    // Bell ping for admins — their pending-confirmations queue just grew a
    // row. After the commit, so the listener never reads a row that is not
    // there yet.
    this.events.emit(NotificationEvents.PaymentDeclared, {
      paymentId: created.id,
      quotationId: row.quotationId,
      orderId: row.quotation.orderId,
      orderCode: row.quotation.order.orderCode,
      doctorId: args.caller.userId,
      doctorName: row.quotation.order.doctor?.fullName ?? null,
      patientName: row.quotation.order.patient?.fullName ?? null,
      amount: created.amount.toString(),
      withholdingAmount: created.withholdingAmount.toString(),
      stampAmount: created.stampAmount.toString(),
      currency: row.quotation.currency ?? 'TND',
      method: created.paymentMethod,
      installmentNumber: row.installmentNumber,
    } satisfies PaymentEvent);
    return created;
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
    // The declared charge (retenue + stamp) is confirmed as declared: the
    // admin checks the cash on the statement against `amount`.
    return this.handleSuccess({
      paymentId,
      transactionId: existing.transactionId ?? `bank_${randomUUID()}`,
      actor: caller,
      notes,
      // Re-checked under the installment lock: a concurrent reject must
      // not be overturned, and an installment paid meanwhile is a 409 the
      // admin has to see, not a transfer silently cancelled.
      expectStatus: PaymentRecordStatus.awaiting_confirmation,
      conflictIfPaid: true,
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
      quotationId: rejected.quotationId!,
      orderId: rejected.orderId,
      orderCode: rejected.order.orderCode,
      doctorId: rejected.order.doctorId,
      doctorName: rejected.order.doctor?.fullName ?? null,
      patientName: rejected.order.patient?.fullName ?? null,
      amount: rejected.amount.toString(),
      withholdingAmount: rejected.withholdingAmount.toString(),
      stampAmount: rejected.stampAmount.toString(),
      currency: 'TND',
      method: rejected.paymentMethod,
      installmentNumber: rejected.installment?.installmentNumber,
    } satisfies PaymentEvent);
    return rejected;
  }

  // ─── CASH / CHEQUE ─────────────────────────────────────────────

  /**
   * Admin records money received in person, cash or cheque (a dentist
   * never can). Created and settled in ONE transaction under the
   * installment lock: a cash row is never left `pending`, so it can never
   * block (or be mistaken for) a payment in flight.
   */
  async recordCash(args: {
    installmentId: string;
    caller: Caller;
    receiptNumber?: string;
    notes?: string;
    method?: PaymentMethod;
    applyWithholding?: boolean;
  }): Promise<Payment> {
    if (!isAdmin(args.caller)) {
      throw new ForbiddenException(
        'Only admins can record cash payments.',
      );
    }
    const method = args.method ?? PaymentMethod.cash;
    if (!isAdminRecordedMethod(method)) {
      throw new BadRequestException(
        'Only a cash or cheque payment can be recorded here.',
        'PAYMENT_METHOD_NOT_RECORDABLE',
      );
    }
    const row = await this.loadInstallmentForCaller(
      args.installmentId,
      args.caller,
      { adminOnly: true },
    );
    this.assertPayable(row);
    await this.quotations.approveOnFirstPayment(row.quotationId, args.caller);
    const settled = await this.prisma.$transaction(async (tx) => {
      const installment = await this.lockPayableInstallment(tx, row.id);
      await assertNoOtherPaymentInFlight(tx, installment.id, method);
      // Received in person: the installment + the stamp, minus the
      // retenue when the practitioner keeps it back.
      const charge = resolvePaymentCharge(
        args.applyWithholding,
        installment.amount,
        await readChargeSettings(tx),
      );
      const payment = await tx.payment.create({
        data: {
          orderId: row.quotation.orderId,
          quotationId: row.quotationId,
          installmentId: installment.id,
          ...paymentChargeData(charge),
          status: PaymentRecordStatus.pending,
          paymentMethod: method,
          transactionId: args.receiptNumber ?? null,
          notes: args.notes ?? null,
          initiatedById: args.caller.userId,
        },
      });
      return this.settleWithin(tx, {
        paymentId: payment.id,
        transactionId: payment.transactionId ?? `${method}_${randomUUID()}`,
        actor: args.caller,
      });
    });
    return this.notifySettlement(settled);
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
   *      caller gets a 200 with the existing Payment), or 409 when the
   *      caller asked for it (`conflictIfPaid`, the admin's confirm).
   *   3. Flip the Payment, Installment, StepBatch, and Quotation in
   *      one go.
   *   4. Move the order to `payment_pending` (partial) or `fabrication`
   *      (full), only from a quote / payment phase status: an order
   *      already past it keeps its status.
   *
   * Returns the up-to-date Payment row.
   */
  async handleSuccess(args: SettleArgs): Promise<Payment> {
    const settled = await this.prisma.$transaction((tx) =>
      this.settleWithin(tx, args),
    );
    return this.notifySettlement(settled);
  }

  /**
   * handleSuccess's transaction body, for a caller that already holds a
   * transaction (cash and cheque are created and settled in one). The
   * caller must pass the result to `notifySettlement` after the commit.
   */
  private async settleWithin(
    tx: Prisma.TransactionClient,
    args: SettleArgs,
  ): Promise<Settlement> {
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

    // No notification for these: the original transition already pinged,
    // or nothing was settled.
    const quietly = (row: Payment): Settlement => ({
      payment: row,
      order: {
        id: installment.quotation.orderId,
        doctorId: '',
        orderCode: '',
        doctor: { fullName: '' },
        patient: null,
      },
      installmentNumber: installment.installmentNumber,
      batchUnlocked: null,
      skipNotify: true,
    });

    // Idempotent path — the row may have been promoted by a
    // concurrent caller while we waited on the lock.
    if (payment.status === PaymentRecordStatus.success) {
      return quietly(payment);
    }
    if (args.expectStatus && payment.status !== args.expectStatus) {
      throw new BadRequestException(
        `Cannot confirm a payment in status ${payment.status}.`,
      );
    }

    // The installment may have already been marked paid by a
    // sibling Payment (e.g. CARD raced with BANK_TRANSFER confirm).
    if (installment.status === InstallmentStatus.paid) {
      if (args.conflictIfPaid) {
        throw new ConflictException(
          "Cette échéance est déjà payée : ce virement ne peut pas être confirmé. Rejetez-le, et remboursez le praticien si l'argent a bien été reçu.",
          'INSTALLMENT_ALREADY_PAID',
        );
      }
      // A card charge that landed anyway becomes a duplicate-paid
      // refunded-style row; we cancel it gracefully and DON'T re-unlock.
      const cancelled = await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentRecordStatus.cancelled },
      });
      return quietly(cancelled);
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

    // Mark installment paid. Unconditional: a payment settles its whole
    // installment, the cash plus the retenue the practitioner kept back,
    // minus the stamp charged on top.
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
      // An admin may have delivered these steps before the payment (D1):
      // the batch becomes `delivered` now, in this transaction (D2).
      await projectBatches(tx, {
        orderId: installment.quotation.orderId,
        actorId: null,
      });
    }

    // Recalculate quote totals. Settled = cash + retenue - stamp: a
    // practitioner who kept back the retenue has paid the installment in
    // full, and the stamp he paid on top belongs to the facture, not to
    // the devis.
    const aggregate = await tx.payment.aggregate({
      where: {
        quotationId: installment.quotationId,
        status: PaymentRecordStatus.success,
      },
      _sum: { amount: true, withholdingAmount: true, stampAmount: true },
    });
    const totalPaid = settledTotal(aggregate._sum);
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
    //
    // Both moves only leave the quote / payment phase forwards: an extra
    // installment (planRebalance after a total edit) can be paid on a case
    // already in fabrication, shipped or finished, and paying it must
    // leave that status alone. The full-payment move is the quote edit's
    // own rule (advanceOrderWhenPaid), so both paths agree on "paid".
    const orderId = installment.quotation.orderId;
    if (newStatus === QuotationPaymentStatus.paid) {
      await advanceOrderWhenPaid(tx, orderId);
    } else {
      await moveOrderWithinPaymentPhase(
        tx,
        orderId,
        OrderStatus.payment_pending,
      );
    }
    const order = await tx.dentalOrder.findUnique({
      where: { id: orderId },
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
    if (!order) throw new NotFoundException('Order not found.');

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
  }

  /**
   * Post-commit notifications of a settlement. The DB has already
   * accepted the transition; nothing here can unwind it. Failures in the
   * listener get logged and swallowed.
   */
  private notifySettlement({
    payment,
    order,
    installmentNumber,
    batchUnlocked,
    skipNotify,
  }: Settlement): Payment {
    if (skipNotify) return payment;
    const sharedPayload: PaymentEvent = {
      paymentId: payment.id,
      quotationId: payment.quotationId!,
      orderId: payment.orderId,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
      amount: payment.amount.toString(),
      withholdingAmount: payment.withholdingAmount.toString(),
      stampAmount: payment.stampAmount.toString(),
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
      // Cash or cheque: admin recorded it; broadcast to admin team +
      // ping doctor. The payload's method tells the two apart.
      this.events.emit(NotificationEvents.CashPaymentRecorded, sharedPayload);
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
}

/**
 * Move an order to `next` only while it is still in the quote / payment
 * phase (QUOTE_PHASE_ORDER_STATUSES, the rule the quote edit and recall
 * use). A conditional updateMany rather than read-then-write: Postgres
 * re-checks the status on the row it updates, so an order moved past the
 * phase meanwhile is left alone. Returns whether the order moved.
 */
async function moveOrderWithinPaymentPhase(
  tx: Pick<Prisma.TransactionClient, 'dentalOrder'>,
  orderId: string,
  next: OrderStatus,
): Promise<boolean> {
  const { count } = await tx.dentalOrder.updateMany({
    where: { id: orderId, status: { in: QUOTE_PHASE_ORDER_STATUSES } },
    data: { status: next },
  });
  return count > 0;
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
