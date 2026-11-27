import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { REASON_MAX_LENGTH } from '../../common/exceptions/domain-error-codes';

/**
 * Body of POST quotations/:quotationId/step-batches/:batchId/unlock (spec
 * §3, CONTRACT §2.5). The 3-500 character rule (trimmed) is the service's
 * validReason(), so a missing, blank or short reason is the stable
 * 400 UNLOCK_REASON_REQUIRED, never a bare validation message. The cap
 * below only stops an absurd body before it reaches the service.
 */
export class UnlockStepBatchDto {
  @ApiProperty({
    description:
      'Why the batch is released without its payment (3-500 characters once trimmed). Shown to staff only.',
    minLength: 3,
    maxLength: REASON_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH * 4)
  reason?: string;
}
