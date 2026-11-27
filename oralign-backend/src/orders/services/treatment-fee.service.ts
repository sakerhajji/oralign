import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  dec,
  toAmount,
  type PaymentCharge,
} from '../../common/billing/tax-split';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import {
  CARD_IN_FLIGHT_MESSAGE,
  IN_FLIGHT_PAYMENT_STATUSES,
  isAdminRecordedMethod,
  PAYMENT_ATTEMPT_IN_PROGRESS,
  readTreatmentFeeSettings,
  resolvePaymentCharge,
  toRate,
  TRANSFER_IN_FLIGHT_MESSAGE,
  treatmentFeeDue,
} from '../../payments/services/payment-rules';
import {
  assertConfirmReceipt,
  assertDeclarationReceipt,
  assertSameDeclaration,
  canReadReceipt,
  idempotencyKeyReused,
  parseTransferIdempotencyKey,
  proofNotFound,
  proofRequired,
  rejectionReasonOrThrow,
  sameDeclarationInstant,
  transferAlreadyProcessed,
  transferNotWithdrawable,
} from '../../payments/services/transfer-rules';
import { treatmentFeeTransferState } from '../../payments/services/transfer-state';
import {
  assertReceiptFile,
  openReceipt,
  type OpenedReceipt,
  type ReceiptUpload,
  removeReceiptFile,
  writeReceiptFile,
} from '../../payments/receipt-file';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BankDetailsSnapshot,
  hasUsableBankTransferDetails,
} from '../../common/utils/bank-details.util';
import {
  type NotificationEventName,
  NotificationEvents,
  type TransferClosedEvent,
  type TransferReviewOpenedEvent,
  type TreatmentFeeEvent,
  type TreatmentFeeRejectedEvent,
} from '../../notifications/events/notification-events';
import { treatmentFeeSubjectKey } from '../../notifications/notification-subject';
import { isAdmin, type Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import { ORDER_AUDIT_ACTION } from '../../common/audit/order-audit-actions';
import { writeOrderAudit } from '../../common/audit/order-audit-entry';
import {
  type TreatmentFeeFilterDto,
  type TreatmentFeePageDto,
  type TreatmentFeeReviewOpenedDto,
  type TreatmentFeeRowDto,
} from '../dto/treatment-fee.dto';
import { OrderService } from './order.service';
import { OrderAuditService } from './order-audit.service';
import { treatmentFeeOrderBy, treatmentFeeWhere } from './treatment-fee-query';
import {
  currentFeeRefusal,
  declaredFeeAuditMetadata,
  isAwaitingFee,
  LOCKED_FEE_SELECT,
  type LockedFee,
  newDeclarationData,
  SETTLED_IN_PERSON_FEE_DATA,
  WITHDRAWN_FEE_DATA,
} from './treatment-fee-transfer';
import { assertTreatmentFeeApplies } from '../order-kind';
import {
  mapOrderToDto,
  orderInclude,
  type OrderResponseView,
  type OrderWithRelations,
} from './order.mapper';

type Tx = Prisma.TransactionClient;

/**
 * The per-order treatment fee: the flat, server-priced amount a doctor
 * pays to unlock treatment planning (distinct from the pack/quotation
 * installments handled by PaymentsService). Owns the three payment
 * paths (card / cash / bank transfer + admin review), the two admin lists
 * and the notification fan-out. Split out of OrderService so the money
 * rules live in one place next to each other.
 *
 * Bank transfers (spec §1) follow the pack-installment model on the
 * order's columns (no Payment row): a receipt is mandatory for a dentist,
 * each declaration is named by treatmentFeeDeclaredAt (the notification
 * subject), the first admin opening stamps treatmentFeeReviewOpenedAt, and
 * an admin confirms or refuses with a reason; the doctor may replace or
 * withdraw while it awaits. Every transition runs under the order's
 * FOR UPDATE lock (the lock the ClicToPay fee attempt and its settlement
 * take), status-guarded, journaled in the same transaction, with its event
 * after the commit.
 */
@Injectable()
export class TreatmentFeeService {
  private readonly logger = new Logger(TreatmentFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly events: EventEmitter2,
    private readonly orderAudit: OrderAuditService,
  ) {}

  /**
   * Pay the order's treatment fee. Routes by payment method, mirroring
   * the lifecycle of the installment Payment record:
   *
   *   • CARD          → refused here: the ClicToPay hosted checkout is
   *                     the only card path.
   *   • CASH / CHEQUE → admin-only (money received in person); instant
   *                     success, stamps `treatmentFeePaidAt`. A dentist
   *                     can never mark the fee paid this way.
   *   • BANK_TRANSFER → a dentist declares through the receipt upload
   *                     (`uploadTreatmentFeeProof`): 400 PROOF_REQUIRED
   *                     here. An admin declaring for the doctor WITHOUT a
   *                     receipt gives an override note (400
   *                     PROOF_OVERRIDE_NOTE_REQUIRED otherwise); the fee
   *                     then awaits confirmation like an upload.
   *
   * Charge (payment-rules): the droit de timbre is added on top of the fee
   * due (the fee's facture carries it) and, when `applyWithholding` is
   * set, the retenue à la source (company rate, on the due) comes off.
   * Everything is computed here and stored on the order:
   * `treatmentFeeAmount` is the cash (due + stamp - retenue), beside it the
   * retenue and the stamp; the fee due is cash + retenue - stamp.
   *
   * Idempotent on already-paid orders (the row is returned unchanged so a
   * double-click is harmless).
   */
  async payTreatmentFee(
    id: string,
    method: PaymentMethod,
    caller: Caller,
    applyWithholding?: boolean,
    overrideNote?: string,
  ): Promise<OrderResponseView> {
    this.orders.ensureCanCreateOrModify(caller);
    if (method === PaymentMethod.card) {
      throw new BadRequestException(
        'Card payments must use the secure hosted checkout.',
        'CARD_PAYMENT_REQUIRES_HOSTED_CHECKOUT',
      );
    }
    // Cash and cheque are collected in the clinic — only an admin records
    // them, so a dentist can never mark the fee paid on their own word.
    if (isAdminRecordedMethod(method) && !isAdmin(caller)) {
      throw new ForbiddenException(
        'Cash and cheque payments can only be recorded by an admin.',
      );
    }
    if (method === PaymentMethod.bank_transfer) {
      return this.declareWithoutReceipt(
        id,
        caller,
        applyWithholding,
        overrideNote,
      );
    }
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);

    if (current.treatmentFeePaidAt) {
      return mapOrderToDto(current, caller);
    }
    this.ensureNotWelcomeGift(current);
    // Server-computed — the client only says whether the retenue applies.
    const fee = await this.resolveTreatmentFee(current, applyWithholding);

    // CASH / CHEQUE — instant success. Card payments use ClicToPay and
    // reach this aggregate only after server-side provider verification.
    // The fee columns then describe this payment: an earlier refused
    // transfer's instant, refusal and receipt pointer are cleared (the
    // refusal stays in the order history, the file on disk).
    const auditEntry = await this.orderAudit.entry(
      caller,
      ORDER_AUDIT_ACTION.TREATMENT_FEE_PAID,
      null,
      feeAuditMetadata(method, fee),
    );
    const order = await this.writeFeeUnderLock(
      id,
      {
        treatmentFeePaymentMethod: method,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
        ...feeAmounts(fee),
        ...SETTLED_IN_PERSON_FEE_DATA,
      },
      auditEntry,
    );
    if (!order) return this.currentDto(id, caller);
    this.logger.log(
      `Treatment fee paid (${method}) for order ${id} by user ${caller.userId} — due ${fee.due.toFixed(3)}, stamp ${fee.stamp.toFixed(3)}, received ${fee.cash.toFixed(3)}`,
    );
    // Admin audit ping — money is in. The doctor doesn't get a ping
    // because they saw the dialog's success state themselves.
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeePaid,
      order,
      method,
    );
    return mapOrderToDto(order, caller);
  }

  /**
   * An admin declares the doctor's transfer without a receipt, with his
   * override note (bank_transfer on POST /pay). A declaration still
   * awaiting is superseded; the new one has no receipt (hasProof false),
   * so confirming it will ask for an override note again.
   */
  private async declareWithoutReceipt(
    id: string,
    caller: Caller,
    applyWithholding: boolean | undefined,
    overrideNote: string | undefined,
  ): Promise<OrderResponseView> {
    // A dentist: 400 PROOF_REQUIRED; an admin without a note: 400
    // PROOF_OVERRIDE_NOTE_REQUIRED (the rule of both flows).
    const note = assertDeclarationReceipt({
      caller,
      hasReceipt: false,
      overrideNote,
    });
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (current.treatmentFeePaidAt) return mapOrderToDto(current, caller);
    this.ensureNotWelcomeGift(current);
    const fee = await this.resolveTreatmentFee(current, applyWithholding);
    await this.ensureBankTransferIsConfigured();
    const actorName = await lookupActorName(this.prisma, caller.userId);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockFee(tx, id);
      if (locked.treatmentFeePaidAt) return null;
      await this.assertNoCardFeeInFlight(tx, id);
      const declaredAt = new Date();
      const previous = isAwaitingFee(locked)
        ? locked.treatmentFeeDeclaredAt
        : null;
      const updated = await tx.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
          treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
          treatmentFeeProofPath: null,
          ...feeAmounts(fee),
          ...newDeclarationData(declaredAt, null),
        },
        include: orderInclude,
      });
      await writeOrderAudit(tx, id, caller, {
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_DECLARED,
        actorName,
        metadata: {
          ...feeAuditMetadata(PaymentMethod.bank_transfer, fee),
          hasProof: false,
          declaredAt: declaredAt.toISOString(),
          overrideNote: note,
        },
      });
      return { order: updated, declaredAt, previous };
    });
    if (!outcome) return this.currentDto(id, caller);
    this.logger.log(
      `Treatment fee bank transfer declared without a receipt for order ${id} by admin ${caller.userId}`,
    );
    this.announceDeclaration(outcome, caller);
    return mapOrderToDto(outcome.order, caller);
  }

  /**
   * Attach a bank-transfer receipt to an order's treatment fee: the
   * doctor's declaration (an admin may upload for him). The receipt is
   * required (400 PROOF_REQUIRED), checked (JPEG / PNG / WebP / PDF, 10 MB,
   * content scan: 400 RECEIPT_TYPE / RECEIPT_TOO_LARGE) and written only
   * once the caller is authorised and the fee payable, under
   * uploads/orders/<id>/payment-proofs; unlinked when the write fails.
   *
   * A new declaration: treatmentFeeDeclaredAt = now, the review and the
   * refusal cleared. A declaration still awaiting is superseded (audit
   * treatment_fee_proof_replaced, TreatmentFeeSuperseded with the OLD
   * subject), otherwise treatment_fee_proof_uploaded; then
   * TreatmentFeeDeclared. Idempotency-Key: the same key on this order
   * answers the order as it stands (200), on another order of the doctor
   * 409 TRANSFER_IDEMPOTENCY_KEY_REUSED.
   */
  async uploadTreatmentFeeProof(
    id: string,
    receipt: ReceiptUpload | null | undefined,
    caller: Caller,
    applyWithholding?: boolean,
    idempotencyKey?: string,
  ): Promise<OrderResponseView> {
    const key = parseTransferIdempotencyKey(idempotencyKey);
    this.orders.ensureCanCreateOrModify(caller);
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (key && current.treatmentFeeDeclarationKey === key) {
      return mapOrderToDto(current, caller);
    }
    if (key) await this.assertDeclarationKeyFree(current.doctorId, id, key);
    if (current.treatmentFeePaidAt) throw feeAlreadyPaid();
    this.ensureNotWelcomeGift(current);
    if (!receipt) throw proofRequired();
    // Server-computed amount (audit M-4) — not taken from the client.
    const fee = await this.resolveTreatmentFee(current, applyWithholding);
    await this.ensureBankTransferIsConfigured();
    const kind = await assertReceiptFile(receipt);
    const actorName = await lookupActorName(this.prisma, caller.userId);

    const proofPath = await writeReceiptFile(id, receipt.buffer, kind);
    let outcome:
      | { replay: true }
      | { paid: true }
      | { order: OrderWithRelations; declaredAt: Date; previous: Date | null };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockFee(tx, id);
        if (key && locked.treatmentFeeDeclarationKey === key) {
          return { replay: true as const };
        }
        if (locked.treatmentFeePaidAt) return { paid: true as const };
        await this.assertNoCardFeeInFlight(tx, id);
        const declaredAt = new Date();
        const previous = isAwaitingFee(locked)
          ? locked.treatmentFeeDeclaredAt
          : null;
        const updated = await tx.dentalOrder.update({
          where: { id },
          data: {
            treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
            treatmentFeePaymentStatus:
              PaymentRecordStatus.awaiting_confirmation,
            treatmentFeeProofPath: proofPath,
            ...feeAmounts(fee),
            ...newDeclarationData(declaredAt, key),
          },
          include: orderInclude,
        });
        await writeOrderAudit(tx, id, caller, {
          action: previous
            ? ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_REPLACED
            : ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_UPLOADED,
          actorName,
          metadata: {
            ...feeAuditMetadata(PaymentMethod.bank_transfer, fee),
            hasProof: true,
            declaredAt: declaredAt.toISOString(),
          },
        });
        return { order: updated, declaredAt, previous };
      });
    } catch (error) {
      await removeReceiptFile(proofPath);
      throw error;
    }
    if ('replay' in outcome) {
      await removeReceiptFile(proofPath);
      return this.currentDto(id, caller);
    }
    if ('paid' in outcome) {
      await removeReceiptFile(proofPath);
      throw feeAlreadyPaid();
    }
    this.logger.log(
      `Treatment fee bank-transfer proof uploaded for order ${id} by user ${caller.userId}`,
    );
    this.announceDeclaration(outcome, caller);
    return mapOrderToDto(outcome.order, caller);
  }

  /**
   * The doctor (or an admin for him) withdraws the fee declaration still
   * awaiting confirmation (DELETE orders/:id/treatment-fee/proof): the fee
   * is payable again, the receipt file kept on disk, audit
   * treatment_fee_proof_removed, TreatmentFeeWithdrawn. A repeat (nothing
   * declared any more) answers the order; a declaration already confirmed
   * or refused is 409 TRANSFER_NOT_WITHDRAWABLE.
   */
  async withdrawTreatmentFeeProof(
    id: string,
    caller: Caller,
  ): Promise<OrderResponseView> {
    this.orders.ensureCanCreateOrModify(caller);
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (!current.treatmentFeePaidAt && !current.treatmentFeePaymentStatus) {
      return mapOrderToDto(current, caller);
    }
    if (!isAwaitingFee(current)) {
      throw transferNotWithdrawable(current.treatmentFeePaymentStatus);
    }
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockFee(tx, id);
      if (!locked.treatmentFeePaidAt && !locked.treatmentFeePaymentStatus) {
        return null;
      }
      if (!isAwaitingFee(locked)) {
        throw transferNotWithdrawable(locked.treatmentFeePaymentStatus);
      }
      const declared = await tx.dentalOrder.findUnique({
        where: { id },
        select: {
          treatmentFeePaymentMethod: true,
          treatmentFeeAmount: true,
          treatmentFeeWithholdingRate: true,
          treatmentFeeWithholdingAmount: true,
          treatmentFeeStampAmount: true,
          treatmentFeeProofPath: true,
        },
      });
      const updated = await tx.dentalOrder.update({
        where: { id },
        data: WITHDRAWN_FEE_DATA,
        include: orderInclude,
      });
      const audit = declaredFeeAuditMetadata(
        declared ?? { treatmentFeePaymentMethod: null, treatmentFeeAmount: 0 },
        { declaredAt: locked.treatmentFeeDeclaredAt },
      );
      await writeOrderAudit(tx, id, caller, {
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_REMOVED,
        actorName,
        metadata: {
          method: audit.method,
          amount: audit.amount,
          ...(audit.declaredAt ? { declaredAt: audit.declaredAt } : {}),
        },
      });
      return { order: updated, declaredAt: locked.treatmentFeeDeclaredAt };
    });
    if (!outcome) return this.currentDto(id, caller);
    if (outcome.declaredAt) {
      this.emit(NotificationEvents.TreatmentFeeWithdrawn, {
        kind: 'treatment_fee',
        subjectKey: treatmentFeeSubjectKey(id, outcome.declaredAt),
        reason: 'withdrawn',
        orderId: id,
        orderCode: outcome.order.orderCode,
        doctorId: outcome.order.doctorId,
        actorId: caller.userId,
      } satisfies TransferClosedEvent);
    }
    return mapOrderToDto(outcome.order, caller);
  }

  /**
   * Paginated admin queue of treatment-fee bank-transfer payments
   * awaiting confirmation, newest declaration first (index
   * treatmentFeePaymentStatus + treatmentFeeDeclaredAt). Mirrors the shape
   * of the installment "pending confirmations" list so the admin pending
   * page can render both in one consistent layout.
   *
   * Filter envelope: { page, limit } — same as the installment list, and
   * the same page count: 0 pages when nothing waits.
   */
  async listPendingTreatmentFees(args: {
    page?: number;
    limit?: number;
    caller: Caller;
  }): Promise<TreatmentFeePageDto> {
    if (!isAdmin(args.caller)) {
      throw new ForbiddenException(
        'Only admins can view the treatment-fee queue.',
      );
    }
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DentalOrderWhereInput = {
      deletedAt: null,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeePaidAt: null,
    };

    const [rows, total] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        orderBy: [
          { treatmentFeeDeclaredAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip,
        take: limit,
        select: this.treatmentFeeSelect,
      }),
      this.prisma.dentalOrder.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.mapTreatmentFeeRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Treatment-fee history: every order whose fee has a payment on record,
   * filtered, sorted (newest payment first by default, the fees still
   * awaiting confirmation on top) and paginated.
   */
  async listTreatmentFees(
    filters: TreatmentFeeFilterDto,
    caller: Caller,
  ): Promise<TreatmentFeePageDto> {
    const callerIsAdmin = isAdmin(caller);
    if (!callerIsAdmin && caller.role !== UserRole.dentist) {
      // Only admins and dentists ever ask for the treatment-fee
      // history. Any other role (designer, etc.) gets a 403.
      throw new ForbiddenException(
        'You are not allowed to view the treatment-fee history.',
      );
    }
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
    // Doctors only ever see THEIR OWN orders, whatever doctorId they
    // send; admins every doctor's, or the one they pick.
    const doctorId = callerIsAdmin ? filters.doctorId : caller.userId;
    const where = treatmentFeeWhere(filters, doctorId);

    const [rows, total] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        orderBy: treatmentFeeOrderBy(filters),
        skip: (page - 1) * limit,
        take: limit,
        select: this.treatmentFeeSelect,
      }),
      this.prisma.dentalOrder.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.mapTreatmentFeeRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin confirms a bank-transfer payment. Flips the status to
   * `success` and stamps `treatmentFeePaidAt`, which unlocks the
   * treatment-plan gate in `TreatmentPlanService.create()`. A repeat on a
   * paid fee answers the order (200); a declaration refused or withdrawn
   * meanwhile, or replaced since the admin's screen named it (`declaredAt`),
   * is 409 TRANSFER_ALREADY_PROCESSED; one without a receipt needs the
   * override note (400 PROOF_OVERRIDE_NOTE_REQUIRED).
   */
  async confirmTreatmentFeePayment(
    id: string,
    caller: Caller,
    options: { overrideNote?: string; declaredAt?: string } = {},
  ): Promise<OrderResponseView> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can confirm a bank-transfer payment.',
      );
    }
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (current.treatmentFeePaidAt) {
      return mapOrderToDto(current, caller);
    }
    if (!isAwaitingFee(current)) {
      throw transferAlreadyProcessed(current.treatmentFeePaymentStatus);
    }
    assertSameDeclaration(
      current.treatmentFeeDeclaredAt,
      options.declaredAt,
      current.treatmentFeePaymentStatus,
    );
    const overrideNote = assertConfirmReceipt(
      Boolean(current.treatmentFeeProofPath),
      options.overrideNote,
    );
    const actorName = await lookupActorName(this.prisma, caller.userId);
    // The amounts stay as declared (cash, retenue, stamp): the admin
    // confirms the transfer, not a new figure, even when the stamp or the
    // rate changed since. Under the order lock so a card settlement that
    // won meanwhile is not overwritten.
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockFee(tx, id);
      if (locked.treatmentFeePaidAt) return null;
      if (
        !isAwaitingFee(locked) ||
        !sameDeclarationInstant(
          locked.treatmentFeeDeclaredAt,
          current.treatmentFeeDeclaredAt,
        )
      ) {
        throw transferAlreadyProcessed(locked.treatmentFeePaymentStatus);
      }
      const updated = await tx.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
          treatmentFeePaidAt: new Date(),
        },
        include: orderInclude,
      });
      await writeOrderAudit(tx, id, caller, {
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_CONFIRMED,
        actorName,
        changes: {
          treatmentFeePaymentStatus: {
            from: PaymentRecordStatus.awaiting_confirmation,
            to: PaymentRecordStatus.success,
          },
        },
        metadata: {
          ...declaredFeeAuditMetadata(current, {
            declaredAt: current.treatmentFeeDeclaredAt,
            overrideNote,
          }),
        },
      });
      return updated;
    });
    if (!order) return this.currentDto(id, caller);
    this.logger.log(
      `Treatment fee bank-transfer CONFIRMED for order ${id} by admin ${caller.userId}`,
    );
    // Doctor ping — their payment was verified, treatment plan can
    // proceed. Use the recorded amounts (admin can't override them
    // here, so what the doctor declared is what's confirmed).
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeeConfirmed,
      order,
      order.treatmentFeePaymentMethod ?? PaymentMethod.bank_transfer,
    );
    return mapOrderToDto(order, caller);
  }

  /**
   * Admin refuses the fee transfer with a reason (trimmed, 3-500, 400
   * REJECTION_REASON_INVALID): status rejected, treatmentFeeRejectedAt /
   * ById / ByName / Reason, the declared amounts kept; audit
   * treatment_fee_rejected; TreatmentFeeRejected (the doctor reads
   * « Motif : … »). A repeat on that refused declaration answers the order
   * (200); a declaration confirmed, withdrawn or replaced meanwhile is 409
   * TRANSFER_ALREADY_PROCESSED. The doctor declares again with a new
   * receipt.
   */
  async rejectTreatmentFeePayment(
    id: string,
    caller: Caller,
    body: { rejectionReason: string; declaredAt?: string },
  ): Promise<OrderResponseView> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can refuse a bank-transfer payment.',
      );
    }
    const reason = rejectionReasonOrThrow(body.rejectionReason);
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    assertSameDeclaration(
      current.treatmentFeeDeclaredAt,
      body.declaredAt,
      current.treatmentFeePaymentStatus,
    );
    const alreadyRefused =
      !current.treatmentFeePaidAt &&
      current.treatmentFeePaymentStatus === PaymentRecordStatus.rejected;
    if (alreadyRefused) return mapOrderToDto(current, caller);
    if (!isAwaitingFee(current)) {
      throw transferAlreadyProcessed(current.treatmentFeePaymentStatus);
    }
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockFee(tx, id);
      const sameDeclaration = sameDeclarationInstant(
        locked.treatmentFeeDeclaredAt,
        current.treatmentFeeDeclaredAt,
      );
      if (
        sameDeclaration &&
        !locked.treatmentFeePaidAt &&
        locked.treatmentFeePaymentStatus === PaymentRecordStatus.rejected
      ) {
        return null;
      }
      if (!isAwaitingFee(locked) || !sameDeclaration) {
        throw transferAlreadyProcessed(locked.treatmentFeePaymentStatus);
      }
      const updated = await tx.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
          treatmentFeeRejectedAt: new Date(),
          treatmentFeeRejectedById: caller.userId,
          treatmentFeeRejectedByName: actorName,
          treatmentFeeRejectionReason: reason,
        },
        include: orderInclude,
      });
      await writeOrderAudit(tx, id, caller, {
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_REJECTED,
        actorName,
        changes: {
          treatmentFeePaymentStatus: {
            from: PaymentRecordStatus.awaiting_confirmation,
            to: PaymentRecordStatus.rejected,
          },
        },
        metadata: {
          ...declaredFeeAuditMetadata(current, {
            declaredAt: current.treatmentFeeDeclaredAt,
            reason,
          }),
        },
      });
      return updated;
    });
    if (!outcome) return this.currentDto(id, caller);
    this.logger.log(
      `Treatment fee bank-transfer REFUSED for order ${id} by admin ${caller.userId}`,
    );
    const declaredAt = outcome.treatmentFeeDeclaredAt;
    if (declaredAt) {
      this.emit(NotificationEvents.TreatmentFeeRejected, {
        ...this.feeEventPayload(
          outcome,
          outcome.treatmentFeePaymentMethod ?? PaymentMethod.bank_transfer,
        ),
        declaredAt: declaredAt.toISOString(),
        rejectionReason: reason,
        rejectedById: caller.userId,
      } satisfies TreatmentFeeRejectedEvent);
    }
    return mapOrderToDto(outcome, caller);
  }

  /**
   * An admin opened the fee receipt. The FIRST opening of a declaration
   * still awaiting stamps treatmentFeeReviewOpenedAt ("À vérifier") with
   * the treatment_fee_review_opened audit row, under the order lock and
   * guarded on that very declaration; later openings, and openings of a
   * processed one, stamp nothing. Every call emits TransferReviewOpened so
   * THIS admin's subject rows turn read. An order without a declaration
   * is a 404.
   */
  async markTreatmentFeeReviewOpened(
    id: string,
    caller: Caller,
  ): Promise<TreatmentFeeReviewOpenedDto> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Admin-only action.');
    }
    const order = await this.prisma.dentalOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        ...LOCKED_FEE_SELECT,
      },
    });
    const declaredAt = order?.treatmentFeeDeclaredAt;
    if (!order || !declaredAt) {
      throw new NotFoundException('No treatment-fee transfer on this order.');
    }
    let reviewOpenedAt = order.treatmentFeeReviewOpenedAt;
    let firstOpen = false;
    if (isAwaitingFee(order) && !order.treatmentFeeReviewOpenedAt) {
      const actorName = await lookupActorName(this.prisma, caller.userId);
      const stamped = await this.prisma.$transaction(async (tx) => {
        await this.lockOrderRow(tx, id);
        const now = new Date();
        const { count } = await tx.dentalOrder.updateMany({
          where: {
            id,
            treatmentFeePaidAt: null,
            treatmentFeePaymentStatus:
              PaymentRecordStatus.awaiting_confirmation,
            treatmentFeeDeclaredAt: declaredAt,
            treatmentFeeReviewOpenedAt: null,
          },
          data: { treatmentFeeReviewOpenedAt: now },
        });
        if (count > 0) {
          await writeOrderAudit(tx, id, caller, {
            action: ORDER_AUDIT_ACTION.TREATMENT_FEE_REVIEW_OPENED,
            actorName,
            metadata: { declaredAt: declaredAt.toISOString() },
          });
          return { first: true, at: now };
        }
        const after = await tx.dentalOrder.findUnique({
          where: { id },
          select: { treatmentFeeReviewOpenedAt: true },
        });
        return { first: false, at: after?.treatmentFeeReviewOpenedAt ?? null };
      });
      firstOpen = stamped.first;
      reviewOpenedAt = stamped.at;
    }
    const subjectKey = treatmentFeeSubjectKey(id, declaredAt);
    this.emit(NotificationEvents.TransferReviewOpened, {
      kind: 'treatment_fee',
      subjectKey,
      orderId: id,
      paymentId: null,
      adminId: caller.userId,
      firstOpen,
      // A declaration processed before anyone opened it has no stamp: the
      // instant of this opening, for the listener's information only.
      reviewOpenedAt: (reviewOpenedAt ?? new Date()).toISOString(),
    } satisfies TransferReviewOpenedEvent);
    return { orderId: id, subjectKey, reviewOpenedAt, firstOpen };
  }

  /**
   * The fee receipt, for the authenticated stream (GET
   * orders/:id/treatment-fee/proof): the owning dentist and admins only.
   * A designer, a technician, another dentist, an order without a receipt
   * or a file missing on disk all answer the same 404 PROOF_NOT_FOUND.
   */
  async readTreatmentFeeProof(
    id: string,
    caller: Caller,
  ): Promise<{ receipt: OpenedReceipt; downloadName: string }> {
    if (!isAdmin(caller) && caller.role !== UserRole.dentist) {
      throw proofNotFound();
    }
    const order = await this.prisma.dentalOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        doctorId: true,
        orderCode: true,
        treatmentFeeProofPath: true,
      },
    });
    if (
      !order?.treatmentFeeProofPath ||
      !canReadReceipt(caller, order.doctorId)
    ) {
      throw proofNotFound();
    }
    const receipt = await openReceipt(order.treatmentFeeProofPath);
    if (!receipt) throw proofNotFound();
    return {
      receipt,
      downloadName: `recu-frais-${order.orderCode}`,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────

  /**
   * Write a payment received in person (cash / cheque) under the order's
   * row lock (the lock the ClicToPay attempt and its settlement take), so
   * the paid check and the "one payment at a time" checks hold until the
   * write commits: no card attempt in flight, and no bank transfer still
   * awaiting the admin (409 PAYMENT_ATTEMPT_IN_PROGRESS: confirm or refuse
   * it first, as for an installment). Returns null when the fee got paid
   * meanwhile: nothing is written.
   */
  private async writeFeeUnderLock(
    id: string,
    data: Prisma.DentalOrderUncheckedUpdateInput,
    auditEntry: Awaited<ReturnType<OrderAuditService['entry']>>,
  ): Promise<OrderWithRelations | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockFee(tx, id);
      if (locked.treatmentFeePaidAt) return null;
      if (isAwaitingFee(locked)) {
        throw new ConflictException(
          TRANSFER_IN_FLIGHT_MESSAGE,
          PAYMENT_ATTEMPT_IN_PROGRESS,
        );
      }
      await this.assertNoCardFeeInFlight(tx, id);
      const updated = await tx.dentalOrder.update({
        where: { id },
        data,
        include: orderInclude,
      });
      await tx.orderAuditLog.create({
        data: { orderId: id, ...auditEntry },
      });
      return updated;
    });
  }

  /** The order row lock every fee transition takes. */
  private async lockOrderRow(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${id} FOR UPDATE`;
  }

  /** The order row lock, then the fee columns as they stand under it. */
  private async lockFee(tx: Tx, id: string): Promise<LockedFee> {
    await this.lockOrderRow(tx, id);
    const locked = await tx.dentalOrder.findUnique({
      where: { id },
      select: LOCKED_FEE_SELECT,
    });
    if (!locked) throw new NotFoundException('Order not found');
    return locked;
  }

  /**
   * A ClicToPay attempt still undecided on this fee may yet take the
   * money: recording another payment beside it is how a fee gets paid
   * twice. The attempt expires on its own (or is settled) within minutes.
   */
  private async assertNoCardFeeInFlight(
    tx: Tx,
    orderId: string,
  ): Promise<void> {
    const live = await tx.payment.findFirst({
      where: {
        orderId,
        purpose: PaymentPurpose.treatment_fee,
        paymentMethod: PaymentMethod.card,
        status: { in: IN_FLIGHT_PAYMENT_STATUSES },
      },
      select: { id: true },
    });
    if (live) {
      throw new ConflictException(
        CARD_IN_FLIGHT_MESSAGE,
        PAYMENT_ATTEMPT_IN_PROGRESS,
      );
    }
  }

  /**
   * An Idempotency-Key already used on ANOTHER order of this doctor is a
   * 409 (the client reused a key across fees). Scoped by doctor, so the
   * read rides the doctor index.
   */
  private async assertDeclarationKeyFree(
    doctorId: string,
    orderId: string,
    key: string,
  ): Promise<void> {
    const other = await this.prisma.dentalOrder.findFirst({
      where: {
        doctorId,
        id: { not: orderId },
        treatmentFeeDeclarationKey: key,
      },
      select: { id: true },
    });
    if (other) throw idempotencyKeyReused();
  }

  /**
   * After a new declaration committed: the superseded one's subject
   * resolves first (TreatmentFeeSuperseded, with the OLD subject), then the
   * admins hear of the new one (TreatmentFeeDeclared, with its
   * declaredAt).
   */
  private announceDeclaration(
    outcome: {
      order: OrderWithRelations;
      declaredAt: Date;
      previous: Date | null;
    },
    caller: Caller,
  ): void {
    const { order, declaredAt, previous } = outcome;
    const subjectKey = treatmentFeeSubjectKey(order.id, declaredAt);
    if (previous && previous.getTime() !== declaredAt.getTime()) {
      this.emit(NotificationEvents.TreatmentFeeSuperseded, {
        kind: 'treatment_fee',
        subjectKey: treatmentFeeSubjectKey(order.id, previous),
        reason: 'superseded',
        orderId: order.id,
        orderCode: order.orderCode,
        doctorId: order.doctorId,
        actorId: caller.userId,
        replacedBySubjectKey: subjectKey,
      } satisfies TransferClosedEvent);
    }
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeeDeclared,
      order,
      PaymentMethod.bank_transfer,
    );
  }

  /** The order as it stands now (after a concurrent settlement won). */
  private async currentDto(
    id: string,
    caller: Caller,
  ): Promise<OrderResponseView> {
    return mapOrderToDto(
      await this.orders.findAccessibleOrder(id, caller),
      caller,
    );
  }

  /**
   * The welcome gift waived this order's whole treatment-fee
   * charge: there is nothing to pay, declare or prove. Refused before any
   * amount is computed so no payment state can ever land on a gift order.
   */
  private ensureNotWelcomeGift(order: {
    welcomeGiftAppliedAt: Date | null;
  }): void {
    if (order.welcomeGiftAppliedAt) {
      throw new BadRequestException(
        "Nothing to pay: this case's fees are covered by the welcome gift.",
        'WELCOME_GIFT_NOTHING_DUE',
      );
    }
  }

  /**
   * SECURITY (audit M-4): the treatment fee is computed SERVER-SIDE, never
   * taken from the client. It is the configured `defaultTreatmentFee` from
   * the active billing settings plus this order's server-snapshotted CBCT
   * supplement (`cbctFeeAmount`, itself set server-side at order creation).
   * This is the exact figure the treatment-plan gate checks, so a doctor
   * can no longer pay 0 (or any client value) to unlock treatment planning.
   *
   * The company's current droit de timbre is added on top of that due,
   * and the retenue à la source, when asked for, is computed on the due
   * (stamp excluded) at the company's current rate, only where the rule
   * lets it apply (DECISIONS §4, assertWithholdingAllowed):
   *   • 400 WITHHOLDING_DISABLED when the retenue is switched off
   *     (withholdingEnabled false) or its rate is 0;
   *   • 400 WITHHOLDING_BELOW_THRESHOLD when the due is below the
   *     threshold in force (base ≥ threshold, compared in Decimal; the
   *     error body carries `withholdingThreshold`).
   * The threshold is snapshotted with the charge. Decimal end to end, the
   * very charge of the card path (paymentCharge):
   *   300 + 50 CBCT, stamp 1, retenue 1 %  ->  351 - 3.500 = 347.500 cash
   */
  private async resolveTreatmentFee(
    order: { cbctFeeAmount: Prisma.Decimal | null },
    applyWithholding: boolean | undefined,
  ): Promise<PaymentCharge> {
    // The one read of the fee's settings, shared with the card checkout
    // (fee, stamp, retenue and its threshold snapshot).
    const settings = await readTreatmentFeeSettings(this.prisma);
    return resolvePaymentCharge(
      applyWithholding,
      treatmentFeeDue(settings.defaultTreatmentFee, order.cbctFeeAmount),
      settings,
    );
  }

  /**
   * Tight Prisma projection used by both treatment-fee list endpoints.
   * Pulls only the fields the admin queue UI actually renders — order
   * code, doctor + patient names for the row header, the treatment-fee
   * fields, the declaration's review and refusal, and the timestamps the
   * table sorts on.
   */
  private readonly treatmentFeeSelect = {
    id: true,
    orderCode: true,
    treatmentFeeAmount: true,
    treatmentFeeWithholdingRate: true,
    treatmentFeeWithholdingAmount: true,
    treatmentFeeStampAmount: true,
    treatmentFeePaymentMethod: true,
    treatmentFeePaymentStatus: true,
    treatmentFeePaidAt: true,
    treatmentFeeProofPath: true,
    treatmentFeeInvoiceNumber: true,
    treatmentFeeDeclaredAt: true,
    treatmentFeeReviewOpenedAt: true,
    treatmentFeeRejectedAt: true,
    treatmentFeeRejectionReason: true,
    submittedAt: true,
    updatedAt: true,
    doctor: { select: { id: true, fullName: true, email: true } },
    patient: { select: { id: true, fullName: true } },
  } satisfies Prisma.DentalOrderSelect;

  /** Decimal → Number at the DTO boundary; matches the rest of the API. */
  private mapTreatmentFeeRow(row: {
    id: string;
    orderCode: string;
    treatmentFeeAmount: Prisma.Decimal | null;
    treatmentFeeWithholdingRate?: Prisma.Decimal | null;
    treatmentFeeWithholdingAmount?: Prisma.Decimal | null;
    treatmentFeeStampAmount?: Prisma.Decimal | null;
    treatmentFeePaymentMethod: PaymentMethod | null;
    treatmentFeePaymentStatus: PaymentRecordStatus | null;
    treatmentFeePaidAt: Date | null;
    treatmentFeeProofPath: string | null;
    treatmentFeeInvoiceNumber: string | null;
    treatmentFeeDeclaredAt?: Date | null;
    treatmentFeeReviewOpenedAt?: Date | null;
    treatmentFeeRejectedAt?: Date | null;
    treatmentFeeRejectionReason?: string | null;
    submittedAt: Date | null;
    updatedAt: Date;
    doctor?: { id: string; fullName: string; email: string } | null;
    patient?: { id: string; fullName: string } | null;
  }): TreatmentFeeRowDto {
    const withheld = row.treatmentFeeWithholdingAmount;
    const refusal = currentFeeRefusal({
      treatmentFeePaidAt: row.treatmentFeePaidAt,
      treatmentFeePaymentStatus: row.treatmentFeePaymentStatus,
      treatmentFeeRejectedAt: row.treatmentFeeRejectedAt ?? null,
      treatmentFeeRejectionReason: row.treatmentFeeRejectionReason ?? null,
    });
    return {
      orderId: row.id,
      orderCode: row.orderCode,
      // Cash collected; the fee due is amount + withholdingAmount -
      // stampAmount.
      amount:
        row.treatmentFeeAmount !== null ? Number(row.treatmentFeeAmount) : null,
      withholdingRate:
        row.treatmentFeeWithholdingRate !== null &&
        row.treatmentFeeWithholdingRate !== undefined &&
        withheld?.gt(0)
          ? Number(row.treatmentFeeWithholdingRate)
          : null,
      withholdingAmount: withheld?.gt(0) ? Number(withheld) : 0,
      // 0 on fees paid before the stamp was added (null column).
      stampAmount: toAmount(row.treatmentFeeStampAmount),
      method: row.treatmentFeePaymentMethod,
      status: row.treatmentFeePaymentStatus,
      paidAt: row.treatmentFeePaidAt,
      proofPath: row.treatmentFeeProofPath,
      hasProof: Boolean(row.treatmentFeeProofPath),
      state: treatmentFeeTransferState({
        treatmentFeePaidAt: row.treatmentFeePaidAt,
        treatmentFeePaymentStatus: row.treatmentFeePaymentStatus,
        treatmentFeeReviewOpenedAt: row.treatmentFeeReviewOpenedAt,
      }),
      declaredAt: row.treatmentFeeDeclaredAt ?? null,
      reviewOpenedAt: row.treatmentFeeReviewOpenedAt ?? null,
      rejectedAt: refusal.rejectedAt,
      rejectionReason: refusal.rejectionReason,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      invoiceNumber: row.treatmentFeeInvoiceNumber,
      doctor: row.doctor ?? null,
      patient: row.patient ?? null,
    };
  }

  /**
   * The TreatmentFeeEvent of an order as written: the cash, the retenue
   * kept back and the stamp charged on top, and the declaration's instant
   * for a bank transfer (the subject of its notifications).
   */
  private feeEventPayload(
    order: OrderWithRelations,
    method: PaymentMethod,
  ): TreatmentFeeEvent {
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
      amount: dec(order.treatmentFeeAmount).toString(),
      withholdingAmount: dec(order.treatmentFeeWithholdingAmount).toString(),
      stampAmount: dec(order.treatmentFeeStampAmount).toString(),
      currency: 'TND',
      method,
      declaredAt:
        method === PaymentMethod.bank_transfer && order.treatmentFeeDeclaredAt
          ? order.treatmentFeeDeclaredAt.toISOString()
          : null,
    };
  }

  /**
   * Compose + emit a TreatmentFeeEvent. Centralised here so the payload
   * shape stays in lockstep with the event interface, and a failing
   * emission never bubbles up to the caller (the business write is
   * already committed). Currency falls back to 'TND' (the fee has no
   * currency column; it inherits the global default).
   */
  private emitTreatmentFeeEvent(
    eventName: (typeof NotificationEvents)[
      | 'TreatmentFeeDeclared'
      | 'TreatmentFeePaid'
      | 'TreatmentFeeConfirmed'],
    order: OrderWithRelations,
    method: PaymentMethod,
  ): void {
    this.emit(eventName, this.feeEventPayload(order, method));
  }

  /** Post-commit emission: a listener failure is logged, never thrown. */
  private emit(eventName: NotificationEventName, payload: object): void {
    try {
      this.events.emit(eventName, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to emit ${eventName}: ${(err as Error).message}`,
      );
    }
  }

  private async ensureBankTransferIsConfigured(): Promise<void> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { bankDetails: true },
    });
    const details = (settings?.bankDetails ?? null) as BankDetailsSnapshot;
    if (hasUsableBankTransferDetails(details)) return;
    throw new BadRequestException(
      'Bank transfer is not available until company bank details are configured.',
    );
  }
}

