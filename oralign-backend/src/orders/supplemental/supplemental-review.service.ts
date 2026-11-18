import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderType,
  SupplementalReviewStatus,
  type SupplementalCoverageStatus,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  NotificationEvents,
  type SupplementalOrderReviewedEvent,
} from '../../notifications/events/notification-events';
import { PrismaService } from '../../prisma/prisma.service';
import type { ReviewSupplementalOrderDto } from '../dto/supplemental-order.dto';
import {
  REVIEWED_ORDER_STATUS,
  SUPPLEMENTAL_AUDIT_ACTION,
  SUPPLEMENTAL_ERROR,
  WARRANTY_CONVERSION_KEY_PREFIX,
} from './supplemental.constants';
import {
  childAndParentRows,
  writeAudit,
  SupplementalAudit,
  type AuditActor,
  type AuditChanges,
} from './supplemental-audit';
import { SupplementalClock } from './supplemental-clock';
import {
  consumesCorrection,
  CONVERTED_WARRANTY_COVERAGE,
  isAllowanceExhausted,
  nextCorrectionRank,
  resolveReviewCoverage,
} from './supplemental-coverage.policy';
import { claimIdempotencyKey, createChildInTx } from './supplemental-creation';
import { warrantyReplacementDefaults } from './supplemental-defaults';
import { assertPending, requireReadableChild } from './supplemental-guards';
import { liveConversionId } from './supplemental-order.mapper';
import {
  findParentIdOf,
  loadParentSnapshot,
  lockOrder,
  type LoadedChild,
  type SupplementalTx,
} from './supplemental-order.repository';
import { SupplementalOrderService } from './supplemental-order.service';
import {
  assertCanConvert,
  assertCanReview,
  isConvertibleWarranty,
} from './supplemental-permissions';
import type {
  SupplementalOrderView,
  SupplementalParentSnapshot,
} from './supplemental.types';

/**
 * The lab's side: an admin's decision on a pending request, and the
 * doctor's acceptance of a paid replacement after a rejected warranty.
 * Both lock the parent row then the child (the deadlock-free order used
 * everywhere) and re-check the state under the locks.
 */
