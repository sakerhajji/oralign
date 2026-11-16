import { OrderType } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  BLOCKED_REASON,
  IDEMPOTENCY_KEY_SHAPE,
  SERVER_KEY_PREFIXES,
  SUPPLEMENTAL_ERROR,
} from './supplemental.constants';
import { isAwaitingReview, isEditableDraft } from './supplemental-permissions';
import {
  loadChild,
  loadParentSnapshot,
  type LoadedChild,
  type SupplementalDb,
} from './supplemental-order.repository';
import type {
  SupplementalBlockedReason,
  SupplementalParentSnapshot,
} from './supplemental.types';

/** Shared preconditions of the supplemental flows (404 / 403 / 400 / 409). */

/** An opaque client token, never one of the keys the server writes itself. */
export function isClientIdempotencyKey(key: string): boolean {
  return (
    IDEMPOTENCY_KEY_SHAPE.test(key) &&
    !SERVER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isClientIdempotencyKey(key)) {
    throw new BadRequestException(
      `A valid Idempotency-Key header (8-128 letters, digits, _ or -, not starting with ${SERVER_KEY_PREFIXES.join(' or ')}) is required.`,
      SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REQUIRED,
    );
  }
  return key;
}

/** The initial case, readable by the caller (404 hides what they cannot see). */
export async function requireReadableParent(
  db: SupplementalDb,
  access: Pick<OrderAccessPolicy, 'assertCanRead'>,
  parentId: string,
  caller: Caller,
): Promise<SupplementalParentSnapshot> {
  const parent = await loadParentSnapshot(db, parentId);
  if (!parent) throw new NotFoundException('Initial order not found.');
  access.assertCanRead(parent, caller);
  if (parent.orderType !== OrderType.initial || parent.parentOrderId) {
    throw new BadRequestException(
      'Supplemental requests hang off an initial case, not off another request.',
      SUPPLEMENTAL_ERROR.PARENT_NOT_INITIAL,
    );
  }
  return parent;
}

export async function requireReadableChild(
  db: SupplementalDb,
  access: Pick<OrderAccessPolicy, 'assertCanRead'>,
  childId: string,
  caller: Caller,
): Promise<LoadedChild> {
  const child = await loadChild(db, childId);
  if (!child) throw new NotFoundException('Supplemental request not found.');
  access.assertCanRead(child, caller);
  return child;
}

export function assertDraft(child: LoadedChild): void {
  if (
    !isEditableDraft({
      status: child.status,
      request: child.supplementalRequest,
    })
  ) {
    throw new ConflictException(
      'Only a draft supplemental request can be changed.',
      SUPPLEMENTAL_ERROR.NOT_DRAFT,
    );
  }
}

/**
 * 409 unless the request waits for a review: pending AND its order still
 * submitted. An admin override that moved the order on (cancelled it,
 * pushed it to a quote) leaves the review flag pending, but the request is
 * no longer the admin's to decide: deciding it would reopen it without the
 * one-open-request-per-kind check.
 */
export function assertPending(child: LoadedChild): void {
  if (
    !isAwaitingReview({
      status: child.status,
      request: child.supplementalRequest,
    })
  ) {
    throw new ConflictException(
      'Only a submitted request waiting for review can be reviewed.',
      SUPPLEMENTAL_ERROR.NOT_PENDING,
    );
  }
}

/** 409 for a request that cannot start (or be submitted) now. */
export function blockedRequest(
  reason: SupplementalBlockedReason,
): ConflictException {
  return reason === BLOCKED_REASON.ACTIVE_REQUEST_EXISTS
    ? new ConflictException(
        'An open request of this kind already exists for this case.',
        SUPPLEMENTAL_ERROR.ACTIVE_REQUEST_EXISTS,
      )
    : new ConflictException(
        `This case does not accept supplemental requests: ${reason}.`,
        SUPPLEMENTAL_ERROR.NOT_ALLOWED,
      );
}
