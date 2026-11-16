import {
  OrderStatus,
  OrderType,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  UserRole,
} from '@prisma/client';
import { isAdmin, type Caller } from '../../common/access/caller';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';
import type { SupplementalPermissions } from './supplemental.types';

/**
 * Who may do what with a supplemental request. Reading follows the shared
 * OrderAccessPolicy (designers see only the cases assigned to them); the
 * write rules below are narrower and are the ONLY place they are decided:
 * services assert them, views expose them, the UI only reflects them.
 *
 *   create / edit / submit / delete draft   the owning dentist or an admin
 *   review a submitted, pending request     an admin
 *   convert a rejected warranty to paid     the owning dentist only: it is
 *                                           the doctor's consent to a charge
 */

export function isOwningDentist(
  order: { doctorId: string },
  caller: Caller,
): boolean {
  return caller.role === UserRole.dentist && order.doctorId === caller.userId;
}

export function canAuthor(
  order: { doctorId: string },
  caller: Caller,
): boolean {
  return isAdmin(caller) || isOwningDentist(order, caller);
}

export function assertCanAuthor(
  order: { doctorId: string },
  caller: Caller,
): void {
  if (!canAuthor(order, caller)) {
    throw new ForbiddenException(
      'Only the dentist who owns this case or an admin can do this.',
      SUPPLEMENTAL_ERROR.FORBIDDEN,
    );
  }
}

export function assertCanReview(caller: Caller): void {
  if (!isAdmin(caller)) {
    throw new ForbiddenException(
      'Only an admin can review a supplemental request.',
      SUPPLEMENTAL_ERROR.FORBIDDEN,
    );
  }
}

export function assertCanConvert(
  order: { doctorId: string },
  caller: Caller,
): void {
  if (!isOwningDentist(order, caller)) {
    throw new ForbiddenException(
      'Only the dentist who owns this case can accept a paid replacement.',
      SUPPLEMENTAL_ERROR.FORBIDDEN,
    );
  }
}

/** What the permission flags read about a child and its request. */
export interface PermissionSubject {
  doctorId: string;
  orderType: OrderType;
  status: OrderStatus;
  request: {
    reviewStatus: SupplementalReviewStatus;
    coverageStatus: SupplementalCoverageStatus;
  };
  /** A live (not archived) replacement already converted from it. */
  hasLiveConversion: boolean;
}

export function isEditableDraft(subject: {
  status: OrderStatus;
  request: { reviewStatus: SupplementalReviewStatus };
}): boolean {
  return (
    subject.status === OrderStatus.draft &&
    subject.request.reviewStatus === SupplementalReviewStatus.draft
  );
}

/**
 * A request an admin can decide: submitted and pending. Both columns are
 * read on purpose (see assertPending): a status override that moves the
 * order elsewhere leaves the review flag pending.
 */
export function isAwaitingReview(subject: {
  status: OrderStatus;
  request: { reviewStatus: SupplementalReviewStatus };
}): boolean {
  return (
    subject.status === OrderStatus.submitted &&
    subject.request.reviewStatus === SupplementalReviewStatus.pending
  );
}

export function isConvertibleWarranty(subject: {
  orderType: OrderType;
  request: {
    reviewStatus: SupplementalReviewStatus;
    coverageStatus: SupplementalCoverageStatus;
  };
}): boolean {
  return (
    subject.orderType === OrderType.warranty &&
    subject.request.reviewStatus === SupplementalReviewStatus.rejected &&
    subject.request.coverageStatus ===
      SupplementalCoverageStatus.warranty_rejected
  );
}

export function permissionsFor(
  subject: PermissionSubject,
  caller: Caller,
): SupplementalPermissions {
  const authorsDraft = isEditableDraft(subject) && canAuthor(subject, caller);
  return {
    canEdit: authorsDraft,
    canSubmit: authorsDraft,
    canDelete: authorsDraft,
    canReview: isAdmin(caller) && isAwaitingReview(subject),
    canConvert:
      isOwningDentist(subject, caller) &&
      isConvertibleWarranty(subject) &&
      !subject.hasLiveConversion,
  };
}
