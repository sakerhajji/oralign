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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Caller } from '../../common/access/caller';
import {
  NotificationFilterDto,
  SubjectReadResponseDto,
  UnreadCountResponseDto,
} from '../dto/notification.dto';
import { NotificationsService } from '../services/notifications.service';

/** The service-layer principal of a verified token. */
const callerOf = (user: JwtPayload): Caller => ({
  userId: user.sub,
  role: user.role,
});

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
      "List the caller's notifications, newest first. Supports `unreadOnly` filter and PaginatedResponse pagination.",
  })
  async list(
    @Query() filters: NotificationFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notifications.list(callerOf(user), filters);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'How many unread notifications the caller has.' })
  @ApiResponse({ status: 200, type: UnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: JwtPayload,
  ): Promise<UnreadCountResponseDto> {
    const count = await this.notifications.unreadCount(callerOf(user));
    return { count };
  }

  /**
   * Three segments after `notifications/`, so it never meets `:id/read`.
   * The key travels URL-encoded (`installment%3A<id>`); Express decodes it.
   */
  @Post('subject/:subjectKey/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark the caller\'s own rows of one subject as read ("Consulté" on the transfer desk). Idempotent. 400 NOTIFICATION_SUBJECT_INVALID on a malformed key.',
  })
  @ApiParam({
    name: 'subjectKey',
    example: 'installment:2b9c1f9e-6a43-4c1e-8a57-0b1c1d2e3f40',
  })
  @ApiResponse({ status: 200, type: SubjectReadResponseDto })
  async markSubjectRead(
    @Param('subjectKey') subjectKey: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubjectReadResponseDto> {
    return this.notifications.markSubjectRead(callerOf(user), subjectKey);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark one notification as read. 404 if not found, 403 if owned by another user. Idempotent on already-read rows.',
  })
  async markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notifications.markRead(id, callerOf(user));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every unread notification for the caller.' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(callerOf(user));
  }
}