/**
 * A receipt sent (a declaration, or the replacement of one) on a fee that
 * is already paid: typically an admin confirmed the very transfer being
 * replaced. 409 TRANSFER_ALREADY_PROCESSED, so the client says « déjà
 * traité » and refetches instead of offering a retry that fails the same
 * way.
 */
function feeAlreadyPaid(): ConflictException {
  return new ConflictException(
    'Les honoraires de traitement sont déjà payés : ce virement a déjà été traité.',
    TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED,
    { status: PaymentRecordStatus.success },
  );
}

/**
 * The order columns a treatment-fee payment writes: the cash collected,
 * the retenue beside it (rate and amount null when not applied, so a
 * re-declaration without it clears an earlier one) and the stamp charged
 * on top (always written, so a re-declaration carries the current one).
 */
function feeAmounts(fee: PaymentCharge) {
  return {
    treatmentFeeAmount: fee.cash,
    treatmentFeeWithholdingRate: fee.withholdingRate,
    treatmentFeeWithholdingAmount: fee.withholdingRate ? fee.withholding : null,
    treatmentFeeStampAmount: fee.stamp,
    // The retenue threshold in force (snapshot; the rule itself is P-D1).
    treatmentFeeWithholdingThreshold: fee.withholdingThreshold,
  };
}

/**
 * The order audit trail: the fee due, the stamp added on top, the retenue
 * when applied, and the cash whenever it differs from the due.
 */
function feeAuditMetadata(
  method: PaymentMethod,
  fee: PaymentCharge,
): Record<string, unknown> {
  return {
    method,
    amount: toAmount(fee.due),
    ...(fee.stamp.gt(0) ? { stampAmount: toAmount(fee.stamp) } : {}),
    ...(fee.withholdingRate
      ? {
          withholdingRate: toRate(fee.withholdingRate),
          withholdingAmount: toAmount(fee.withholding),
        }
      : {}),
    ...(fee.cash.equals(fee.due) ? {} : { cashAmount: toAmount(fee.cash) }),
  };
}
