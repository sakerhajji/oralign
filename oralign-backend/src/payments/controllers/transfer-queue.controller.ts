import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  TRANSFER_QUEUE_FILTERS,
  type TransferQueueFilter,
  type TransferQueuePage,
  TransferQueueService,
} from '../services/transfer-queue.service';

/** GET admin/payments/transfer-queue query (CONTRACT.md §2.4). */
export class TransferQueueQueryDto {
  @ApiPropertyOptional({ enum: TRANSFER_QUEUE_FILTERS, default: 'a_verifier' })
  @IsOptional()
  @IsIn(TRANSFER_QUEUE_FILTERS)
  filter?: TransferQueueFilter;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * The merged transfer queue of the admin pending desk (pack installments +
 * treatment fees). Registered in PaymentsModule BEFORE PaymentsController:
 * Express matches routes in registration order, and
 * `admin/payments/:paymentId` would otherwise swallow
 * `admin/payments/transfer-queue`.
 *
 * Validé and Refusé hold the last TRANSFER_QUEUE_RECENT_DAYS days only; the
 * full history stays on GET payments/history and the payments desk.
 */
@ApiTags('payments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/payments/transfer-queue')
export class TransferQueueController {
  constructor(private readonly queue: TransferQueueService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bank transfers to review (installments + treatment fees), one tab: nouveau | a_verifier | valide | refuse.',
  })
  list(
    @Query() query: TransferQueueQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferQueuePage> {
    return this.queue.list({ userId: user.sub, role: user.role }, query);
  }
}
