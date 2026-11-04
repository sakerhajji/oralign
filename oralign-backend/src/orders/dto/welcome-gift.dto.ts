import { ApiProperty } from '@nestjs/swagger';

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
      'Banner rule: switch on, the doctor never received the gift (no mark, no gift order) and a value above 0. Past cases do not matter: the gift lands on the next submitted case.',
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
    description: 'The order that consumed the gift, if any.',
  })
  giftOrderId!: string | null;
}
