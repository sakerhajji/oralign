import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AttachPackToQuotationDto,
  ConfigurePaymentPlanDto,
} from '../dto/quotation.dto';
import { QuotationPaymentPlanService } from '../services/quotation-payment-plan.service';

/**
 * Pack-attach + payment-plan + batch-delivery surface for the
 * Quotation. Lives next to QuotationController (the legacy CRUD)
 * so the URL layout is consistent — `/quotations/:id/*`.
 */
@ApiTags('quotation-payment-plan')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class QuotationPaymentPlanController {
  constructor(private readonly service: QuotationPaymentPlanService) {}

  // ─── Admin — attach pack + configure plan ──────────────────────

  @Patch('quotations/:id/attach-pack')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Attach a pack + arch to a draft quotation. Snapshots price + ' +
      'limits onto the Quotation. Resets any previously-configured plan.',
  })
  async attachPack(
    @Param('id') id: string,
    @Body() dto: AttachPackToQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.attachPack(id, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Put('quotations/:id/payment-plan')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Define the installment + step-batch plan. Service enforces ' +
      'Σamounts == totalPrice, non-overlapping step ranges, and the ' +
      'pack max-steps rule.',
  })
  async configurePaymentPlan(
    @Param('id') id: string,
    @Body() dto: ConfigurePaymentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.configurePaymentPlan(id, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Both — read plan ──────────────────────────────────────────

  @Get('quotations/:id/installments')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
  )
  @HttpCode(HttpStatus.OK)
  async getInstallments(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const { installments } = await this.service.getPlan(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    return installments;
  }

  @Get('quotations/:id/step-batches')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
  )
  @HttpCode(HttpStatus.OK)
  async getBatches(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const { batches } = await this.service.getPlan(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    return batches;
  }

  // ─── Admin — deliver a batch ───────────────────────────────────

  @Post('quotations/:quotationId/step-batches/:batchId/deliver')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark an unlocked batch as delivered. Locked batches can never ' +
      'be delivered — service enforces the invariant.',
  })
  async deliverBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deliverBatch(batchId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}
