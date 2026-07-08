import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import {
  MediaProcessingStatus,
  OrderFile,
  OrderFileCategory,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  ToothInstructionType,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
// `archiver`'s runtime export is the callable "vending" factory
// (`archiver('zip', opts)`), but the bundled @types only declare the
// named class exports — not the call signature. We import the `Archiver`
// + options TYPES from the named exports and grab the callable factory
// via a typed `require` (see `createArchive` below the imports) so
// `archiver('zip', …)` stays the documented API while the return value
// is strongly typed as an `Archiver` stream.
import type { Archiver, ArchiverOptions } from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { OrderNotificationService } from '../../mail/order-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateStamp, slugifyForCode } from '../../common/utils/code-naming.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  type TreatmentFeeEvent,
} from '../../notifications/events/notification-events';
import {
  CreateOrderDto,
  OrderFileResponseDto,
  OrderFilterDto,
  OrderResponseDto,
  SubmitOrderDto,
  ToothInstructionDto,
  UpdateOrderDto,
} from '../dto/order.dto';
import { MediaProcessingService } from '../../media/media-processing.service';
import { classifyMedia } from '../../media/media.constants';
import {
  scanUploadContent,
  isDangerousUploadExtension,
} from '../../media/file-security';
import { buildSequentialName } from '../../media/naming';
import { MediaVariantInfo } from '../../media/media.types';

// Callable `archiver('zip', opts)` factory, typed via the named exports
// (see the import note above). Kept out of the import block so the
// `require` doesn't trip the `import/first` lint rule.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const createArchive: (
  format: 'zip' | 'tar',
  options?: ArchiverOptions,
) => Archiver = require('archiver');

type Caller = { userId: string; role: string };

const orderInclude = Prisma.validator<Prisma.DentalOrderInclude>()({
  doctor: { select: { id: true, fullName: true, email: true } },
  patient: { select: { id: true, fullName: true, email: true, phone: true } },
  toothInstructions: {
    select: { toothNumber: true, type: true, value: true, note: true },
    orderBy: [{ toothNumber: 'asc' }, { type: 'asc' }],
  },
  files: {
    where: { deletedAt: null },
    // Saved upload order first (orderIndex is per order+category); the
    // createdAt tie-break keeps legacy rows (all index 0) stable.
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  },
  // Used to compute notification badges in the orders list. `take: 1` keeps
  // the join tiny — Postgres only fetches one row per order, so this scales
  // with page size, not with plan-history size.
  //
  // PENDING plans are excluded: a pending plan is the planner's in-progress
  // draft, not a plan that has been issued to the doctor. Counting / badging
  // it would (a) leak a phantom "2nd treatment" to the doctor's tab and (b)
  // raise a premature "action required" dot. Planners still see every plan
  // (incl. drafts) via TreatmentPlanService.listForOrder + the always-on
  // treatment-plans tab, so nothing is hidden from them.
  treatmentPlans: {
    where: { deletedAt: null, status: { not: TreatmentPlanStatus.pending } },
    select: { id: true, status: true },
    orderBy: { version: 'desc' },
    take: 1,
  },
  _count: {
    select: {
      treatmentPlans: {
        where: { deletedAt: null, status: { not: TreatmentPlanStatus.pending } },
      },
    },
  },
});

type OrderWithRelations = Prisma.DentalOrderGetPayload<{
  include: typeof orderInclude;
}>;

type ClinicalOrderData = Partial<
  Pick<
    Prisma.DentalOrderUncheckedCreateInput,
    | 'patientStage'
    | 'chiefComplaint'
    | 'archTreatment'
    | 'treatBothArch'
    | 'treatmentPlan'
    | 'dontMoveOption'
    | 'apRelationship'
    | 'anteroposteriorRelationship'
    | 'elastics'
    | 'openBite'
    | 'midline'
    | 'ipr'
    | 'biteRamps'
    | 'expansion'
    | 'crossbite'
    | 'spaces'
    | 'extractions'
    | 'specialInstructions'
    | 'additionalInstructions'
    | 'useCbctWithScans'
    | 'wantsManufacturing'
    | 'materials'
  >
>;

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];

