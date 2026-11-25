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
} from '../../common/exceptions/app.exception';
import {
  CARD_IN_FLIGHT_MESSAGE,
  IN_FLIGHT_PAYMENT_STATUSES,
  isAdminRecordedMethod,
  PAYMENT_ATTEMPT_IN_PROGRESS,
  resolvePaymentCharge,
  toRate,
  treatmentFeeDue,
  treatmentFeeSettled,
} from '../../payments/services/payment-rules';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BankDetailsSnapshot,
  hasUsableBankTransferDetails,
} from '../../common/utils/bank-details.util';
import {
  NotificationEvents,
  type TreatmentFeeEvent,
} from '../../notifications/events/notification-events';
import { isAdmin, type Caller } from '../../common/access/caller';
import { OrderResponseDto } from '../dto/order.dto';
import {
  type TreatmentFeeFilterDto,
  type TreatmentFeePageDto,
  type TreatmentFeeRowDto,
} from '../dto/treatment-fee.dto';
import { OrderService } from './order.service';
import { OrderAuditService } from './order-audit.service';
import { treatmentFeeOrderBy, treatmentFeeWhere } from './treatment-fee-query';
import { assertTreatmentFeeApplies } from '../order-kind';
import {
  mapOrderToDto,
  orderInclude,
  type OrderWithRelations,
} from './order.mapper';

