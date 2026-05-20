import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { TreatmentAttachmentCategory, UserRole } from '@prisma/client';
import { TreatmentMessageService } from '../services/treatment-message.service';
import { CreateTreatmentMessageDto } from '../dto/treatment-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

const AUTHED: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

@ApiTags('treatment-messages')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUTHED)
export class TreatmentMessageController {
  constructor(private readonly service: TreatmentMessageService) {}

  // ─── Order-scoped chat (one conversation per order, across all plans) ─────

  @Get('orders/:orderId/messages')
  @ApiOperation({
    summary:
      "List all chat messages for an order's conversation (spans every treatment plan version).",
  })
  @ApiParam({ name: 'orderId', type: String })
  listByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listByOrder(orderId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('orders/:orderId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Send a text-only message to the order's conversation (attached to the latest plan).",
  })
  @ApiParam({ name: 'orderId', type: String })
  createForOrder(
    @Param('orderId') orderId: string,
    @Body() dto: CreateTreatmentMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createForOrder(
      orderId,
      { message: dto.message, files: [] },
      { userId: user.sub, role: user.role as UserRole },
    );
  }

  @Post('orders/:orderId/messages/with-attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', nullable: true },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiQuery({
    name: 'category',
    enum: TreatmentAttachmentCategory,
    required: false,
  })
  @ApiOperation({
    summary:
      "Send a message + attachments to the order's conversation (attached to the latest plan).",
  })
  @ApiParam({ name: 'orderId', type: String })
  createForOrderWithAttachments(
    @Param('orderId') orderId: string,
    @Body() body: CreateTreatmentMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: TreatmentAttachmentCategory,
  ) {
    return this.service.createForOrder(
      orderId,
      { message: body.message, files: files ?? [] },
      { userId: user.sub, role: user.role as UserRole },
      category,
    );
  }

  // ─── Legacy per-plan endpoints (kept for back-compat) ─────────────────────
  // `list` returns ORDER-wide messages — same as the new endpoint — so
  // older clients still see the full conversation. New code should use
  // the /orders/:orderId/messages endpoints above.

  @Get('treatment-plans/:id/messages')
  @ApiOperation({
    summary:
      "List the order's conversation (messages span every plan version) — addressed by plan id.",
  })
  @ApiParam({ name: 'id', type: String })
  list(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.list(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('treatment-plans/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Send a text-only message (use /messages/with-attachments for files).',
  })
  @ApiParam({ name: 'id', type: String })
  create(
    @Param('id') id: string,
    @Body() dto: CreateTreatmentMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(
      id,
      { message: dto.message, files: [] },
      { userId: user.sub, role: user.role as UserRole },
    );
  }

  @Post('treatment-plans/:id/messages/with-attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', nullable: true },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiQuery({
    name: 'category',
    enum: TreatmentAttachmentCategory,
    required: false,
  })
  @ApiOperation({
    summary:
      'Send a message with attachments. ' +
      'Optional `?category=...` overrides the inferred file category for all attached files.',
  })
  @ApiParam({ name: 'id', type: String })
  createWithAttachments(
    @Param('id') id: string,
    @Body() body: CreateTreatmentMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: TreatmentAttachmentCategory,
  ) {
    return this.service.create(
      id,
      { message: body.message, files: files ?? [] },
      { userId: user.sub, role: user.role as UserRole },
      category,
    );
  }

  // ─── Attachment access ────────────────────────────────────────────────────

  @Get('treatment-message-attachments/:attachmentId/download')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream a treatment-message attachment' })
  @ApiParam({ name: 'attachmentId', type: String })
  async download(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileName } =
      await this.service.getAttachmentStream(attachmentId, {
        userId: user.sub,
        role: user.role as UserRole,
      });
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    stream.pipe(res);
  }

  @Delete('treatment-message-attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a treatment-message attachment' })
  @ApiParam({ name: 'attachmentId', type: String })
  remove(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.softDeleteAttachment(attachmentId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}
