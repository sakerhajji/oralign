import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
} from '../../common/exceptions/app.exception';
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
import { OrderService } from './order.service';
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
  ) {}

  /**
   * Pay the order's treatment fee. Routes by payment method, mirroring
   * the lifecycle of the installment Payment record:
   *
   *   • CARD          → instant success. The mock card collector
   *                     stamps `treatmentFeePaidAt = now()`.
   *   • CASH          → admin-only. Same shape as CARD but only an
   *                     admin can call (the doctor doesn't see the
   *                     button in their UI). Stamps `treatmentFeePaidAt`.
   *   • BANK_TRANSFER → doctor uploads a receipt via
   *                     `uploadTreatmentFeeProof()`. We record the
   *                     method + status=awaiting_confirmation but do
   *                     NOT stamp `treatmentFeePaidAt` — the admin
   *                     must call `confirmTreatmentFeePayment()` once
   *                     the funds land.
   *
   * Idempotent on already-paid orders (both card + cash branches
   * return the row unchanged so a double-click is harmless).
   */
  async payTreatmentFee(
    id: string,
    method: PaymentMethod,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.orders.ensureCanCreateOrModify(caller);
    const current = await this.orders.findAccessibleOrder(id, caller);

    if (current.treatmentFeePaidAt) {
      return mapOrderToDto(current);
    }
    // Server-computed — the client no longer supplies the amount.
    const amount = await this.resolveTreatmentFeeAmount(current);

    // Cash collection is an in-clinic flow — only an admin records it.
    if (
      method === PaymentMethod.cash &&
      !isAdmin(caller)
    ) {
      throw new ForbiddenException(
        'Cash payment can only be recorded by an admin.',
      );
    }

    // Bank transfer takes a dedicated path — admin confirmation gates
    // the actual `paidAt`. Direct callers should use uploadProof + confirm.
    if (method === PaymentMethod.bank_transfer) {
      await this.ensureBankTransferIsConfigured();
      const order = await this.prisma.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentMethod: method,
          treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
          treatmentFeeAmount: amount,
        },
        include: orderInclude,
      });
      this.logger.log(
        `Treatment fee bank-transfer recorded (awaiting admin confirmation) for order ${id} by user ${caller.userId}`,
      );
      // Fire-and-forget admin ping — doctor declared a wire intent.
      // The receipt is uploaded via uploadTreatmentFeeProof which
      // emits its own ping with the proof attached.
      this.emitTreatmentFeeEvent(
        NotificationEvents.TreatmentFeeDeclared,
        order,
        amount,
        method,
      );
      return mapOrderToDto(order);
    }

    // CARD or CASH — instant success.
    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        treatmentFeePaymentMethod: method,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
        treatmentFeeAmount: amount,
      },
      include: orderInclude,
    });
    this.logger.log(
      `Treatment fee paid (${method}) for order ${id} by user ${caller.userId} — amount ${amount}`,
    );
    // Admin audit ping — money is in. The doctor doesn't get a ping
    // because they saw the dialog's success state themselves.
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeePaid,
      order,
      amount,
      method,
    );
    return mapOrderToDto(order);
  }

  /**
   * Attach a bank-transfer receipt to an order's treatment fee. Called
   * by the doctor as part of the BANK_TRANSFER flow. Also bumps the
   * payment lifecycle to `awaiting_confirmation` if it isn't already.
   */
  async uploadTreatmentFeeProof(
    id: string,
    relativePath: string,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.orders.ensureCanCreateOrModify(caller);
    const current = await this.orders.findAccessibleOrder(id, caller);
    if (current.treatmentFeePaidAt) {
      throw new BadRequestException(
        'Treatment fee is already paid — receipt upload not allowed.',
      );
    }
    // Server-computed amount (audit M-4) — not taken from the client.
    const amount = await this.resolveTreatmentFeeAmount(current);
    await this.ensureBankTransferIsConfigured();
    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
        treatmentFeeProofPath: relativePath,
        treatmentFeeAmount: amount,
      },
      include: orderInclude,
    });
    this.logger.log(
      `Treatment fee bank-transfer proof uploaded for order ${id} by user ${caller.userId}`,
    );
    // Fire-and-forget admin ping — the receipt is now attached and
    // the order needs confirmation. Admins see this in the bell +
    // /payments/pending list.
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeeDeclared,
      order,
      amount,
      PaymentMethod.bank_transfer,
    );
    return mapOrderToDto(order);
  }

  /**
   * Paginated admin queue of treatment-fee bank-transfer payments
   * awaiting confirmation. Mirrors the shape of the installment
   * Payment "pending confirmations" list so the admin /pending page
   * can render both in one consistent layout.
   *
   * Filter envelope: { page, limit } — same as the installment list.
   */
  async listPendingTreatmentFees(args: {
    page?: number;
    limit?: number;
    caller: Caller;
  }) {
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
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Admin history of treatment-fee payments. Returns every order
   * where a method has been recorded, sorted by paid date (most
   * recent first; unpaid rows fall to the bottom).
   */
  async listTreatmentFees(args: {
    page?: number;
    limit?: number;
    caller: Caller;
  }) {
    const callerIsAdmin = isAdmin(args.caller);
    const isDentist = args.caller.role === UserRole.dentist;
    if (!callerIsAdmin && !isDentist) {
      // Only admins and dentists ever ask for the treatment-fee
      // history. Any other role (designer, etc.) gets a 403.
      throw new ForbiddenException(
        'You are not allowed to view the treatment-fee history.',
      );
    }
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.min(100, Math.max(1, args.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DentalOrderWhereInput = {
      deletedAt: null,
      treatmentFeePaymentMethod: { not: null },
      // Doctors only ever see THEIR OWN orders. Admins see every
      // doctor's. The doctorId filter is added at the DB layer so a
      // pagination scan stays O(matching rows) for the doctor case
      // instead of paging through the full system list and filtering
      // in-memory.
      ...(isDentist ? { doctorId: args.caller.userId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        orderBy: [
          { treatmentFeePaidAt: 'desc' },
          { updatedAt: 'desc' },
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
      totalPages: Math.max(1, Math.ceil(total / limit)),
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
    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      },
      include: orderInclude,
    });
    this.logger.log(
      `Treatment fee bank-transfer CONFIRMED for order ${id} by admin ${caller.userId}`,
    );
    // Doctor ping — their payment was verified, treatment plan can
    // proceed. Use the recorded amount (admin can't override it
    // here, so what the doctor declared is what's confirmed).
    this.emitTreatmentFeeEvent(
      NotificationEvents.TreatmentFeeConfirmed,
      order,
      Number(order.treatmentFeeAmount ?? 0),
      order.treatmentFeePaymentMethod ?? PaymentMethod.bank_transfer,
    );
    return mapOrderToDto(order);
  }

  // ── Internals ──────────────────────────────────────────────────────

  /**
   * SECURITY (audit M-4): the treatment fee is computed SERVER-SIDE, never
   * taken from the client. It is the configured `defaultTreatmentFee` from
   * the active billing settings plus this order's server-snapshotted CBCT
   * supplement (`cbctFeeAmount`, itself set server-side at order creation).
   * This is the exact figure the treatment-plan gate checks, so a doctor
   * can no longer pay 0 (or any client value) to unlock treatment planning.
   */
  private async resolveTreatmentFeeAmount(order: {
    cbctFeeAmount: Prisma.Decimal | null;
  }): Promise<number> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { defaultTreatmentFee: true },
    });
    const base = Number(settings?.defaultTreatmentFee ?? 0);
    const cbct = order.cbctFeeAmount ? Number(order.cbctFeeAmount) : 0;
    return base + cbct;
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
    treatmentFeePaymentMethod: true,
    treatmentFeePaymentStatus: true,
    treatmentFeePaidAt: true,
    treatmentFeeProofPath: true,
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
    treatmentFeePaymentMethod: PaymentMethod | null;
    treatmentFeePaymentStatus: PaymentRecordStatus | null;
    treatmentFeePaidAt: Date | null;
    treatmentFeeProofPath: string | null;
    submittedAt: Date | null;
    updatedAt: Date;
    doctor?: { id: string; fullName: string; email: string } | null;
    patient?: { id: string; fullName: string } | null;
  }) {
    return {
      orderId: row.id,
      orderCode: row.orderCode,
      amount:
        row.treatmentFeeAmount !== null
          ? Number(row.treatmentFeeAmount)
          : null,
      method: row.treatmentFeePaymentMethod,
      status: row.treatmentFeePaymentStatus,
      paidAt: row.treatmentFeePaidAt,
      proofPath: row.treatmentFeeProofPath,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
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
   */
  private emitTreatmentFeeEvent(
    eventName: (typeof NotificationEvents)[
      | 'TreatmentFeeDeclared'
      | 'TreatmentFeePaid'
      | 'TreatmentFeeConfirmed'],
    order: OrderWithRelations,
    amount: number,
    method: PaymentMethod,
  ): void {
    try {
      this.events.emit(eventName, {
        orderId: order.id,
        orderCode: order.orderCode,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        amount: String(amount),
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
