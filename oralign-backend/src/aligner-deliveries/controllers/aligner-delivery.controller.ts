import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AlignerDeliverySummaryDto,
  RecordAlignerDeliveryDto,
  UpdateAlignerTotalDto,
} from '../dto/aligner-delivery.dto';
import { AlignerDeliveryService } from '../services/aligner-delivery.service';

/**
 * Aligner delivery tracking, nested under the order it belongs to.
 * Role gates here are coarse; the real rule (admin or owning dentist
 * writes, anyone who can read the order reads) is OrderAccessPolicy's,
 * applied in the service.
 */
@ApiTags('orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
)
@ApiParam({ name: 'orderId', description: 'Dental order id' })
@Controller('orders/:orderId/aligner-deliveries')
export class AlignerDeliveryController {
  constructor(private readonly deliveries: AlignerDeliveryService) {}

  @Get()
  @ApiOperation({
    summary: 'Delivered-aligner summary and delivery history of an order',
  })
  @ApiResponse({ status: 200, type: AlignerDeliverySummaryDto })
  getSummary(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AlignerDeliverySummaryDto> {
    return this.deliveries.getSummary(orderId, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post()
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record an aligner delivery batch',
    description:
      'Appends one delivery (e.g. aligners 4 → 7). 400 for an invalid or out-of-series range, 409 when it overlaps or repeats an existing delivery.',
  })
  @ApiResponse({ status: 201, type: AlignerDeliverySummaryDto })
  record(
    @Param('orderId') orderId: string,
    @Body() dto: RecordAlignerDeliveryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AlignerDeliverySummaryDto> {
    return this.deliveries.record(orderId, dto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Patch('total')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @ApiOperation({
    summary: 'Correct the size of the aligner series',
    description: 'Refused (400) below the highest aligner already delivered.',
  })
  @ApiResponse({ status: 200, type: AlignerDeliverySummaryDto })
  setTotal(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateAlignerTotalDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AlignerDeliverySummaryDto> {
    return this.deliveries.setTotal(orderId, dto, {
      userId: user.sub,
      role: user.role,
    });
  }
}
