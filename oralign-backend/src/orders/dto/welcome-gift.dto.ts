import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * GET /welcome-gift — what the doctor-facing banner needs. Every amount is
 * a plain number read LIVE from the active billing settings (the order's
 * own snapshot is what gets waived at submit; see WelcomeGiftService).
 */
export class WelcomeGiftStatusDto {
  @ApiProperty({ description: 'Master switch in the billing settings.' })
  enabled!: boolean;

  @ApiProperty({
    description:
      'Banner rule: switch on, the doctor mark is clear (User.welcomeGiftUsedAt NULL) and a value above 0. The mark alone decides: past cases and earlier gift orders do not matter while it is clear; the gift lands on the next submitted case.',
  })
  eligible!: boolean;

  @ApiProperty({
    description:
      'True while the doctor has no submitted case yet (drafts do not count): the gift would land on their very first case ("first" vs "next" copy).',
  })
  firstCase!: boolean;

  @ApiProperty({ example: 'TND' })
  currency!: string;

  @ApiProperty({ example: 300, description: 'Live default treatment fee.' })
  treatmentFee!: number;

  @ApiProperty({
    example: 50,
    description: 'Live CBCT supplement when it is enabled and priced, else 0.',
  })
  cbctFee!: number;

  @ApiProperty({
    description:
      'True when the paid CBCT supplement is enabled and priced above 0.',
  })
  cbctOffered!: boolean;

  @ApiProperty({
    example: 350,
    description: 'treatmentFee + cbctFee — the value shown in the banner.',
  })
  total!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The doctor's most recent order carrying the gift, if any (a doctor reset by an admin may hold several).",
  })
  giftOrderId!: string | null;
}

/**
 * PATCH /welcome-gift/doctors/:doctorId (admin) — set or clear the doctor
 * mark. `used: false` makes the doctor eligible again (the gift lands on
 * their next submitted case); `used: true` withdraws it.
 */
export class WelcomeGiftMarkDto {
  @ApiProperty({
    description:
      'true = the gift is used (not offered again), false = available again on the next submitted case.',
  })
  // Read the raw value: enableImplicitConversion would turn ANY string
  // (even "false") into true before @IsBoolean runs. Only a real JSON
  // boolean is accepted; anything else is a 400.
  @Transform(({ obj }) => (obj as Record<string, unknown>).used)
  @IsBoolean()
  used!: boolean;
}

/** Response of PATCH /welcome-gift/doctors/:doctorId. */
export class WelcomeGiftMarkResponseDto {
  @ApiProperty()
  doctorId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'The doctor mark after the change: when the gift was used, or null when it is available.',
  })
  welcomeGiftUsedAt!: Date | null;
}
