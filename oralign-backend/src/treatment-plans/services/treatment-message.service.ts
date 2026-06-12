import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  MediaProcessingStatus,
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import { MediaProcessingService } from '../../media/media-processing.service';
import { classifyMedia } from '../../media/media.constants';
import { MediaVariantInfo } from '../../media/media.types';

type Caller = { userId: string; role: UserRole };

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];
const PLANNER_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];
const RESULT_LIKE_CATEGORIES: TreatmentAttachmentCategory[] = [
  TreatmentAttachmentCategory.treatment_result,
  TreatmentAttachmentCategory.treatment_file,
  TreatmentAttachmentCategory.container,
];

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024; // 200 MB per file

const BLOCKED_EXT = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'scr',
  'pif',
  'msi',
  'lnk',
  'hta',
  'vbs',
  'wsh',
  'ws',
  'js',
  'jse',
  'ps1',
  'psm1',
  'reg',
  'app',
]);

@Injectable()
export class TreatmentMessageService {
  private readonly logger = new Logger(TreatmentMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TreatmentChatGateway))
    private readonly chatGateway: TreatmentChatGateway,
    private readonly mediaProcessing: MediaProcessingService,
  ) {}

  // ─── Access checks ────────────────────────────────────────────────────────

  /**
   * Returns the treatment plan + its order's doctor/designer ids for
   * downstream RBAC checks. Throws if the caller cannot see it.
   */
  private async assertPlanReadable(treatmentPlanId: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: {
        id: true,
        orderId: true,
        deletedAt: true,
        status: true,
        order: {
          select: {
            id: true,
            doctorId: true,
            assignedDesignerId: true,
            deletedAt: true,
            status: true,
          },
        },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found.');
    }
    const { role, userId } = caller;
    if (ADMIN_ROLES.includes(role)) return plan;
    if (role === UserRole.dentist && plan.order.doctorId === userId)
      return plan;
    if (role === UserRole.designer && plan.order.assignedDesignerId === userId)
      return plan;
    throw new ForbiddenException('You cannot access this treatment plan.');
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  /**
   * List all messages for the ORDER that owns this treatment plan — across
   * every plan version (v1, v2, …). The conversation lives at the order
   * level so the doctor / designer / admin can see the full back-and-forth
   * even after a rejected plan is replaced by a new versioned one.
   */
  async list(treatmentPlanId: string, caller: Caller) {
    const plan = await this.assertPlanReadable(treatmentPlanId, caller);
    return this.prisma.treatmentMessage.findMany({
      where: {
        treatmentPlan: { orderId: plan.orderId, deletedAt: null },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        attachments: { where: { deletedAt: null } },
        sender: {
          select: { id: true, fullName: true, role: true, avatarUrl: true },
        },
      },
    });
  }

  /** Same listing, addressed directly by orderId for the order-scoped chat
   *  endpoint that the frontend now uses. */
  async listByOrder(orderId: string, caller: Caller) {
    await this.assertOrderReadable(orderId, caller);
    return this.prisma.treatmentMessage.findMany({
      where: {
        treatmentPlan: { orderId, deletedAt: null },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        attachments: { where: { deletedAt: null } },
        sender: {
          select: { id: true, fullName: true, role: true, avatarUrl: true },
        },
      },
    });
  }

  /**
   * Order-level read gate (mirror of assertPlanReadable, but addressed by
   * orderId). Used by the order-scoped chat endpoint.
   */
  private async assertOrderReadable(orderId: string, caller: Caller) {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        doctorId: true,
        assignedDesignerId: true,
        deletedAt: true,
      },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found.');
    }
    const { role, userId } = caller;
    if (ADMIN_ROLES.includes(role)) return order;
    if (role === UserRole.dentist && order.doctorId === userId) return order;
    if (role === UserRole.designer && order.assignedDesignerId === userId)
      return order;
    throw new ForbiddenException('You cannot access this order.');
  }

  /**
   * Order-level write — picks the latest non-deleted plan to attach the
   * message to, so the conversation stays under one parent even when the
   * planner is between versions.
   */
  async createForOrder(
    orderId: string,
    payload: { message?: string; files?: Express.Multer.File[] },
    caller: Caller,
    categoryOverride?: TreatmentAttachmentCategory,
  ) {
    await this.assertOrderReadable(orderId, caller);
    const latest = await this.prisma.treatmentPlan.findFirst({
      where: { orderId, deletedAt: null },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (!latest) {
      throw new BadRequestException(
        'This order has no treatment plan yet — nothing to discuss.',
      );
    }
    return this.create(latest.id, payload, caller, categoryOverride);
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(
    treatmentPlanId: string,
    payload: { message?: string; files?: Express.Multer.File[] },
    caller: Caller,
    categoryOverride?: TreatmentAttachmentCategory,
  ) {
    const plan = await this.assertPlanReadable(treatmentPlanId, caller);
    const text = payload.message?.trim() ?? '';
    const files = payload.files ?? [];
    if (!text && files.length === 0) {
      throw new BadRequestException('Message must contain text or files.');
    }

    // Validate every file before we touch the filesystem.
    for (const f of files) {
      this.validateAttachment(f);
    }

    return this.prisma
      .$transaction(async (tx) => {
        const message = await tx.treatmentMessage.create({
          data: {
            treatmentPlanId,
            senderId: caller.userId,
            message: text || null,
            type:
              files.length > 0 && !text
                ? TreatmentMessageType.file
                : TreatmentMessageType.message,
          },
        });

        for (const file of files) {
          const category = categoryOverride ?? this.inferCategory(file);
          // Result-like uploads need planner role.
          if (
            RESULT_LIKE_CATEGORIES.includes(category) &&
            !PLANNER_ROLES.includes(caller.role)
          ) {
            throw new ForbiddenException(
              'Only planners can attach treatment results / files / containers.',
            );
          }

          const folder =
            category === TreatmentAttachmentCategory.treatment_result
              ? 'results'
              : category === TreatmentAttachmentCategory.container
                ? 'containers'
                : `messages/${message.id}`;
          const relDir = path.posix.join(
            'orders',
            plan.orderId,
            'treatment-plans',
            treatmentPlanId,
            folder,
          );
          const absDir = path.join(UPLOAD_ROOT, relDir);
          fs.mkdirSync(absDir, { recursive: true });

          const ext = (path.extname(file.originalname) || '')
            .toLowerCase()
            .slice(0, 12);
          const safeName = `${uuidv4()}${ext}`;
          const absPath = path.join(absDir, safeName);
          const relPath = path.posix.join(relDir, safeName);
          await fs.promises.writeFile(absPath, file.buffer);

          await tx.treatmentMessageAttachment.create({
            data: {
              messageId: message.id,
              uploadedById: caller.userId,
              fileName: file.originalname,
              filePath: relPath,
              mimeType: file.mimetype || null,
              sizeBytes: file.size,
              category,
              // Async media pipeline: pending = variants will be
              // derived (image/zip/stl); null = nothing to derive.
              processingStatus: classifyMedia(file.mimetype, safeName)
                ? MediaProcessingStatus.pending
                : null,
            },
          });

          // We deliberately do NOT auto-promote the plan to "ready" on
          // treatment_result uploads any more. Marking the plan as ready
          // is now an explicit planner action (POST /mark-ready) so that
          // designers can stage multiple result files before signalling
          // the doctor.
        }

        return tx.treatmentMessage.findUnique({
          where: { id: message.id },
          include: {
            attachments: { where: { deletedAt: null } },
            sender: {
              select: { id: true, fullName: true, role: true, avatarUrl: true },
            },
          },
        });
      })
      .then((created) => {
        // Fire-and-forget broadcast — sockets are advisory, not the
        // source of truth, so a transient error here shouldn't break
        // the REST response. Broadcast to the ORDER room (not the plan)
        // so subscribers see the message regardless of which plan tab
        // they happen to have open right now.
        if (created) {
          try {
            this.chatGateway.broadcastNewMessage(plan.orderId, created);
          } catch (err) {
            this.logger.warn(
              `socket broadcast failed: ${(err as Error).message}`,
            );
          }
          // Enqueue strictly after the transaction committed — the
          // worker re-reads each row by id, so a job racing an
          // uncommitted tx would just see nothing.
          for (const att of created.attachments) {
            if (att.processingStatus === MediaProcessingStatus.pending) {
              this.mediaProcessing.enqueue('treatment-attachment', att.id);
            }
          }
        }
        return created;
      });
  }

  // ─── Attachments — download / delete ─────────────────────────────────────

  async getAttachmentStream(
    attachmentId: string,
    caller: Caller,
    variant?: string,
  ) {
    const att = await this.prisma.treatmentMessageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        mimeType: true,
        deletedAt: true,
        variants: true,
        message: { select: { treatmentPlanId: true } },
      },
    });
    if (!att || att.deletedAt) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.assertPlanReadable(att.message.treatmentPlanId, caller);

    // `?variant=thumb|md|lg|avif|model` → serve the derived artefact
    // inline; silently falls back to the original while processing is
    // pending (or for legacy/failed rows), so chat bubbles can request
    // thumbnails unconditionally.
    if (variant && att.variants && typeof att.variants === 'object') {
      const info = (
        att.variants as Record<string, Partial<MediaVariantInfo>>
      )[variant];
      if (info?.path) {
        try {
          const variantAbs = this.resolveSafePath(info.path);
          if (fs.existsSync(variantAbs)) {
            const mime =
              info.format === 'webp'
                ? 'image/webp'
                : info.format === 'avif'
                  ? 'image/avif'
                  : info.format === 'glb'
                    ? 'model/gltf-binary'
                    : 'application/octet-stream';
            return {
              stream: fs.createReadStream(variantAbs),
              fileName: path.basename(info.path),
              mimeType: mime,
              inline: true,
            };
          }
        } catch {
          /* fall through to original */
        }
      }
    }

    const abs = this.resolveSafePath(att.filePath);
    return {
      stream: fs.createReadStream(abs),
      fileName: att.fileName,
      mimeType: att.mimeType ?? 'application/octet-stream',
      inline: Boolean(variant),
    };
  }

  async softDeleteAttachment(attachmentId: string, caller: Caller) {
    const att = await this.prisma.treatmentMessageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        uploadedById: true,
        deletedAt: true,
        message: {
          select: {
            treatmentPlanId: true,
            treatmentPlan: { select: { orderId: true } },
          },
        },
      },
    });
    if (!att || att.deletedAt) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.assertPlanReadable(att.message.treatmentPlanId, caller);
    const isAdmin = ADMIN_ROLES.includes(caller.role);
    if (!isAdmin && att.uploadedById !== caller.userId) {
      throw new ForbiddenException(
        'Only the uploader or an admin can delete this attachment.',
      );
    }
    const updated = await this.prisma.treatmentMessageAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });
    try {
      this.chatGateway.broadcastMessageDeleted(
        att.message.treatmentPlan.orderId,
        att.id,
      );
    } catch {
      /* sockets advisory */
    }
    return updated;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private validateAttachment(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Empty attachment.');
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(
        `Attachment "${file.originalname}" exceeds the ${Math.round(
          MAX_ATTACHMENT_BYTES / 1024 / 1024,
        )} MB limit.`,
      );
    }
    const ext = (path.extname(file.originalname) || '')
      .replace(/^\./, '')
      .toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      throw new BadRequestException(
        `Attachment "${file.originalname}" is a blocked file type.`,
      );
    }
  }

  private inferCategory(
    file: Express.Multer.File,
  ): TreatmentAttachmentCategory {
    const ext = (path.extname(file.originalname) || '')
      .replace(/^\./, '')
      .toLowerCase();
    if (ext === 'stl') return TreatmentAttachmentCategory.stl;
    if (ext === 'ply') return TreatmentAttachmentCategory.ply;
    if (ext === 'obj') return TreatmentAttachmentCategory.obj;
    if (ext === 'zip') return TreatmentAttachmentCategory.zip;
    if (ext === 'pdf') return TreatmentAttachmentCategory.pdf;
    if (file.mimetype.startsWith('image/'))
      return TreatmentAttachmentCategory.image;
    if (file.mimetype.startsWith('video/'))
      return TreatmentAttachmentCategory.video;
    return TreatmentAttachmentCategory.other;
  }

  private resolveSafePath(relPath: string): string {
    const abs = path.resolve(UPLOAD_ROOT, relPath);
    const root = path.resolve(UPLOAD_ROOT) + path.sep;
    if (!abs.startsWith(root))
      throw new ForbiddenException('Invalid file path.');
    if (!fs.existsSync(abs))
      throw new NotFoundException('File no longer exists on disk.');
    return abs;
  }
}
