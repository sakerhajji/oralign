import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import { Lang, LangText, pickLang, tr } from '../../common/i18n/lang';
import { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from '../../common/access/caller';
import {
  isTransferSubjectKey,
  TREATMENT_FEE_SUBJECT_PREFIX,
} from '../notification-subject';

/**
 * Owner of the Notification table lifecycle.
 *
 * Boundaries:
 *   • CREATE — only this service (and the listener it forwards to) ever
 *              writes rows. Business services never touch `prisma.notification`
 *              directly; they emit a domain event and trust the listener.
 *   • READ   — recipient-scoped. Even an admin who fetches `/notifications`
 *              only sees rows where `recipientId === their userId`.
 *   • UPDATE — limited to the `readAt` field, again recipient-scoped, except
 *              `resolveSubject`: when a transfer is processed (or the
 *              doctor replaces / withdraws it) every admin's row of that
 *              subject is resolved, since there is nothing left to see.
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
   *
   * i18n: `title` / `message` accept a `{ en, fr }` pair (or a plain
   * string for back-compat). The recipient's `preferredLanguage` is
   * resolved HERE — the single chokepoint every notification passes
   * through — and the stored row carries the already-translated
   * strings. Storing resolved text (rather than keys) keeps the read
   * path and the existing schema untouched: the bell just renders
   * what's in the row.
   *
   * `lang`: a caller that already loaded the recipient's preferredLanguage
   * (the production notice dispatcher, per batch) passes it, and the
   * lookup is skipped.
   *
   * `subjectKey`: the business subject (notification-subject.ts), only on
   * rows about something actionable.
   */
  async create(args: {
    recipientId: string;
    type: NotificationType;
    title: LangText | string;
    message: LangText | string;
    link?: string | null;
    metadata?: Prisma.InputJsonValue;
    lang?: Lang;
    subjectKey?: string | null;
  }): Promise<Notification> {
    const lang =
      args.lang ??
      pickLang(
        (
          await this.prisma.user.findUnique({
            where: { id: args.recipientId },
            select: { preferredLanguage: true },
          })
        )?.preferredLanguage,
      );
    return this.prisma.notification.create({
      data: {
        recipientId: args.recipientId,
        type: args.type,
        title: tr(args.title, lang),
        message: tr(args.message, lang),
        link: args.link ?? null,
        metadata: args.metadata ?? Prisma.JsonNull,
        subjectKey: args.subjectKey ?? null,
      },
    });
  }

  /**
   * Fan-out helper for events that target every admin (e.g. "a doctor
   * just submitted an order"). One Notification row per admin user:
   * every active, undeleted admin and super_admin ("admin autorisé",
   * DECISIONS §2).
   *
   * `subjectKey` rides on every row, so each admin has his own
   * "Nouveau / Consulté" (readAt) for the subject.
   *
   * `createMany` skips returning rows for perf — we don't need them.
   */
  async broadcastToAdmins(args: {
    type: NotificationType;
    title: LangText | string;
    message: LangText | string;
    link?: string | null;
    metadata?: Prisma.InputJsonValue;
    subjectKey?: string | null;
  }): Promise<number> {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: [UserRole.admin, UserRole.super_admin] },
      },
      // preferredLanguage rides along so each admin's row is rendered
      // in THEIR language — a French admin and an English admin get
      // different copies of the same broadcast.
      select: { id: true, preferredLanguage: true },
    });
    if (admins.length === 0) return 0;
    const result = await this.prisma.notification.createMany({
      data: admins.map((a) => {
        const lang = pickLang(a.preferredLanguage);
        return {
          recipientId: a.id,
          type: args.type,
          title: tr(args.title, lang),
          message: tr(args.message, lang),
          link: args.link ?? null,
          metadata: args.metadata ?? Prisma.JsonNull,
          subjectKey: args.subjectKey ?? null,
        };
      }),
    });
    this.logger.debug(`Broadcast ${args.type} to ${result.count} admin(s)`);
    return result.count;
  }

  // ─── Subjects (transfer "Nouveau / Consulté") ──────────────────────

  /**
   * The caller opened the subject (POST notifications/subject/:key/read,
   * or the receipt review): HIS unread rows of it become read. Idempotent;
   * never touches another recipient's rows. 400 NOTIFICATION_SUBJECT_INVALID
   * on a key notification-subject.ts cannot parse.
   */
  async markSubjectRead(
    caller: Caller,
    subjectKey: string,
  ): Promise<{ updated: number }> {
    if (!isTransferSubjectKey(subjectKey)) {
      throw new BadRequestException(
        'Sujet de notification invalide.',
        TRANSFER_ERROR.SUBJECT_KEY_INVALID,
      );
    }
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: caller.userId, subjectKey, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /**
   * The subject is closed (processed by an admin, replaced or withdrawn by
   * the doctor): every recipient's unread row of it is resolved, so no
   * badge keeps counting it. Returns the rows resolved; a malformed key
   * resolves nothing (listener input, logged).
   */
  async resolveSubject(subjectKey: string): Promise<number> {
    if (!isTransferSubjectKey(subjectKey)) {
      // The key itself is not logged: listener input, never trusted text.
      this.logger.warn('resolveSubject: ignored a malformed subject key');
      return 0;
    }
    const result = await this.prisma.notification.updateMany({
      where: { subjectKey, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Fallback of resolveSubject for a treatment-fee event that carries no
   * declaration instant (legacy emitter): every open treatment-fee subject
   * of the order. A fee settled or refused leaves no declaration of it to
   * review, so all of them are done.
   */
  async resolveTreatmentFeeSubjects(orderId: string): Promise<number> {
    // A uuid in practice. No '_' or '%' (LIKE wildcards) may reach the
    // prefix match, so anything else resolves nothing.
    if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) return 0;
    const result = await this.prisma.notification.updateMany({
      where: {
        type: NotificationType.treatment_fee_declared,
        subjectKey: {
          startsWith: `${TREATMENT_FEE_SUBJECT_PREFIX}:${orderId}:`,
        },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
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
