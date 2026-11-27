import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ArchTreatment,
  OrderStatus,
  Prisma,
  SupplementalReviewStatus,
  type SupplementalCoverageStatus,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  NotificationEvents,
  type SupplementalOrderEvent,
} from '../../notifications/events/notification-events';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateSupplementalOrderDto,
  UpdateSupplementalOrderDto,
} from '../dto/supplemental-order.dto';
import { reviewStatePatch } from './review-state';
import {
  SUPPLEMENTAL_AUDIT_ACTION,
  SUPPLEMENTAL_ERROR,
} from './supplemental.constants';
import {
  childAndParentRows,
  writeAudit,
  SupplementalAudit,
  type AuditChanges,
} from './supplemental-audit';
import { SupplementalClock } from './supplemental-clock';
import { claimIdempotencyKey, createChildInTx } from './supplemental-creation';
import { detailInputErrors } from './supplemental-details';
import {
  answersOf,
  applyDraftUpdate,
  draftChanges,
  draftUpdateFromDto,
  DRAFT_ANSWER_FIELDS,
  type DraftState,
} from './supplemental-draft';
import { buildEligibility } from './supplemental-eligibility';
import {
  assertDraft,
  blockedRequest,
  requireIdempotencyKey,
  requireReadableChild,
  requireReadableParent,
} from './supplemental-guards';
import { draftStateOf, toSupplementalView } from './supplemental-order.mapper';
import {
  findApprovedPlan,
  findReplay,
  listChildren,
  loadParentSnapshot,
  lockOrder,
  releaseIdempotencyKey,
  replaceDetails,
  type LoadedChild,
  type SupplementalTx,
} from './supplemental-order.repository';
import { assertCanAuthor } from './supplemental-permissions';
import {
  assertDoctorCanOrder,
  assertDoctorCanOrderLocked,
} from '../../users/activity/doctor-ordering.policy';
import type {
  SupplementalEligibility,
  SupplementalOrderView,
} from './supplemental.types';
import { assertSubmittable } from './validators';

/**
 * The doctor's side of a supplemental request: eligibility, creation, the
 * draft (autosaved PUT, archive) and its submission. Admin decisions live
 * in SupplementalReviewService. Every write locks the rows it reads, then
 * re-checks the state under the lock, so two tabs never both succeed.
 */
