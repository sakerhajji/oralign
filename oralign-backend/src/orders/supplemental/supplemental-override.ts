import type { OrderStatus, OrderType } from '@prisma/client';
import { ConflictException } from '../../common/exceptions/app.exception';
import { openChildrenOf } from '../order-kind';
import { isClosedOrderStatus, isReopening } from '../order-status-groups';
import { reviewStatePatch, type ReviewStatePatch } from './review-state';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';
import {
  isAllowanceExhausted,
  reclaimedCorrectionNumber,
  regainsCorrection,
} from './supplemental-coverage.policy';
import {
  consumedCorrectionNumbers,
  countConsumedCorrections,
  loadCorrectionClaim,
  loadPackAllowance,
  lockOrder,
  type CorrectionClaim,
  type SupplementalTx,
} from './supplemental-order.repository';

/**
 * An admin status override on a supplemental child (OrderService, single
 * and bulk). The override itself is deliberately unvalidated; what it must
 * not break are the rules a case holds across its requests:
 *
 *   • one open request per kind: a closed child is not reopened while a
 *     sibling of its kind is open (409 SUPPLEMENTAL_ACTIVE_REQUEST_EXISTS);
 *   • the pack allowance: a child approved as included whose cancellation
 *     gave its correction back does not take it again once the pack is
 *     used up (409 SUPPLEMENTAL_ALLOWANCE_EXHAUSTED); when it may, it keeps
 *     its number unless a live correction took it meanwhile.
 *
 * Both are decided on the case's other requests, so they are read under
 * the case row lock, the lock creation and review take too.
 */

/** What the override reads about the child it moves. */
export interface OverriddenChild {
  id: string;
  status: OrderStatus;
  orderType: OrderType;
  parentOrderId: string;
}

/** The request columns an override writes besides the order status. */
export type ChildRequestPatch = ReviewStatePatch | { correctionNumber: number };

export type ChildOverride =
  | { conflict: ConflictException }
  | { conflict: null; requestPatch: ChildRequestPatch | null };

const proceed = (requestPatch: ChildRequestPatch | null): ChildOverride => ({
  conflict: null,
  requestPatch,
});

/**
 * Decide an override of `child` to `to`. The case is locked whenever the
 * child leaves a closed status: that is the only way to reopen it or to
 * put a given-back correction back into use (an abandoned status is a
 * closed one).
 */
export async function planChildOverride(
  tx: SupplementalTx,
  child: OverriddenChild,
  to: OrderStatus,
  now: Date,
): Promise<ChildOverride> {
  if (isClosedOrderStatus(child.status)) {
    await lockOrder(tx, child.parentOrderId);
  }
  if (isReopening(child.status, to) && (await hasOpenSibling(tx, child))) {
    return {
      conflict: new ConflictException(
        'Another request of this kind is already open on this case. Close it before reopening this one.',
        SUPPLEMENTAL_ERROR.ACTIVE_REQUEST_EXISTS,
      ),
    };
  }
  const claim = await loadCorrectionClaim(tx, child.id);
  if (!claim) return proceed(null);
  if (!regainsCorrection(child.orderType, claim, child.status, to)) {
    return proceed(reviewStatePatch(to, claim, now));
  }
  // The review state is kept as is (approved, included): only the
  // allowance and the number are at stake.
  return reclaimCorrection(tx, child, claim);
}

async function hasOpenSibling(
  tx: SupplementalTx,
  child: OverriddenChild,
): Promise<boolean> {
  const sibling = await tx.dentalOrder.findFirst({
    where: {
      ...openChildrenOf(child.parentOrderId),
      orderType: child.orderType,
      id: { not: child.id },
    },
    select: { id: true },
  });
  return sibling !== null;
}

async function reclaimCorrection(
  tx: SupplementalTx,
  child: OverriddenChild,
  claim: CorrectionClaim,
): Promise<ChildOverride> {
  const others = { excludeChildId: child.id };
  const quotation = await loadPackAllowance(tx, child.parentOrderId);
  const consumed = await countConsumedCorrections(
    tx,
    child.parentOrderId,
    others,
  );
  if (isAllowanceExhausted(quotation, consumed)) {
    return {
      conflict: new ConflictException(
        'The pack has no included correction left for this request to take back: move it back to submitted to review it again.',
        SUPPLEMENTAL_ERROR.ALLOWANCE_EXHAUSTED,
      ),
    };
  }
  const correctionNumber = reclaimedCorrectionNumber(
    claim.correctionNumber,
    await consumedCorrectionNumbers(tx, child.parentOrderId, others),
  );
  return proceed(
    correctionNumber === claim.correctionNumber ? null : { correctionNumber },
  );
}
