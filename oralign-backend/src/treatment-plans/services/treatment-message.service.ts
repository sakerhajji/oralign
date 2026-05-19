import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderStatus,
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';

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
  'exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'msi', 'lnk', 'hta',
  'vbs', 'wsh', 'ws', 'js', 'jse', 'ps1', 'psm1', 'reg', 'app',
]);

@Injectable()
export class TreatmentMessageService {
  private readonly logger = new Logger(TreatmentMessageService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    if (role === UserRole.dentist && plan.order.doctorId === userId) return plan;
    if (
      role === UserRole.designer &&
      plan.order.assignedDesignerId === userId
    )
      return plan;
    throw new ForbiddenException('You cannot access this treatment plan.');
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(treatmentPlanId: string, caller: Caller) {
    await this.assertPlanReadable(treatmentPlanId, caller);
    return this.prisma.treatmentMessage.findMany({
      where: { treatmentPlanId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        attachments: { where: { deletedAt: null } },
        sender: {
          select: { id: true, fullName: true, role: true, avatarUrl: true },
        },
      },
    });
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

    return this.prisma.$transaction(async (tx) => {
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

      let promoteToReady = false;

      for (const file of files) {
        const category =
          categoryOverride ?? this.inferCategory(file);
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

        const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 12);
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
          },
        });

        if (
          category === TreatmentAttachmentCategory.treatment_result &&
          PLANNER_ROLES.includes(caller.role)
        ) {
          promoteToReady = true;
        }
      }

      // If a designer/admin attached a treatment_result, mark the plan
      // ready and bump the order's status (unless already approved).
      if (promoteToReady && plan.status === TreatmentPlanStatus.pending) {
        await tx.treatmentPlan.update({
          where: { id: treatmentPlanId },
          data: { status: TreatmentPlanStatus.ready },
        });
        await tx.dentalOrder.update({
          where: { id: plan.orderId },
          data: { status: OrderStatus.treatment_plan_ready },
        });
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
    });
  }

  // ─── Attachments — download / delete ─────────────────────────────────────

  async getAttachmentStream(attachmentId: string, caller: Caller) {
    const att = await this.prisma.treatmentMessageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        mimeType: true,
        deletedAt: true,
        message: { select: { treatmentPlanId: true } },
      },
    });
    if (!att || att.deletedAt) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.assertPlanReadable(att.message.treatmentPlanId, caller);

    const abs = this.resolveSafePath(att.filePath);
    return {
      stream: fs.createReadStream(abs),
      fileName: att.fileName,
      mimeType: att.mimeType ?? 'application/octet-stream',
    };
  }

  async softDeleteAttachment(attachmentId: string, caller: Caller) {
    const att = await this.prisma.treatmentMessageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        uploadedById: true,
        deletedAt: true,
        message: { select: { treatmentPlanId: true } },
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
    return this.prisma.treatmentMessageAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });
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
    const ext = (path.extname(file.originalname) || '').replace(/^\./, '').toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      throw new BadRequestException(
        `Attachment "${file.originalname}" is a blocked file type.`,
      );
    }
  }

  private inferCategory(file: Express.Multer.File): TreatmentAttachmentCategory {
    const ext = (path.extname(file.originalname) || '').replace(/^\./, '').toLowerCase();
    if (ext === 'stl') return TreatmentAttachmentCategory.stl;
    if (ext === 'ply') return TreatmentAttachmentCategory.ply;
    if (ext === 'obj') return TreatmentAttachmentCategory.obj;
    if (ext === 'zip') return TreatmentAttachmentCategory.zip;
    if (ext === 'pdf') return TreatmentAttachmentCategory.pdf;
    if (file.mimetype.startsWith('image/')) return TreatmentAttachmentCategory.image;
    if (file.mimetype.startsWith('video/')) return TreatmentAttachmentCategory.video;
    return TreatmentAttachmentCategory.other;
  }

  private resolveSafePath(relPath: string): string {
    const abs = path.resolve(UPLOAD_ROOT, relPath);
    const root = path.resolve(UPLOAD_ROOT) + path.sep;
    if (!abs.startsWith(root)) throw new ForbiddenException('Invalid file path.');
    if (!fs.existsSync(abs))
      throw new NotFoundException('File no longer exists on disk.');
    return abs;
  }
}
