import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { TreatmentPlanService } from '../services/treatment-plan.service';
import {
  CreatePublicLinkDto,
  CreateTreatmentPlanDto,
  TreatmentPlanReviewDto,
  UpdateResultViewUrlDto,
  UpdateTreatmentPlanDto,
} from '../dto/treatment-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

const ALL_AUTHED: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];
const PLANNER: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

@ApiTags('treatment-plans')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_AUTHED)
export class TreatmentPlanController {
  constructor(private readonly service: TreatmentPlanService) {}

  // ─── Nested under /orders/:orderId ────────────────────────────────────────

  @Post('orders/:orderId/treatment-plans')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...PLANNER)
  @ApiOperation({ summary: 'Create a new Treatment Plan for an order' })
  @ApiParam({ name: 'orderId', type: String })
  async create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateTreatmentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(orderId, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Get('orders/:orderId/treatment-plans')
  @ApiOperation({ summary: 'List Treatment Plans for an order' })
  @ApiParam({ name: 'orderId', type: String })
  async list(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listForOrder(orderId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Top-level /treatment-plans/:id ───────────────────────────────────────

  @Get('treatment-plans/:id')
  @ApiOperation({ summary: 'Get a Treatment Plan by id' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getOne(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Get('treatment-plans/:id/review')
  @ApiOperation({
    summary:
      'Get the full review payload for a Treatment Plan — plan + grouped ' +
      'odontogram + conversation messages + clinical images.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: TreatmentPlanReviewDto })
  async getReview(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getReview(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Put('treatment-plans/:id')
  @Roles(...PLANNER)
  @ApiOperation({ summary: 'Update a Treatment Plan (planner roles only)' })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Put('treatment-plans/:id/result-view-url')
  @Roles(...PLANNER)
  @ApiOperation({ summary: 'Set/update the Treatment Plan result viewer URL' })
  @ApiParam({ name: 'id', type: String })
  async updateResultViewUrl(
    @Param('id') id: string,
    @Body() dto: UpdateResultViewUrlDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateResultViewUrl(id, dto.resultViewUrl, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Approve / reject — doctor or admin ───────────────────────────────────

  @Post('treatment-plans/:id/mark-ready')
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNER)
  @ApiOperation({
    summary:
      'Planner marks the plan as ready for doctor review. The plan status ' +
      'becomes "ready" and the order status becomes "treatment_plan_ready". ' +
      'No longer happens implicitly when uploading a treatment_result file.',
  })
  async markReady(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.markReady(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('treatment-plans/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Doctor (or admin) approves a treatment plan; transitions the order to treatment_approved.',
  })
  async approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approve(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('treatment-plans/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doctor (or admin) rejects a treatment plan' })
  async reject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.reject(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Movement table image ─────────────────────────────────────────────────

  @Post('treatment-plans/:id/movement-table-image')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...PLANNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload (or replace) the orthodontic movement-table image',
  })
  async uploadMovementTableImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.uploadMovementTableImage(id, file, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Delete('treatment-plans/:id/movement-table-image')
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNER)
  @ApiOperation({ summary: 'Delete the movement-table image' })
  async deleteMovementTableImage(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deleteMovementTableImage(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Get('treatment-plans/:id/movement-table-image')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream the movement-table image' })
  async getMovementTableImage(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileName } =
      await this.service.getMovementTableImageStream(id, {
        userId: user.sub,
        role: user.role as UserRole,
      });
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(fileName)}"`,
    );
    stream.pipe(res);
  }

  // ─── Public link ──────────────────────────────────────────────────────────

  @Post('treatment-plans/:id/generate-public-link')
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNER)
  @ApiOperation({
    summary:
      'Generate (or rotate) a public viewer token for this treatment plan.',
  })
  async generatePublicLink(
    @Param('id') id: string,
    @Body() dto: CreatePublicLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.generatePublicLink(id, dto.validDays, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}
