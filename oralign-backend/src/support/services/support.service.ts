import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Prisma,
  SupportConversation,
  SupportConversationStatus,
  SupportMessage,
  SupportPriority,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportChatGateway } from '../gateways/support-chat.gateway';
import {
  SupportConversationFilterDto,
  CreateSupportConversationDto,
} from '../dto/support.dto';
import { MediaProcessingService } from '../../media/media-processing.service';
import { ADMIN_ROLES, isAdmin, type Caller } from '../../common/access/caller';

// Storage: every conversation gets its own subdirectory under
// /uploads/support/<convId>/ so cleanup on hard-delete is one rmdir.
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'support');

// Image-only attachments — locked down to four formats the dashboard
// renders inline without an external viewer. PDF / video / etc would
// need a separate flow.
const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/jpg', // some uploads come with this non-standard alias
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per image

const PREVIEW_LEN = 120;

export interface ListConversationsResult {
  data: SupportConversation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SupportChatGateway))
    private readonly gateway: SupportChatGateway,
    private readonly mediaProcessing: MediaProcessingService,
  ) {}

  /**
   * Hand an image attachment to the async optimizer (chat-bubble
   * thumbnails). Called strictly post-commit; variants are cosmetic
   * here and the original is always the fallback.
   */
  private enqueueAttachmentProcessing(message: {
    id: string;
    attachmentRelativePath: string | null;
    attachmentMime: string | null;
  }): void {
    if (
      message.attachmentRelativePath &&
      message.attachmentMime?.startsWith('image/')
    ) {
      this.mediaProcessing.enqueue('support-message', message.id);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Load a conversation + permission-check the caller. Throws 404 if
   * the row is missing OR soft-deleted (admins still see deleted via
   * the explicit `includeDeleted` path). Doctors only ever see their
   * own conversations.
   */
  private async loadConversationForCaller(
    id: string,
    caller: Caller,
    opts: { allowDeleted?: boolean } = {},
  ): Promise<SupportConversation> {
    const conv = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conv) throw new NotFoundException('Conversation not found.');
    if (conv.deletedAt && !opts.allowDeleted) {
      throw new NotFoundException('Conversation not found.');
    }
    if (isAdmin(caller)) return conv;
    if (caller.role === UserRole.dentist && conv.doctorId === caller.userId) {
      return conv;
    }
    throw new ForbiddenException('You cannot access this conversation.');
  }

  /** Trim + slice the preview shown in the admin list. */
  private buildPreview(body: string | null, hasAttachment: boolean): string {
    if (body && body.length > 0) {
      const single = body.replace(/\s+/g, ' ').trim();
      return single.slice(0, PREVIEW_LEN);
    }
    return hasAttachment ? '📎 Image attachment' : '';
  }

  /** Multer-side attachment validation. Throws on disallowed MIME / oversize. */
  validateAttachment(file: Express.Multer.File | undefined): void {
    if (!file) return;
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported attachment type "${file.mimetype}". Allowed: PNG, JPG, JPEG, WebP.`,
      );
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(
        `Attachment too large (max ${
          MAX_ATTACHMENT_BYTES / 1024 / 1024
        } MB).`,
      );
    }
  }

  // ─── Doctor + admin: create + send ────────────────────────────────

  /**
   * Doctor opens a brand-new conversation with the support team. The
   * first message lands inside the same transaction so the
   * conversation never exists with zero messages.
   */
  async createConversation(args: {
    caller: Caller;
    dto: CreateSupportConversationDto;
    attachment?: Express.Multer.File;
  }): Promise<{ conversation: SupportConversation; firstMessage: SupportMessage }> {
    if (args.caller.role !== UserRole.dentist) {
      throw new ForbiddenException(
        'Only dentists can open a support conversation.',
      );
    }
    this.validateAttachment(args.attachment);
    if (!args.dto.body && !args.attachment) {
      throw new BadRequestException(
        'Message body or image attachment required.',
      );
    }

    const conversationId = uuidv4();
    const attachmentMeta = args.attachment
      ? await this.persistAttachment(conversationId, args.attachment)
      : null;
    const preview = this.buildPreview(
      args.dto.body ?? null,
      !!args.attachment,
    );

    const { conversation, firstMessage } = await this.prisma.$transaction(
      async (tx) => {
        const conversation = await tx.supportConversation.create({
          data: {
            id: conversationId,
            doctorId: args.caller.userId,
            subject: args.dto.subject ?? null,
            lastMessageAt: new Date(),
            lastMessagePreview: preview,
            unreadByAdmin: 1, // first message is unread by admin
          },
        });
        const firstMessage = await tx.supportMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: args.caller.userId,
            senderRole: UserRole.dentist,
            body: args.dto.body ?? null,
            attachmentRelativePath: attachmentMeta?.relativePath ?? null,
            attachmentMime: attachmentMeta?.mime ?? null,
            attachmentName: attachmentMeta?.name ?? null,
            attachmentSize: attachmentMeta?.size ?? null,
          },
        });
        return { conversation, firstMessage };
      },
    );

    this.enqueueAttachmentProcessing(firstMessage);

    // Real-time fan-out: the new conversation goes to ALL admins, the
    // doctor joins their own room automatically when the bubble opens.
    this.gateway.broadcastConversationCreated(conversation);
    this.gateway.broadcastNewMessage(
      conversation.id,
      firstMessage,
      conversation.doctorId,
    );
    return { conversation, firstMessage };
  }

  /**
   * Doctor or admin sends a new message to an existing conversation.
   * Increments the recipient's unread counter and updates the
   * conversation's `lastMessageAt` + `lastMessagePreview` atomically.
   *
   * Refuses to write to a closed or soft-deleted conversation.
   */
  async sendMessage(args: {
    conversationId: string;
    caller: Caller;
    body?: string;
    attachment?: Express.Multer.File;
  }): Promise<SupportMessage> {
    const conv = await this.loadConversationForCaller(
      args.conversationId,
      args.caller,
    );
    if (conv.status === SupportConversationStatus.closed) {
      throw new BadRequestException(
        'This conversation is closed. Open a new one to keep the discussion.',
      );
    }
    this.validateAttachment(args.attachment);
    if (!args.body && !args.attachment) {
      throw new BadRequestException(
        'Message body or image attachment required.',
      );
    }

    const attachmentMeta = args.attachment
      ? await this.persistAttachment(conv.id, args.attachment)
      : null;
    const preview = this.buildPreview(args.body ?? null, !!args.attachment);
    const senderIsDoctor = args.caller.role === UserRole.dentist;

    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.supportMessage.create({
        data: {
          conversationId: conv.id,
          senderId: args.caller.userId,
          senderRole: args.caller.role,
          body: args.body ?? null,
          attachmentRelativePath: attachmentMeta?.relativePath ?? null,
          attachmentMime: attachmentMeta?.mime ?? null,
          attachmentName: attachmentMeta?.name ?? null,
          attachmentSize: attachmentMeta?.size ?? null,
        },
      });
      await tx.supportConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: preview,
          // Bump the OTHER side's unread counter. When the doctor
          // writes, admin unread +=1. When admin writes, doctor +=1.
          ...(senderIsDoctor
            ? { unreadByAdmin: { increment: 1 } }
            : { unreadByDoctor: { increment: 1 } }),
          // Admin reply on a resolved/pending thread bumps it back to
          // open so it surfaces in the queue again — doctors keep
          // resolved status though, they re-open by sending.
          ...(conv.status === SupportConversationStatus.resolved
            ? { status: SupportConversationStatus.open, resolvedAt: null }
            : {}),
        },
      });
      return m;
    });

    this.enqueueAttachmentProcessing(message);

    this.gateway.broadcastNewMessage(conv.id, message, conv.doctorId);
    this.gateway.broadcastConversationUpdated(conv.id, conv.doctorId);
    return message;
  }

  // ─── Reads ────────────────────────────────────────────────────────

  async listConversations(
    caller: Caller,
    filters: SupportConversationFilterDto,
  ): Promise<ListConversationsResult> {
    const take = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * take;
    const where = this.buildListWhere(caller, filters);

    const [rows, total] = await Promise.all([
      this.prisma.supportConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take,
        include: {
          doctor: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
          assignedAdmin: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.supportConversation.count({ where }),
    ]);
    return {
      data: rows,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async getConversation(id: string, caller: Caller) {
    const conv = await this.loadConversationForCaller(id, caller);
    const messages = await this.prisma.supportMessage.findMany({
      where: { conversationId: conv.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, fullName: true, role: true, avatarUrl: true },
        },
      },
    });
    return { conversation: conv, messages };
  }

  async unreadCount(caller: Caller): Promise<number> {
    // Doctor: sum of `unreadByDoctor` across THEIR conversations.
    // Admin: sum of `unreadByAdmin` across all non-deleted threads.
    // We sum in SQL to avoid pulling rows just to add their counts.
    if (caller.role === UserRole.dentist) {
      const row = await this.prisma.supportConversation.aggregate({
        where: { doctorId: caller.userId, deletedAt: null },
        _sum: { unreadByDoctor: true },
      });
      return row._sum.unreadByDoctor ?? 0;
    }
    if (isAdmin(caller)) {
      const row = await this.prisma.supportConversation.aggregate({
        where: { deletedAt: null },
        _sum: { unreadByAdmin: true },
      });
      return row._sum.unreadByAdmin ?? 0;
    }
    return 0;
  }

  /**
   * Mark every unread message in the conversation as read by the
   * caller and zero the matching side's unread counter. Idempotent —
   * re-calling on an already-read thread is a cheap no-op.
   */
  async markRead(id: string, caller: Caller): Promise<{ updated: number }> {
    const conv = await this.loadConversationForCaller(id, caller);
    const isDoctor = caller.role === UserRole.dentist;
    // The CALLER reads messages from the OTHER side — so doctor reads
    // admin-sent messages, admin reads doctor-sent messages.
    const senderRoleFilter = isDoctor
      ? { in: [...ADMIN_ROLES] }
      : UserRole.dentist;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportMessage.updateMany({
        where: {
          conversationId: conv.id,
          readAt: null,
          senderRole: senderRoleFilter as Prisma.EnumUserRoleFilter,
        },
        data: { readAt: new Date() },
      });
      await tx.supportConversation.update({
        where: { id: conv.id },
        data: isDoctor ? { unreadByDoctor: 0 } : { unreadByAdmin: 0 },
      });
      return updated.count;
    });

    this.gateway.broadcastReadBy(conv.id, {
      readerId: caller.userId,
      readerRole: caller.role,
      readAt: new Date().toISOString(),
    });
    return { updated: result };
  }

  // ─── Admin lifecycle ──────────────────────────────────────────────

  async updateStatus(
    id: string,
    nextStatus: SupportConversationStatus,
    caller: Caller,
  ): Promise<SupportConversation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can change conversation status.',
      );
    }
    const conv = await this.loadConversationForCaller(id, caller);
    if (conv.status === nextStatus) return conv;
    const updated = await this.prisma.supportConversation.update({
      where: { id: conv.id },
      data: {
        status: nextStatus,
        resolvedAt:
          nextStatus === SupportConversationStatus.resolved
            ? new Date()
            : nextStatus === SupportConversationStatus.open
              ? null
              : undefined,
        closedAt:
          nextStatus === SupportConversationStatus.closed ? new Date() : null,
      },
    });
    this.gateway.broadcastConversationUpdated(updated.id, updated.doctorId);
    return updated;
  }

  async updatePriority(
    id: string,
    priority: SupportPriority,
    caller: Caller,
  ): Promise<SupportConversation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can change conversation priority.',
      );
    }
    const conv = await this.loadConversationForCaller(id, caller);
    const updated = await this.prisma.supportConversation.update({
      where: { id: conv.id },
      data: { priority },
    });
    this.gateway.broadcastConversationUpdated(updated.id, updated.doctorId);
    return updated;
  }

  async assign(
    id: string,
    assignedAdminId: string | null,
    caller: Caller,
  ): Promise<SupportConversation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can assign a conversation.',
      );
    }
    const conv = await this.loadConversationForCaller(id, caller);
    if (assignedAdminId) {
      const target = await this.prisma.user.findUnique({
        where: { id: assignedAdminId },
        select: { role: true, deletedAt: true },
      });
      if (!target || target.deletedAt || !isAdmin(target)) {
        throw new BadRequestException(
          'Assignee must be an active admin user.',
        );
      }
    }
    const updated = await this.prisma.supportConversation.update({
      where: { id: conv.id },
      data: { assignedAdminId },
    });
    this.gateway.broadcastConversationUpdated(updated.id, updated.doctorId);
    return updated;
  }

  /**
   * Admin-only soft delete. Doctors cannot reach this path — the
   * controller already gates with @Roles, and the service rejects
   * non-admin callers belt-and-braces. We stamp `deletedAt` +
   * `deletedById` and broadcast so any open client closes the view.
   *
   * Attachments stay on disk (cheap, audit-friendly). A future cron
   * can sweep `deletedAt < now - 30 days` and rm-rf the directories.
   */
  async softDelete(id: string, caller: Caller): Promise<{ id: string }> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can delete a support conversation.',
      );
    }
    const conv = await this.loadConversationForCaller(id, caller, {
      allowDeleted: true,
    });
    if (conv.deletedAt) return { id: conv.id }; // idempotent
    await this.prisma.supportConversation.update({
      where: { id: conv.id },
      data: {
        deletedAt: new Date(),
        deletedById: caller.userId,
        // Closing on delete is purely cosmetic — the deletedAt is the
        // gate that locks new messages — but it keeps the data tidy.
        status: SupportConversationStatus.closed,
        closedAt: new Date(),
      },
    });
    this.gateway.broadcastConversationDeleted(conv.id, conv.doctorId);
    return { id: conv.id };
  }

  async restore(id: string, caller: Caller): Promise<SupportConversation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can restore a conversation.');
    }
    const conv = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conv) throw new NotFoundException('Conversation not found.');
    if (!conv.deletedAt) return conv;
    const restored = await this.prisma.supportConversation.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
        status: SupportConversationStatus.open,
        closedAt: null,
      },
    });
    this.gateway.broadcastConversationUpdated(restored.id, restored.doctorId);
    return restored;
  }

  // ─── Internals ────────────────────────────────────────────────────

  private buildListWhere(
    caller: Caller,
    filters: SupportConversationFilterDto,
  ): Prisma.SupportConversationWhereInput {
    const showOnlyDeleted =
      isAdmin(caller) && filters.includeDeleted === true;
    const where: Prisma.SupportConversationWhereInput = showOnlyDeleted
      ? { deletedAt: { not: null } }
      : { deletedAt: null };

    // Scope: doctor sees only their own.
    if (caller.role === UserRole.dentist) {
      where.doctorId = caller.userId;
    }

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }
    if (filters.priorities && filters.priorities.length > 0) {
      where.priority = { in: filters.priorities };
    }
    if (filters.unreadOnly === true) {
      if (isAdmin(caller)) {
        where.unreadByAdmin = { gt: 0 };
      } else {
        where.unreadByDoctor = { gt: 0 };
      }
    }
    if (filters.search && filters.search.length > 0) {
      const s = filters.search;
      where.OR = [
        { subject: { contains: s, mode: 'insensitive' } },
        { lastMessagePreview: { contains: s, mode: 'insensitive' } },
        { id: { contains: s, mode: 'insensitive' } },
        {
          doctor: {
            OR: [
              { fullName: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
              { phone: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    return where;
  }

  /** Persist the uploaded image under /uploads/support/<convId>/. */
  private async persistAttachment(
    conversationId: string,
    file: Express.Multer.File,
  ): Promise<{
    relativePath: string;
    mime: string;
    name: string;
    size: number;
  }> {
    const dir = path.join(UPLOAD_ROOT, conversationId);
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = path
      .extname(file.originalname || '.png')
      .toLowerCase()
      .slice(0, 6) || '.png';
    const safeName = `${uuidv4()}${ext}`;
    const absPath = path.join(dir, safeName);
    await fs.promises.writeFile(absPath, file.buffer);
    const relativePath = path.posix.join('support', conversationId, safeName);
    return {
      relativePath,
      mime: file.mimetype,
      name: file.originalname?.slice(0, 200) ?? safeName,
      size: file.size,
    };
  }

  /**
   * Resolve a relative path to the absolute file on disk, guarding
   * against path traversal. Same pattern as the quotation PDF service.
   */
  resolveSafeAttachmentPath(relativePath: string): string {
    if (!relativePath || path.isAbsolute(relativePath)) {
      throw new BadRequestException('Invalid attachment path.');
    }
    const root = path.resolve(process.cwd(), 'uploads');
    const abs = path.resolve(root, relativePath);
    const rel = path.relative(root, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new BadRequestException('Invalid attachment path.');
    }
    return abs;
  }
}
