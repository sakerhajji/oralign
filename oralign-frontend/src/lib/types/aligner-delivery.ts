/**
 * Aligner delivery tracking — mirrors the backend AlignerDeliverySummaryDto
 * (oralign-backend/src/aligner-deliveries/dto/aligner-delivery.dto.ts).
 * Every derived number (delivered count, merged ranges, next aligner) is
 * computed server-side from persisted rows; the UI only renders them.
 */

/**
 * Largest series an order can declare. Mirrors MAX_ALIGNERS_PER_ORDER in
 * aligner-delivery.rules.ts — used here for form feedback only; the
 * backend enforces it.
 */
export const MAX_ALIGNERS_PER_ORDER = 200;

export interface AlignerRange {
  fromAligner: number;
  toAligner: number;
}

export interface AlignerDelivery extends AlignerRange {
  id: string;
  quantity: number;
  /** Calendar date of the hand-over, 'YYYY-MM-DD' (no time zone). */
  deliveredAt: string;
  createdByName: string | null;
  /** When the delivery was recorded, ISO 8601. */
  createdAt: string;
}

export interface AlignerDeliverySummary {
  orderId: string;
  /** Size of the series; null until the first delivery sets it. */
  totalAligners: number | null;
  deliveredCount: number;
  remainingCount: number | null;
  /** Sorted, adjacent ranges merged: 1 → 3 + 4 → 7 is one 1 → 7 range. */
  deliveredRanges: AlignerRange[];
  /** Lowest undelivered aligner; null once the series is complete. */
  nextAligner: number | null;
  isComplete: boolean;
  /** The order status still allows recording deliveries. */
  acceptsDeliveries: boolean;
  /** The current user may record deliveries (admin or owning dentist). */
  canRecord: boolean;
  /** Chronological delivery log. */
  deliveries: AlignerDelivery[];
}

export interface RecordAlignerDeliveryInput extends AlignerRange {
  /** 'YYYY-MM-DD'; the server defaults to today. */
  deliveredAt?: string;
  /** Required on an order's first delivery only. */
  totalAligners?: number;
}

/** Error codes the delivery endpoints return (errorCode field). */
export const ALIGNER_DELIVERY_ERROR_CODES = [
  'ALIGNER_RANGE_INVALID',
  'ALIGNER_RANGE_OUT_OF_BOUNDS',
  'ALIGNER_TOTAL_REQUIRED',
  'ALIGNER_TOTAL_ALREADY_SET',
  'ALIGNER_TOTAL_BELOW_DELIVERED',
  'ALIGNER_DELIVERY_DUPLICATE',
  'ALIGNER_DELIVERY_OVERLAP',
  'ALIGNER_DELIVERY_DATE_INVALID',
  'ALIGNER_DELIVERY_DATE_IN_FUTURE',
  'ORDER_NOT_DELIVERABLE',
] as const;

export type AlignerDeliveryErrorCode = (typeof ALIGNER_DELIVERY_ERROR_CODES)[number];
