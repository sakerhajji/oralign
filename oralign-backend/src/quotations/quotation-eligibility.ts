import {
  OrderType,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  type Prisma,
} from '@prisma/client';

/** Code of the refusal below; the frontend translates by code. */
export const QUOTATION_ELIGIBILITY_ERROR = {
  SUPPLEMENTAL_NOT_QUOTABLE: 'SUPPLEMENTAL_NOT_QUOTABLE',
} as const;

/** The order columns the rule reads. */
export const QUOTABLE_ORDER_SELECT = {
  orderType: true,
  supplementalRequest: {
    select: { reviewStatus: true, coverageStatus: true },
  },
} satisfies Prisma.DentalOrderSelect;

export type QuotableOrder = Prisma.DentalOrderGetPayload<{
  select: typeof QUOTABLE_ORDER_SELECT;
}>;

/**
 * May a quotation be issued on this order?
 *   • an initial case: always (its own workflow decides when);
 *   • a supplemental child: only once an admin approved it as CHARGEABLE.
 *     Any kind qualifies, with or without a treatment plan (a replacement
 *     or a transfer template is quoted straight away). An included
 *     refinement or an approved warranty is free and is never quoted, and
 *     a request not reviewed yet has no price to quote.
 */
export function isQuotable(order: QuotableOrder): boolean {
  if (order.orderType === OrderType.initial) return true;
  const request = order.supplementalRequest;
  return (
    request?.reviewStatus === SupplementalReviewStatus.approved &&
    request.coverageStatus === SupplementalCoverageStatus.chargeable
  );
}
