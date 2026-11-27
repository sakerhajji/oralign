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
import { UnlockStepBatchDto } from '../dto/step-batch-unlock.dto';
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
      'Attach a pack + arch to a quotation while no money was received and ' +
      'none is in progress (409 QUOTE_PAYMENT_RECEIVED / QUOTE_PAYMENT_IN_FLIGHT). ' +
      'Snapshots price (TTC, HT/TVA split at the company rate) + limits onto ' +
      'the Quotation. Resets any previously-configured plan.',
  })
  async attachPack(
    @Param('id') id: string,
    @Body() dto: AttachPackToQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.attachPack(id, dto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put('quotations/:id/payment-plan')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Define the installment + step-batch plan (draft, sent or approved). ' +
      'Paid installments and their batches are kept: the body lists only the ' +
      'new unpaid rows, which must sum to totalPrice − Σ paid installments and ' +
      'not overlap the kept step ranges; numbering continues after the kept ' +
      'rows. Also enforces the pack max-steps rule. 409 QUOTE_PAYMENT_IN_FLIGHT ' +
      'while an unpaid installment has a payment in progress.',
  })
  async configurePaymentPlan(
    @Param('id') id: string,
    @Body() dto: ConfigurePaymentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.configurePaymentPlan(id, dto, {
      userId: user.sub,
      role: user.role,
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
    return this.service.getInstallments(id, {
      userId: user.sub,
      role: user.role,
    });
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
    return this.service.getBatches(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  // ─── Admin — release a batch by hand (spec §3) ─────────────────

  @Post('quotations/:quotationId/step-batches/:batchId/unlock')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Release a LOCKED step batch without its payment (manual unlock): the ' +
      'lab may then work on its steps, the installment stays pending, the ' +
      'unlock is journaled (batch_unlocked, source manual, with the reason) ' +
      'and the practitioner is not notified. Repeat on an unlocked or ' +
      'delivered batch: 200 with the row as is. 400 UNLOCK_REASON_REQUIRED ' +
      '(reason 3-500 characters once trimmed); 404 BATCH_NOT_FOUND.',
  })
  async unlockBatch(
    @Param('quotationId') quotationId: string,
    @Param('batchId') batchId: string,
    @Body() dto: UnlockStepBatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.unlockBatch(quotationId, batchId, dto.reason, {
      userId: user.sub,
      role: user.role,
    });
  }

  // ─── Admin — deliver a batch ───────────────────────────────────

  @Post('quotations/:quotationId/step-batches/:batchId/deliver')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark an unlocked batch as delivered. On a limited pack, through ' +
      'the lab production delivery path (an aligner_delivered declaration ' +
      'of its steps, clipped per arch to the approved plan); on an ' +
      'unlimited-step pack, whose batches are payment placeholders, the ' +
      'batch is flipped directly and the practitioner notified. Locked ' +
      'batches can never be delivered (400); a delivered one is returned ' +
      'as is; 409 PRODUCTION_CONFIRM_REQUIRED when some steps already ' +
      'have a live delivery (use the production form); 409 when the ' +
      'batch covers no aligner of the approved plan and nothing was ' +
      'delivered yet.',
  })
  async deliverBatch(
    @Param('quotationId') quotationId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deliverBatch(quotationId, batchId, {
      userId: user.sub,
      role: user.role,
    });
  }
}