/**
 * The per-order treatment fee: the flat, server-priced amount a doctor
 * pays to unlock treatment planning (distinct from the pack/quotation
 * installments handled by PaymentsService). Owns the three payment
 * paths (card / cash / bank transfer + admin confirmation), the two
 * admin lists and the notification fan-out. Split out of OrderService so
 * the money rules live in one place next to each other.
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
   *   • BANK_TRANSFER → doctor uploads a receipt via
   *                     `uploadTreatmentFeeProof()`. We record the
   *                     method + status=awaiting_confirmation but do
   *                     NOT stamp `treatmentFeePaidAt` — the admin
   *                     must call `confirmTreatmentFeePayment()` once
   *                     the funds land.
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
  ): Promise<OrderResponseDto> {
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
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);

    if (current.treatmentFeePaidAt) {
      return mapOrderToDto(current);
    }
    this.ensureNotWelcomeGift(current);
    // Server-computed — the client only says whether the retenue applies.
    const fee = await this.resolveTreatmentFee(current, applyWithholding);

    // Bank transfer takes a dedicated path — admin confirmation gates
    // the actual `paidAt`. Direct callers should use uploadProof + confirm.
    if (method === PaymentMethod.bank_transfer) {
      await this.ensureBankTransferIsConfigured();
      const auditEntry = await this.orderAudit.entry(
        caller,
        'treatment_fee_declared',
        null,
        feeAuditMetadata(method, fee),
      );
      const order = await this.writeFeeUnderLock(
        id,
        {
          treatmentFeePaymentMethod: method,
          treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
          ...feeAmounts(fee),
        },
        auditEntry,
      );
      if (!order) return this.currentDto(id, caller);
      this.logger.log(
        `Treatment fee bank-transfer recorded (awaiting admin confirmation) for order ${id} by user ${caller.userId}`,
      );
      // Fire-and-forget admin ping — doctor declared a wire intent.
      // The receipt is uploaded via uploadTreatmentFeeProof which
      // emits its own ping with the proof attached.
      this.emitTreatmentFeeEvent(
        NotificationEvents.TreatmentFeeDeclared,
        order,
        method,
      );
      return mapOrderToDto(order);
    }

    // CASH / CHEQUE — instant success. Card payments use ClicToPay and
    // reach this aggregate only after server-side provider verification.
    const auditEntry = await this.orderAudit.entry(
      caller,
      'treatment_fee_paid',
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
      },
      auditEntry,
    );
    if (!order) return this.currentDto(id, caller);
    this.logger.log(
      `Treatment fee paid (${method}) for order ${id} by user ${caller.userId} — due ${fee.due.toFixed(3)}, stamp ${fee.stamp.toFixed(3)}, received ${fee.cash.toFixed(3)}`,
    );
    // Admin audit ping — money is in. The doctor doesn't get a ping
    // because they saw the dialog's success state themselves.
    this.emitTreatmentFeeEvent(NotificationEvents.TreatmentFeePaid, order, method);
    return mapOrderToDto(order);
  }

  /**
   * Attach a bank-transfer receipt to an order's treatment fee. Called
   * by the doctor as part of the BANK_TRANSFER flow. Also bumps the
   * payment lifecycle to `awaiting_confirmation` if it isn't already.
   * The charge (retenue choice and stamp) is stored with the declaration;
   * confirming keeps it as declared. A new upload replaces the previous
   * declaration.
   */
  async uploadTreatmentFeeProof(
    id: string,
    relativePath: string,
    caller: Caller,
    applyWithholding?: boolean,
  ): Promise<OrderResponseDto> {
    this.orders.ensureCanCreateOrModify(caller);
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (current.treatmentFeePaidAt) {
      throw new BadRequestException(
        'Treatment fee is already paid — receipt upload not allowed.',
      );
    }
    this.ensureNotWelcomeGift(current);
    // Server-computed amount (audit M-4) — not taken from the client.
    const fee = await this.resolveTreatmentFee(current, applyWithholding);
    await this.ensureBankTransferIsConfigured();
    const auditEntry = await this.orderAudit.entry(
      caller,
      'treatment_fee_proof_uploaded',
      null,
      feeAuditMetadata(PaymentMethod.bank_transfer, fee),
    );
    const order = await this.writeFeeUnderLock(
      id,
      {
        treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
        treatmentFeeProofPath: relativePath,
        ...feeAmounts(fee),
      },
      auditEntry,
    );
    if (!order) {
      throw new BadRequestException(
        'Treatment fee is already paid — receipt upload not allowed.',
      );
    }
    this.logger.log(
      `Treatment fee bank-transfer proof uploaded for order ${id} by user ${caller.userId}`,
    );
    // Fire-and-forget admin ping — the receipt is now attached and
    // the order needs confirmation. Admins see this in the bell +
    // /payments/pending list.
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeeDeclared,
      order,
      PaymentMethod.bank_transfer,
    );
    return mapOrderToDto(order);
  }

  /**
   * Write a treatment-fee payment under the order's row lock (the lock
   * the ClicToPay attempt and its settlement take), so the paid check and
   * the "no card payment in flight" check hold until the write commits.
   * Returns null when the fee got paid meanwhile: nothing is written.
   */
  private async writeFeeUnderLock(
    id: string,
    data: Prisma.DentalOrderUpdateInput,
    auditEntry: Awaited<ReturnType<OrderAuditService['entry']>>,
  ): Promise<OrderWithRelations | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.dentalOrder.findUnique({
        where: { id },
        select: { treatmentFeePaidAt: true },
      });
      if (locked?.treatmentFeePaidAt) return null;
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

  /**
   * A ClicToPay attempt still undecided on this fee may yet take the
   * money: recording another payment beside it is how a fee gets paid
   * twice. The attempt expires on its own (or is settled) within minutes.
   */
  private async assertNoCardFeeInFlight(
    tx: Prisma.TransactionClient,
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

  /** The order as it stands now (after a concurrent settlement won). */
  private async currentDto(
    id: string,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    return mapOrderToDto(await this.orders.findAccessibleOrder(id, caller));
  }

  /**
   * Paginated admin queue of treatment-fee bank-transfer payments
   * awaiting confirmation. Mirrors the shape of the installment
   * Payment "pending confirmations" list so the admin /pending page
   * can render both in one consistent layout.
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
        orderBy: { updatedAt: 'desc' },
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
   * Treatment-fee history: every order whose fee has a payment method on
   * record, filtered, sorted (newest payment first by default, the fees
   * still awaiting confirmation on top) and paginated.
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
   * treatment-plan gate in `TreatmentPlanService.create()`.
   */
  async confirmTreatmentFeePayment(
    id: string,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can confirm a bank-transfer payment.',
      );
    }
    const current = await this.orders.findAccessibleOrder(id, caller);
    assertTreatmentFeeApplies(current);
    if (current.treatmentFeePaidAt) {
      return mapOrderToDto(current);
    }
    if (
      current.treatmentFeePaymentStatus !==
      PaymentRecordStatus.awaiting_confirmation
    ) {
      throw new BadRequestException(
        'No bank-transfer payment is awaiting confirmation on this order.',
      );
    }
    const auditEntry = await this.orderAudit.entry(
      caller,
      'treatment_fee_confirmed',
      {
        treatmentFeePaymentStatus: {
          from: PaymentRecordStatus.awaiting_confirmation,
          to: PaymentRecordStatus.success,
        },
      },
      {
        method:
          current.treatmentFeePaymentMethod ?? PaymentMethod.bank_transfer,
        // The fee due: the declared cash + the declared retenue - the
        // declared stamp.
        amount: toAmount(treatmentFeeSettled(current)),
      },
    );
    // The amounts stay as declared (cash, retenue, stamp): the admin
    // confirms the transfer, not a new figure, even when the stamp or the
    // rate changed since. Under the order lock so a card settlement that
    // won meanwhile is not overwritten.
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.dentalOrder.findUnique({
        where: { id },
        select: { treatmentFeePaidAt: true, treatmentFeePaymentStatus: true },
      });
      if (
        locked?.treatmentFeePaidAt ||
        locked?.treatmentFeePaymentStatus !==
          PaymentRecordStatus.awaiting_confirmation
      ) {
        return null;
      }
      const updated = await tx.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
          treatmentFeePaidAt: new Date(),
        },
        include: orderInclude,
      });
      await tx.orderAuditLog.create({
        data: { orderId: id, ...auditEntry },
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
    return mapOrderToDto(order);
  }

  // ── Internals ──────────────────────────────────────────────────────

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
   * (stamp excluded) at the company's current rate (400
   * WITHHOLDING_DISABLED when the rate is 0). Decimal end to end, the
   * very charge of the card path (paymentCharge):
   *   300 + 50 CBCT, stamp 1, retenue 1 %  ->  351 - 3.500 = 347.500 cash
   */
  private async resolveTreatmentFee(
    order: { cbctFeeAmount: Prisma.Decimal | null },
    applyWithholding: boolean | undefined,
  ): Promise<PaymentCharge> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        defaultTreatmentFee: true,
        withholdingRate: true,
        stampDuty: true,
      },
    });
    return resolvePaymentCharge(
      applyWithholding,
      treatmentFeeDue(settings?.defaultTreatmentFee, order.cbctFeeAmount),
      settings ?? {},
    );
  }

  /**
   * Tight Prisma projection used by both treatment-fee list endpoints.
   * Pulls only the fields the admin queue UI actually renders — order
   * code, doctor + patient names for the row header, the four
   * treatment-fee fields, and the timestamps the table sorts on.
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
    submittedAt: Date | null;
    updatedAt: Date;
    doctor?: { id: string; fullName: string; email: string } | null;
    patient?: { id: string; fullName: string } | null;
  }): TreatmentFeeRowDto {
    const withheld = row.treatmentFeeWithholdingAmount;
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
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      invoiceNumber: row.treatmentFeeInvoiceNumber,
      doctor: row.doctor ?? null,
      patient: row.patient ?? null,
    };
  }

  /**
   * Compose + emit a TreatmentFeeEvent. Centralised here so:
   *   • The payload shape stays in lockstep with the event interface
   *   • Failures in event emission never bubble up to the caller
   *     (the business write is already committed)
   *   • Currency falls back to 'TND' consistent with the rest of the
   *     system (the treatment-fee record has no currency field —
   *     it inherits the global default).
   * The amounts are read from the order as written: the cash, the
   * retenue kept back and the stamp charged on top.
   */
  private emitTreatmentFeeEvent(
    eventName: (typeof NotificationEvents)[
      | 'TreatmentFeeDeclared'
      | 'TreatmentFeePaid'
      | 'TreatmentFeeConfirmed'],
    order: OrderWithRelations,
    method: PaymentMethod,
  ): void {
    try {
      this.events.emit(eventName, {
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
      } satisfies TreatmentFeeEvent);
    } catch (err) {
      this.logger.warn(
        `Failed to emit ${eventName} for order ${order.id}: ${(err as Error).message}`,
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
