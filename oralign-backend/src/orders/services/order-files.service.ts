import { Injectable, StreamableFile } from '@nestjs/common';
import {
  MediaProcessingStatus,
  OrderFile,
  OrderFileCategory,
  Prisma,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderFileResponseDto } from '../dto/order.dto';
import { MediaProcessingService } from '../../media/media-processing.service';
import {
  classifyMedia,
  inlineSafeMimeType,
  storedUploadMimeType,
} from '../../media/media.constants';
import {
  scanUploadContent,
  isDangerousUploadExtension,
} from '../../media/file-security';
import { buildSequentialName } from '../../media/naming';
import { MediaVariantInfo } from '../../media/media.types';
import type { Caller } from '../../common/access/caller';
import { OrderService } from './order.service';
import { OrderAuditService } from './order-audit.service';
import { mapOrderFileToDto, type OrderWithRelations } from './order.mapper';
import { maxUploadBytesFor, resolveUploadPath } from './order-storage';
import { resolveUploadCategory } from './scan-category';

/**
 * Order file storage: upload, list, delete, download (originals + derived
 * variants) and the chunked-upload registration path. Split out of
 * OrderService so the order lifecycle (create / submit / status / bulk)
 * and the blob handling (naming, disk layout, media pipeline hand-off)
 * evolve independently.
 *
 * Authorization is delegated to OrderService's guards
 * (findAccessibleOrder / ensureCanCreateOrModify /
 * ensureOrderNotLockedByPayment) so there is exactly one rule set.
 */
