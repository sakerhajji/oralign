import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import {
  OrderFile,
  OrderFileCategory,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  ToothInstructionType,
  UserRole,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
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
import { NotificationEvents } from '../../notifications/events/notification-events';
import {
  CreateOrderDto,
  OrderFileResponseDto,
  OrderFilterDto,
  OrderResponseDto,
  ToothInstructionDto,
  UpdateOrderDto,
} from '../dto/order.dto';

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
    orderBy: { createdAt: 'desc' },
  },
  // Used to compute notification badges in the orders list. `take: 1` keeps
  // the join tiny — Postgres only fetches one row per order, so this scales
  // with page size, not with plan-history size.
  treatmentPlans: {
    where: { deletedAt: null },
    select: { id: true, status: true },
    orderBy: { version: 'desc' },
    take: 1,
  },
  _count: {
    select: {
      treatmentPlans: { where: { deletedAt: null } },
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
const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.mp4',
  '.mov',
  '.avi',
  '.stl',
  '.ply',
  '.obj',
  '.zip',
  '.pdf',
  // DICOM single-volume files. The CBCT bundle path uses .zip, but
  // some viewers export individual `.dcm` slices which the doctor
  // wants to attach directly — kept in sync with the upload UI
  // copy: "Single .dcm DICOM files are also accepted." (See
  // order-file-upload.tsx → ZipUploadDialog description text.)
  '.dcm',
]);

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OrderNotificationService,
    private readonly events: EventEmitter2,
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
    await this.findAccessibleOrder(id, caller);

    await this.prisma.dentalOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Order deleted successfully' };
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

  async submitOrder(id: string, caller: Caller): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status !== OrderStatus.draft) {
      throw new BadRequestException('Only draft orders can be submitted');
    }

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: { status: OrderStatus.submitted, submittedAt: new Date() },
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
    return this.mapToDto(order);
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
    return this.mapToDto(order);
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
    await this.findAccessibleOrder(id, caller);

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
    await this.findAccessibleOrder(id, caller);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    const savedFiles: Prisma.OrderFileCreateManyInput[] = [];

    for (const file of files) {
      this.validateFile(file, category);
      const saved = await this.saveFileToDisk(id, category, file);
      savedFiles.push(saved);
    }

    await this.prisma.orderFile.createMany({ data: savedFiles });

    const orderFiles = await this.prisma.orderFile.findMany({
      where: {
        orderId: id,
        deletedAt: null,
        relativePath: { in: savedFiles.map((file) => file.relativePath) },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orderFiles.map((file) => this.mapFileToDto(file));
  }

  async getFiles(id: string, caller: Caller): Promise<OrderFileResponseDto[]> {
    await this.findAccessibleOrder(id, caller);

    const files = await this.prisma.orderFile.findMany({
      where: { orderId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return files.map((file) => this.mapFileToDto(file));
  }

  async deleteFile(
    id: string,
    fileId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanCreateOrModify(caller);
    await this.findAccessibleOrder(id, caller);
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
  ): Promise<{
    stream: StreamableFile;
    file: OrderFile;
    absolutePath: string;
  }> {
    await this.findAccessibleOrder(id, caller);
    const file = await this.findOrderFile(id, fileId);
    const absolutePath = this.resolveUploadPath(file.relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Stored file not found');
    }

    return {
      stream: new StreamableFile(fs.createReadStream(absolutePath)),
      file,
      absolutePath,
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
    if (filters.status) where.status = filters.status;
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

    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('File extension is not allowed');
    }

    if (file.originalname.includes('..') || /[\\/]/.test(file.originalname)) {
      throw new BadRequestException('Invalid file name');
    }
  }

  private async saveFileToDisk(
    orderId: string,
    category: OrderFileCategory,
    file: Express.Multer.File,
  ): Promise<Prisma.OrderFileCreateManyInput> {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80);
    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${safeBase || 'file'}-${uuidv4()}${ext}`;
    const relativePath = path.posix.join('orders', orderId, category, fileName);
    const absolutePath = this.resolveUploadPath(relativePath);

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
    };
  }
}
