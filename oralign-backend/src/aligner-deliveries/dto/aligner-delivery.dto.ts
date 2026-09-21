import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_ALIGNERS_PER_ORDER } from '../aligner-delivery.rules';

// ── Requests ────────────────────────────────────────────────────────
// Shape-level validation only (integers, bounds, date format). The
// business rules — from ≤ to, within the series, no overlap with what
// is already delivered — need the persisted state and live in
// aligner-delivery.rules.ts, applied under the order lock.

export class RecordAlignerDeliveryDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_ALIGNERS_PER_ORDER })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALIGNERS_PER_ORDER)
  fromAligner!: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: MAX_ALIGNERS_PER_ORDER })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALIGNERS_PER_ORDER)
  toAligner!: number;

  @ApiPropertyOptional({
    example: '2026-09-07',
    description:
      'Calendar date the aligners were handed over (YYYY-MM-DD). Defaults to today.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveredAt must be a date in YYYY-MM-DD format',
  })
  deliveredAt?: string;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: MAX_ALIGNERS_PER_ORDER,
    description:
      "Size of the aligner series. Required for an order's first delivery; afterwards it may only repeat the stored value.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALIGNERS_PER_ORDER)
  totalAligners?: number;
}

export class UpdateAlignerTotalDto {
  @ApiProperty({ example: 24, minimum: 1, maximum: MAX_ALIGNERS_PER_ORDER })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALIGNERS_PER_ORDER)
  totalAligners!: number;
}

// ── Response ────────────────────────────────────────────────────────

export class AlignerRangeDto {
  @ApiProperty({ example: 1 }) fromAligner!: number;
  @ApiProperty({ example: 7 }) toAligner!: number;
}

export class AlignerDeliveryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 4 }) fromAligner!: number;
  @ApiProperty({ example: 7 }) toAligner!: number;
  @ApiProperty({ example: 4 }) quantity!: number;
  @ApiProperty({
    example: '2026-09-20',
    description: 'Calendar date (YYYY-MM-DD).',
  })
  deliveredAt!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Dr Hajji' })
  createdByName!: string | null;
  @ApiProperty({ description: 'When the delivery was recorded (ISO 8601).' })
  createdAt!: string;
}

/**
 * Everything the order page needs, derived server-side from persisted
 * rows — the client never recomputes delivered counts or re-implements
 * who may record a delivery.
 */
export class AlignerDeliverySummaryDto {
  @ApiProperty() orderId!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 20,
    description: 'Null until the first delivery sets it.',
  })
  totalAligners!: number | null;

  @ApiProperty({
    example: 7,
    description:
      'Distinct aligners delivered (size of the union of all ranges).',
  })
  deliveredCount!: number;

  @ApiProperty({ type: Number, nullable: true, example: 13 })
  remainingCount!: number | null;

  @ApiProperty({
    type: [AlignerRangeDto],
    description:
      'Delivered ranges, sorted, adjacent ranges merged (1→3 + 4→7 = 1→7).',
  })
  deliveredRanges!: AlignerRangeDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8,
    description:
      'Lowest undelivered aligner; null once the series is complete.',
  })
  nextAligner!: number | null;

  @ApiProperty() isComplete!: boolean;

  @ApiProperty({
    description: 'The order status still allows recording deliveries.',
  })
  acceptsDeliveries!: boolean;

  @ApiProperty({
    description:
      'The CALLER may record deliveries and correct the total (admin or owning dentist).',
  })
  canRecord!: boolean;

  @ApiProperty({
    type: [AlignerDeliveryDto],
    description: 'Chronological delivery log.',
  })
  deliveries!: AlignerDeliveryDto[];
}
