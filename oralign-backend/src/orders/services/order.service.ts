import { Injectable, Logger } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ToothInstructionType,
  UserRole,
} from '@prisma/client';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { formatDateStamp, slugifyForCode } from '../../common/utils/code-naming.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import {
  CreateOrderDto,
  OrderFilterDto,
  OrderResponseDto,
  SubmitOrderDto,
  ToothInstructionDto,
  UpdateOrderDto,
} from '../dto/order.dto';
import { isAdmin, type Caller } from '../../common/access/caller';
import {
  mapOrderToDto,
  orderInclude,
  type OrderWithRelations,
} from './order.mapper';
import { purgeStoredMedia, removeFileFromDisk } from './order-storage';
import { assertNoDependents } from '../../common/deletion/deletion-blocked';

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

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
    private readonly events: EventEmitter2,
  ) {}

  async createOrder(
    createOrderDto: CreateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);

    const doctorId = isAdmin(caller)
      ? createOrderDto.doctorId
      : caller.userId;

    if (!doctorId) {
      throw new BadRequestException('Dentist is required');
    }

    await this.ensureDentistExists(doctorId);
    await this.ensurePatientBelongsToDoctor(createOrderDto.patientId, doctorId);
    this.ensureUniqueToothInstructions(createOrderDto.toothInstructions ?? []);

    // CBCT paid supplement — snapshot the CONFIGURED price server-side
    // the moment the doctor requests CBCT. Never client-supplied.
    const cbct = createOrderDto.useCbctWithScans
      ? await this.resolveCbctSupplement()
      : null;

    const order = await this.prisma.dentalOrder.create({
      data: {
        ...this.buildClinicalData(createOrderDto),
        ...(cbct
          ? { cbctFeeAmount: cbct.amount, cbctFeeCurrency: cbct.currency }
          : {}),
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
      include: orderInclude,
    });

    // Draft creation is intentionally silent — admins only get pinged
    // when the doctor actually submits for review (see submitOrder).
    // Notifying on every saved draft was noise: a doctor often opens
    // a new order and abandons it during photo prep.

    return mapOrderToDto(order);
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
        include: orderInclude,
      }),
      this.prisma.dentalOrder.count({ where }),
    ]);

    return new PaginatedResponse(
      orders.map((order) => mapOrderToDto(order)),
      total,
      currentPage,
      take,
      Math.ceil(total / take),
    );
  }

  async getOrderById(id: string, caller: Caller): Promise<OrderResponseDto> {
    const order = await this.findAccessibleOrder(id, caller);
    return mapOrderToDto(order);
  }

  async updateOrder(
    id: string,
    updateOrderDto: UpdateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);
    this.ensureOrderNotLockedByPayment(current, caller);

    const doctorId = isAdmin(caller)
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
        ...(await this.cbctSnapshotUpdate(current, updateOrderDto)),
        ...(isAdmin(caller) && doctorId ? { doctorId } : {}),
        patientId,
        ...(updateOrderDto.orderCode
          ? { orderCode: updateOrderDto.orderCode }
          : {}),
      },
      include: orderInclude,
    });

    return mapOrderToDto(order);
  }

  /**
   * CBCT supplement price for NEW requests, read from the ACTIVE company
   * billing settings. Returns null when the paid option is disabled or
   * configured at 0 — CBCT then behaves exactly as before (free).
   */
  private async resolveCbctSupplement(): Promise<{
    amount: Prisma.Decimal;
    currency: string;
  } | null> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        cbctSupplementEnabled: true,
        cbctSupplementFee: true,
        defaultCurrency: true,
      },
    });
    if (!settings?.cbctSupplementEnabled) return null;
    if (Number(settings.cbctSupplementFee) <= 0) return null;
    return {
      amount: settings.cbctSupplementFee,
      currency: settings.defaultCurrency || 'TND',
    };
  }

  /**
   * Snapshot transitions on update. Only DRAFT orders reprice — once the
   * order left draft (submitted / fee paid) the snapshot is frozen, so a
   * configuration change can never rewrite an existing order's price.
   *   • CBCT toggled ON  (no snapshot yet) → snapshot the current config.
   *   • CBCT toggled OFF                   → clear the snapshot.
   *   • Toggle untouched / already priced  → leave as-is.
   */
  private async cbctSnapshotUpdate(
    current: { status: OrderStatus; cbctFeeAmount: Prisma.Decimal | null },
    dto: UpdateOrderDto,
  ): Promise<{
    cbctFeeAmount?: Prisma.Decimal | null;
    cbctFeeCurrency?: string | null;
  }> {
    if (dto.useCbctWithScans === undefined) return {};
    if (current.status !== OrderStatus.draft) return {};

    if (dto.useCbctWithScans === false) {
      return { cbctFeeAmount: null, cbctFeeCurrency: null };
    }
    if (current.cbctFeeAmount !== null) return {};

    const cbct = await this.resolveCbctSupplement();
    return cbct
      ? { cbctFeeAmount: cbct.amount, cbctFeeCurrency: cbct.currency }
      : {};
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
    if (!isAdmin(caller)) return { seen: false };
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
    if (!isAdmin(caller)) {
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

  /**
   * Permanent (hard) delete of ONE order. Rules, in order:
   *   1. admin only;
   *   2. trash-first — the order must already be soft-deleted;
   *   3. no protected history: a quotation, any payment or any treatment
   *      plan blocks the purge with 409 (the DB has onDelete: Restrict on
   *      those relations as the last line of defence). Such an order can
   *      only ever be archived.
   * Only orders that never entered the clinical/financial pipeline are
   * purgeable; their own children (tooth instructions, files incl. the
   * ones already in the file trash, upload sessions) go with them, and
   * the blobs + variants + treatment-fee proof are unlinked AFTER commit.
   */
  async permanentDeleteOrder(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanPermanentDelete(caller);
    const { purged, blocked } = await this.purgeOrders([id], caller, {
      throwOnBlocked: true,
    });
    if (purged === 0 && blocked === 0) {
      throw new NotFoundException('Order not found');
    }

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
      include: orderInclude,
    });

    // E-mail fan-out (doctor + admins) is handled by the notification
    // listener on the OrderSubmitted event below - one subscription point.
    // In-app bell ping for the admin team.
    this.events.emit(NotificationEvents.OrderSubmitted, {
      orderId: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor?.fullName ?? null,
      patientName: order.patient?.fullName ?? null,
    });

    return mapOrderToDto(order);
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
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can manually override an order status.',
      );
    }
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status === status) {
      // Idempotent — no-op when the requested status matches reality.
      return mapOrderToDto(current);
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
      include: orderInclude,
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

    return mapOrderToDto(order);
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
    if (!isAdmin(caller)) {
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
    if (!isAdmin(caller)) {
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
    if (!isAdmin(caller)) {
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
  /**
   * Bulk permanent delete — same rules as the single path, applied per
   * id. Blocked orders (live, or with quotation / payments / plans) are
   * counted in `blocked` and left untouched; unknown ids are `skipped`.
   */
  async bulkPermanentDeleteOrders(
    ids: string[],
    caller: Caller,
  ): Promise<{ deleted: number; skipped: number; blocked: number }> {
    this.ensureCanPermanentDelete(caller);
    if (ids.length === 0) return { deleted: 0, skipped: 0, blocked: 0 };
    const { purged, blocked, found } = await this.purgeOrders(ids, caller, {
      throwOnBlocked: false,
    });
    return { deleted: purged, skipped: ids.length - found, blocked };
  }

  /**
   * THE hard-delete routine for orders (single + bulk share it).
   * Returns counts; with `throwOnBlocked` the first blocked order throws
   * a 409 DeletionBlockedException / 400 (not archived) instead.
   */
  private async purgeOrders(
    ids: string[],
    caller: Caller,
    opts: { throwOnBlocked: boolean },
  ): Promise<{ purged: number; blocked: number; found: number }> {
    const candidates = await this.prisma.dentalOrder.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        orderCode: true,
        deletedAt: true,
        treatmentFeeProofPath: true,
        files: { select: { relativePath: true, variants: true } },
        _count: {
          select: { treatmentPlans: true, payments: true },
        },
        quotation: { select: { id: true } },
      },
    });

    const purgeable: typeof candidates = [];
    let blocked = 0;
    for (const order of candidates) {
      if (order.deletedAt === null) {
        if (opts.throwOnBlocked) {
          throw new BadRequestException(
            'Archive the order first; only archived orders can be permanently deleted.',
            'NOT_ARCHIVED',
          );
        }
        blocked += 1;
        continue;
      }
      const deps = [
        { label: 'quotation', count: order.quotation ? 1 : 0 },
        { label: 'payments', count: order._count.payments },
        { label: 'treatment plans', count: order._count.treatmentPlans },
      ];
      if (deps.some((d) => d.count > 0)) {
        if (opts.throwOnBlocked) {
          assertNoDependents(`Order ${order.orderCode}`, deps);
        }
        blocked += 1;
        continue;
      }
      purgeable.push(order);
    }

    if (purgeable.length === 0) {
      return { purged: 0, blocked, found: candidates.length };
    }

    const purgeIds = purgeable.map((o) => o.id);
    this.logger.warn(
      `PERMANENT delete of ${purgeIds.length} order(s) by user ${caller.userId} - irreversible: ${purgeable.map((o) => o.orderCode).join(', ')}`,
    );

    // One transaction: children first (also the ones already in the file
    // trash), then the order rows. Quotation/payments/plans cannot exist
    // here (checked above; DB Restrict backs it).
    await this.prisma.$transaction(async (tx) => {
      await tx.orderToothInstruction.deleteMany({
        where: { orderId: { in: purgeIds } },
      });
      await tx.uploadSession.deleteMany({
        where: { orderId: { in: purgeIds } },
      });
      await tx.orderFile.deleteMany({
        where: { orderId: { in: purgeIds } },
      });
      await tx.dentalOrder.deleteMany({ where: { id: { in: purgeIds } } });
    });

    // Disk cleanup AFTER commit, best-effort: originals + variants of
    // every file, plus the treatment-fee proof. A failed unlink never
    // rolls back the purge; the rows are already gone.
    for (const order of purgeable) {
      for (const file of order.files) {
        await purgeStoredMedia(file.relativePath, file.variants);
      }
      if (order.treatmentFeeProofPath) {
        await removeFileFromDisk(order.treatmentFeeProofPath);
      }
    }

    return { purged: purgeIds.length, blocked, found: candidates.length };
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
        include: orderInclude,
      });
    });

    return mapOrderToDto(order);
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
      isAdmin(caller) && filters.includeDeleted === true;
    const where: Prisma.DentalOrderWhereInput = showOnlyDeleted
      ? { deletedAt: { not: null } }
      : { deletedAt: null };

    if (isAdmin(caller)) {
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

  // Public: the chunked-upload service enforces the exact same access
  // rules as the single-shot upload path by delegating to these helpers.
  async findAccessibleOrder(
    id: string,
    caller: Caller,
  ): Promise<OrderWithRelations> {
    const order = await this.prisma.dentalOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.accessWhere(caller),
      },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private accessWhere(caller: Caller): Prisma.DentalOrderWhereInput {
    // Single shared rule — see common/access/order-access.policy.ts.
    return this.orderAccess.scope(caller);
  }

  ensureCanCreateOrModify(caller: Caller): void {
    if (caller.role === UserRole.designer) {
      throw new ForbiddenException('Designers cannot modify orders directly');
    }
    if (
      caller.role !== UserRole.dentist &&
      !isAdmin(caller)
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
      !isAdmin(caller)
    ) {
      throw new ForbiddenException('You cannot edit this odontogram');
    }
  }

  private ensureCanPermanentDelete(caller: Caller): void {
    if (!isAdmin(caller)) {
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
  ensureOrderNotLockedByPayment(
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

}
