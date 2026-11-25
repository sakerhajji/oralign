import { Injectable, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Caller } from '../common/access/caller';
import { NotFoundException } from '../common/exceptions/app.exception';
import { attachmentDisposition } from '../common/http/content-disposition';
import { inlineSafeMimeType } from '../media/media.constants';
import { openOrderFileStream } from '../orders/services/order-files.service';
import { resolveUploadPath } from '../orders/services/order-storage';
import { PrismaService } from '../prisma/prisma.service';
import { openAttachmentStream } from '../treatment-plans/services/treatment-message.service';
import { ProductionFileVariant } from './dto';
import { productionDownloadName } from './kernel';
import {
  LATEST_APPROVED_PLAN,
  PLAN_ATTACHMENT_CATEGORIES,
} from './production.selects';
import { ProductionOrderGate } from './production-order-gate';

/** A stream and the headers the route sends it with. */
export interface ProductionFileStream {
  file: StreamableFile;
  contentType: string;
  disposition: string;
  /** Set for artefacts that never change under the same URL. */
  cacheControl: string | null;
}

/** Variants are immutable per file id: the browser may keep them a day. */
const VARIANT_CACHE = 'private, max-age=86400';
const OCTET_STREAM = 'application/octet-stream';

export type PlanImageKind = 'movement' | 'dental';

/**
 * The lab's file streams (§2.1 #4-#7), behind the production access rule
 * instead of the order one. The streaming itself is the order and plan
 * modules' own (openOrderFileStream, openAttachmentStream), so a file is
 * served the same way on both sides; only the NAME differs: every
 * download is named `<category>-<NNN>[-<variant>]<ext>`
 * (productionDownloadName), never the stored name, which carries the
 * doctor's and the patient's names and rebuilds the disk path. Each
 * route costs the access check with the row it needs riding along (one
 * call), plus one for a plan attachment.
 */
@Injectable()
export class ProductionFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ProductionOrderGate,
  ) {}

  /** GET production/orders/:orderId/files/:fileId/download?variant= */
  async orderFile(
    orderId: string,
    fileId: string,
    caller: Caller,
    variant?: ProductionFileVariant,
  ): Promise<ProductionFileStream> {
    const order = await this.gate.requireReadable(orderId, caller, (where) =>
      this.prisma.dentalOrder.findFirst({
        where,
        select: {
          id: true,
          files: {
            where: { id: fileId, deletedAt: null },
            select: {
              category: true,
              orderIndex: true,
              relativePath: true,
              mimeType: true,
              variants: true,
            },
            take: 1,
          },
        },
      }),
    );
    const file = order.files[0];
    if (!file) throw new NotFoundException('Order file not found');

    const opened = openOrderFileStream(file, variant);
    const name = productionDownloadName(
      file,
      opened.storedPath,
      opened.servedVariant ?? undefined,
    );
    // Opened last: this route always sends the bytes (Nest pipes them).
    return opened.inline
      ? {
          file: opened.openStream(),
          contentType: opened.contentType,
          disposition: `inline; filename="${name}"`,
          cacheControl: VARIANT_CACHE,
        }
      : {
          file: opened.openStream(),
          contentType: 'application/octet-stream',
          disposition: attachmentDisposition(name),
          cacheControl: null,
        };
  }

  /**
   * GET production/orders/:orderId/plan/attachments/:attachmentId/download:
   * a deliverable (result, file, container) of the order's LATEST approved
   * plan only; any other attachment, a chat file included, is a 404.
   */
  async planAttachment(
    orderId: string,
    attachmentId: string,
    caller: Caller,
  ): Promise<ProductionFileStream> {
    const order = await this.gate.requireReadable(orderId, caller, (where) =>
      this.prisma.dentalOrder.findFirst({
        where,
        select: {
          id: true,
          treatmentPlans: { ...LATEST_APPROVED_PLAN, select: { id: true } },
        },
      }),
    );
    const plan = order.treatmentPlans[0];
    const attachment = plan
      ? await this.prisma.treatmentMessageAttachment.findFirst({
          where: {
            id: attachmentId,
            deletedAt: null,
            category: { in: [...PLAN_ATTACHMENT_CATEGORIES] },
            message: { treatmentPlanId: plan.id, deletedAt: null },
          },
          select: {
            fileName: true,
            filePath: true,
            mimeType: true,
            variants: true,
          },
        })
      : null;
    if (!attachment) throw new NotFoundException('Attachment not found');

    const opened = openAttachmentStream(attachment);
    return {
      file: new StreamableFile(opened.stream),
      // The designer's declared type: kept only when inline-safe, so a
      // saved blob is never an SVG / HTML document.
      contentType: inlineSafeMimeType(opened.mimeType) ?? OCTET_STREAM,
      disposition: attachmentDisposition(opened.fileName),
      cacheControl: null,
    };
  }

  /** GET production/orders/:orderId/plan/{movement,dental}-table-image, inline. */
  async planImage(
    orderId: string,
    kind: PlanImageKind,
    caller: Caller,
  ): Promise<ProductionFileStream> {
    const order = await this.gate.requireReadable(orderId, caller, (where) =>
      this.prisma.dentalOrder.findFirst({
        where,
        select: {
          id: true,
          treatmentPlans: {
            ...LATEST_APPROVED_PLAN,
            select: {
              movementTableImagePath: true,
              movementTableImageMimeType: true,
              dentalTreatmentTableImagePath: true,
              dentalTreatmentTableImageMimeType: true,
            },
          },
        },
      }),
    );
    const plan = order.treatmentPlans[0];
    const stored =
      kind === 'movement'
        ? plan?.movementTableImagePath
        : plan?.dentalTreatmentTableImagePath;
    const mimeType =
      kind === 'movement'
        ? plan?.movementTableImageMimeType
        : plan?.dentalTreatmentTableImageMimeType;
    if (!stored)
      throw new NotFoundException('No table image on the approved plan');
    const absolutePath = resolveUploadPath(stored);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Stored file not found');
    }
    // A neutral name, not the uploader's file name.
    const ext = path
      .extname(stored)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '');
    const name = `${kind}-table${ext}`;
    // Inline only under an inline-safe (raster) declared type, like the
    // order file fallback: anything else leaves as an attachment.
    const inlineType = inlineSafeMimeType(mimeType);
    return {
      file: new StreamableFile(fs.createReadStream(absolutePath)),
      contentType: inlineType ?? OCTET_STREAM,
      disposition: inlineType
        ? `inline; filename="${name}"`
        : attachmentDisposition(name),
      cacheControl: null,
    };
  }
}
