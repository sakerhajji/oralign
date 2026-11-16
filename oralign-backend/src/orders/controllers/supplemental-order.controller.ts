import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateSupplementalOrderDto,
  ReviewSupplementalOrderDto,
  UpdateSupplementalOrderDto,
} from '../dto/supplemental-order.dto';
import { IDEMPOTENCY_KEY_HEADER } from '../supplemental/supplemental.constants';
import { SupplementalOrderService } from '../supplemental/supplemental-order.service';
import { SupplementalReviewService } from '../supplemental/supplemental-review.service';
import type {
  SupplementalEligibility,
  SupplementalOrderView,
} from '../supplemental/supplemental.types';

/**
 * Supplemental requests (additional aligners, replacement, transfer
 * template, warranty) hanging off an initial case. Every role that can
 * read orders reaches these routes; what each may do is decided in the
 * services (supplemental-permissions.ts), never here.
 */
@ApiTags('supplemental-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
)
@Controller('orders')
export class SupplementalOrderController {
  constructor(
    private readonly requests: SupplementalOrderService,
    private readonly reviews: SupplementalReviewService,
  ) {}

  @Get(':id/supplemental-eligibility')
  @ApiOperation({ summary: 'Server-computed eligibility per request kind.' })
  @ApiParam({ name: 'id', description: 'Initial order ID' })
  eligibility(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalEligibility> {
    return this.requests.eligibility(id, toCaller(user));
  }

  @Get(':id/supplemental-requests')
  @ApiOperation({ summary: 'The requests of a case the caller may see.' })
  @ApiParam({ name: 'id', description: 'Initial order ID' })
  list(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView[]> {
    return this.requests.list(id, toCaller(user));
  }

  @Post(':id/supplemental-requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a request draft (idempotent per key).' })
  @ApiParam({ name: 'id', description: 'Initial order ID' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: '8-128 characters: letters, digits, _ or -.',
  })
  create(
    @Param('id') id: string,
    @Body() dto: CreateSupplementalOrderDto,
    @CurrentUser() user: JwtPayload,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<SupplementalOrderView> {
    return this.requests.create(id, dto, idempotencyKey, toCaller(user));
  }

  @Get('supplemental-requests/:requestId')
  @ApiOperation({ summary: 'A request, by its child order ID.' })
  get(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView> {
    return this.requests.get(requestId, toCaller(user));
  }

  @Put('supplemental-requests/:requestId')
  @ApiOperation({ summary: 'Save a draft (whole form; null clears).' })
  update(
    @Param('requestId') requestId: string,
    @Body() dto: UpdateSupplementalOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView> {
    return this.requests.update(requestId, dto, toCaller(user));
  }

  @Delete('supplemental-requests/:requestId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a draft.' })
  removeDraft(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.requests.removeDraft(requestId, toCaller(user));
  }

  @Post('supplemental-requests/:requestId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate and submit a draft for review.' })
  submit(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView> {
    return this.requests.submit(requestId, toCaller(user));
  }

  @Post('supplemental-requests/:requestId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: approve or reject a pending request.' })
  review(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewSupplementalOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView> {
    return this.reviews.review(requestId, dto, toCaller(user));
  }

  @Post('supplemental-requests/:requestId/convert-to-replacement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Owning dentist: accept a paid replacement for a rejected warranty claim.',
  })
  convertToReplacement(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SupplementalOrderView> {
    return this.reviews.convertRejectedWarranty(requestId, toCaller(user));
  }
}

function toCaller(user: JwtPayload): Caller {
  return { userId: user.sub, role: user.role };
}
