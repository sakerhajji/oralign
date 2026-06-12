import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AssignSupportConversationDto,
  CreateSupportConversationDto,
  SendSupportMessageDto,
  SupportConversationFilterDto,
  UpdateSupportPriorityDto,
  UpdateSupportStatusDto,
} from '../dto/support.dto';
import { SupportService } from '../services/support.service';
import { NotFoundException } from '../../common/exceptions/app.exception';

const ALL_AUTHED: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
];
const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

@ApiTags('support')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_AUTHED)
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  // ─── Conversations ──────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({
    summary:
      'List conversations. Doctor scope: own conversations only. Admin scope: every conversation, filterable.',
  })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() filters: SupportConversationFilterDto,
  ) {
    return this.service.listConversations(
      { userId: user.sub, role: user.role as UserRole },
      filters,
    );
  }

  @Get('conversations/unread-count')
  @ApiOperation({
    summary:
      'Total unread messages for the caller. Doctor: messages from admins; admin: messages from doctors.',
  })
  async unreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.service.unreadCount({
      userId: user.sub,
      role: user.role as UserRole,
    });
    return { count };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get one conversation with all its messages.' })
  @ApiParam({ name: 'id' })
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getConversation(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  /**
   * Doctor opens a brand-new conversation. Multipart: optional
   * `subject` + `body` text fields, optional `attachment` image. The
   * service rejects empty submissions (no body + no attachment).
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.dentist)
  @ApiOperation({ summary: 'Doctor opens a new support conversation.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
        attachment: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('attachment', {
      // 10 MB to match the service's hard cap. Anything bigger gets
      // rejected by Multer before the service even sees it.
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSupportConversationDto,
    @UploadedFile() attachment: Express.Multer.File | undefined,
  ) {
    return this.service.createConversation({
      caller: { userId: user.sub, role: user.role as UserRole },
      dto,
      attachment,
    });
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message (text + optional image) to an existing conversation.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        attachment: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiParam({ name: 'id' })
  @UseInterceptors(
    FileInterceptor('attachment', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendSupportMessageDto,
    @UploadedFile() attachment: Express.Multer.File | undefined,
  ) {
    return this.service.sendMessage({
      conversationId: id,
      caller: { userId: user.sub, role: user.role as UserRole },
      body: dto.body,
      attachment,
    });
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every unread message from the OTHER side as read.' })
  @ApiParam({ name: 'id' })
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.markRead(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Admin lifecycle ────────────────────────────────────────────

  @Patch('conversations/:id/status')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Admin: change conversation status (open/pending/resolved/closed).' })
  @ApiParam({ name: 'id' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupportStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateStatus(id, dto.status, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Patch('conversations/:id/priority')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Admin: set conversation priority.' })
  @ApiParam({ name: 'id' })
  async setPriority(
    @Param('id') id: string,
    @Body() dto: UpdateSupportPriorityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updatePriority(id, dto.priority, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Patch('conversations/:id/assign')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Admin: assign (or unassign) a conversation.' })
  @ApiParam({ name: 'id' })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignSupportConversationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.assign(
      id,
      dto.assignedAdminId ?? null,
      { userId: user.sub, role: user.role as UserRole },
    );
  }

  @Delete('conversations/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Admin-only soft delete. Doctors cannot reach this route (403).' })
  @ApiParam({ name: 'id' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.softDelete(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('conversations/:id/restore')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: restore a soft-deleted conversation.' })
  @ApiParam({ name: 'id' })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.restore(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Attachments ────────────────────────────────────────────────

  /**
   * Stream an attachment through the API (RBAC-gated). We do NOT
   * serve attachments via the public /uploads static route because
   * conversations are private; the controller revalidates access on
   * every fetch.
   */
  @Get('attachments/:conversationId/:messageId')
  @ApiOperation({ summary: 'Stream an image attachment for a message.' })
  @ApiParam({ name: 'conversationId' })
  @ApiParam({ name: 'messageId' })
  @ApiQuery({
    name: 'variant',
    required: false,
    description:
      'Optimized variant (thumb | md | lg | avif); falls back to the ' +
      'original while processing is pending.',
  })
  async downloadAttachment(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('variant') variant?: string,
  ) {
    const { conversation, messages } = await this.service.getConversation(
      conversationId,
      { userId: user.sub, role: user.role as UserRole },
    );
    const message = messages.find(
      (m: { id: string; attachmentRelativePath: string | null; attachmentMime: string | null; attachmentName: string | null; attachmentVariants?: unknown }) =>
        m.id === messageId,
    );
    if (!message || !message.attachmentRelativePath) {
      throw new NotFoundException('Attachment not found.');
    }

    // Serve the derived thumbnail/preview when asked and available —
    // chat bubbles request `?variant=thumb` blindly and rely on this
    // falling back to the original until the async pipeline catches up.
    if (
      variant &&
      message.attachmentVariants &&
      typeof message.attachmentVariants === 'object'
    ) {
      const info = (
        message.attachmentVariants as Record<
          string,
          { path?: string; format?: string }
        >
      )[variant];
      if (info?.path) {
        try {
          const variantAbs = this.service.resolveSafeAttachmentPath(info.path);
          if (fs.existsSync(variantAbs)) {
            res.setHeader(
              'Content-Type',
              info.format === 'avif' ? 'image/avif' : 'image/webp',
            );
            // Variants are immutable per message id — cache hard.
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.setHeader('Content-Disposition', 'inline');
            fs.createReadStream(variantAbs).pipe(res);
            void conversation.id;
            return;
          }
        } catch {
          /* fall back to the original below */
        }
      }
    }

    const abs = this.service.resolveSafeAttachmentPath(
      message.attachmentRelativePath,
    );
    if (!fs.existsSync(abs)) {
      throw new NotFoundException('Attachment missing on disk.');
    }
    res.setHeader(
      'Content-Type',
      message.attachmentMime ?? 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Voluntary header so the doctor's screenshot keeps its name when
    // they save the image — `inline` so the browser previews it.
    if (message.attachmentName) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${message.attachmentName.replace(/[^\x20-\x7E]+/g, '_')}"`,
      );
    }
    fs.createReadStream(abs).pipe(res);
    // Belt-and-braces: prevent the `conversation` row from being
    // garbage-collected by the JS engine before the stream resolves
    // (no-op in v8 but keeps the linter happy).
    void conversation.id;
  }
}
