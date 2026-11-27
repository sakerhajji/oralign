import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BatchStatus,
  BatchUnlockSource,
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
  type BatchUnlockedEvent,
  type NotificationEventName,
  NotificationEvents,
  type PaymentEvent,
  type TransferClosedEvent,
  type TransferReviewOpenedEvent,
} from '../../notifications/events/notification-events';
import { installmentSubjectKey } from '../../notifications/notification-subject';
import { env } from '../../common/config/env';
import { QuotationService } from '../../quotations/services/quotation.service';
import { unlockStepBatch } from '../../production/batch-unlock';
import { isAdmin, type Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import { ORDER_AUDIT_ACTION } from '../../common/audit/order-audit-actions';
import { writeOrderAudit } from '../../common/audit/order-audit-entry';
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
  assertWithholdingAllowed,
  isAdminRecordedMethod,
  paymentChargeData,
  readChargeSettings,
  resolvePaymentCharge,
} from './payment-rules';
import {
  assertConfirmReceipt,
  assertDeclarationReceipt,
  canReadReceipt,
  HIDDEN_FROM_DENTISTS,
  parseTransferIdempotencyKey,
  paymentTransferAuditMetadata,
  proofNotFound,
  rejectionReasonOrThrow,
  transferAlreadyProcessed,
  transferNotWithdrawable,
  withdrawalNoteOf,
} from './transfer-rules';
import {
  findDeclarationReplay,
  isUniqueViolation,
  lockInstallmentRow,
  paymentPhaseAfterPartialSettlement,
  releaseOrderFromReview,
  supersedeAwaitingDeclarations,
} from './transfer-transitions';
import {
  assertReceiptFile,
  openReceipt,
  type OpenedReceipt,
  type ReceiptUpload,
  removeReceiptFile,
  writeReceiptFile,
} from '../receipt-file';
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
 * 409: the installment is already paid (stable code, domain-error-codes.ts):
 * a transfer confirmed on it, or declared / replaced on it, after another
 * payment settled it.
 */
export const INSTALLMENT_ALREADY_PAID = 'INSTALLMENT_ALREADY_PAID';

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

/** What a refusal hands back and tells the doctor (names and order code). */
const REJECTED_PAYMENT_INCLUDE = {
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
} satisfies Prisma.PaymentInclude;