@Injectable()
export class OrderFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly mediaProcessing: MediaProcessingService,
    private readonly orderAudit: OrderAuditService,
  ) {}

  async uploadFiles(
    id: string,
    files: Express.Multer.File[],
    category: OrderFileCategory,
    caller: Caller,
  ): Promise<OrderFileResponseDto[]> {
    this.orders.ensureCanCreateOrModify(caller);
    const order = await this.orders.findAccessibleOrder(id, caller);
    this.orders.ensureOrderNotLockedByPayment(order, caller);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    // Continue the per-(order, category) sequence — it drives both the
    // display order and the `_NNN` suffix in the generated filename.
    // Soft-deleted rows are counted on purpose: their index must never
    // be reissued, or a new file could land on a path an old DB row
    // still references. Keyed by category because one batch of scans
    // can span stl/ply/obj (see resolveUploadCategory).
    const nextIndex = new Map<OrderFileCategory, number>();
    const takeIndex = async (fileCategory: OrderFileCategory) => {
      let seq = nextIndex.get(fileCategory);
      if (seq === undefined) {
        const maxExisting = await this.prisma.orderFile.aggregate({
          where: { orderId: id, category: fileCategory },
          _max: { orderIndex: true },
        });
        seq = (maxExisting._max.orderIndex ?? 0) + 1;
      }
      nextIndex.set(fileCategory, seq + 1);
      return seq;
    };

    const savedFiles: Prisma.OrderFileCreateManyInput[] = [];

    for (const file of files) {
      const fileCategory = resolveUploadCategory(category, file.originalname);
      this.validateFile(file, fileCategory);
      // Content-security gate: never persist a file whose BYTES are a
      // script or executable (or a ZIP carrying one) — the extension check
      // above only trusts the attacker-supplied name. See file-security.ts.
      const verdict = await scanUploadContent(file);
      if (!verdict.safe) {
        const suffix = verdict.detail
          ? `: ${verdict.detail.slice(0, 120)}`
          : '';
        throw new BadRequestException(
          `${verdict.reason ?? 'This file was rejected for security reasons.'}${suffix}`,
        );
      }
      const saved = await this.saveFileToDisk(id, fileCategory, file, {
        doctorName: order.doctor?.fullName,
        patientName: order.patient.fullName,
        seq: await takeIndex(fileCategory),
      });
      savedFiles.push(saved);
    }

    const auditEntry = await this.orderAudit.entry(
      caller,
      'files_uploaded',
      null,
      {
        // The stored category when the batch shares one (.ply files sent
        // as `stl` log `ply`); a mixed scan batch keeps the requested one.
        category:
          new Set(savedFiles.map((saved) => saved.category)).size === 1
            ? savedFiles[0].category
            : category,
        count: savedFiles.length,
        fileNames: savedFiles.map((file) => file.originalName),
      },
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.orderFile.createMany({ data: savedFiles });
      await tx.orderAuditLog.create({ data: { orderId: id, ...auditEntry } });
    });

    const orderFiles = await this.prisma.orderFile.findMany({
      where: {
        orderId: id,
        deletedAt: null,
        relativePath: { in: savedFiles.map((file) => file.relativePath) },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    // Kick the async optimizer strictly AFTER the rows are committed —
    // the upload response never waits on sharp/zip/stl work.
    for (const file of orderFiles) {
      if (file.processingStatus === MediaProcessingStatus.pending) {
        this.mediaProcessing.enqueue('order-file', file.id);
      }
    }

    return orderFiles.map((file) => mapOrderFileToDto(file));
  }

  async getFiles(id: string, caller: Caller): Promise<OrderFileResponseDto[]> {
    await this.orders.findAccessibleOrder(id, caller);

    const files = await this.prisma.orderFile.findMany({
      where: { orderId: id, deletedAt: null },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return files.map((file) => mapOrderFileToDto(file));
  }

  async deleteFile(
    id: string,
    fileId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.orders.ensureCanCreateOrModify(caller);
    const parent = await this.orders.findAccessibleOrder(id, caller);
    this.orders.ensureOrderNotLockedByPayment(parent, caller);
    const file = await this.findOrderFile(id, fileId);

    // Soft delete ONLY: the row is hidden but the blob (and its variants)
    // stay on disk, so the record remains restorable/auditable. Physical
    // removal happens when the ORDER is permanently deleted
    // (OrderService.permanentDeleteOrder → purgeStoredMedia) or when the
    // retention sweep purges files that have sat in the trash long enough
    // (UploadCleanupService).
    const auditEntry = await this.orderAudit.entry(
      caller,
      'file_deleted',
      null,
      {
        fileId: file.id,
        fileName: file.generatedName ?? file.originalName,
        category: file.category,
      },
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.orderFile.update({
        where: { id: file.id },
        data: { deletedAt: new Date() },
      });
      await tx.orderAuditLog.create({ data: { orderId: id, ...auditEntry } });
    });

    return { message: 'Order file deleted successfully' };
  }

  async getDownloadFile(
    id: string,
    fileId: string,
    caller: Caller,
    variant?: string,
  ): Promise<{
    /** Opens the file; see OrderFileStream.openStream. */
    openStream: () => StreamableFile;
    file: OrderFile;
    absolutePath: string;
    /** Content-Type to serve with. */
    contentType: string;
    /** true → render in place (variants); false → attachment download. */
    inline: boolean;
    /** Name used for Content-Disposition. */
    downloadName: string;
  }> {
    await this.orders.findAccessibleOrder(id, caller);
    const file = await this.findOrderFile(id, fileId);
    const opened = openOrderFileStream(file, variant);
    return {
      ...opened,
      file,
      // A served variant keeps its own name; an original lands on disk
      // with the clean generated name, legacy rows (no generatedName)
      // with the original client filename.
      downloadName: opened.servedVariant
        ? path.basename(opened.storedPath)
        : (file.generatedName ?? file.originalName),
    };
  }

  // Public + structurally typed: the chunked-upload service validates the
  // DECLARED name/size at session init with the exact same rules, before
  // a single byte is transferred.
  validateFile(
    file: { originalname: string; size: number },
    category: OrderFileCategory,
  ): void {
    // CBCT / DICOM bundles (`zip`) and 3D scans (`stl`/`ply`/`obj`) get
    // the 1 GB ceiling; every other slot keeps the 50 MB cap so a stray
    // giant JPEG can't sneak into a clinical-photo slot.
    const maxBytes = maxUploadBytesFor(category);
    if (file.size > maxBytes) {
      const limitLabel =
        maxBytes >= 1024 * 1024 * 1024
          ? `${Math.round(maxBytes / (1024 * 1024 * 1024))} GB`
          : `${Math.round(maxBytes / (1024 * 1024))} MB`;
      throw new BadRequestException(`File size must be ${limitLabel} or less`);
    }

    // Policy: accept ANY file type EXCEPT scripts/executables. Rather than a
    // strict allow-list, we reject only the dangerous "code" extensions
    // (.exe/.js/.sh/.php/.html/.svg/…); the byte-level scanUploadContent()
    // then catches disguised payloads. See file-security.ts.
    if (isDangerousUploadExtension(file.originalname)) {
      throw new BadRequestException(
        'This file type is not allowed for security reasons.',
      );
    }

    if (file.originalname.includes('..') || /[\\/]/.test(file.originalname)) {
      throw new BadRequestException('Invalid file name');
    }
  }

  /**
   * Register a file that ALREADY exists on disk (assembled from a chunked
   * upload) as a normal OrderFile: same sequential naming, same DB shape,
   * same async media pipeline as the single-shot upload path. The payload
   * is MOVED into the order's directory — it is never buffered in RAM.
   * Content security is the CALLER's responsibility (the chunked service
   * scans the assembled file before calling this).
   */
  async registerAssembledFile(
    order: OrderWithRelations,
    requestedCategory: OrderFileCategory,
    meta: { originalName: string; mimeType?: string; sizeBytes: number },
    sourceAbsolutePath: string,
    caller: Caller,
  ): Promise<OrderFileResponseDto> {
    // Sessions opened before scan categories were normalised may still
    // carry the slot's category for a .ply/.obj payload.
    const category = resolveUploadCategory(
      requestedCategory,
      meta.originalName,
    );
    const maxExisting = await this.prisma.orderFile.aggregate({
      where: { orderId: order.id, category },
      _max: { orderIndex: true },
    });
    const seq = (maxExisting._max.orderIndex ?? 0) + 1;

    const saved = await this.saveFileToDisk(
      order.id,
      category,
      {
        originalname: meta.originalName,
        mimetype: meta.mimeType,
        size: meta.sizeBytes,
      },
      {
        doctorName: order.doctor?.fullName,
        patientName: order.patient.fullName,
        seq,
      },
      sourceAbsolutePath,
    );

    const auditEntry = await this.orderAudit.entry(
      caller,
      'files_uploaded',
      null,
      {
        category,
        count: 1,
        fileNames: [meta.originalName],
      },
    );
    const file = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderFile.create({ data: saved });
      await tx.orderAuditLog.create({
        data: { orderId: order.id, ...auditEntry },
      });
      return created;
    });

    if (file.processingStatus === MediaProcessingStatus.pending) {
      this.mediaProcessing.enqueue('order-file', file.id);
    }

    return mapOrderFileToDto(file);
  }

  private async saveFileToDisk(
    orderId: string,
    category: OrderFileCategory,
    file: {
      originalname: string;
      mimetype?: string;
      size: number;
      buffer?: Buffer;
    },
    naming: {
      doctorName?: string | null;
      patientName: string | null | undefined;
      seq: number;
    },
    // When set, the payload already exists on disk (chunked-upload
    // assembly) — MOVE it into place instead of writing a RAM buffer.
    sourcePath?: string,
  ): Promise<Prisma.OrderFileCreateManyInput> {
    const ext = path.extname(file.originalname).toLowerCase();

    // Clean ordered name: `<Doctor>_<Patient>_<category>_<NNN>.<ext>`
    // (e.g. "Dr-Hajji_Marie-Dupont_front-photo_003.jpg"). This is the
    // name the UI shows and the file downloads as — never the client's
    // "image1.jpeg" (that's preserved in `originalName`). Empty/Arabic
    // name parts are dropped by buildSequentialName, so a missing
    // doctor or patient name simply collapses out. These files live
    // behind the RBAC'd download endpoint, never a public URL, so the
    // readable doctor/patient names are a feature for the lab.
    let fileName = buildSequentialName(
      [naming.doctorName, naming.patientName, category.replace(/_/g, '-')],
      naming.seq,
      ext,
    );
    let relativePath = path.posix.join('orders', orderId, category, fileName);
    let absolutePath = resolveUploadPath(relativePath);

    // Collision guard — two concurrent uploads to the same category
    // can race the sequence read. Salt the stem instead of failing
    // the upload; the DB row still records its own orderIndex.
    if (fs.existsSync(absolutePath)) {
      const stem = ext ? fileName.slice(0, -ext.length) : fileName;
      fileName = `${stem}-${uuidv4().slice(0, 8)}${ext}`;
      relativePath = path.posix.join('orders', orderId, category, fileName);
      absolutePath = resolveUploadPath(relativePath);
    }

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    if (sourcePath) {
      try {
        await fs.promises.rename(sourcePath, absolutePath);
      } catch {
        // Cross-device fallback (tmp and orders trees on different
        // mounts) — copy then unlink.
        await fs.promises.copyFile(sourcePath, absolutePath);
        await fs.promises.unlink(sourcePath).catch(() => undefined);
      }
    } else {
      await fs.promises.writeFile(absolutePath, file.buffer!);
    }

    // Both upload paths (multipart and chunked) store through here, so
    // this is where an SVG / HTML / XML claim is neutralised.
    const mimeType = storedUploadMimeType(file.mimetype);
    return {
      orderId,
      category,
      originalName: file.originalname,
      fileName,
      relativePath,
      mimeType,
      size: file.size,
      generatedName: fileName,
      orderIndex: naming.seq,
      // pending = the async pipeline applies (image/zip/3D scan); null =
      // nothing to derive (pdf, video, …) — readers serve the original.
      processingStatus: classifyMedia(mimeType, fileName)
        ? MediaProcessingStatus.pending
        : null,
    };
  }

  private async findOrderFile(
    orderId: string,
    fileId: string,
  ): Promise<OrderFile> {
    const file = await this.prisma.orderFile.findFirst({
      where: { id: fileId, orderId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('Order file not found');
    }

    return file;
  }
}

/** An order file ready to stream, its name left to the route. */
export interface OrderFileStream {
  /**
   * Opens the file. Call it only to send the bytes: a stream nobody reads
   * holds its file descriptor (the attachment route sends by path).
   */
  openStream: () => StreamableFile;
  absolutePath: string;
  /** Content-Type to serve with. */
  contentType: string;
  /** true → render in place (variants); false → attachment download. */
  inline: boolean;
  /** Uploads-relative path actually served (lends its extension to a name). Never sent. */
  storedPath: string;
  /** The variant served; null when the original is (fallback included). */
  servedVariant: string | null;
}

/**
 * The STREAM part of a download, split from the access check so a route
 * with its own rule (the lab production routes) serves files exactly as
 * GET orders/:id/files/:fileId/download does, after checking access its
 * way. `?variant=thumb|md|lg|avif|model` serves the derived artefact
 * inline; it falls back to the original (still inline: the client asked
 * for something to DISPLAY) while the variant is not ready (processing)
 * or never will be (failed / legacy), so clients can request variants
 * blindly without racing the queue. That inline fallback keeps the
 * declared type only when it is inline-safe (raster); any other original
 * leaves as an octet-stream attachment, so an uploaded SVG / HTML never
 * renders as a document. 404 when the blob is gone. Nothing is opened
 * here: the caller opens the file when it sends it (`openStream`).
 */
export function openOrderFileStream(
  file: Pick<OrderFile, 'relativePath' | 'mimeType' | 'variants'>,
  variant?: string,
): OrderFileStream {
  if (variant) {
    const variants = (file.variants ?? {}) as Record<
      string,
      Partial<MediaVariantInfo>
    >;
    const info = variants[variant];
    if (info?.path) {
      const variantAbs = resolveUploadPath(info.path);
      if (fs.existsSync(variantAbs)) {
        return {
          openStream: () => new StreamableFile(fs.createReadStream(variantAbs)),
          absolutePath: variantAbs,
          contentType: variantContentType(info.format),
          inline: true,
          storedPath: info.path,
          servedVariant: variant,
        };
      }
    }
  }

  const absolutePath = resolveUploadPath(file.relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundException('Stored file not found');
  }
  const inlineType = variant ? inlineSafeMimeType(file.mimeType) : null;
  return {
    openStream: () => new StreamableFile(fs.createReadStream(absolutePath)),
    absolutePath,
    contentType: inlineType ?? 'application/octet-stream',
    inline: inlineType !== null,
    storedPath: file.relativePath,
    servedVariant: null,
  };
}

/** webp/avif/glb → the Content-Type the browser needs. */
function variantContentType(format: string | undefined): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'glb':
      return 'model/gltf-binary';
    default:
      return 'application/octet-stream';
  }
}
