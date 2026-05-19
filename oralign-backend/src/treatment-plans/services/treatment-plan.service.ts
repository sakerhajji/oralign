import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderStatus,
  Prisma,
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
} from '../dto/treatment-plan.dto';

type Caller = { userId: string; role: UserRole };

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];
const PLANNER_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

/** Uploads directory — mirrors the existing LocalStorageService convention. */
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

/**
 * TreatmentPlan service.
 *
 * Owns the treatment-plan lifecycle, the public-viewer token generation,
 * movement-table image storage, and grouped odontogram reads for the
 * doctor/designer review screen.
 */
@Injectable()
export class TreatmentPlanService {
  private readonly logger = new Logger(TreatmentPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ─── Authorisation helpers ────────────────────────────────────────────────

  /**
   * Throws unless the caller can READ the order (and therefore its treatment
   * plans, messages, etc.). Doctor must own the order; designer must be
   * assigned to it; admins always pass.
   */
  private async assertOrderReadable(orderId: string, caller: Caller) {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        doctorId: true,
        assignedDesignerId: true,
        deletedAt: true,
      },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }
    if (ADMIN_ROLES.includes(caller.role)) return order;
    if (caller.role === UserRole.dentist && order.doctorId === caller.userId)
      return order;
    if (
      caller.role === UserRole.designer &&
      order.assignedDesignerId === caller.userId
    )
      return order;
    throw new ForbiddenException('You cannot access this order');
  }

  /**
   * Throws unless the caller is allowed to WRITE on this treatment plan.
   * Used by URL updates, movement-table uploads, attachment uploads
   * marked as `treatment_result`, etc.
   */
  private async assertCanPlan(treatmentPlanId: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: {
        id: true,
        orderId: true,
        deletedAt: true,
        order: { select: { assignedDesignerId: true } },
      },
    });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    if (ADMIN_ROLES.includes(caller.role)) return plan;
    if (
      caller.role === UserRole.designer &&
      plan.order.assignedDesignerId === caller.userId
    )
      return plan;
    throw new ForbiddenException(
      'Only admins or the assigned designer can plan this treatment.',
    );
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async create(
    orderId: string,
    dto: CreateTreatmentPlanDto,
    caller: Caller,
  ) {
    const order = await this.assertOrderReadable(orderId, caller);
    if (!PLANNER_ROLES.includes(caller.role)) {
      throw new ForbiddenException('Only planners can create treatment plans.');
    }

    // Block creation once a plan is already approved unless an admin
    // explicitly reopens the order (admin can also force a new plan).
    const approved = await this.prisma.treatmentPlan.findFirst({
      where: {
        orderId,
        status: TreatmentPlanStatus.approved,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (approved && !ADMIN_ROLES.includes(caller.role)) {
      throw new BadRequestException(
        'A treatment plan has already been approved for this order.',
      );
    }

    // Auto-increment version per order.
    const latest = await this.prisma.treatmentPlan.findFirst({
      where: { orderId, deletedAt: null },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    const name = dto.name ?? `Treatment Plan ${version}`;

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        orderId,
        version,
        name,
        status: TreatmentPlanStatus.pending,
        resultViewUrl: dto.resultViewUrl ?? null,
        totalUpperAligners: dto.totalUpperAligners ?? null,
        totalLowerAligners: dto.totalLowerAligners ?? null,
        createdById: caller.userId,
      },
    });

    // Nudge the parent order into the planning phase if it isn't already.
    const planningPhases: OrderStatus[] = [
      OrderStatus.treatment_planning,
      OrderStatus.treatment_plan_ready,
      OrderStatus.treatment_approved,
    ];
    const fresh = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (order && fresh && !planningPhases.includes(fresh.status)) {
      await this.prisma.dentalOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.treatment_planning },
      });
    }

    return plan;
  }

  async listForOrder(orderId: string, caller: Caller) {
    await this.assertOrderReadable(orderId, caller);
    return this.prisma.treatmentPlan.findMany({
      where: { orderId, deletedAt: null },
      orderBy: { version: 'desc' },
    });
  }

  async getOne(id: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
    });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    await this.assertOrderReadable(plan.orderId, caller);
    return plan;
  }

  async update(
    id: string,
    dto: UpdateTreatmentPlanDto,
    caller: Caller,
  ) {
    await this.assertCanPlan(id, caller);
    return this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        name: dto.name,
        resultViewUrl: dto.resultViewUrl,
        totalUpperAligners: dto.totalUpperAligners,
        totalLowerAligners: dto.totalLowerAligners,
        issuedUpperAligners: dto.issuedUpperAligners,
        issuedLowerAligners: dto.issuedLowerAligners,
        status: dto.status,
      },
    });
  }

  async updateResultViewUrl(id: string, url: string, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const plan = await this.prisma.treatmentPlan.update({
      where: { id },
      data: { resultViewUrl: url },
    });
    // Invalidate any cached public viewer payload that pointed at this plan.
    if (plan.publicToken) {
      await this.cache.del(`treatment-viewer:${plan.publicToken}`);
    }
    return plan;
  }

  // ─── Approval / Rejection ─────────────────────────────────────────────────

  async approve(id: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        deletedAt: true,
        order: { select: { doctorId: true } },
      },
    });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    // Doctor (the order's owner) or admin can approve.
    const isAdmin = ADMIN_ROLES.includes(caller.role);
    const isOwner =
      caller.role === UserRole.dentist && plan.order.doctorId === caller.userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only the order doctor or admin can approve.');
    }
    if (plan.status !== TreatmentPlanStatus.ready) {
      throw new BadRequestException(
        'Only a plan in "ready" status can be approved.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: {
          status: TreatmentPlanStatus.approved,
          approvedAt: new Date(),
        },
      });
      await tx.dentalOrder.update({
        where: { id: plan.orderId },
        data: {
          approvedTreatmentPlanId: id,
          status: OrderStatus.treatment_approved,
        },
      });
      await tx.treatmentMessage.create({
        data: {
          treatmentPlanId: id,
          senderId: caller.userId,
          message: 'PLAN APPROVED',
          type: TreatmentMessageType.approval,
        },
      });
      return updated;
    });
  }

  async reject(id: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        deletedAt: true,
        order: { select: { doctorId: true } },
      },
    });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    const isAdmin = ADMIN_ROLES.includes(caller.role);
    const isOwner =
      caller.role === UserRole.dentist && plan.order.doctorId === caller.userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only the order doctor or admin can reject.');
    }
    if (plan.status === TreatmentPlanStatus.approved) {
      throw new BadRequestException('Cannot reject an already-approved plan.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: {
          status: TreatmentPlanStatus.rejected,
          rejectedAt: new Date(),
        },
      });
      await tx.dentalOrder.update({
        where: { id: plan.orderId },
        data: { status: OrderStatus.revision_requested },
      });
      await tx.treatmentMessage.create({
        data: {
          treatmentPlanId: id,
          senderId: caller.userId,
          message: 'REJECTED (Request a replanning)',
          type: TreatmentMessageType.rejection,
        },
      });
      return updated;
    });
  }

  // ─── Movement table image ─────────────────────────────────────────────────

  async uploadMovementTableImage(
    id: string,
    file: Express.Multer.File,
    caller: Caller,
  ) {
    if (!file) throw new BadRequestException('Image file is required.');
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Movement table image must be PNG, JPG/JPEG or WebP.',
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Movement table image must be ≤ 10 MB.');
    }
    const plan = await this.assertCanPlan(id, caller);

    // Storage path: orders/{orderId}/treatment-plans/{planId}/movement-table/
    const relDir = path.posix.join(
      'orders',
      plan.orderId,
      'treatment-plans',
      id,
      'movement-table',
    );
    const absDir = path.join(UPLOAD_ROOT, relDir);
    await fs.promises.mkdir(absDir, { recursive: true });

    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
    const safeName = `${uuidv4()}${ext}`;
    const absPath = path.join(absDir, safeName);
    const relPath = path.posix.join(relDir, safeName);

    await fs.promises.writeFile(absPath, file.buffer);

    // Best-effort cleanup of any previous image.
    const existing = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: { movementTableImagePath: true },
    });
    if (existing?.movementTableImagePath) {
      void this.safeUnlink(existing.movementTableImagePath).catch((err) =>
        this.logger.warn(`Failed to remove old movement table: ${err}`),
      );
    }

    return this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        movementTableImagePath: relPath,
        movementTableImageName: file.originalname,
        movementTableImageMimeType: file.mimetype,
        movementTableImageSizeBytes: file.size,
      },
    });
  }

  async deleteMovementTableImage(id: string, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: { movementTableImagePath: true },
    });
    if (plan?.movementTableImagePath) {
      void this.safeUnlink(plan.movementTableImagePath).catch(() => {});
    }
    return this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        movementTableImagePath: null,
        movementTableImageName: null,
        movementTableImageMimeType: null,
        movementTableImageSizeBytes: null,
      },
    });
  }

  async getMovementTableImageStream(id: string, caller: Caller) {
    const plan = await this.getOne(id, caller);
    if (!plan.movementTableImagePath) {
      throw new NotFoundException('No movement table image uploaded.');
    }
    const absPath = this.resolveSafePath(plan.movementTableImagePath);
    return {
      stream: fs.createReadStream(absPath),
      mimeType: plan.movementTableImageMimeType ?? 'application/octet-stream',
      fileName: plan.movementTableImageName ?? 'movement-table',
    };
  }

  // ─── Public link ──────────────────────────────────────────────────────────

  async generatePublicLink(id: string, validDays: number | undefined, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const token = randomBytes(24).toString('base64url');
    const days = Math.min(Math.max(validDays ?? 30, 1), 365);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const plan = await this.prisma.treatmentPlan.update({
      where: { id },
      data: { publicToken: token, publicExpiresAt: expiresAt },
    });
    await this.cache.del(`treatment-viewer:${token}`);
    return plan;
  }

  // ─── Doctor/admin review payload ──────────────────────────────────────────

  async getReview(id: string, caller: Caller) {
    const plan = await this.getOne(id, caller);

    const [toothInstructions, messages] = await Promise.all([
      this.prisma.orderToothInstruction.findMany({
        where: { orderId: plan.orderId },
        orderBy: [{ toothNumber: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.treatmentMessage.findMany({
        where: { treatmentPlanId: id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          attachments: { where: { deletedAt: null } },
          sender: {
            select: {
              id: true,
              fullName: true,
              role: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    // Group odontogram entries by tooth number so the UI can render per-tooth.
    const byTooth = new Map<
      number,
      Array<{
        type: string;
        value: string | null;
        note: string | null;
        createdById: string | null;
        createdAt: Date;
      }>
    >();
    for (const row of toothInstructions) {
      const list = byTooth.get(row.toothNumber) ?? [];
      list.push({
        type: row.type,
        value: row.value ?? null,
        note: row.note ?? null,
        createdById: row.createdById ?? null,
        createdAt: row.createdAt,
      });
      byTooth.set(row.toothNumber, list);
    }
    const odontogram = Array.from(byTooth.entries())
      .sort(([a], [b]) => a - b)
      .map(([toothNumber, entries]) => ({ toothNumber, entries }));

    return { ...plan, odontogram, messages };
  }

  // ─── File-path helpers ────────────────────────────────────────────────────

  private resolveSafePath(relPath: string): string {
    // Reject anything that escapes the uploads root.
    const abs = path.resolve(UPLOAD_ROOT, relPath);
    const normalisedRoot = path.resolve(UPLOAD_ROOT) + path.sep;
    if (!abs.startsWith(normalisedRoot)) {
      throw new ForbiddenException('Invalid file path.');
    }
    if (!fs.existsSync(abs)) {
      throw new NotFoundException('File no longer exists on disk.');
    }
    return abs;
  }

  private async safeUnlink(relPath: string): Promise<void> {
    try {
      const abs = path.resolve(UPLOAD_ROOT, relPath);
      const normalisedRoot = path.resolve(UPLOAD_ROOT) + path.sep;
      if (!abs.startsWith(normalisedRoot)) return;
      if (fs.existsSync(abs)) await fs.promises.unlink(abs);
    } catch {
      /* ignore */
    }
  }
}
