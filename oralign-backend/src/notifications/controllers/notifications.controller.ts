import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  NotificationFilterDto,
  UnreadCountResponseDto,
} from '../dto/notification.dto';
import { NotificationsService } from '../services/notifications.service';

/**
 * Recipient-only notification endpoints.
 *
 * Every route requires authentication and operates on the caller's
 * inbox — there is no admin-elevation here. Even a super-admin reading
 * `/notifications` only sees their own rows. Cross-user reads are
 * intentionally not exposed by HTTP; if a feature needs them later
 * it should go through a dedicated admin-only audit endpoint, not
 * this one.
 */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List the caller\'s notifications, newest first. Supports `unreadOnly` filter and PaginatedResponse pagination.',
  })
  async list(
    @Query() filters: NotificationFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notifications.list(
      { userId: user.sub, role: user.role as UserRole },
      filters,
    );
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'How many unread notifications the caller has.' })
  @ApiResponse({ status: 200, type: UnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: JwtPayload,
  ): Promise<UnreadCountResponseDto> {
    const count = await this.notifications.unreadCount({
      userId: user.sub,
      role: user.role as UserRole,
    });
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark one notification as read. 404 if not found, 403 if owned by another user. Idempotent on already-read rows.',
  })
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notifications.markRead(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every unread notification for the caller.' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead({
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}