@Injectable()
export class SupplementalOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
    private readonly audit: SupplementalAudit,
    private readonly clock: SupplementalClock,
    private readonly events: EventEmitter2,
  ) {}

  async eligibility(
    parentOrderId: string,
    caller: Caller,
  ): Promise<SupplementalEligibility> {
    const parent = await requireReadableParent(
      this.prisma,
      this.access,
      parentOrderId,
      caller,
    );
    return buildEligibility(parent, { now: this.clock.now(), caller });
  }

  /** The case's live requests the caller may see (designers: assigned ones). */
  async list(
    parentOrderId: string,
    caller: Caller,
  ): Promise<SupplementalOrderView[]> {
    const parent = await requireReadableParent(
      this.prisma,
      this.access,
      parentOrderId,
      caller,
    );
    const children = await listChildren(
      this.prisma,
      parent.id,
      this.access.scope(caller),
    );
    return children.map((child) => toSupplementalView(child, caller));
  }

  async get(
    childOrderId: string,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    const child = await requireReadableChild(
      this.prisma,
      this.access,
      childOrderId,
      caller,
    );
    return toSupplementalView(child, caller);
  }

  /**
   * Idempotent per (caller, Idempotency-Key): a retry returns the request
   * the first call created. The parent row lock serialises concurrent
   * creations on one case.
   */
  async create(
    parentOrderId: string,
    dto: CreateSupplementalOrderDto,
    idempotencyKey: string | undefined,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    const key = requireIdempotencyKey(idempotencyKey);
    const actor = await this.audit.actor(caller);
    const target = { parentId: parentOrderId, type: dto.type };
    try {
      const childId = await this.prisma.$transaction(async (tx) => {
        await lockOrder(tx, parentOrderId);
        const parent = await requireReadableParent(
          tx,
          this.access,
          parentOrderId,
          caller,
        );
        assertCanAuthor(parent, caller);
        // A dormant doctor (spec §5) gets no new request, whoever asks.
        await assertDoctorCanOrder(tx, parent.doctorId);
        const replayed = await claimIdempotencyKey(
          tx,
          caller.userId,
          key,
          target,
        );
        if (replayed) return replayed;
        const created = await createChildInTx(tx, {
          parent,
          type: dto.type,
          caller,
          actor,
          now: this.clock.now(),
          idempotencyKey: key,
        });
        return created.childId;
      });
      return await this.get(childId, caller);
    } catch (error) {
      // The same key used concurrently on ANOTHER case is not serialised by
      // the parent lock: the unique (creator, key) index decides. Return the
      // winner when it is this very request, otherwise let the error out.
      const replay = isUniqueViolation(error)
        ? await findReplay(this.prisma, caller.userId, key)
        : null;
      if (
        replay &&
        !replay.archived &&
        replay.parentOrderId === target.parentId &&
        replay.orderType === target.type
      ) {
        return this.get(replay.orderId, caller);
      }
      throw error;
    }
  }

  /** Whole-form draft save. A save that changes nothing writes nothing. */
  async update(
    childOrderId: string,
    dto: UpdateSupplementalOrderDto,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    const actor = await this.audit.actor(caller);
    const update = draftUpdateFromDto(dto);
    await this.prisma.$transaction(async (tx) => {
      const child = await this.lockedDraft(tx, childOrderId, caller);
      const errors = detailInputErrors(child.orderType, {
        teeth: update.teeth ?? [],
        contacts: update.contacts ?? [],
      });
      if (errors.length > 0) {
        throw new BadRequestException(
          `Invalid teeth or contacts: ${errors.join('; ')}.`,
          SUPPLEMENTAL_ERROR.INVALID_DRAFT,
        );
      }

      const current = draftStateOf(child);
      const next = applyDraftUpdate(child.orderType, current, update);
      const changes = draftChanges(current, next);
      if (Object.keys(changes).length === 0) return;

      await this.writeDraft(tx, child, next, changes);
      await writeAudit(tx, actor, [
        {
          orderId: child.id,
          action: SUPPLEMENTAL_AUDIT_ACTION.DRAFT_UPDATED,
          changes,
          metadata: { requestType: child.orderType },
        },
      ]);
    });
    return this.get(childOrderId, caller);
  }

  /** Archive a draft (soft delete) and free its idempotency key. */
  async removeDraft(
    childOrderId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    const actor = await this.audit.actor(caller);
    const deletedAt = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const child = await this.lockedDraft(tx, childOrderId, caller);
      await tx.dentalOrder.update({
        where: { id: child.id },
        data: { deletedAt },
      });
      await releaseIdempotencyKey(tx, child.supplementalRequest.id);
      await writeAudit(
        tx,
        actor,
        childAndParentRows({
          childId: child.id,
          parentId: child.parentOrder.id,
          child: {
            action: SUPPLEMENTAL_AUDIT_ACTION.DRAFT_ARCHIVED,
            changes: {
              deletedAt: { from: null, to: deletedAt.toISOString() },
            },
            metadata: { requestType: child.orderType },
          },
          parent: {
            action: SUPPLEMENTAL_AUDIT_ACTION.CHILD_ARCHIVED,
            metadata: {
              childOrderId: child.id,
              orderCode: child.orderCode,
              requestType: child.orderType,
            },
          },
        }),
      );
    });
    return { message: 'Supplemental request draft deleted successfully.' };
  }

  /**
   * Draft → submitted (review pending). Re-validates everything on the
   * server and recomputes the coverage, with the request itself left out
   * of the "open request" check. Nothing is consumed here: an included
   * correction is used only when an admin approves it.
   */
  async submit(
    childOrderId: string,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    const actor = await this.audit.actor(caller);
    const now = this.clock.now();
    const event = await this.prisma.$transaction(async (tx) => {
      const child = await this.lockedDraft(tx, childOrderId, caller);
      // Doctor inactivity (spec §5): locked like OrderService.submitOrder,
      // so the sweep and this submission of the same doctor serialise.
      await assertDoctorCanOrderLocked(tx, child.doctorId);
      const parent = await loadParentSnapshot(tx, child.parentOrder.id, {
        includeArchived: true,
      });
      if (!parent) throw new NotFoundException('Initial order not found.');
      const kind = buildEligibility(parent, {
        now,
        caller,
        excludeOrderId: child.id,
      }).requests[child.orderType];
      if (kind.blockedReason) throw blockedRequest(kind.blockedReason);

      const draft = draftStateOf(child);
      assertSubmittable({
        type: child.orderType,
        archTreatment: draft.archTreatment,
        answers: draft.answers,
        details: draft.details,
        files: child.files.map(({ category, originalName }) => ({
          category,
          originalName,
        })),
        parent,
        now,
      });

      const request = child.supplementalRequest;
      // A paid replacement the doctor accepted after a rejected warranty
      // keeps the price that acceptance set.
      const coverage = child.warrantyConversion
        ? { status: request.coverageStatus, reason: request.coverageReason }
        : { status: kind.coverageStatus, reason: kind.coverageReason };
      await tx.dentalOrder.update({
        where: { id: child.id },
        data: { status: OrderStatus.submitted, submittedAt: now },
      });
      await tx.supplementalOrderRequest.update({
        where: { id: request.id },
        data: {
          ...reviewStatePatch(OrderStatus.submitted, request, now),
          reviewedByName: null,
          coverageStatus: coverage.status,
          coverageReason: coverage.reason,
        },
      });
      await writeAudit(
        tx,
        actor,
        childAndParentRows({
          childId: child.id,
          parentId: parent.id,
          child: {
            action: SUPPLEMENTAL_AUDIT_ACTION.SUBMITTED,
            changes: submissionChanges(child, coverage.status),
            metadata: {
              requestType: child.orderType,
              coverageStatus: coverage.status,
              coverageReason: coverage.reason,
            },
          },
          parent: {
            action: SUPPLEMENTAL_AUDIT_ACTION.CHILD_SUBMITTED,
            metadata: {
              childOrderId: child.id,
              orderCode: child.orderCode,
              requestType: child.orderType,
            },
          },
        }),
      );
      return submittedEvent(child);
    });
    this.events.emit(NotificationEvents.SupplementalOrderSubmitted, event);
    return this.get(childOrderId, caller);
  }

  /** Lock the child, then check it is a draft the caller may author. */
  private async lockedDraft(
    tx: SupplementalTx,
    childOrderId: string,
    caller: Caller,
  ): Promise<LoadedChild> {
    await lockOrder(tx, childOrderId);
    const child = await requireReadableChild(
      tx,
      this.access,
      childOrderId,
      caller,
    );
    assertCanAuthor(child, caller);
    assertDraft(child);
    return child;
  }

  private async writeDraft(
    tx: SupplementalTx,
    child: LoadedChild,
    next: DraftState,
    changes: AuditChanges,
  ): Promise<void> {
    const sourcePlan = changes.sourceTreatmentPlanId
      ? {
          sourceTreatmentPlanVersion: await this.sourcePlanVersion(
            tx,
            child,
            next.answers.sourceTreatmentPlanId,
          ),
        }
      : {};
    if (changes.archTreatment) {
      await tx.dentalOrder.update({
        where: { id: child.id },
        data: {
          archTreatment: next.archTreatment,
          treatBothArch: next.archTreatment === ArchTreatment.both,
        },
      });
    }
    const changedAnswers = DRAFT_ANSWER_FIELDS.filter(
      (field) => field in changes,
    );
    if (changedAnswers.length > 0) {
      await tx.supplementalOrderRequest.update({
        where: { id: child.supplementalRequest.id },
        data: { ...answersOf(next.answers, changedAnswers), ...sourcePlan },
      });
    }
    await replaceDetails(tx, child.supplementalRequest.id, {
      teeth: changes.teeth ? next.details.teeth : undefined,
      contacts: changes.contacts ? next.details.contacts : undefined,
    });
  }

  /** The version of the chosen source plan, read from the plan row. */
  private async sourcePlanVersion(
    tx: SupplementalTx,
    child: LoadedChild,
    planId: string | null,
  ): Promise<number | null> {
    if (!planId) return null;
    const plan = await findApprovedPlan(tx, child.parentOrder.id, planId);
    if (!plan) {
      throw new BadRequestException(
        'The source plan must be an approved plan of this case.',
        SUPPLEMENTAL_ERROR.INVALID_DRAFT,
      );
    }
    return plan.version;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function submissionChanges(
  child: LoadedChild,
  coverageStatus: SupplementalCoverageStatus,
): AuditChanges {
  const from = child.supplementalRequest.coverageStatus;
  return {
    status: { from: child.status, to: OrderStatus.submitted },
    reviewStatus: {
      from: child.supplementalRequest.reviewStatus,
      to: SupplementalReviewStatus.pending,
    },
    ...(from === coverageStatus
      ? {}
      : { coverageStatus: { from, to: coverageStatus } }),
  };
}

function submittedEvent(child: LoadedChild): SupplementalOrderEvent {
  return {
    orderId: child.id,
    orderCode: child.orderCode,
    parentOrderId: child.parentOrder.id,
    requestType: child.orderType,
    doctorId: child.doctorId,
    doctorName: child.doctor?.fullName ?? null,
    patientName: child.patient?.fullName ?? null,
  };
}
