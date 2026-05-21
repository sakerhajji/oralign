import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Payload for upserting a single IPR / stripping entry on a treatment
 * plan. The contact pair (fromTooth, toTooth) is the unique key; passing
 * the same pair twice updates the row in place — no P2002 collisions.
 *
 * Why two tooth numbers instead of one anchor + neighbour: IPR is
 * inherently a between-tooth measurement (mesial/distal stripping
 * applied to the contact between two adjacent teeth). The previous
 * one-tooth model was a UX hack that fed straight into the constraint
 * conflicts the team kept hitting on the front-end.
 */
export class UpsertTreatmentPlanIprDto {
  @ApiProperty({
    example: 11,
    description: 'FDI tooth number of the "from" side of the contact.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(11)
  @Max(48)
  fromTooth!: number;

  @ApiProperty({
    example: 12,
    description: 'FDI tooth number of the "to" side of the contact.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(11)
  @Max(48)
  toTooth!: number;

  @ApiProperty({
    example: '0.2',
    description:
      'IPR amount in millimetres. Stored as a string so trailing zeros ' +
      'round-trip exactly through forms.',
  })
  @IsString()
  value!: string;

  @ApiProperty({
    required: false,
    description:
      'Optional "stripping" auxiliary value — semantics are clinic-specific ' +
      '(aligner step #, side, raw count).',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Response shape — mirrors the Prisma row except `createdById` is
 * collapsed to a slim createdBy if the client asks for it (the
 * service can optionally include it).
 */
export class TreatmentPlanIprResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() treatmentPlanId!: string;
  @ApiProperty() fromTooth!: number;
  @ApiProperty() toTooth!: number;
  @ApiProperty() value!: string;
  @ApiProperty({ required: false, nullable: true }) note?: string | null;
  @ApiProperty({ required: false, nullable: true }) createdById?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