@Injectable()
export class SupplementalReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
    private readonly audit: SupplementalAudit,
    private readonly clock: SupplementalClock,
    private readonly events: EventEmitter2,
    private readonly requests: SupplementalOrderService,
  ) {}

  /**
   * Approve or reject a pending request whose order is still submitted
   * (assertPending, re-read under the locks: an admin override that moved
   * the order elsewhere ends the review). Coverage must fit the kind; an
   * approval as "included" consumes one correction of the pack, checked
   * against the allowance under the parent lock and numbered then.
   */
  async review(
    childOrderId: string,
    dto: ReviewSupplementalOrderDto,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    assertCanReview(caller);
    if (dto.decision === SupplementalReviewStatus.rejected && !dto.reason) {
      throw new BadRequestException(
        'A rejection needs a reason the doctor can read.',
        SUPPLEMENTAL_ERROR.REJECTION_REASON_REQUIRED,
      );
    }
    const actor = await this.audit.actor(caller);
    const now = this.clock.now();
    const event = await this.prisma.$transaction(async (tx) => {
      const { child, parent } = await this.lockFamily(tx, childOrderId, caller);
      assertPending(child);
      const request = child.supplementalRequest;
      const coverageStatus = resolveReviewCoverage({
        type: child.orderType,
        decision: dto.decision,
        requested: dto.coverageStatus,
        current: request.coverageStatus,
      });
      const correctionNumber = consumesCorrection(
        child.orderType,
        dto.decision,
        coverageStatus,
      )
        ? nextCorrectionNumber(parent)
        : null;
      const status = REVIEWED_ORDER_STATUS[dto.decision];
      const reason = dto.reason ?? null;

      await tx.dentalOrder.update({
        where: { id: child.id },
        data: { status },
      });
      await tx.supplementalOrderRequest.update({
        where: { id: request.id },
        data: {
          reviewStatus: dto.decision,
          reviewReason: reason,
          reviewedAt: now,
          reviewedById: caller.userId,
          reviewedByName: actor.actorName,
          coverageStatus,
          correctionNumber,
        },
      });
      await writeAudit(
        tx,
        actor,
        childAndParentRows({
          childId: child.id,
          parentId: parent.id,
          child: {
            action: SUPPLEMENTAL_AUDIT_ACTION.REVIEWED,
            changes: reviewChanges(child, {
              status,
              decision: dto.decision,
              coverageStatus,
              correctionNumber,
            }),
            metadata: { requestType: child.orderType, reason },
          },
          parent: {
            action: SUPPLEMENTAL_AUDIT_ACTION.CHILD_REVIEWED,
            metadata: {
              childOrderId: child.id,
              orderCode: child.orderCode,
              requestType: child.orderType,
              decision: dto.decision,
              coverageStatus,
              correctionNumber,
            },
          },
        }),
      );
      const reviewed: SupplementalOrderReviewedEvent = {
        orderId: child.id,
        orderCode: child.orderCode,
        parentOrderId: parent.id,
        requestType: child.orderType,
        doctorId: child.doctorId,
        patientName: child.patient?.fullName ?? null,
        decision: dto.decision,
        coverageStatus,
        reason,
      };
      return reviewed;
    });
    this.events.emit(NotificationEvents.SupplementalOrderReviewed, event);
    return this.requests.get(childOrderId, caller);
  }

  /**
   * The owning dentist accepts to pay for a replacement of the aligner a
   * rejected warranty was about. One transaction: the replacement draft,
   * the link and three audit rows (warranty, replacement, case).
   * Idempotent: the live linked replacement is returned as is; once that
   * draft was archived, a new one is created and linked.
   */
  async convertRejectedWarranty(
    warrantyOrderId: string,
    caller: Caller,
  ): Promise<SupplementalOrderView> {
    const actor = await this.audit.actor(caller);
    const now = this.clock.now();
    const replacementId = await this.prisma.$transaction(async (tx) => {
      const { child: warranty, parent } = await this.lockFamily(
        tx,
        warrantyOrderId,
        caller,
      );
      assertCanConvert(warranty, caller);
      if (
        !isConvertibleWarranty({
          orderType: warranty.orderType,
          request: warranty.supplementalRequest,
        })
      ) {
        throw new ConflictException(
          'Only a rejected warranty claim can become a paid replacement.',
          SUPPLEMENTAL_ERROR.CONVERSION_NOT_ALLOWED,
        );
      }
      const linked = liveConversionId(warranty);
      if (linked) return linked;
      return this.createReplacement(tx, {
        warranty,
        parent,
        caller,
        actor,
        now,
      });
    });
    return this.requests.get(replacementId, caller);
  }

  private async createReplacement(
    tx: SupplementalTx,
    {
      warranty,
      parent,
      caller,
      actor,
      now,
    }: {
      warranty: LoadedChild;
      parent: SupplementalParentSnapshot;
      caller: Caller;
      actor: AuditActor;
      now: Date;
    },
  ): Promise<string> {
    const key = `${WARRANTY_CONVERSION_KEY_PREFIX}${warranty.supplementalRequest.id}`;
    const type = OrderType.replacement;
    // The link is written in the same transaction and clients cannot send
    // this prefix, so a live request under the key that is not the linked
    // one is a conflict, never a replay to return. An archived one frees it.
    const unlinked = await claimIdempotencyKey(tx, caller.userId, key, {
      parentId: parent.id,
      type,
    });
    if (unlinked) {
      throw new ConflictException(
        'Another request already holds the conversion key of this warranty claim.',
        SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REUSED,
      );
    }
    const { childId, orderCode, coverage } = await createChildInTx(tx, {
      parent,
      type,
      caller,
      actor,
      now,
      idempotencyKey: key,
      defaults: warrantyReplacementDefaults(
        {
          orderCode: warranty.orderCode,
          archTreatment: warranty.archTreatment,
          defectiveAligners: warranty.supplementalRequest.defectiveAligners,
        },
        parent,
      ),
      coverage: CONVERTED_WARRANTY_COVERAGE,
      auditMetadata: { convertedFromOrderId: warranty.id },
    });
    await tx.supplementalOrderRequest.update({
      where: { id: warranty.supplementalRequest.id },
      data: { convertedReplacementOrderId: childId },
    });
    await writeAudit(tx, actor, [
      {
        orderId: warranty.id,
        action: SUPPLEMENTAL_AUDIT_ACTION.CONVERTED,
        metadata: {
          replacementOrderId: childId,
          orderCode,
          coverageStatus: coverage.status,
          coverageReason: coverage.reason,
        },
      },
    ]);
    return childId;
  }

  /**
   * Lock the case, then the child, and load both. The case may be archived:
   * a request must stay decidable whatever happened to its case.
   */
  private async lockFamily(
    tx: SupplementalTx,
    childOrderId: string,
    caller: Caller,
  ): Promise<{ child: LoadedChild; parent: SupplementalParentSnapshot }> {
    const parentId = await findParentIdOf(tx, childOrderId);
    if (!parentId)
      throw new NotFoundException('Supplemental request not found.');
    await lockOrder(tx, parentId);
    await lockOrder(tx, childOrderId);
    const child = await requireReadableChild(
      tx,
      this.access,
      childOrderId,
      caller,
    );
    const parent = await loadParentSnapshot(tx, parentId, {
      includeArchived: true,
    });
    if (!parent) throw new NotFoundException('Initial order not found.');
    return { child, parent };
  }
}

/**
 * Number of the next included correction, or 409 once the pack is used
 * up. The allowance is checked on the count, the number taken above the
 * live ones (nextCorrectionRank).
 */
function nextCorrectionNumber(parent: SupplementalParentSnapshot): number {
  if (isAllowanceExhausted(parent.quotation, parent.consumedCorrections)) {
    throw new ConflictException(
      'The pack has no included correction left: approve it as chargeable.',
      SUPPLEMENTAL_ERROR.ALLOWANCE_EXHAUSTED,
    );
  }
  return nextCorrectionRank(parent.correctionNumbers);
}

function reviewChanges(
  child: LoadedChild,
  next: {
    status: LoadedChild['status'];
    decision: SupplementalReviewStatus;
    coverageStatus: SupplementalCoverageStatus;
    correctionNumber: number | null;
  },
): AuditChanges {
  const request = child.supplementalRequest;
  const changes: AuditChanges = {
    status: { from: child.status, to: next.status },
    reviewStatus: { from: request.reviewStatus, to: next.decision },
  };
  if (request.coverageStatus !== next.coverageStatus) {
    changes.coverageStatus = {
      from: request.coverageStatus,
      to: next.coverageStatus,
    };
  }
  if (next.correctionNumber !== null) {
    changes.correctionNumber = {
      from: request.correctionNumber,
      to: next.correctionNumber,
    };
  }
  return changes;
}
