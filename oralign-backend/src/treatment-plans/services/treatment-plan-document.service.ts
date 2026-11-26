import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, TreatmentPlanDocumentKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { scanUploadContent } from '../../media/file-security';
import { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import {
  PLAN_DOCUMENT_PUBLIC_SELECT,
  type TreatmentPlanDocumentView,
} from '../dto/treatment-plan-document.dto';
import {
  cleanDocumentName,
  PLAN_DOCUMENT_ERROR,
  PLAN_DOCUMENT_MIME,
  planDocumentContentRejection,
  planDocumentShapeRejection,
} from '../documents/plan-document.rules';
import {
  discardPlanFile,
  releasePlanFile,
  resolvePlanFile,
  writePlanFile,
} from '../documents/plan-file-store';

/** What multer hands over (memory storage). */
export type UploadedPdf = Pick<
  Express.Multer.File,
  'originalname' | 'mimetype' | 'size' | 'buffer'
>;

export interface OpenedPlanDocument {
  absPath: string;
  size: number;
  fileName: string;
}

/**
 * The analysis PDFs of a treatment plan version: one slot per kind
 * (CBCT analysis, cephalometric analysis).
 *
 * - Read: whoever may read the order (owning dentist, assigned designer,
 *   admins). The technician never reaches these routes.
 * - Write: the planner rule (admins, assigned designer).
 * - Writes of one plan are serialised on the plan row, so the file a
 *   replace supersedes is always the one it read.
 * - A superseded or deleted file leaves the disk only when no row refers
 *   to it any more (a renewal shares the files with the version it
 *   copied, see documents/plan-file-store.ts).
 */
@Injectable()
export class TreatmentPlanDocumentService {
  private readonly logger = new Logger(TreatmentPlanDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
    // forwardRef for the same reason as TreatmentPlanService: the gateway
    // sits in a DI triangle with the message and plan services.
    @Inject(forwardRef(() => TreatmentChatGateway))
    private readonly chatGateway: TreatmentChatGateway,
  ) {}

  /** The slots of one version, as the review payload carries them. */
  list(treatmentPlanId: string): Promise<TreatmentPlanDocumentView[]> {
    return this.prisma.treatmentPlanDocument.findMany({
      where: { treatmentPlanId },
      orderBy: { kind: 'asc' },
      select: PLAN_DOCUMENT_PUBLIC_SELECT,
    });
  }

  /** Put (create or replace) the PDF of one slot. */
  async upload(
    treatmentPlanId: string,
    kind: TreatmentPlanDocumentKind,
    file: UploadedPdf | undefined,
    caller: Caller,
  ): Promise<TreatmentPlanDocumentView> {
    const shape = planDocumentShapeRejection(file);
    if (shape || !file) {
      throw new BadRequestException(
        shape?.message ?? 'A PDF file is required.',
        shape?.code ?? PLAN_DOCUMENT_ERROR.FILE_REQUIRED,
      );
    }
    const plan = await this.loadForWrite(treatmentPlanId, caller);

    const content = planDocumentContentRejection(file);
    if (content) throw new BadRequestException(content.message, content.code);
    // The shared scanner (executable signatures, content against the
    // extension) under a fixed name: the client's name is display only.
    const verdict = await scanUploadContent({
      buffer: file.buffer,
      originalname: 'document.pdf',
    });
    if (!verdict.safe) {
      throw new BadRequestException(
        'This file cannot be accepted.',
        PLAN_DOCUMENT_ERROR.UNSAFE,
        { reason: verdict.code ?? 'unsafe' },
      );
    }

    const actorName = await lookupActorName(this.prisma, caller.userId);
    const fileName = cleanDocumentName(file.originalname);
    const storagePath = await writePlanFile(
      ['orders', plan.orderId, 'treatment-plans', plan.id, 'documents'],
      '.pdf',
      file.buffer,
    );

    const data = {
      storagePath,
      fileName,
      mimeType: PLAN_DOCUMENT_MIME,
      sizeBytes: file.size,
      uploadedById: caller.userId,
      uploadedByName: actorName,
    };
    let result: { saved: TreatmentPlanDocumentView; superseded: string | null };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await this.lockPlan(tx, plan.id);
        const slot = { treatmentPlanId: plan.id, kind };
        const previous = await tx.treatmentPlanDocument.findUnique({
          where: { treatmentPlanId_kind: slot },
          select: { storagePath: true },
        });
        const saved = await tx.treatmentPlanDocument.upsert({
          where: { treatmentPlanId_kind: slot },
          create: { ...slot, ...data },
          update: data,
          select: PLAN_DOCUMENT_PUBLIC_SELECT,
        });
        return { saved, superseded: previous?.storagePath ?? null };
      });
    } catch (error) {
      await discardPlanFile(storagePath);
      throw error;
    }

    if (result.superseded) await this.release(result.superseded);
    this.broadcastUpdated(plan.orderId, plan.id);
    return result.saved;
  }

  /** Empty one slot. Idempotent: an empty slot stays empty. */
  async remove(
    treatmentPlanId: string,
    kind: TreatmentPlanDocumentKind,
    caller: Caller,
  ): Promise<void> {
    const plan = await this.loadForWrite(treatmentPlanId, caller);
    const removedPath = await this.prisma.$transaction(async (tx) => {
      await this.lockPlan(tx, plan.id);
      const existing = await tx.treatmentPlanDocument.findUnique({
        where: { treatmentPlanId_kind: { treatmentPlanId: plan.id, kind } },
        select: { id: true, storagePath: true },
      });
      if (!existing) return null;
      await tx.treatmentPlanDocument.delete({ where: { id: existing.id } });
      return existing.storagePath;
    });
    if (!removedPath) return;
    await this.release(removedPath);
    this.broadcastUpdated(plan.orderId, plan.id);
  }

  /** The stored PDF of one slot, for the stream route. */
  async open(
    treatmentPlanId: string,
    kind: TreatmentPlanDocumentKind,
    caller: Caller,
  ): Promise<OpenedPlanDocument> {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: {
        deletedAt: true,
        order: {
          select: { doctorId: true, assignedDesignerId: true, deletedAt: true },
        },
        documents: {
          where: { kind },
          select: { storagePath: true, fileName: true },
          take: 1,
        },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    this.orderAccess.assertCanRead(plan.order, caller);
    const document = plan.documents[0];
    if (!document) {
      throw new NotFoundException(
        'No document in this slot.',
        PLAN_DOCUMENT_ERROR.NOT_FOUND,
      );
    }
    const { absPath, size } = await resolvePlanFile(document.storagePath);
    return { absPath, size, fileName: document.fileName };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** 404 for a missing or deleted plan/order, 403 off the planner rule. */
  private async loadForWrite(treatmentPlanId: string, caller: Caller) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: {
        id: true,
        orderId: true,
        deletedAt: true,
        order: { select: { assignedDesignerId: true, deletedAt: true } },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found');
    }
    this.orderAccess.assertCanPlan(plan.order, caller);
    return plan;
  }

  /**
   * Serialise the document writes of one plan (and the renewal that
   * copies them, see TreatmentPlanService.markReady) on the plan row.
   * Re-checks the soft delete: the plan may have gone between the access
   * check and the lock.
   */
  private async lockPlan(
    tx: Prisma.TransactionClient,
    treatmentPlanId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "TreatmentPlan"
      WHERE id = ${treatmentPlanId} AND "deletedAt" IS NULL
      FOR UPDATE`;
    if (rows.length === 0) {
      throw new NotFoundException('Treatment plan not found');
    }
  }

  private release(storagePath: string): Promise<void> {
    return releasePlanFile(this.prisma, storagePath, (error) =>
      this.logger.warn(
        `Could not release ${storagePath}: ${(error as Error).message}`,
      ),
    );
  }

  /** Open tabs refetch the review. Sockets are advisory. */
  private broadcastUpdated(orderId: string, planId: string): void {
    try {
      this.chatGateway.broadcastPlanChanged(orderId, {
        type: 'updated',
        planId,
      });
    } catch (error) {
      this.logger.warn(
        `plan:changed broadcast failed: ${(error as Error).message}`,
      );
    }
  }
}
