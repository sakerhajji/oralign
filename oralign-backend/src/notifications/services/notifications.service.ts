import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';

type Caller = { userId: string; role: UserRole | string };

/**
 * Owner of the Notification table lifecycle.
 *
 * Boundaries:
 *   • CREATE — only this service (and the listener it forwards to) ever
 *              writes rows. Business services never touch `prisma.notification`
 *              directly; they emit a domain event and trust the listener.
 *   • READ   — recipient-scoped. Even an admin who fetches `/notifications`
 *              only sees rows where `recipientId === their userId`.
 *   • UPDATE — limited to the `readAt` field, again recipient-scoped.
 *
 * The `Caller` parameter on every read/write path enforces this: the
 * service refuses to expose another user's inbox no matter the role.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Writes (used by the listener) ─────────────────────────────────

  /**
   * Persist a single notification. Returns the row so the listener
   * can chain follow-ups (e.g. push it through a real-time channel
   * if/when we wire one up).
   */
  async create(args: {
    recipientId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        recipientId: args.recipientId,
        type: args.type,
        title: args.title,
        message: args.message,
        link: args.link ?? null,
        metadata: args.metadata ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Fan-out helper for events that target every admin (e.g. "a doctor
   * just submitted an order"). One Notification row per admin user.
   *
   * `createMany` skips returning rows for perf — we don't need them.
   */
  async broadcastToAdmins(args: {
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<number> {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: [UserRole.admin, UserRole.super_admin] },
      },
      select: { id: true },
    });
    if (admins.length === 0) return 0;
    const result = await this.prisma.notification.createMany({
      data: admins.map((a) => ({
        recipientId: a.id,
        type: args.type,
        title: args.title,
        message: args.message,
        link: args.link ?? null,
        metadata: args.metadata ?? Prisma.JsonNull,
      })),
    });
    this.logger.debug(
      `Broadcast ${args.type} to ${result.count} admin(s)`,
    );
    return result.count;
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  async list(
    caller: Caller,
    filters: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<PaginatedResponse<Notification>> {
    const take = Math.min(Math.max(filters.limit ?? 20, 1), 50);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * take;
    const where: Prisma.NotificationWhereInput = {
      recipientId: caller.userId,
      ...(filters.unreadOnly ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return new PaginatedResponse(
      rows,
      total,
      page,
      take,
      Math.ceil(total / take),
    );
  }

  async unreadCount(caller: Caller): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: caller.userId, readAt: null },
    });
  }

  // ─── Mark-read ──────────────────────────────────────────────────────

  /**
   * Marks one notification as read. Hardens against tampering:
   *   • 404 if the id doesn't exist
   *   • 403 if it belongs to someone else
   * Idempotent — calling on an already-read row just returns it.
   */
  async markRead(id: string, caller: Caller): Promise<Notification> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Notification not found.');
    if (row.recipientId !== caller.userId) {
      throw new ForbiddenException('You cannot mutate this notification.');
    }
    if (row.readAt) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Mark every unread notification for this user as read. */
  async markAllRead(caller: Caller): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: caller.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