// ── Per-category upload caps ─────────────────────────────────────────
// Most slots (clinical photos, intra-oral scans as STL/PLY/OBJ, PDFs)
// fit comfortably under 50 MB and we cap there to keep storage sane.
//
// The exception is CBCT / DICOM bundles, which the clinical team ships
// as a single ZIP archive containing hundreds of slice files. Real-world
// CBCT volumes sit between 200 MB and 800 MB; bumping the ZIP-category
// ceiling to 1 GB covers everything we've seen so far without opening
// the door for someone to drop a 1 GB JPEG into a clinical-photo slot.
//
// Bytes-only constants (no MB strings) so unit conversion is obvious
// at the call site.
const MAX_FILE_SIZE_DEFAULT_BYTES = 50 * 1024 * 1024;      //  50 MB
const MAX_FILE_SIZE_ZIP_BUNDLE_BYTES = 1024 * 1024 * 1024; //   1 GB

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OrderNotificationService,
    private readonly events: EventEmitter2,
    private readonly mediaProcessing: MediaProcessingService,
  ) {}

  readonly includeOrder = orderInclude;

  async createOrder(
    createOrderDto: CreateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? createOrderDto.doctorId
      : caller.userId;

    if (!doctorId) {
      throw new BadRequestException('Dentist is required');
    }

    await this.ensureDentistExists(doctorId);
    await this.ensurePatientBelongsToDoctor(createOrderDto.patientId, doctorId);
    this.ensureUniqueToothInstructions(createOrderDto.toothInstructions ?? []);

    const order = await this.prisma.dentalOrder.create({
      data: {
        ...this.buildClinicalData(createOrderDto),
        orderCode:
          createOrderDto.orderCode ??
          (await this.generateOrderCode(createOrderDto.patientId)),
        doctorId,
        patientId: createOrderDto.patientId,
        toothInstructions: createOrderDto.toothInstructions?.length
          ? {
              create: createOrderDto.toothInstructions.map((instruction) => ({
                toothNumber: instruction.toothNumber,
                type: instruction.type,
              })),
            }
          : undefined,
      },
      include: this.includeOrder,
    });

    // Draft creation is intentionally silent — admins only get pinged
    // when the doctor actually submits for review (see submitOrder).
    // Notifying on every saved draft was noise: a doctor often opens
    // a new order and abandons it during photo prep.

    return this.mapToDto(order);
  }

  async getOrders(
    page = 1,
    limit = 10,
    filters: OrderFilterDto,
    caller: Caller,
  ): Promise<PaginatedResponse<OrderResponseDto>> {
    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;
    const where = this.buildWhere(filters, caller);

    // Sort key whitelisted by the DTO enum — Prisma throws on an
    // unknown key, but the runtime validation is the real safety net.
    const sortField = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.DentalOrderOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [orders, total] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        skip,
        take,
        orderBy,
        include: this.includeOrder,
      }),
      this.prisma.dentalOrder.count({ where }),
    ]);

    return new PaginatedResponse(
      orders.map((order) => this.mapToDto(order)),
      total,
      currentPage,
      take,
      Math.ceil(total / take),
    );
  }

  async getOrderById(id: string, caller: Caller): Promise<OrderResponseDto> {
    const order = await this.findAccessibleOrder(id, caller);
    return this.mapToDto(order);
  }

  async updateOrder(
    id: string,
    updateOrderDto: UpdateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(current, caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? updateOrderDto.doctorId
      : current.doctorId;
    const patientId = updateOrderDto.patientId ?? current.patientId;

    if (doctorId) {
      await this.ensureDentistExists(doctorId);
    }
    await this.ensurePatientBelongsToDoctor(
      patientId,
      doctorId ?? current.doctorId,
    );

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        ...this.buildClinicalData(updateOrderDto),
        ...(ADMIN_ROLES.includes(caller.role) && doctorId ? { doctorId } : {}),
        patientId,
        ...(updateOrderDto.orderCode
          ? { orderCode: updateOrderDto.orderCode }
          : {}),
      },
      include: this.includeOrder,
    });

    return this.mapToDto(order);
  }

  async deleteOrder(id: string, caller: Caller): Promise<{ message: string }> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(current, caller);

    await this.prisma.dentalOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Order deleted successfully' };
  }

  /**
   * Stamp `adminSeenAt` the first time an admin opens an order's detail.
   * This clears the sidebar "new orders" badge once the order has been
   * checked. Idempotent — the `adminSeenAt: null` filter makes a repeat
   * call a no-op, so the detail page can fire it on every mount. Only
   * admins drive the badge, so non-admins are a harmless no-op.
   */
  async markSeenByAdmin(id: string, caller: Caller): Promise<{ seen: boolean }> {
    if (!ADMIN_ROLES.includes(caller.role)) return { seen: false };
    const res = await this.prisma.dentalOrder.updateMany({
      where: { id, deletedAt: null, adminSeenAt: null },
      data: { adminSeenAt: new Date() },
    });
    return { seen: res.count > 0 };
  }

  /**
   * Restore a soft-deleted order. Admin-only — clearing `deletedAt`
   * makes the row visible to all the standard list/detail queries
   * again. Idempotent: an already-live order returns the same shape
   * so re-clicking "Restore" doesn't error.
   *
   * We intentionally skip `findAccessibleOrder` here because that
   * helper filters by `deletedAt: null` — we explicitly need to
   * fetch deleted rows. RBAC is enforced by the role check first.
   */
  async restoreOrder(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can restore deleted orders.',
      );
    }
    const order = await this.prisma.dentalOrder.findFirst({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.deletedAt === null) {
      // Already live — no-op (idempotent).
      return { message: 'Order is already active' };
    }

    await this.prisma.dentalOrder.update({
      where: { id },
      data: { deletedAt: null },
    });

    return { message: 'Order restored successfully' };
  }

  async permanentDeleteOrder(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanPermanentDelete(caller);

    const order = await this.prisma.dentalOrder.findFirst({
      where: { id },
      select: {
        id: true,
        files: { select: { relativePath: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderToothInstruction.deleteMany({ where: { orderId: id } });
      await tx.orderFile.deleteMany({ where: { orderId: id } });
      await tx.dentalOrder.delete({ where: { id } });
    });

    await Promise.all(
      order.files.map((file) => this.removeFileFromDisk(file.relativePath)),
    );

    return { message: 'Order permanently deleted successfully' };
  }

  async submitOrder(
    id: string,
    dto: SubmitOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status !== OrderStatus.draft) {
      throw new BadRequestException('Only draft orders can be submitted');
    }

    // Terms & Conditions gate — the doctor must accept the GTC before an
    // order can be submitted. The frontend disables the button until the
    // box is checked; this is the authoritative server-side guard.
    if (dto?.termsAccepted !== true) {
      throw new BadRequestException(
        'You must accept the General Terms & Conditions to submit the order.',
      );
    }

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        status: OrderStatus.submitted,
        submittedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
      include: this.includeOrder,
    });

    // Fire-and-forget — fan-out emails to doctor + all admins. Failures
    // are logged inside the notification service so a flaky SMTP relay
    // can't break the submit-order transaction the user is waiting on.
    void this.notifications.notifyOrderSubmitted(order.id);

    // In-app bell ping for the admin team.
    this.events.emit(NotificationEvents.OrderSubmitted, {
      orderId: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
    });

    return this.mapToDto(order);
  }

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
    amount: number,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);

    if (current.treatmentFeePaidAt) {
      return this.mapToDto(current);
    }
    if (amount < 0) {
      throw new BadRequestException('Treatment fee amount must be ≥ 0.');
    }

    // Cash collection is an in-clinic flow — only an admin records it.
    if (
      method === PaymentMethod.cash &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException(
        'Cash payment can only be recorded by an admin.',
      );
    }

    // Bank transfer takes a dedicated path — admin confirmation gates
    // the actual `paidAt`. Direct callers should use uploadProof + confirm.
    if (method === PaymentMethod.bank_transfer) {
      const order = await this.prisma.dentalOrder.update({
        where: { id },
        data: {
          treatmentFeePaymentMethod: method,
          treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
          treatmentFeeAmount: amount,
        },
        include: this.includeOrder,
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
      return this.mapToDto(order);
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
      include: this.includeOrder,
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
    return this.mapToDto(order);
  }

  /**
   * Attach a bank-transfer receipt to an order's treatment fee. Called
   * by the doctor as part of the BANK_TRANSFER flow. Also bumps the
   * payment lifecycle to `awaiting_confirmation` if it isn't already.
   */
  async uploadTreatmentFeeProof(
    id: string,
    relativePath: string,
    amount: number,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);
    if (current.treatmentFeePaidAt) {
      throw new BadRequestException(
        'Treatment fee is already paid — receipt upload not allowed.',
      );
    }
    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
        treatmentFeeProofPath: relativePath,
        treatmentFeeAmount: amount,
      },
      include: this.includeOrder,
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
    return this.mapToDto(order);
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
    if (!ADMIN_ROLES.includes(args.caller.role)) {
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
    const isAdmin = ADMIN_ROLES.includes(args.caller.role);
    const isDentist = args.caller.role === UserRole.dentist;
    if (!isAdmin && !isDentist) {
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
   * Admin confirms a bank-transfer payment. Flips the status to
   * `success` and stamps `treatmentFeePaidAt`, which unlocks the
   * treatment-plan gate in `TreatmentPlanService.create()`.
   */
  async confirmTreatmentFeePayment(
    id: string,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can confirm a bank-transfer payment.',
      );
    }
    const current = await this.findAccessibleOrder(id, caller);
    if (current.treatmentFeePaidAt) {
      return this.mapToDto(current);
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
      include: this.includeOrder,
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
    return this.mapToDto(order);
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
    order: Prisma.DentalOrderGetPayload<{ include: typeof orderInclude }>,
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

  /**
   * Admin-only manual status override.
   *
   * Sets `order.status` to any valid OrderStatus value, no state-machine
   * validation — the admin is intentionally allowed to roll forward
   * (skip ahead) OR roll backward (undo a transition that fired by
   * mistake). Related side-tables (treatment plan, quotation) are NOT
   * touched: changing the status doesn't destroy artefacts.
   *
   * The reason field is logged at INFO level for traceability; an
   * audit-log table is a follow-up feature.
   */
  async overrideStatus(
    id: string,
    status: OrderStatus,
    reason: string | undefined,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can manually override an order status.',
      );
    }
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status === status) {
      // Idempotent — no-op when the requested status matches reality.
      return this.mapToDto(current);
    }

    this.logger.log(
      `Admin status override on order ${current.orderCode} (${id}): ` +
        `${current.status} → ${status}` +
        ` by user ${caller.userId}` +
        (reason ? ` — reason: ${reason}` : ''),
    );

    // When admin rolls all the way back to `draft`, clear the
    // submittedAt timestamp so the order looks pristine again. When
    // admin moves a still-unsubmitted draft forward, backfill
    // submittedAt now so downstream UIs that key off it (e.g. "Created
    // / Submitted" header strap) stay consistent.
    const data: Prisma.DentalOrderUncheckedUpdateInput = { status };
    if (status === OrderStatus.draft) {
      data.submittedAt = null;
    } else if (!current.submittedAt) {
      data.submittedAt = new Date();
    }

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data,
      include: this.includeOrder,
    });

    // Tell the doctor the order moved — admin already saw the transition
    // because they performed it, no point pinging them back.
    this.events.emit(NotificationEvents.OrderStatusChanged, {
      orderId: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
      previousStatus: current.status,
      nextStatus: status,
    });

    return this.mapToDto(order);
  }

  /**
   * Bulk admin-only status update. Wrapped in a single transaction so
   * the whole set either succeeds or rolls back — we don't want a
   * half-applied bulk that leaves N orders at the new status and M
   * still on the old one. Idempotent on the per-id level (a row
   * already at the target status is silently skipped).
   *
   * The IDs are scoped through findMany + accessibility check before
   * the write so an admin can't accidentally touch deleted orders or
   * cross-tenant rows. Returns the count of rows actually changed so
   * the UI can show a precise "N orders moved to Finished" toast.
   */
  async bulkUpdateStatus(
    ids: string[],
    status: OrderStatus,
    reason: string | undefined,
    caller: Caller,
  ): Promise<{ updated: number; skipped: number }> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can bulk-update order statuses.',
      );
    }
    if (ids.length === 0) {
      return { updated: 0, skipped: 0 };
    }

    // Pre-load the candidates so we can filter out (a) deleted rows
    // and (b) rows already at the requested status. Both checks live
    // here rather than at the DB layer so the response can report a
    // truthful `skipped` count.
    const candidates = await this.prisma.dentalOrder.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, orderCode: true, status: true, submittedAt: true },
    });
    const toUpdate = candidates.filter((c) => c.status !== status);
    const skipped = ids.length - toUpdate.length;

    if (toUpdate.length === 0) {
      return { updated: 0, skipped };
    }

    this.logger.log(
      `Bulk status override → ${status} on ${toUpdate.length} order(s) ` +
        `by user ${caller.userId}` +
        (reason ? ` — reason: ${reason}` : ''),
    );

    await this.prisma.$transaction(async (tx) => {
      // The submittedAt fix-up is per-row because we honour the same
      // semantics as the single overrideStatus path. Loop-of-updates
      // is fine here at the 200-id cap; a single updateMany would
      // collapse submittedAt to one value across the whole batch.
      for (const order of toUpdate) {
        const data: Prisma.DentalOrderUncheckedUpdateInput = { status };
        if (status === OrderStatus.draft) {
          data.submittedAt = null;
        } else if (!order.submittedAt) {
          data.submittedAt = new Date();
        }
        await tx.dentalOrder.update({ where: { id: order.id }, data });
      }
    });

    return { updated: toUpdate.length, skipped };
  }

  /**
   * Bulk soft-delete (sets deletedAt = NOW). Same admin gate as
   * bulkUpdateStatus. Idempotent — already-deleted rows aren't
   * re-touched. Hard-delete is intentionally NOT exposed in bulk; the
   * single-row permanent delete is destructive enough that we want
   * the admin to confirm one at a time.
   */
  async bulkDelete(
    ids: string[],
    caller: Caller,
  ): Promise<{ deleted: number; skipped: number }> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can bulk-delete orders.',
      );
    }
    if (ids.length === 0) {
      return { deleted: 0, skipped: 0 };
    }

    const candidates = await this.prisma.dentalOrder.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, orderCode: true },
    });
    const skipped = ids.length - candidates.length;

    if (candidates.length === 0) {
      return { deleted: 0, skipped };
    }

    this.logger.log(
      `Bulk soft-delete on ${candidates.length} order(s) by user ${caller.userId}`,
    );

    const result = await this.prisma.dentalOrder.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { deletedAt: new Date() },
    });

    return { deleted: result.count, skipped };
  }

  /**
   * Bulk restore — clear `deletedAt` for the subset of `ids` that
   * are currently soft-deleted. Already-live rows are skipped silently
   * so the call is idempotent. Admin-only; mirrors `restoreOrder`
   * but in a single UPDATE for the whole batch.
   */
  async bulkRestoreOrders(
    ids: string[],
    caller: Caller,
  ): Promise<{ restored: number; skipped: number }> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can bulk-restore orders.',
      );
    }
    if (ids.length === 0) return { restored: 0, skipped: 0 };

    const candidates = await this.prisma.dentalOrder.findMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
      select: { id: true },
    });
    const skipped = ids.length - candidates.length;
    if (candidates.length === 0) return { restored: 0, skipped };

    this.logger.log(
      `Bulk restore on ${candidates.length} order(s) by user ${caller.userId}`,
    );

    const result = await this.prisma.dentalOrder.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { deletedAt: null },
    });

    return { restored: result.count, skipped };
  }

  /**
   * Bulk PERMANENT delete — hard-delete N orders + wipe their files
   * from disk. Mirrors the single-row `permanentDeleteOrder` semantics:
   * tooth instructions + order-file records cascade inside the
   * transaction, then the file blobs are unlinked from disk best-effort.
   * Admin-only; never partially commits.
   */
  async bulkPermanentDeleteOrders(
    ids: string[],
    caller: Caller,
  ): Promise<{ deleted: number; skipped: number }> {
    this.ensureCanPermanentDelete(caller);
    if (ids.length === 0) return { deleted: 0, skipped: 0 };

    // Fetch orders + their files so we can clean up disk blobs after
    // the DB transaction commits. Orders that don't exist (already
    // hard-deleted, bogus ids) are simply skipped.
    const candidates = await this.prisma.dentalOrder.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        files: { select: { relativePath: true } },
      },
    });
    const skipped = ids.length - candidates.length;
    if (candidates.length === 0) return { deleted: 0, skipped };

    const candidateIds = candidates.map((c) => c.id);

    this.logger.warn(
      `Bulk PERMANENT delete on ${candidates.length} order(s) by user ${caller.userId} — irreversible`,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.orderToothInstruction.deleteMany({
        where: { orderId: { in: candidateIds } },
      });
      await tx.orderFile.deleteMany({
        where: { orderId: { in: candidateIds } },
      });
      await tx.dentalOrder.deleteMany({
        where: { id: { in: candidateIds } },
      });
    });

    // Disk cleanup — best-effort, run after the DB commit so a failed
    // unlink can't roll back the orders. Errors are logged but don't
    // throw because the order record is already gone.
    const allFiles = candidates.flatMap((c) => c.files);
    await Promise.all(
      allFiles.map((file) => this.removeFileFromDisk(file.relativePath)),
    );

    return { deleted: candidateIds.length, skipped };
  }

  async updateToothInstructions(
    id: string,
    instructions: ToothInstructionDto[],
    caller: Caller,
    replaceTypes?: ToothInstructionType[],
  ): Promise<OrderResponseDto> {
    // Designers normally can't modify orders directly, but the odontogram
    // (per-tooth attachments + the doctor's no_attachments / do_not_move /
    // no_ipr / extract instructions) IS their job in the treatment plan
    // editor. assertCanEditOdontogram allows them when assigned.
    this.ensureCanEditOdontogram(caller);
    const target = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(target, caller);

    // IPR / stripping moved to its own table (`TreatmentPlanIpr`).
    // Any client still trying to stuff `ipr_value` rows through this
    // endpoint is hitting deprecated behaviour — reject loudly so the
    // bug surfaces early instead of silently re-introducing the legacy
    // one-tooth model.
    for (const ins of instructions) {
      if (ins.type === 'ipr_value') {
        throw new BadRequestException(
          'IPR / stripping is no longer stored on tooth instructions. ' +
            'Use PUT /treatment-plans/:planId/iprs instead.',
        );
      }
    }

    this.ensureUniqueToothInstructions(instructions);

    // Scope check — when the caller declares `replaceTypes`, every row
    // in the payload must have a type in that set. Otherwise a caller
    // could claim "I'm only replacing ATTACHMENT" but secretly also
    // ship a DO_NOT_MOVE row, which would be created without ever
    // wiping any prior DO_NOT_MOVE rows — splitting the source of
    // truth across two writers.
    //
    // This is also why we accept an EMPTY `instructions` payload as
    // long as `replaceTypes` is present: it means "wipe everything I
    // own", which is the natural semantics for "the planner removed
    // their last attachment".
    const scope =
      replaceTypes && replaceTypes.length > 0
        ? new Set<ToothInstructionType>(replaceTypes)
        : null;
    if (scope) {
      for (const ins of instructions) {
        if (!scope.has(ins.type)) {
          throw new BadRequestException(
            `Instruction type '${ins.type}' is not in the declared replaceTypes scope.`,
          );
        }
      }
    }

    // Defence-in-depth dedupe: even after the per-payload uniqueness
    // check above passes, two CONCURRENT updateToothInstructions calls
    // for the same order can race each other (both pass the check
    // independently, then their createMany overlap and one fails the
    // unique constraint with P2002). The SELECT FOR UPDATE below
    // serialises that race; dedupe via Map here is also a belt to
    // catch any frontend bug that sends the same (tooth, type) twice
    // in one payload before it reaches the DB.
    const deduped = new Map<string, ToothInstructionDto>();
    for (const ins of instructions) {
      deduped.set(`${ins.toothNumber}:${ins.type}`, ins);
    }
    const uniqueInstructions = Array.from(deduped.values());

    const order = await this.prisma.$transaction(async (tx) => {
      // Row-level lock on the parent order. Two concurrent calls for
      // the same orderId serialise here, eliminating the delete +
      // createMany race that otherwise throws P2002.
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${id} FOR UPDATE`;

      // REPLACE-ALL scope:
      //   • With `scope`: only wipe rows whose type is in the caller's
      //     declared set. This lets the doctor edit her four flags
      //     (NO_ATTACHMENTS / DO_NOT_MOVE / NO_IPR / EXTRACT) without
      //     touching the planner's ATTACHMENT rows, and vice versa.
      //   • Without `scope`: legacy fall-back — wipe everything for
      //     the order. Kept so older clients that don't yet send
      //     `replaceTypes` don't break, but new callers should ALWAYS
      //     send the scope.
      await tx.orderToothInstruction.deleteMany({
        where: scope
          ? { orderId: id, type: { in: Array.from(scope) } }
          : { orderId: id },
      });
      if (uniqueInstructions.length > 0) {
        await tx.orderToothInstruction.createMany({
          data: uniqueInstructions.map((instruction) => ({
            orderId: id,
            toothNumber: instruction.toothNumber,
            type: instruction.type,
            // value/note are optional; ipr_value entries use value as the
            // measured IPR amount in mm and note as the optional
            // stripping auxiliary value. The DTO validated shape.
            value: instruction.value ?? null,
            note: instruction.note ?? null,
            createdById: caller.userId,
          })),
        });
      }

      return tx.dentalOrder.findUniqueOrThrow({
        where: { id },
        include: this.includeOrder,
      });
    });

    return this.mapToDto(order);
  }

  async uploadFiles(
    id: string,
    files: Express.Multer.File[],
    category: OrderFileCategory,
    caller: Caller,
  ): Promise<OrderFileResponseDto[]> {
    this.ensureCanCreateOrModify(caller);
    const order = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(order, caller);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    // Continue the per-(order, category) sequence — it drives both the
    // display order and the `_NNN` suffix in the generated filename.
    // Soft-deleted rows are counted on purpose: their index must never
    // be reissued, or a new file could land on a path an old DB row
    // still references.
    const maxExisting = await this.prisma.orderFile.aggregate({
      where: { orderId: id, category },
      _max: { orderIndex: true },
    });
    let nextIndex = (maxExisting._max.orderIndex ?? 0) + 1;

    const savedFiles: Prisma.OrderFileCreateManyInput[] = [];

    for (const file of files) {
      this.validateFile(file, category);
      // Content-security gate: never persist a file whose BYTES are a
      // script or executable (or a ZIP carrying one) — the extension check
      // above only trusts the attacker-supplied name. See file-security.ts.
      const verdict = await scanUploadContent(file);
      if (!verdict.safe) {
        const suffix = verdict.detail ? `: ${verdict.detail.slice(0, 120)}` : '';
        throw new BadRequestException(
          `${verdict.reason ?? 'This file was rejected for security reasons.'}${suffix}`,
        );
      }
      const saved = await this.saveFileToDisk(id, category, file, {
        doctorName: order.doctor?.fullName,
        patientName: order.patient.fullName,
        seq: nextIndex,
      });
      nextIndex += 1;
      savedFiles.push(saved);
    }

    await this.prisma.orderFile.createMany({ data: savedFiles });

    const orderFiles = await this.prisma.orderFile.findMany({
      where: {
        orderId: id,
        deletedAt: null,
        relativePath: { in: savedFiles.map((file) => file.relativePath) },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    // Kick the async optimizer strictly AFTER the rows are committed —
    // the upload response never waits on sharp/zip/stl work.
    for (const file of orderFiles) {
      if (file.processingStatus === MediaProcessingStatus.pending) {
        this.mediaProcessing.enqueue('order-file', file.id);
      }
    }

    return orderFiles.map((file) => this.mapFileToDto(file));
  }

  async getFiles(id: string, caller: Caller): Promise<OrderFileResponseDto[]> {
    await this.findAccessibleOrder(id, caller);

    const files = await this.prisma.orderFile.findMany({
      where: { orderId: id, deletedAt: null },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return files.map((file) => this.mapFileToDto(file));
  }

  async deleteFile(
    id: string,
    fileId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanCreateOrModify(caller);
    const parent = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(parent, caller);
    const file = await this.findOrderFile(id, fileId);

    await this.prisma.orderFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    await this.removeFileFromDisk(file.relativePath);

    return { message: 'Order file deleted successfully' };
  }

  async getDownloadFile(
    id: string,
    fileId: string,
    caller: Caller,
    variant?: string,
  ): Promise<{
    stream: StreamableFile;
    file: OrderFile;
    absolutePath: string;
    /** Content-Type to serve with. */
    contentType: string;
    /** true → render in place (variants); false → attachment download. */
    inline: boolean;
    /** Name used for Content-Disposition. */
    downloadName: string;
  }> {
    await this.findAccessibleOrder(id, caller);
    const file = await this.findOrderFile(id, fileId);

    // `?variant=thumb|md|lg|avif|model` — serve the derived artefact
    // inline. Falls back to the original (still inline: the client
    // asked for something to DISPLAY) when the variant isn't ready
    // yet (processing) or never will be (failed/legacy) — so the
    // frontend can request variants blindly without racing the queue.
    if (variant) {
      const variants = (file.variants ?? {}) as Record<
        string,
        Partial<MediaVariantInfo>
      >;
      const info = variants[variant];
      if (info?.path) {
        const variantAbs = this.resolveUploadPath(info.path);
        if (fs.existsSync(variantAbs)) {
          return {
            stream: new StreamableFile(fs.createReadStream(variantAbs)),
            file,
            absolutePath: variantAbs,
            contentType: variantContentType(info.format),
            inline: true,
            downloadName: path.basename(info.path),
          };
        }
      }
      const originalAbs = this.resolveUploadPath(file.relativePath);
      if (!fs.existsSync(originalAbs)) {
        throw new NotFoundException('Stored file not found');
      }
      return {
        stream: new StreamableFile(fs.createReadStream(originalAbs)),
        file,
        absolutePath: originalAbs,
        contentType: file.mimeType || 'application/octet-stream',
        inline: true,
        downloadName: file.generatedName ?? file.originalName,
      };
    }

    const absolutePath = this.resolveUploadPath(file.relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Stored file not found');
    }

    return {
      stream: new StreamableFile(fs.createReadStream(absolutePath)),
      file,
      absolutePath,
      contentType: 'application/octet-stream',
      inline: false,
      // Downloads land on disk with the clean generated name; legacy
      // rows (no generatedName) keep the original client filename.
      downloadName: file.generatedName ?? file.originalName,
    };
  }

  /**
   * Build a single ZIP archive of EVERY non-deleted file on the order
   * (clinical photos, STL/scans, CBCT/ZIP bundles, …) organised into
   * `<category>/` folders, plus an `order-data.json` carrying the full
   * order DTO (clinical + patient + doctor data) for the lab.
   *
   * Returns the live `archiver` stream so the controller can pipe it
   * straight to the HTTP response — nothing is buffered to disk. The
   * caller MUST `finalize()` is already invoked here; the controller
   * only pipes + handles transport errors.
   *
   * RBAC: planner-only (admin / super_admin / designer). Designers see
   * the archive only for orders they're assigned to — `assertOrderReadable`
   * (via findAccessibleOrder) already scopes that. Doctors are excluded
   * on purpose: the bulk export is an internal lab/admin tool.
   *
   * Robustness: a file row whose blob is missing on disk is SKIPPED with
   * a logged warning rather than aborting the whole archive — a half-
   * migrated order should still yield a usable zip of what survives.
   */
  async downloadAllAsZip(
    orderId: string,
    caller: Caller,
  ): Promise<{ archive: Archiver; fileName: string; mimeType: string }> {
    // Planner gate. Designers are allowed but only for their assigned
    // orders, which findAccessibleOrder enforces below via accessWhere.
    const isPlanner =
      ADMIN_ROLES.includes(caller.role) || caller.role === UserRole.designer;
    if (!isPlanner) {
      throw new ForbiddenException(
        'Only admins and designers can download the full order archive.',
      );
    }

    // Reuse the canonical accessible-order load: enforces RBAC + soft-
    // delete + pulls the same relations mapToDto serialises, so the JSON
    // we embed is the exact order DTO the detail page shows.
    const order = await this.findAccessibleOrder(orderId, caller);
    const dto = this.mapToDto(order);

    const archive = createArchive('zip', { zlib: { level: 9 } });

    // archiver emits `warning` for non-fatal issues (e.g. ENOENT on a
    // file we add) and `error` for fatal ones. We pre-check existence
    // below so warnings are rare, but log them rather than crash.
    archive.on('warning', (err) => {
      this.logger.warn(
        `Zip archive warning for order ${orderId}: ${err.message}`,
      );
    });
    archive.on('error', (err) => {
      this.logger.error(
        `Zip archive error for order ${orderId}: ${err.message}`,
      );
    });

    // De-dupe identical entry names WITHIN a category folder — two files
    // can share an originalName ("scan.stl"). A per-folder Set tracks
    // taken names and we append a numeric suffix before the extension.
    const takenByFolder = new Map<string, Set<string>>();
    const uniqueName = (folder: string, name: string): string => {
      let taken = takenByFolder.get(folder);
      if (!taken) {
        taken = new Set<string>();
        takenByFolder.set(folder, taken);
      }
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
      const ext = path.extname(name);
      const stem = ext ? name.slice(0, -ext.length) : name;
      let i = 2;
      let candidate = `${stem}-${i}${ext}`;
      while (taken.has(candidate)) {
        i += 1;
        candidate = `${stem}-${i}${ext}`;
      }
      taken.add(candidate);
      return candidate;
    };

    let appended = 0;
    for (const file of order.files) {
      // order.files is already filtered to deletedAt: null by includeOrder.
      let absolutePath: string;
      try {
        absolutePath = this.resolveUploadPath(file.relativePath);
      } catch (err) {
        // A path that fails the traversal guard is corrupt data, not a
        // reason to fail the whole export — skip + log.
        this.logger.warn(
          `Skipping order file ${file.id} (bad path '${file.relativePath}'): ${(err as Error).message}`,
        );
        continue;
      }

      if (!fs.existsSync(absolutePath)) {
        this.logger.warn(
          `Skipping order file ${file.id} for order ${orderId}: blob missing at ${absolutePath}`,
        );
        continue;
      }

      const folder = file.category; // e.g. "front_photo", "stl", "zip"
      const baseName =
        file.originalName?.trim() ||
        file.generatedName?.trim() ||
        path.basename(file.relativePath);
      const entryName = uniqueName(folder, baseName);

      archive.file(absolutePath, { name: path.posix.join(folder, entryName) });
      appended += 1;
    }

    // The "data of order all" payload — the full order DTO, pretty so a
    // human can read it straight out of the zip.
    archive.append(JSON.stringify(dto, null, 2), { name: 'order-data.json' });

    this.logger.log(
      `Prepared full ZIP for order ${order.orderCode} (${orderId}): ` +
        `${appended}/${order.files.length} file(s) by user ${caller.userId}`,
    );

    // Kick off compression. We do NOT await — the controller pipes the
    // stream and the response completes when archiver flushes its end.
    void archive.finalize();

    return {
      archive,
      // Sanitise the order code for a Content-Disposition filename:
      // strip anything that isn't a safe filename char.
      fileName: `order-${(order.orderCode || orderId).replace(/[^\w.-]+/g, '_')}.zip`,
      mimeType: 'application/zip',
    };
  }

  private buildWhere(
    filters: OrderFilterDto,
    caller: Caller,
  ): Prisma.DentalOrderWhereInput {
    // Trash-bin view: admin opted in via `includeDeleted=true`. We
    // return ONLY soft-deleted rows so the same list endpoint can
    // back both the live catalogue AND the deleted-orders trash UI
    // without a second route. Non-admin callers always see the live
    // set — the flag is silently ignored for safety.
    const showOnlyDeleted =
      ADMIN_ROLES.includes(caller.role) && filters.includeDeleted === true;
    const where: Prisma.DentalOrderWhereInput = showOnlyDeleted
      ? { deletedAt: { not: null } }
      : { deletedAt: null };

    if (ADMIN_ROLES.includes(caller.role)) {
      if (filters.doctorId) where.doctorId = filters.doctorId;
    } else if (caller.role === UserRole.dentist) {
      where.doctorId = caller.userId;
    } else if (caller.role === UserRole.designer) {
      where.assignedDesignerId = caller.userId;
    } else {
      throw new ForbiddenException('You cannot view orders');
    }

    if (filters.patientId) where.patientId = filters.patientId;
    // Status filter — `statuses[]` (multi) wins over `status` (single)
    // when both are sent. The list path is what the Orders page tab
    // strip uses so the "Treatment plan" tab can cover the whole
    // planning phase in one request; legacy single-status callers
    // still work unchanged.
    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    } else if (filters.status) {
      where.status = filters.status;
    }
    if (filters.orderCode) {
      where.orderCode = { contains: filters.orderCode, mode: 'insensitive' };
    }
    if (filters.search) {
      where.OR = [
        { orderCode: { contains: filters.search, mode: 'insensitive' } },
        {
          patient: {
            fullName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          doctor: {
            fullName: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    // Inclusive [from, to] range on createdAt — same pattern as the
    // patients service. ISO 8601 strings are parsed via Date(); invalid
    // input falls through (undefined) so a malformed query param
    // widens the result set rather than breaking the request.
    const createdRange: Prisma.DateTimeFilter = {};
    if (filters.createdFrom) {
      const d = new Date(filters.createdFrom);
      if (!Number.isNaN(d.getTime())) createdRange.gte = d;
    }
    if (filters.createdTo) {
      const d = new Date(filters.createdTo);
      if (!Number.isNaN(d.getTime())) {
        // End-of-day so "to Sep 30" includes anything created that
        // calendar date in UTC.
        d.setUTCHours(23, 59, 59, 999);
        createdRange.lte = d;
      }
    }
    if (createdRange.gte || createdRange.lte) {
      where.createdAt = createdRange;
    }

    return where;
  }

  private async findAccessibleOrder(
    id: string,
    caller: Caller,
  ): Promise<OrderWithRelations> {
    const order = await this.prisma.dentalOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.accessWhere(caller),
      },
      include: this.includeOrder,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private accessWhere(caller: Caller): Prisma.DentalOrderWhereInput {
    if (ADMIN_ROLES.includes(caller.role)) return {};
    if (caller.role === UserRole.dentist) return { doctorId: caller.userId };
    if (caller.role === UserRole.designer) {
      return { assignedDesignerId: caller.userId };
    }
    throw new ForbiddenException('You cannot access orders');
  }

  private ensureCanCreateOrModify(caller: Caller): void {
    if (caller.role === UserRole.designer) {
      throw new ForbiddenException('Designers cannot modify orders directly');
    }
    if (
      caller.role !== UserRole.dentist &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException('You cannot manage orders');
    }
  }

  /**
   * Looser permission gate used by the per-tooth instruction endpoint —
   * lets designers update the odontogram (color flags + IPR mm values)
   * because that's their primary job during treatment planning. Read
   * access (assertOrderReadable) is enforced separately and ensures the
   * caller is actually assigned to this order.
   */
  private ensureCanEditOdontogram(caller: Caller): void {
    if (
      caller.role !== UserRole.dentist &&
      caller.role !== UserRole.designer &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException('You cannot edit this odontogram');
    }
  }

  private ensureCanPermanentDelete(caller: Caller): void {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException('Only admins can permanently delete orders');
    }
  }

  /**
   * Lock a paid order against edits by the DENTIST who owns it. Once the
   * treatment fee is collected (`treatmentFeePaidAt` stamped), the doctor
   * can no longer modify the order, upload/delete its files, or delete it —
   * only an admin can still manage it. Designers (planning staff) and
   * admins are NOT locked: the treatment-plan work legitimately happens
   * after the fee is paid.
   */
  private ensureOrderNotLockedByPayment(
    order: { treatmentFeePaidAt: Date | null },
    caller: Caller,
  ): void {
    if (order.treatmentFeePaidAt && caller.role === UserRole.dentist) {
      throw new ForbiddenException(
        'This order has been paid and can no longer be modified. Please contact an administrator.',
      );
    }
  }

  private async ensureDentistExists(doctorId: string): Promise<void> {
    const dentist = await this.prisma.user.findFirst({
      where: { id: doctorId, role: UserRole.dentist, deletedAt: null },
      select: { id: true },
    });

    if (!dentist) {
      throw new NotFoundException('Dentist not found');
    }
  }

  private async ensurePatientBelongsToDoctor(
    patientId: string,
    doctorId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, doctorId, deletedAt: null },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found for this dentist');
    }
  }

  private ensureUniqueToothInstructions(
    instructions: ToothInstructionDto[],
  ): void {
    const seen = new Set<string>();
    for (const instruction of instructions) {
      const key = `${instruction.toothNumber}:${instruction.type}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate tooth instruction for the same tooth',
        );
      }
      seen.add(key);
    }
  }

  private buildClinicalData(
    dto: Partial<CreateOrderDto | UpdateOrderDto>,
  ): ClinicalOrderData {
    return {
      patientStage: dto.patientStage,
      chiefComplaint: dto.chiefComplaint,
      archTreatment: dto.archTreatment,
      treatBothArch: dto.treatBothArch,
      treatmentPlan: dto.treatmentPlan,
      dontMoveOption: dto.dontMoveOption,
      apRelationship: dto.apRelationship,
      anteroposteriorRelationship: dto.anteroposteriorRelationship,
      elastics: dto.elastics,
      openBite: dto.openBite,
      midline: dto.midline,
      ipr: dto.ipr,
      biteRamps: dto.biteRamps,
      expansion: dto.expansion,
      crossbite: dto.crossbite,
      spaces: dto.spaces,
      extractions: dto.extractions,
      specialInstructions: dto.specialInstructions,
      additionalInstructions: dto.additionalInstructions,
      useCbctWithScans: dto.useCbctWithScans,
      wantsManufacturing: dto.wantsManufacturing,
      materials: dto.materials,
    };
  }

  /**
   * Build the human-readable order code from the patient's name and
   * the creation date — `<PatientNameSlug>_YYYYMMDD`. When the same
   * patient already has an order created today we append a `-N` suffix
   * so the code stays unique without blowing up callers that rely on
   * `orderCode` being a primary search key.
   *
   * Falls back to a date-only stem when we can't read the patient
   * (deleted, missing, etc.) — better than throwing on what is really
   * a cosmetic field.
   */
  private async generateOrderCode(patientId: string): Promise<string> {
    const now = new Date();
    const datePart = formatDateStamp(now);

    let stem = datePart;
    try {
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { fullName: true },
      });
      const slug = slugifyForCode(patient?.fullName);
      if (slug) stem = `${slug}_${datePart}`;
    } catch {
      // Cosmetic only — fall through to the date-only stem.
    }

    // Tack on a counter if the same patient already has an order today.
    // We look at the full stem rather than the date alone so two
    // *different* patients can share a clean code on the same day.
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const existingToday = await this.prisma.dentalOrder.count({
      where: {
        createdAt: { gte: todayStart },
        orderCode: { startsWith: stem },
      },
    });
    return existingToday === 0
      ? stem
      : `${stem}-${String(existingToday + 1).padStart(2, '0')}`;
  }

  private validateFile(
    file: Express.Multer.File,
    category: OrderFileCategory,
  ): void {
    // CBCT / DICOM bundles arrive in the `zip` category and routinely
    // hit 200–800 MB; only that category gets the 1 GB ceiling. Every
    // other slot keeps the 50 MB cap so a stray giant JPEG can't
    // sneak into a clinical-photo slot.
    const isZipBundle = category === OrderFileCategory.zip;
    const maxBytes = isZipBundle
      ? MAX_FILE_SIZE_ZIP_BUNDLE_BYTES
      : MAX_FILE_SIZE_DEFAULT_BYTES;
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new BadRequestException(`File size must be ${maxMb}MB or less`);
    }

    // Policy: accept ANY file type EXCEPT scripts/executables. Rather than a
    // strict allow-list, we reject only the dangerous "code" extensions
    // (.exe/.js/.sh/.php/.html/.svg/…); the byte-level scanUploadContent()
    // then catches disguised payloads. See file-security.ts.
    if (isDangerousUploadExtension(file.originalname)) {
      throw new BadRequestException(
        'This file type is not allowed for security reasons.',
      );
    }

    if (file.originalname.includes('..') || /[\\/]/.test(file.originalname)) {
      throw new BadRequestException('Invalid file name');
    }
  }

  private async saveFileToDisk(
    orderId: string,
    category: OrderFileCategory,
    file: Express.Multer.File,
    naming: {
      doctorName?: string | null;
      patientName: string | null | undefined;
      seq: number;
    },
  ): Promise<Prisma.OrderFileCreateManyInput> {
    const ext = path.extname(file.originalname).toLowerCase();

    // Clean ordered name: `<Doctor>_<Patient>_<category>_<NNN>.<ext>`
    // (e.g. "Dr-Hajji_Marie-Dupont_front-photo_003.jpg"). This is the
    // name the UI shows and the file downloads as — never the client's
    // "image1.jpeg" (that's preserved in `originalName`). Empty/Arabic
    // name parts are dropped by buildSequentialName, so a missing
    // doctor or patient name simply collapses out. These files live
    // behind the RBAC'd download endpoint, never a public URL, so the
    // readable doctor/patient names are a feature for the lab.
    let fileName = buildSequentialName(
      [naming.doctorName, naming.patientName, category.replace(/_/g, '-')],
      naming.seq,
      ext,
    );
    let relativePath = path.posix.join('orders', orderId, category, fileName);
    let absolutePath = this.resolveUploadPath(relativePath);

    // Collision guard — two concurrent uploads to the same category
    // can race the sequence read. Salt the stem instead of failing
    // the upload; the DB row still records its own orderIndex.
    if (fs.existsSync(absolutePath)) {
      const stem = ext ? fileName.slice(0, -ext.length) : fileName;
      fileName = `${stem}-${uuidv4().slice(0, 8)}${ext}`;
      relativePath = path.posix.join('orders', orderId, category, fileName);
      absolutePath = this.resolveUploadPath(relativePath);
    }

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, file.buffer);

    return {
      orderId,
      category,
      originalName: file.originalname,
      fileName,
      relativePath,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      generatedName: fileName,
      orderIndex: naming.seq,
      // pending = the async pipeline applies (image/zip/stl); null =
      // nothing to derive (pdf, video, …) — readers serve the original.
      processingStatus: classifyMedia(file.mimetype, fileName)
        ? MediaProcessingStatus.pending
        : null,
    };
  }

  private async removeFileFromDisk(relativePath: string): Promise<void> {
    const absolutePath = this.resolveUploadPath(relativePath);
    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch {
      return;
    }
  }

  private async findOrderFile(
    orderId: string,
    fileId: string,
  ): Promise<OrderFile> {
    const file = await this.prisma.orderFile.findFirst({
      where: { id: fileId, orderId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('Order file not found');
    }

    return file;
  }

  private resolveUploadPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new BadRequestException('Invalid stored file path');
    }

    const absolutePath = path.resolve(UPLOAD_ROOT, normalized);
    if (!absolutePath.startsWith(path.resolve(UPLOAD_ROOT))) {
      throw new BadRequestException('Invalid stored file path');
    }

    return absolutePath;
  }

  private mapToDto(order: OrderWithRelations): OrderResponseDto {
    return {
      id: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      patientId: order.patientId,
      assignedDesignerId: order.assignedDesignerId ?? undefined,
      status: order.status,
      patientStage: order.patientStage ?? undefined,
      chiefComplaint: order.chiefComplaint ?? undefined,
      archTreatment: order.archTreatment ?? undefined,
      treatBothArch: order.treatBothArch,
      treatmentPlan: order.treatmentPlan ?? undefined,
      dontMoveOption: order.dontMoveOption ?? undefined,
      apRelationship: order.apRelationship ?? undefined,
      anteroposteriorRelationship:
        order.anteroposteriorRelationship ?? undefined,
      elastics: order.elastics ?? undefined,
      openBite: order.openBite ?? undefined,
      midline: order.midline ?? undefined,
      ipr: order.ipr ?? undefined,
      biteRamps: order.biteRamps ?? undefined,
      expansion: order.expansion ?? undefined,
      crossbite: order.crossbite ?? undefined,
      spaces: order.spaces ?? undefined,
      extractions: order.extractions ?? undefined,
      specialInstructions: order.specialInstructions ?? undefined,
      additionalInstructions: order.additionalInstructions ?? undefined,
      useCbctWithScans: order.useCbctWithScans,
      wantsManufacturing: order.wantsManufacturing,
      materials: order.materials,
      // Prisma returns nullable columns as `null`, but ToothInstructionDto
      // declares `value?: string` / `note?: string` (i.e. undefined, not
      // null). Coerce here so the DTO shape stays clean and the strict
      // build doesn't reject the assignment.
      toothInstructions: order.toothInstructions.map((i) => ({
        toothNumber: i.toothNumber,
        type: i.type,
        value: i.value ?? undefined,
        note: i.note ?? undefined,
      })),
      files: order.files.map((file) => this.mapFileToDto(file)),
      doctor: order.doctor,
      patient: {
        id: order.patient.id,
        fullName: order.patient.fullName,
        email: order.patient.email ?? undefined,
        phone: order.patient.phone ?? undefined,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      submittedAt: order.submittedAt ?? undefined,
      treatmentFeePaidAt: order.treatmentFeePaidAt ?? undefined,
      // Decimal → Number at the DTO boundary so the frontend can format
      // it with the rest of the money fields without a Decimal lib.
      treatmentFeeAmount:
        order.treatmentFeeAmount !== null &&
        order.treatmentFeeAmount !== undefined
          ? Number(order.treatmentFeeAmount)
          : undefined,
      treatmentFeePaymentMethod: order.treatmentFeePaymentMethod ?? undefined,
      treatmentFeePaymentStatus: order.treatmentFeePaymentStatus ?? undefined,
      treatmentFeeProofPath: order.treatmentFeeProofPath ?? undefined,
      // Notification fields used by the orders list to render badges
      // ("Awaiting your review", "Approved", "Replanning requested", …).
      latestPlanStatus: order.treatmentPlans?.[0]?.status ?? undefined,
      treatmentPlansCount: order._count?.treatmentPlans ?? 0,
    };
  }

  private mapFileToDto(file: OrderFile): OrderFileResponseDto {
    return {
      id: file.id,
      category: file.category,
      originalName: file.originalName,
      fileName: file.fileName,
      relativePath: file.relativePath,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      generatedName: file.generatedName ?? undefined,
      orderIndex: file.orderIndex,
      width: file.width ?? undefined,
      height: file.height ?? undefined,
      processingStatus: file.processingStatus ?? undefined,
      variants: sanitizeVariantsForApi(file.variants),
      // zip/stl descriptors are safe by construction (counts, names,
      // bbox — never disk paths).
      mediaMetadata:
        (file.mediaMetadata as Record<string, unknown> | null) ?? undefined,
    };
  }
}

/** webp/avif/glb → the Content-Type the browser needs. */
function variantContentType(format: string | undefined): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'glb':
      return 'model/gltf-binary';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Strip disk paths from the variants JSON before it crosses the API:
 * clients address variants by NAME (`?variant=thumb`), never by path.
 */
function sanitizeVariantsForApi(
  variants: Prisma.JsonValue | null,
): Record<
  string,
  { width?: number; height?: number; sizeBytes?: number; format?: string }
> | undefined {
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    return undefined;
  }
  const out: Record<
    string,
    { width?: number; height?: number; sizeBytes?: number; format?: string }
  > = {};
  for (const [name, raw] of Object.entries(variants)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const v = raw as Partial<MediaVariantInfo>;
    out[name] = {
      width: typeof v.width === 'number' ? v.width : undefined,
      height: typeof v.height === 'number' ? v.height : undefined,
      sizeBytes: typeof v.sizeBytes === 'number' ? v.sizeBytes : undefined,
      format: typeof v.format === 'string' ? v.format : undefined,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
