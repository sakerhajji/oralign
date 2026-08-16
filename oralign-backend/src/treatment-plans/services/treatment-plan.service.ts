import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderFileCategory,
  OrderStatus,
  TreatmentMessageType,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
} from '../dto/treatment-plan.dto';
import { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import { isAdmin, type Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';

const PLANNER_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];
const CLINICAL_IMAGE_CATEGORIES: OrderFileCategory[] = [
  OrderFileCategory.left_photo,
  OrderFileCategory.front_photo,
  OrderFileCategory.right_photo,
  OrderFileCategory.upper_photo,
  OrderFileCategory.lower_photo,
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
    private readonly orderAccess: OrderAccessPolicy,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    // forwardRef because the gateway also depends on the message service,
    // and the message service depends on this one — circular DI shaped
    // like a triangle. Lazy resolution is safe here; the gateway is only
    // used after the request is already in-flight.
    @Inject(forwardRef(() => TreatmentChatGateway))
    private readonly chatGateway: TreatmentChatGateway,
    private readonly events: EventEmitter2,
  ) {}

  /** Fire-and-forget broadcast helper. Sockets are advisory. */
  private safeBroadcastPlanChanged(
    orderId: string,
    type: 'created' | 'updated' | 'ready' | 'approved' | 'rejected',
    planId: string,
  ) {
    try {
      this.chatGateway.broadcastPlanChanged(orderId, { type, planId });
    } catch (err) {
      this.logger.warn(
        `plan:changed broadcast failed: ${(err as Error).message}`,
      );
    }
  }

  /** Fire-and-forget chat broadcast helper. Sockets are advisory. */
  private safeBroadcastNewMessage(orderId: string, message: unknown) {
    try {
      this.chatGateway.broadcastNewMessage(orderId, message);
    } catch (err) {
      this.logger.warn(
        `message:new broadcast failed: ${(err as Error).message}`,
      );
    }
  }

  // ─── Authorisation helpers ────────────────────────────────────────────────

  /**
   * Throws unless the caller can READ the order (and therefore its treatment
   * plans, messages, etc.). Doctor must own the order; designer must be
   * assigned to it; admins always pass.
   */
  private assertOrderReadable(orderId: string, caller: Caller) {
    // Delegates to the single shared rule (common/access/order-access.policy).
    return this.orderAccess.requireReadable(orderId, caller);
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
        order: { select: { assignedDesignerId: true, deletedAt: true } },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    this.orderAccess.assertCanPlan(plan.order, caller);
    return plan;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async create(orderId: string, dto: CreateTreatmentPlanDto, caller: Caller) {
    const order = await this.assertOrderReadable(orderId, caller);
    if (!PLANNER_ROLES.includes(caller.role)) {
      throw new ForbiddenException('Only planners can create treatment plans.');
    }

    // ── Treatment-fee gate ────────────────────────────────────────
    // The doctor must pay the professional/clinical fee BEFORE the
    // admin starts the treatment plan. We look up the configured
    // default — if the tenant has set it > 0 and the order's
    // `treatmentFeePaidAt` is still null, refuse to create.
    //
    // Tenants who never configured a fee (=0) keep the legacy flow:
    // the gate is bypassed entirely so this change is non-breaking
    // for installations that haven't opted into the new policy.
    //
    // Direct prisma query (vs. injecting the settings service) keeps
    // this module free of a cross-module dependency just for a single
    // numeric read on the singleton row.
    const orderRecord = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: { treatmentFeePaidAt: true },
    });
    if (!orderRecord?.treatmentFeePaidAt) {
      const settings = await this.prisma.companyBillingSettings.findFirst({
        where: { isActive: true },
        select: { defaultTreatmentFee: true },
      });
      const fee = Number(settings?.defaultTreatmentFee ?? 0);
      if (fee > 0) {
        throw new BadRequestException(
          'Treatment fee has not been paid yet. The doctor must pay the professional fee before the treatment plan can be sent.',
        );
      }
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
    if (approved && !isAdmin(caller)) {
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
    const actorName = await lookupActorName(this.prisma, caller.userId);

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
        createdByName: actorName,
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

    // Real-time: tell any open doctor / admin / designer page that a new
    // plan was created for this order. Frontends invalidate their plan
    // list cache so the new tab appears without a hard refresh.
    this.safeBroadcastPlanChanged(orderId, 'created', plan.id);

    return plan;
  }

  async listForOrder(orderId: string, caller: Caller) {
    await this.assertOrderReadable(orderId, caller);
    // Planners (admin / designer / super_admin) see every plan, including
    // their own in-progress PENDING drafts. The DOCTOR only ever sees plans
    // that have actually been SENT to them (ready / approved / rejected) —
    // a PENDING draft is the planner's work-in-progress and must stay
    // invisible, otherwise it surfaces as a phantom second "treatment" on
    // the doctor's side the moment the planner starts (or duplicates) a draft.
    const isPlanner =
      caller.role === UserRole.admin ||
      caller.role === UserRole.super_admin ||
      caller.role === UserRole.designer;
    return this.prisma.treatmentPlan.findMany({
      where: {
        orderId,
        deletedAt: null,
        ...(isPlanner ? {} : { status: { not: TreatmentPlanStatus.pending } }),
      },
      orderBy: { version: 'desc' },
    });
  }

  async getOne(id: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    await this.assertOrderReadable(plan.orderId, caller);
    return plan;
  }

  async update(id: string, dto: UpdateTreatmentPlanDto, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        name: dto.name,
        resultViewUrl: dto.resultViewUrl,
        totalUpperAligners: dto.totalUpperAligners,
        totalLowerAligners: dto.totalLowerAligners,
        issuedUpperAligners: dto.issuedUpperAligners,
        issuedLowerAligners: dto.issuedLowerAligners,
      },
    });
    this.safeBroadcastPlanChanged(updated.orderId, 'updated', updated.id);
    return updated;
  }

  /**
   * Planner explicitly marks the plan as "ready for doctor review".
   *
   * Two flows:
   *   • PENDING plan → transitions in place to READY (the very first send).
   *   • REJECTED plan → "renew" creates a NEW versioned plan that inherits
   *     plan-level data from the rejected one and starts as an editable
   *     PENDING draft. The planner sends it only after making corrections.
   *     The rejected plan stays around as historical evidence of what the
   *     doctor pushed back on.
   *
   * ALREADY-READY / APPROVED plans cannot be marked ready again.
   */
  async markReady(id: string, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        orderId: true,
        name: true,
        resultViewUrl: true,
        totalUpperAligners: true,
        totalLowerAligners: true,
        movementTableImagePath: true,
        movementTableImageName: true,
        movementTableImageMimeType: true,
        movementTableImageSizeBytes: true,
        // Dental treatment table — carries forward on the resend path
        // below so the new version inherits the planner's previous
        // restorative document.
        dentalTreatmentTableImagePath: true,
        dentalTreatmentTableImageName: true,
        dentalTreatmentTableImageMimeType: true,
        dentalTreatmentTableImageSizeBytes: true,
        iprEntries: {
          select: {
            fromTooth: true,
            toTooth: true,
            value: true,
            note: true,
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Treatment plan not found.');

    if (plan.status === TreatmentPlanStatus.pending) {
      // ── First send → in-place transition ───────────────────────────────
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.treatmentPlan.update({
          where: { id },
          data: { status: TreatmentPlanStatus.ready },
        });
        await tx.dentalOrder.update({
          where: { id: plan.orderId },
          data: { status: OrderStatus.treatment_plan_ready },
        });
        await tx.treatmentMessage.create({
          data: {
            treatmentPlanId: id,
            senderId: caller.userId,
            senderName: actorName,
            senderRole: caller.role,
            message: 'PLAN READY for review',
            type: TreatmentMessageType.system,
          },
        });
        return u;
      });
      this.safeBroadcastPlanChanged(plan.orderId, 'ready', id);
      // Email the doctor: their plan is ready for review.
      // Bell ping for the doctor. Fetch the doctor + order once for
      // the event payload — adminByline / metadata on the doctor side
      // also lean on it.
      void this.emitPlanEvent(NotificationEvents.TreatmentPlanReady, {
        treatmentPlanId: id,
        orderId: plan.orderId,
        planName: plan.name,
      });
      return updated;
    }

    if (plan.status === TreatmentPlanStatus.rejected) {
      // ── Renew after rejection → spawn an EDITABLE new version ─────────
      // Plan-level data (URL, aligner counts, movement-table image path,
      // treatment-level IPR/stripping) is copied so the new version is a
      // true continuation. Order-level data (tooth instructions, files) is
      // shared via orderId so it picks up any corrections automatically.
      const latest = await this.prisma.treatmentPlan.findFirst({
        where: { orderId: plan.orderId, deletedAt: null },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      const nextName = `Treatment Plan ${nextVersion}`;

      const created = await this.prisma.$transaction(async (tx) => {
        const c = await tx.treatmentPlan.create({
          data: {
            orderId: plan.orderId,
            version: nextVersion,
            name: nextName,
            status: TreatmentPlanStatus.pending,
            resultViewUrl: plan.resultViewUrl,
            totalUpperAligners: plan.totalUpperAligners,
            totalLowerAligners: plan.totalLowerAligners,
            movementTableImagePath: plan.movementTableImagePath,
            movementTableImageName: plan.movementTableImageName,
            movementTableImageMimeType: plan.movementTableImageMimeType,
            movementTableImageSizeBytes: plan.movementTableImageSizeBytes,
            // Carry the dental treatment table forward too — same
            // reasoning as the movement table just above.
            dentalTreatmentTableImagePath: plan.dentalTreatmentTableImagePath,
            dentalTreatmentTableImageName: plan.dentalTreatmentTableImageName,
            dentalTreatmentTableImageMimeType:
              plan.dentalTreatmentTableImageMimeType,
            dentalTreatmentTableImageSizeBytes:
              plan.dentalTreatmentTableImageSizeBytes,
            createdById: caller.userId,
            createdByName: actorName,
          },
        });
        if (plan.iprEntries.length > 0) {
          await tx.treatmentPlanIpr.createMany({
            data: plan.iprEntries.map((entry) => ({
              treatmentPlanId: c.id,
              fromTooth: entry.fromTooth,
              toTooth: entry.toTooth,
              value: entry.value,
              note: entry.note,
              createdById: caller.userId,
            })),
          });
        }
        await tx.dentalOrder.update({
          where: { id: plan.orderId },
          data: { status: OrderStatus.treatment_planning },
        });
        // Audit trail on BOTH the old (closed) plan and the new one so
        // doctors can trace the lineage in the conversation tab.
        await tx.treatmentMessage.create({
          data: {
            treatmentPlanId: id,
            senderId: caller.userId,
            senderName: actorName,
            senderRole: caller.role,
            message: `Replacement plan created → ${nextName}`,
            type: TreatmentMessageType.system,
          },
        });
        await tx.treatmentMessage.create({
          data: {
            treatmentPlanId: c.id,
            senderId: caller.userId,
            senderName: actorName,
            senderRole: caller.role,
            message: `${nextName} draft created from the rejected plan. Edit it, then mark it ready for doctor review.`,
            type: TreatmentMessageType.system,
          },
        });
        return c;
      });
      // The replacement is intentionally only CREATED/PENDING. No ready
      // broadcast, email, or bell notification is sent until the planner
      // explicitly marks the new draft ready after editing.
      this.safeBroadcastPlanChanged(plan.orderId, 'created', created.id);
      return created;
    }

    throw new BadRequestException(
      `Cannot mark a ${plan.status} plan as ready.`,
    );
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
        order: { select: { doctorId: true, deletedAt: true } },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    // Doctor (the order's owner) or admin can approve.
    const callerIsAdmin = isAdmin(caller);
    const isOwner =
      caller.role === UserRole.dentist && plan.order.doctorId === caller.userId;
    if (!callerIsAdmin && !isOwner) {
      throw new ForbiddenException(
        'Only the order doctor or admin can approve.',
      );
    }
    // Doctors must wait for "ready"; admins can bypass the handshake and
    // approve directly (used when admin both planned + signed off, or
    // when fast-tracking a doctor's verbal approval).
    if (!callerIsAdmin && plan.status !== TreatmentPlanStatus.ready) {
      throw new BadRequestException(
        'Only a plan in "ready" status can be approved.',
      );
    }
    if (
      plan.status === TreatmentPlanStatus.approved ||
      plan.status === TreatmentPlanStatus.rejected
    ) {
      throw new BadRequestException(
        `Cannot approve a plan in "${plan.status}" state.`,
      );
    }

    const actorName = await lookupActorName(this.prisma, caller.userId);
    const approved = await this.prisma.$transaction(async (tx) => {
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
          senderName: actorName,
          senderRole: caller.role,
          message: 'PLAN APPROVED',
          type: TreatmentMessageType.approval,
        },
      });
      return updated;
    });
    this.safeBroadcastPlanChanged(plan.orderId, 'approved', id);
    // Email all admins: doctor approved the plan.
    // Bell ping → admin team. Payload carries doctor name + order code
    // so the message body reads as a self-contained sentence.
    void this.emitPlanEvent(NotificationEvents.TreatmentPlanApproved, {
      treatmentPlanId: id,
      orderId: plan.orderId,
      decision: 'approved' as const,
    });
    return approved;
  }

  async reject(id: string, rejectionReason: string, caller: Caller) {
    const reason = rejectionReason.trim();
    if (!reason) {
      throw new BadRequestException('Rejection reason is required.');
    }

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        deletedAt: true,
        order: { select: { doctorId: true, deletedAt: true } },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    const callerIsAdmin = isAdmin(caller);
    const isOwner =
      caller.role === UserRole.dentist && plan.order.doctorId === caller.userId;
    if (!callerIsAdmin && !isOwner) {
      throw new ForbiddenException(
        'Only the order doctor or admin can reject.',
      );
    }
    // Doctors can only reject a READY plan; admins can reject any non-terminal
    // state (e.g. abandon a PENDING plan that's gone stale).
    if (!callerIsAdmin && plan.status !== TreatmentPlanStatus.ready) {
      throw new BadRequestException(
        'Only a plan in "ready" status can be rejected.',
      );
    }
    if (
      plan.status === TreatmentPlanStatus.approved ||
      plan.status === TreatmentPlanStatus.rejected
    ) {
      throw new BadRequestException(
        `Cannot reject a plan in "${plan.status}" state.`,
      );
    }

    const actorName = await lookupActorName(this.prisma, caller.userId);
    const { rejected, message } = await this.prisma.$transaction(async (tx) => {
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
      const chatMessage = await tx.treatmentMessage.create({
        data: {
          treatmentPlanId: id,
          senderId: caller.userId,
          senderName: actorName,
          senderRole: caller.role,
          message: `Treatment plan rejected.\nReason: ${reason}`,
          type: TreatmentMessageType.rejection,
        },
        include: {
          attachments: { where: { deletedAt: null } },
          sender: {
            select: { id: true, fullName: true, role: true, avatarUrl: true },
          },
        },
      });
      return { rejected: updated, message: chatMessage };
    });
    this.safeBroadcastPlanChanged(plan.orderId, 'rejected', id);
    this.safeBroadcastNewMessage(plan.orderId, message);
    // Email all admins: doctor requested a revision.
    // Same admin bell-ping path as approval, just with `decision`.
    void this.emitPlanEvent(NotificationEvents.TreatmentPlanRejected, {
      treatmentPlanId: id,
      orderId: plan.orderId,
      decision: 'rejected' as const,
    });
    return rejected;
  }

  /**
   * Helper — turns a planId/orderId pair into a full Notification
   * event payload by joining the doctor + plan name out of the DB.
   * Fire-and-forget: a missing doctor / deleted plan must not unwind
   * the business write that already committed. The wrapping `void`
   * at the call sites makes this explicit at the boundary.
   */
  private async emitPlanEvent<
    Event extends
      | typeof NotificationEvents.TreatmentPlanReady
      | typeof NotificationEvents.TreatmentPlanUpdated
      | typeof NotificationEvents.TreatmentPlanApproved
      | typeof NotificationEvents.TreatmentPlanRejected,
  >(
    eventName: Event,
    base: {
      treatmentPlanId: string;
      orderId: string;
      planName?: string | null;
      decision?: 'approved' | 'rejected';
    },
  ): Promise<void> {
    try {
      const enriched = await this.prisma.dentalOrder.findUnique({
        where: { id: base.orderId },
        select: {
          orderCode: true,
          doctorId: true,
          doctor: { select: { fullName: true } },
          // Patient name flows into every TreatmentPlan event so the
          // doctor/admin bells can read as "Treatment plan for
          // patient X (ORD-…)" — see notifications.listener.ts.
          patient: { select: { fullName: true } },
          treatmentPlans: {
            where: { id: base.treatmentPlanId },
            select: { name: true },
            take: 1,
          },
        },
      });
      if (!enriched) return;
      this.events.emit(eventName, {
        treatmentPlanId: base.treatmentPlanId,
        orderId: base.orderId,
        orderCode: enriched.orderCode,
        doctorId: enriched.doctorId,
        doctorName: enriched.doctor?.fullName ?? null,
        patientName: enriched.patient?.fullName ?? null,
        planName: base.planName ?? enriched.treatmentPlans[0]?.name ?? null,
        ...(base.decision ? { decision: base.decision } : {}),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to emit ${eventName} for plan ${base.treatmentPlanId}: ${
          (err as Error).message
        }`,
      );
    }
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

    const ext = (path.extname(file.originalname) || '')
      .toLowerCase()
      .slice(0, 8);
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
    // DB first, then disk: if the update fails the row still points at an
    // existing file; if the unlink fails we only leak a blob (harmless).
    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        movementTableImagePath: null,
        movementTableImageName: null,
        movementTableImageMimeType: null,
        movementTableImageSizeBytes: null,
      },
    });
    if (plan?.movementTableImagePath) {
      void this.safeUnlink(plan.movementTableImagePath).catch(() => {});
    }
    return updated;
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

  // ─── Dental treatment table image ("traitement dentaire") ────────────────
  //
  // Mirrors uploadMovementTableImage / deleteMovementTableImage /
  // getMovementTableImageStream above. Kept as separate methods rather
  // than a generic helper because:
  //
  //   1. The columns on TreatmentPlan are distinct strings (Prisma can't
  //      address a column by computed name), so a "generic" version
  //      would still need switch-case branches for path / name / mime /
  //      size — no real DRY win.
  //   2. The on-disk folder differs (`/dental-treatment` vs `/movement-
  //      table`) so the two artefacts can never collide even if a
  //      planner names them the same.
  //
  // The upload contract is identical: PNG / JPEG / WebP, ≤ 10 MB.

  async uploadDentalTreatmentTableImage(
    id: string,
    file: Express.Multer.File,
    caller: Caller,
  ) {
    if (!file) throw new BadRequestException('Image file is required.');
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Dental treatment table image must be PNG, JPG/JPEG or WebP.',
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(
        'Dental treatment table image must be ≤ 10 MB.',
      );
    }
    const plan = await this.assertCanPlan(id, caller);

    // Storage path: orders/{orderId}/treatment-plans/{planId}/dental-treatment/
    // Distinct sub-folder from /movement-table so the two image artefacts
    // never collide even when a planner uploads files with the same name.
    const relDir = path.posix.join(
      'orders',
      plan.orderId,
      'treatment-plans',
      id,
      'dental-treatment',
    );
    const absDir = path.join(UPLOAD_ROOT, relDir);
    await fs.promises.mkdir(absDir, { recursive: true });

    const ext = (path.extname(file.originalname) || '')
      .toLowerCase()
      .slice(0, 8);
    const safeName = `${uuidv4()}${ext}`;
    const absPath = path.join(absDir, safeName);
    const relPath = path.posix.join(relDir, safeName);

    await fs.promises.writeFile(absPath, file.buffer);

    // Best-effort cleanup of any previous dental-table image — same
    // pattern as the movement-table method. Loose-await so a slow
    // unlink doesn't block the upload's response.
    const existing = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: { dentalTreatmentTableImagePath: true },
    });
    if (existing?.dentalTreatmentTableImagePath) {
      void this.safeUnlink(existing.dentalTreatmentTableImagePath).catch(
        (err) =>
          this.logger.warn(
            `Failed to remove old dental treatment table: ${err}`,
          ),
      );
    }

    return this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        dentalTreatmentTableImagePath: relPath,
        dentalTreatmentTableImageName: file.originalname,
        dentalTreatmentTableImageMimeType: file.mimetype,
        dentalTreatmentTableImageSizeBytes: file.size,
      },
    });
  }

  async deleteDentalTreatmentTableImage(id: string, caller: Caller) {
    await this.assertCanPlan(id, caller);
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: { dentalTreatmentTableImagePath: true },
    });
    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        dentalTreatmentTableImagePath: null,
        dentalTreatmentTableImageName: null,
        dentalTreatmentTableImageMimeType: null,
        dentalTreatmentTableImageSizeBytes: null,
      },
    });
    if (plan?.dentalTreatmentTableImagePath) {
      void this.safeUnlink(plan.dentalTreatmentTableImagePath).catch(() => {});
    }
    return updated;
  }

  async getDentalTreatmentTableImageStream(id: string, caller: Caller) {
    const plan = await this.getOne(id, caller);
    if (!plan.dentalTreatmentTableImagePath) {
      throw new NotFoundException('No dental treatment table image uploaded.');
    }
    const absPath = this.resolveSafePath(plan.dentalTreatmentTableImagePath);
    return {
      stream: fs.createReadStream(absPath),
      mimeType:
        plan.dentalTreatmentTableImageMimeType ?? 'application/octet-stream',
      fileName: plan.dentalTreatmentTableImageName ?? 'dental-treatment-table',
    };
  }

  // ─── Public link ──────────────────────────────────────────────────────────

  /**
   * Generate (or rotate) a public viewer token.
   *
   * Auth: planners (admin/designer) can always generate. Doctors who OWN
   * the order can also generate — they're the ones sharing it with the
   * patient, so it would be perverse to force them to ask an admin every
   * time. The link itself is bearer-style: anyone with the token can read,
   * so the privilege of CREATING it is the access-control boundary.
   */
  async generatePublicLink(
    id: string,
    validDays: number | undefined,
    caller: Caller,
  ) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        orderId: true,
        order: {
          select: { doctorId: true, assignedDesignerId: true, deletedAt: true },
        },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    // Same read rule as everywhere else (admin / owning dentist / assigned designer).
    this.orderAccess.assertCanRead(plan.order, caller);

    const token = randomBytes(24).toString('base64url');
    const days = Math.min(Math.max(validDays ?? 30, 1), 365);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: { publicToken: token, publicExpiresAt: expiresAt },
    });
    await this.cache.del(`treatment-viewer:${token}`);
    return updated;
  }

  // ─── Doctor/admin review payload ──────────────────────────────────────────

  async getReview(id: string, caller: Caller) {
    const plan = await this.getOne(id, caller);

    const [toothInstructions, messages, clinicalImages, iprEntries] =
      await Promise.all([
        this.prisma.orderToothInstruction.findMany({
          where: { orderId: plan.orderId },
          orderBy: [{ toothNumber: 'asc' }, { createdAt: 'asc' }],
        }),
        // Order-scoped chat: pull messages from EVERY non-deleted plan
        // under this order so the doctor sees the full back-and-forth even
        // after a rejected plan was replaced by a new versioned one.
        this.prisma.treatmentMessage.findMany({
          where: {
            treatmentPlan: { orderId: plan.orderId, deletedAt: null },
            deletedAt: null,
          },
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
        this.prisma.orderFile.findMany({
          where: {
            orderId: plan.orderId,
            deletedAt: null,
            category: { in: CLINICAL_IMAGE_CATEGORIES },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            category: true,
            originalName: true,
            fileName: true,
            relativePath: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        }),
        // IPR / stripping is owned by THIS plan (not the order). The
        // table is intentionally scoped to treatmentPlanId so each plan
        // version carries its own IPR map and a re-plan starts blank.
        this.prisma.treatmentPlanIpr.findMany({
          where: { treatmentPlanId: id },
          orderBy: [{ fromTooth: 'asc' }, { toTooth: 'asc' }],
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

    return { ...plan, odontogram, messages, clinicalImages, iprEntries };
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