interface SettleArgs {
  paymentId: string;
  transactionId: string;
  actor: Caller;
  notes?: string;
  /** Under the lock, the payment must still be in this status (409 TRANSFER_ALREADY_PROCESSED otherwise). */
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
  private readonly logger = new Logger(PaymentsService.name);

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
    opts: { declaration?: boolean } = {},
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
    if (opts.declaration) this.assertDeclarable(installment);
    else this.assertPayable(installment);
    return installment;
  }

  /**
   * The refusals the locked transaction re-checks, raised BEFORE
   * approveOnFirstPayment accepts a `sent` quote in its own transaction
   * (doctorApprovedAt, counted by loyalty): a retenue the rules refuse
   * (400 WITHHOLDING_DISABLED / WITHHOLDING_BELOW_THRESHOLD) or another
   * payment in flight on the installment (409 PAYMENT_ATTEMPT_IN_PROGRESS)
   * must not leave the quote accepted with no payment behind it. Unlocked
   * reads: the transaction stays the authority (resolvePaymentCharge and
   * assertNoOtherPaymentInFlight run again under the installment lock).
   */
  private async assertPaymentAcceptable(
    installment: { id: string; amount: Prisma.Decimal },
    method: PaymentMethod,
    applyWithholding: boolean | undefined,
  ): Promise<void> {
    await assertNoOtherPaymentInFlight(this.prisma, installment.id, method);
    if (applyWithholding === true) {
      assertWithholdingAllowed(
        installment.amount,
        await readChargeSettings(this.prisma),
      );
    }
  }

  // ─── BANK_TRANSFER ─────────────────────────────────────────────

  /**
   * The doctor (or an admin for him) declares an outbound wire transfer
   * for an installment (spec §1). The Payment row sits in
   * `awaiting_confirmation` until an admin reviews the receipt against the
   * bank statement and confirms (or refuses). A card attempt still in
   * flight blocks the declaration (409) so the installment is never paid
   * twice.
   *
   * Receipt (DECISIONS §1): mandatory for a dentist (400 PROOF_REQUIRED);
   * an admin may omit it only with an override note. The file is checked
   * (assertReceiptFile) and written only once the caller is authorised and
   * the installment payable, under uploads/orders/<orderId>/payment-proofs,
   * and unlinked when the transaction fails.
   *
   * Replace: a declaration still awaiting on the installment is
   * superseded (status cancelled + cancelledAt/By, receipt kept, audit
   * payment_proof_replaced, PaymentSuperseded). Replay: the same caller
   * and Idempotency-Key answer the row already made (200), another
   * installment with that key is a 409.
   *
   * The transfer is the cash: the installment + the stamp, minus the
   * retenue when the practitioner applies it. The row stores that cash as
   * `amount`, the retenue and the stamp beside it.
   */
  async declareBankTransfer(args: {
    installmentId: string;
    caller: Caller;
    bankReference?: string;
    /** The uploaded receipt (multer memoryStorage), if any. */
    receipt?: ReceiptUpload | null;
    applyWithholding?: boolean;
    /** Admin without a receipt: why (trimmed, 3-500). */
    overrideNote?: string;
    /** The raw Idempotency-Key header. */
    idempotencyKey?: string;
  }): Promise<Payment> {
    const key = parseTransferIdempotencyKey(args.idempotencyKey);
    const row = await this.loadInstallmentForCaller(
      args.installmentId,
      args.caller,
    );
    const orderId = row.quotation.orderId;
    if (key) {
      const replay = await findDeclarationReplay(this.prisma, {
        callerId: args.caller.userId,
        key,
        installmentId: row.id,
      });
      if (replay) return replay;
    }
    const overrideNote = assertDeclarationReceipt({
      caller: args.caller,
      hasReceipt: Boolean(args.receipt),
      overrideNote: args.overrideNote,
    });
    this.assertDeclarable(row);
    await this.ensureBankTransferIsConfigured();
    const kind = args.receipt ? await assertReceiptFile(args.receipt) : null;
    await this.assertPaymentAcceptable(
      row,
      PaymentMethod.bank_transfer,
      args.applyWithholding,
    );
    await this.quotations.approveOnFirstPayment(row.quotationId, args.caller);
    const actorName = await lookupActorName(this.prisma, args.caller.userId);

    const proofUrl =
      kind && args.receipt
        ? await writeReceiptFile(orderId, args.receipt.buffer, kind)
        : null;
    let outcome:
      | { replay: Payment }
      | { payment: Payment; superseded: string[] };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const installment = await this.lockPayableInstallment(tx, row.id, {
          declaration: true,
        });
        if (key) {
          // A concurrent repeat of the same key committed while we waited.
          const replay = await findDeclarationReplay(tx, {
            callerId: args.caller.userId,
            key,
            installmentId: row.id,
          });
          if (replay) return { replay };
        }
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
        const now = new Date();
        // The admin never sees two pending rows for the same installment.
        const superseded = await supersedeAwaitingDeclarations(tx, {
          installmentId: installment.id,
          actor: args.caller,
          actorName,
          at: now,
        });
        const payment = await tx.payment.create({
          data: {
            orderId,
            quotationId: row.quotationId,
            installmentId: installment.id,
            ...paymentChargeData(charge),
            status: PaymentRecordStatus.awaiting_confirmation,
            paymentMethod: PaymentMethod.bank_transfer,
            transactionId: args.bankReference ?? null,
            proofUrl,
            // Admin-only column: why this declaration has no receipt.
            notes: overrideNote,
            declaredAt: now,
            initiatedById: args.caller.userId,
            declarationKey: key,
          },
        });
        // Move the order into `payment_review` to signal the queue, but
        // only from the quote / payment phase: an extra installment added
        // after a total edit can be paid on a case already in fabrication,
        // shipped or finished, and that case must never go back. One
        // conditional write, so the status check and the write are one step.
        await moveOrderWithinPaymentPhase(
          tx,
          orderId,
          OrderStatus.payment_review,
        );
        await writeOrderAudit(tx, orderId, args.caller, {
          action:
            superseded.length > 0
              ? ORDER_AUDIT_ACTION.PAYMENT_PROOF_REPLACED
              : ORDER_AUDIT_ACTION.PAYMENT_TRANSFER_DECLARED,
          paymentId: payment.id,
          actorName,
          metadata: {
            ...paymentTransferAuditMetadata(payment, row.installmentNumber, {
              overrideNote,
              replacedPaymentId: superseded[0],
            }),
          },
        });
        return { payment, superseded };
      });
    } catch (error) {
      await removeReceiptFile(proofUrl);
      if (key && isUniqueViolation(error)) {
        // Two repeats of one key raced to the insert: the winner's row.
        const replay = await findDeclarationReplay(this.prisma, {
          callerId: args.caller.userId,
          key,
          installmentId: row.id,
        });
        if (replay) return replay;
      }
      throw error;
    }
    if ('replay' in outcome) {
      await removeReceiptFile(proofUrl);
      return outcome.replay;
    }

    const { payment: created, superseded } = outcome;
    const order = row.quotation.order;
    const subjectKey = installmentSubjectKey(created.id);
    // After the commit, so the listener never reads a row that is not
    // there yet. The superseded subjects first: their bell rows resolve
    // before the new one rings.
    for (const paymentId of superseded) {
      this.emit(NotificationEvents.PaymentSuperseded, {
        kind: 'installment',
        subjectKey: installmentSubjectKey(paymentId),
        reason: 'superseded',
        orderId,
        orderCode: order.orderCode,
        doctorId: order.doctorId,
        paymentId,
        quotationId: row.quotationId,
        installmentNumber: row.installmentNumber,
        actorId: args.caller.userId,
        replacedBySubjectKey: subjectKey,
      } satisfies TransferClosedEvent);
    }
    // Bell ping for admins — their pending-confirmations queue just grew a
    // row. doctorId is the order's doctor, also when an admin declared.
    this.emit(NotificationEvents.PaymentDeclared, {
      paymentId: created.id,
      quotationId: row.quotationId,
      orderId,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
      amount: created.amount.toString(),
      withholdingAmount: created.withholdingAmount.toString(),
      stampAmount: created.stampAmount.toString(),
      currency: row.quotation.currency ?? 'TND',
      method: created.paymentMethod,
      installmentNumber: row.installmentNumber,
    } satisfies PaymentEvent);
    return created;
  }

  /**
   * Admin confirms a transfer (awaiting_confirmation → success) through the
   * single success transition (settleWithin: installment lock, quote
   * settlement, batch unlock), then journals payment_confirmed in the same
   * transaction. Idempotent: a repeat on a confirmed transfer answers the
   * row (200); a transfer refused, withdrawn or replaced meanwhile is 409
   * TRANSFER_ALREADY_PROCESSED; an installment paid by another payment is
   * 409 INSTALLMENT_ALREADY_PAID. A transfer without a receipt needs the
   * admin's override note (400 PROOF_OVERRIDE_NOTE_REQUIRED).
   */
  async confirmBankTransfer(
    paymentId: string,
    notes: string | undefined,
    caller: Caller,
    options: { overrideNote?: string } = {},
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
    if (existing.status === PaymentRecordStatus.success) return existing;
    if (existing.status !== PaymentRecordStatus.awaiting_confirmation) {
      throw transferAlreadyProcessed(existing.status);
    }
    // A row's receipt never changes (a replacement is a new row).
    const overrideNote = assertConfirmReceipt(
      Boolean(existing.proofUrl),
      options.overrideNote,
    );
    const actorName = await lookupActorName(this.prisma, caller.userId);
    // The declared charge (retenue + stamp) is confirmed as declared: the
    // admin checks the cash on the statement against `amount`.
    const settled = await this.prisma.$transaction(async (tx) => {
      const settlement = await this.settleWithin(tx, {
        paymentId,
        transactionId: existing.transactionId ?? `bank_${randomUUID()}`,
        actor: caller,
        notes,
        // Re-checked under the installment lock: a concurrent reject must
        // not be overturned, and an installment paid meanwhile is a 409
        // the admin has to see, not a transfer silently cancelled.
        expectStatus: PaymentRecordStatus.awaiting_confirmation,
        conflictIfPaid: true,
      });
      // Last, after the order locks of the settlement (its foreign key
      // takes a key-share lock on the order).
      if (!settlement.skipNotify) {
        await writeOrderAudit(tx, settlement.payment.orderId, caller, {
          action: ORDER_AUDIT_ACTION.PAYMENT_CONFIRMED,
          paymentId,
          actorName,
          metadata: {
            ...paymentTransferAuditMetadata(
              settlement.payment,
              settlement.installmentNumber,
              { overrideNote },
            ),
          },
        });
      }
      return settlement;
    });
    return this.notifySettlement(settled);
  }

  /**
   * Admin refuses a transfer with a reason (trimmed, 3-500 characters,
   * 400 REJECTION_REASON_INVALID). Under the installment FOR UPDATE lock
   * (the lock confirm takes), a status-guarded write: a transfer confirmed
   * or withdrawn meanwhile is 409 TRANSFER_ALREADY_PROCESSED, a repeat on a
   * refused one answers the row (200). The order goes back from
   * payment_review to payment_pending when nothing else awaits the admin.
   * The doctor reads « Motif : … » (PaymentRejected.rejectionReason).
   */
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
    const reason = rejectionReasonOrThrow(rejectionReason);
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orderId: true,
        installmentId: true,
        paymentMethod: true,
        status: true,
      },
    });
    if (!existing) throw new NotFoundException('Payment not found.');
    if (existing.paymentMethod !== PaymentMethod.bank_transfer) {
      throw new BadRequestException(
        'Only bank-transfer payments can be rejected here.',
      );
    }
    if (
      existing.status !== PaymentRecordStatus.awaiting_confirmation &&
      existing.status !== PaymentRecordStatus.rejected
    ) {
      throw transferAlreadyProcessed(existing.status);
    }
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const { payment, changed } = await this.prisma.$transaction(async (tx) => {
      if (existing.installmentId) {
        await lockInstallmentRow(tx, existing.installmentId);
      }
      const { count } = await tx.payment.updateMany({
        where: {
          id: paymentId,
          paymentMethod: PaymentMethod.bank_transfer,
          status: PaymentRecordStatus.awaiting_confirmation,
        },
        data: {
          status: PaymentRecordStatus.rejected,
          rejectedAt: new Date(),
          rejectedById: caller.userId,
          rejectionReason: reason,
        },
      });
      const current = await tx.payment.findUnique({
        where: { id: paymentId },
        include: REJECTED_PAYMENT_INCLUDE,
      });
      if (!current) throw new NotFoundException('Payment not found.');
      if (count === 0) {
        // Not ours to write: an idempotent repeat, or processed meanwhile.
        if (current.status === PaymentRecordStatus.rejected) {
          return { payment: current, changed: false };
        }
        throw transferAlreadyProcessed(current.status);
      }
      await releaseOrderFromReview(tx, existing.orderId);
      await writeOrderAudit(tx, existing.orderId, caller, {
        action: ORDER_AUDIT_ACTION.PAYMENT_REJECTED,
        paymentId,
        actorName,
        metadata: {
          ...paymentTransferAuditMetadata(
            current,
            current.installment?.installmentNumber,
            { reason },
          ),
        },
      });
      return { payment: current, changed: true };
    });
    if (changed) {
      // Tell the doctor the proof was refused, and why, so he can re-submit.
      this.emit(NotificationEvents.PaymentRejected, {
        paymentId: payment.id,
        quotationId: payment.quotationId!,
        orderId: payment.orderId,
        orderCode: payment.order.orderCode,
        doctorId: payment.order.doctorId,
        doctorName: payment.order.doctor?.fullName ?? null,
        patientName: payment.order.patient?.fullName ?? null,
        amount: payment.amount.toString(),
        withholdingAmount: payment.withholdingAmount.toString(),
        stampAmount: payment.stampAmount.toString(),
        currency: payment.currency ?? 'TND',
        method: payment.paymentMethod,
        installmentNumber: payment.installment?.installmentNumber,
        rejectionReason: reason,
      } satisfies PaymentEvent);
    }
    return payment;
  }

  /**
   * The doctor (or an admin for him) withdraws a declaration still
   * awaiting confirmation: status cancelled + cancelledAt/By, the receipt
   * kept, audit payment_transfer_withdrawn, PaymentWithdrawn. Under the
   * installment lock, status-guarded; a repeat on a cancelled row answers
   * it (200); a transfer the admin already processed is 409
   * TRANSFER_NOT_WITHDRAWABLE. The order leaves payment_review when nothing
   * else awaits. Another dentist's payment is a 404.
   */
  async withdrawBankTransfer(
    paymentId: string,
    caller: Caller,
    note?: string,
  ): Promise<Payment> {
    if (!isAdmin(caller) && caller.role !== UserRole.dentist) {
      throw new NotFoundException('Payment not found.');
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orderId: true,
        quotationId: true,
        installmentId: true,
        paymentMethod: true,
        status: true,
        order: { select: { doctorId: true, deletedAt: true } },
      },
    });
    if (
      !existing ||
      existing.order.deletedAt ||
      (!isAdmin(caller) && existing.order.doctorId !== caller.userId)
    ) {
      throw new NotFoundException('Payment not found.');
    }
    if (existing.paymentMethod !== PaymentMethod.bank_transfer) {
      throw transferNotWithdrawable(existing.status);
    }
    if (
      existing.status !== PaymentRecordStatus.awaiting_confirmation &&
      existing.status !== PaymentRecordStatus.cancelled
    ) {
      throw transferNotWithdrawable(existing.status);
    }
    const reason = withdrawalNoteOf(note);
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const { payment, changed, installmentNumber, orderCode } =
      await this.prisma.$transaction(async (tx) => {
        if (existing.installmentId) {
          await lockInstallmentRow(tx, existing.installmentId);
        }
        const { count } = await tx.payment.updateMany({
          where: {
            id: paymentId,
            paymentMethod: PaymentMethod.bank_transfer,
            status: PaymentRecordStatus.awaiting_confirmation,
          },
          data: {
            status: PaymentRecordStatus.cancelled,
            cancelledAt: new Date(),
            cancelledById: caller.userId,
            cancelledByName: actorName,
          },
        });
        const current = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            installment: { select: { installmentNumber: true } },
            order: { select: { orderCode: true } },
          },
        });
        if (!current) throw new NotFoundException('Payment not found.');
        const { installment, order, ...row } = current;
        const result = {
          payment: row,
          installmentNumber: installment?.installmentNumber ?? null,
          orderCode: order.orderCode,
        };
        if (count === 0) {
          if (current.status === PaymentRecordStatus.cancelled) {
            return { ...result, changed: false };
          }
          throw transferNotWithdrawable(current.status);
        }
        await releaseOrderFromReview(tx, existing.orderId);
        await writeOrderAudit(tx, existing.orderId, caller, {
          action: ORDER_AUDIT_ACTION.PAYMENT_TRANSFER_WITHDRAWN,
          paymentId,
          actorName,
          metadata: {
            ...paymentTransferAuditMetadata(current, result.installmentNumber, {
              reason,
            }),
          },
        });
        return { ...result, changed: true };
      });
    if (changed) {
      this.emit(NotificationEvents.PaymentWithdrawn, {
        kind: 'installment',
        subjectKey: installmentSubjectKey(paymentId),
        reason: 'withdrawn',
        orderId: existing.orderId,
        orderCode,
        doctorId: existing.order.doctorId,
        paymentId,
        quotationId: existing.quotationId,
        installmentNumber,
        actorId: caller.userId,
      } satisfies TransferClosedEvent);
    }
    return payment;
  }

  /**
   * An admin opened a transfer receipt. The FIRST opening of a transfer
   * still awaiting stamps the global reviewOpenedAt/ById/ByName ("Reçu
   * envoyé" → "À vérifier") with the payment_review_opened audit row, under
   * the installment lock and status-guarded; later openings, and openings
   * of a processed transfer, stamp nothing. Every call emits
   * TransferReviewOpened so THIS admin's subject rows turn read.
   */
  async markTransferReviewOpened(
    paymentId: string,
    caller: Caller,
  ): Promise<{
    paymentId: string;
    reviewOpenedAt: Date | null;
    firstOpen: boolean;
  }> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Admin-only action.');
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orderId: true,
        installmentId: true,
        paymentMethod: true,
        status: true,
        reviewOpenedAt: true,
      },
    });
    if (!existing || existing.paymentMethod !== PaymentMethod.bank_transfer) {
      throw new NotFoundException('Payment not found.');
    }
    let reviewOpenedAt = existing.reviewOpenedAt;
    let firstOpen = false;
    if (
      existing.status === PaymentRecordStatus.awaiting_confirmation &&
      !existing.reviewOpenedAt
    ) {
      const actorName = await lookupActorName(this.prisma, caller.userId);
      const stamped = await this.prisma.$transaction(async (tx) => {
        if (existing.installmentId) {
          await lockInstallmentRow(tx, existing.installmentId);
        }
        const now = new Date();
        const { count } = await tx.payment.updateMany({
          where: {
            id: paymentId,
            status: PaymentRecordStatus.awaiting_confirmation,
            reviewOpenedAt: null,
          },
          data: {
            reviewOpenedAt: now,
            reviewOpenedById: caller.userId,
            reviewOpenedByName: actorName,
          },
        });
        const current = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { installment: { select: { installmentNumber: true } } },
        });
        if (count > 0 && current) {
          const audit = paymentTransferAuditMetadata(
            current,
            current.installment?.installmentNumber,
          );
          await writeOrderAudit(tx, existing.orderId, caller, {
            action: ORDER_AUDIT_ACTION.PAYMENT_REVIEW_OPENED,
            paymentId,
            actorName,
            metadata: {
              installmentNumber: audit.installmentNumber,
              method: audit.method,
              amount: audit.amount,
              hasProof: audit.hasProof,
            },
          });
        }
        return { first: count > 0, at: current?.reviewOpenedAt ?? null };
      });
      firstOpen = stamped.first;
      reviewOpenedAt = stamped.at;
    }
    this.emit(NotificationEvents.TransferReviewOpened, {
      kind: 'installment',
      subjectKey: installmentSubjectKey(paymentId),
      orderId: existing.orderId,
      paymentId,
      adminId: caller.userId,
      firstOpen,
      // A transfer processed before anyone opened it has no stamp: the
      // instant of this opening, for the listener's information only.
      reviewOpenedAt: (reviewOpenedAt ?? new Date()).toISOString(),
    } satisfies TransferReviewOpenedEvent);
    return { paymentId, reviewOpenedAt, firstOpen };
  }

  /**
   * The receipt of a transfer, for the authenticated stream (GET
   * payments/:paymentId/proof): the owning dentist and admins only. A
   * designer, a technician, another dentist, a payment without a receipt
   * or a file missing on disk all answer the same 404 PROOF_NOT_FOUND.
   */
  async readPaymentProof(
    paymentId: string,
    caller: Caller,
  ): Promise<{ receipt: OpenedReceipt; downloadName: string }> {
    if (!isAdmin(caller) && caller.role !== UserRole.dentist) {
      throw proofNotFound();
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        proofUrl: true,
        order: { select: { doctorId: true, orderCode: true } },
        installment: { select: { installmentNumber: true } },
      },
    });
    if (!payment?.proofUrl || !canReadReceipt(caller, payment.order.doctorId)) {
      throw proofNotFound();
    }
    const receipt = await openReceipt(payment.proofUrl);
    if (!receipt) throw proofNotFound();
    const rank = payment.installment?.installmentNumber;
    return {
      receipt,
      downloadName: `recu-${payment.order.orderCode}${rank ? `-echeance-${rank}` : ''}`,
    };
  }

  /**
   * Emit a post-commit event: the transition is already committed, so a
   * listener failure is logged, never thrown at the caller.
   */
  private emit(name: NotificationEventName, payload: object): void {
    try {
      this.events.emit(name, payload);
    } catch (error) {
      this.logger.warn(`Failed to emit ${name}: ${(error as Error).message}`);
    }
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
      throw new ForbiddenException('Only admins can record cash payments.');
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
    await this.assertPaymentAcceptable(row, method, args.applyWithholding);
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
      // Refused, withdrawn or replaced while we waited on the lock.
      throw transferAlreadyProcessed(payment.status);
    }

    // The installment may have already been marked paid by a
    // sibling Payment (e.g. CARD raced with BANK_TRANSFER confirm).
    if (installment.status === InstallmentStatus.paid) {
      if (args.conflictIfPaid) {
        throw new ConflictException(
          "Cette échéance est déjà payée : ce virement ne peut pas être confirmé. Rejetez-le, et remboursez le praticien si l'argent a bien été reçu.",
          INSTALLMENT_ALREADY_PAID,
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
        confirmedAt: payment.paymentMethod === PaymentMethod.card ? null : now,
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

    // Unlock batch (if not already delivered — defensive). The one writer
    // (production/batch-unlock.ts): guarded update, then the D2 projection
    // (steps an admin delivered before the payment (D1) flip the batch to
    // `delivered` now, in this transaction), then the batch_unlocked
    // journal row. A card settlement has no admin: the system unlocks.
    const unlocked =
      installment.stepBatch &&
      installment.stepBatch.status === BatchStatus.locked
        ? await unlockStepBatch(tx, {
            batchId: installment.stepBatch.id,
            source: BatchUnlockSource.payment,
            actor:
              payment.paymentMethod === PaymentMethod.card ? null : args.actor,
            paymentId: payment.id,
            at: now,
          })
        : null;

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
    const totalPrice =
      installment.quotation.totalPrice ?? new Prisma.Decimal(0);
    // The plan validator accepts installments within 0.001 of the
    // total (MONEY_EPSILON in quotation-payment-plan.service.ts), so
    // settlement must honor the same tolerance — otherwise a plan one
    // millime short of a fractional loyalty net can never reach
    // `paid`. A tolerated shortfall reports remainingAmount 0.
    const settled = totalPaid.gte(
      totalPrice.minus(new Prisma.Decimal('0.001')),
    );
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
    // A partial payment leaves the order in payment_review while another
    // installment transfer still awaits the admin (DECISIONS §1, the rule
    // a refusal applies), in payment_pending otherwise.
    const orderId = installment.quotation.orderId;
    if (newStatus === QuotationPaymentStatus.paid) {
      await advanceOrderWhenPaid(tx, orderId);
    } else {
      await moveOrderWithinPaymentPhase(
        tx,
        orderId,
        await paymentPhaseAfterPartialSettlement(tx, orderId),
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
        unlocked && installment.stepBatch ? installment.stepBatch : null,
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
        source: BatchUnlockSource.payment,
        paymentId: payment.id,
        installmentNumber,
        actorId: payment.confirmedById ?? null,
      } satisfies BatchUnlockedEvent);
    }
    return payment;
  }

  // ─── Read helpers (controller queries) ─────────────────────────

  /**
   * Pending-confirmations queue. Admin-only. Defaults to
   * `awaiting_confirmation` when the caller doesn't pass a status —
   * that's the inbox view.
   */
  async listPendingConfirmations(
    opts: PaymentListOptions & { caller: Caller },
  ) {
    if (!isAdmin(opts.caller)) {
      throw new ForbiddenException('Admin-only.');
    }
    return this.runFilteredQuery({
      ...opts,
      // Default to awaiting_confirmation when nothing more specific
      // was asked for. Explicit statuses[] / status filters still win.
      statuses:
        opts.statuses ??
        (opts.status
          ? [opts.status]
          : [PaymentRecordStatus.awaiting_confirmation]),
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
   * assertPayable for a bank-transfer declaration (and a receipt
   * replacement, which is one): an installment paid meanwhile, typically
   * because an admin confirmed the very transfer being replaced, is a 409
   * INSTALLMENT_ALREADY_PAID the client answers with « déjà traité » and a
   * refetch, never a code-less 400 it can only offer to retry.
   */
  private assertDeclarable(
    row: Parameters<PaymentsService['assertPayable']>[0],
  ): void {
    if (row.status === InstallmentStatus.paid) {
      throw new ConflictException(
        'Cette échéance est déjà payée : ce virement a déjà été traité.',
        INSTALLMENT_ALREADY_PAID,
      );
    }
    this.assertPayable(row);
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
