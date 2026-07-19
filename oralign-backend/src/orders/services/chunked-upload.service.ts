import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderFileCategory,
  UploadSession,
  UploadSessionStatus,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { scanUploadFile } from '../../media/file-security';
import { OrderFileResponseDto } from '../dto/order.dto';
import { OrderService, UPLOAD_ROOT } from './order.service';

/** Caller identity forwarded from the JWT guard (mirrors OrderService). */
type Caller = { userId: string; role: string };

// 8 MiB chunks: 1 GB = 128 requests, each finishing in seconds even on a
// slow clinic connection — far inside every proxy/server timeout. The
// value is SERVER-owned: init returns it and the client must use it.
export const UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

// Sessions untouched for this long are swept with their part files.
export const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const CHUNKED_TMP_ROOT = path.join(UPLOAD_ROOT, 'tmp', 'chunked');

export interface ChunkedSessionStateDto {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: UploadSessionStatus;
}

/**
 * Chunked / resumable uploads for large order files (CBCT ZIP bundles).
 *
 * Why not one big multipart POST: a 1 GB request (a) restarts from zero
 * on any network blip, (b) can outlive proxy timeouts on slow clinic
 * connections, and (c) — with multer's memoryStorage — buffers the whole
 * archive in container RAM. Here every chunk is a small independent
 * request the client can retry, progress survives interruptions (init
 * returns the already-received chunk list), and the final payload only
 * ever exists on DISK: parts are streamed into the assembled file, the
 * security scan reads it from disk, and registration MOVES it into the
 * order's directory.
 *
 * Access control delegates to the exact same OrderService helpers the
 * single-shot upload path uses, so a caller can never touch another
 * doctor's order or files.
 */
@Injectable()
export class ChunkedUploadService {
  private readonly logger = new Logger(ChunkedUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
  ) {}

  // ── Session lifecycle ────────────────────────────────────────────

  async initSession(
    orderId: string,
    dto: {
      fileName: string;
      size: number;
      mimeType?: string;
      category: OrderFileCategory;
    },
    caller: Caller,
  ): Promise<ChunkedSessionStateDto> {
    this.orders.ensureCanCreateOrModify(caller);
    const order = await this.orders.findAccessibleOrder(orderId, caller);
    this.orders.ensureOrderNotLockedByPayment(order, caller);

    // Same name/size/extension rules as the single-shot path — enforced
    // on the DECLARED metadata before a single byte is transferred.
    this.orders.validateFile(
      { originalname: dto.fileName, size: dto.size },
      dto.category,
    );

    // Duplicate guard: the identical payload already lives on this order.
    const duplicate = await this.prisma.orderFile.findFirst({
      where: {
        orderId,
        category: dto.category,
        originalName: dto.fileName,
        size: dto.size,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'This file has already been uploaded to this order.',
      );
    }

    // Resume guard: an interrupted upload of the same payload continues
    // where it left off instead of starting a second session.
    const existing = await this.prisma.uploadSession.findFirst({
      where: {
        orderId,
        uploaderId: caller.userId,
        category: dto.category,
        originalName: dto.fileName,
        totalBytes: BigInt(dto.size),
        status: UploadSessionStatus.active,
      },
    });
    if (existing) return this.toStateDto(existing);

    const totalChunks = Math.max(
      1,
      Math.ceil(dto.size / UPLOAD_CHUNK_SIZE_BYTES),
    );
    const session = await this.prisma.uploadSession.create({
      data: {
        orderId,
        uploaderId: caller.userId,
        category: dto.category,
        originalName: dto.fileName,
        mimeType: dto.mimeType ?? null,
        totalBytes: BigInt(dto.size),
        chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
        totalChunks,
      },
    });
    await fs.promises.mkdir(this.sessionDir(session.id), { recursive: true });
    return this.toStateDto(session);
  }

  async getSession(
    orderId: string,
    uploadId: string,
    caller: Caller,
  ): Promise<ChunkedSessionStateDto> {
    await this.orders.findAccessibleOrder(orderId, caller);
    const session = await this.findSession(orderId, uploadId);
    return this.toStateDto(session);
  }

  async putChunk(
    orderId: string,
    uploadId: string,
    index: number,
    chunk: Buffer,
    caller: Caller,
  ): Promise<{ receivedChunks: number[] }> {
    this.orders.ensureCanCreateOrModify(caller);
    const order = await this.orders.findAccessibleOrder(orderId, caller);
    this.orders.ensureOrderNotLockedByPayment(order, caller);
    const session = await this.findSession(orderId, uploadId);
    this.ensureActive(session);

    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      throw new BadRequestException('Chunk index out of range');
    }

    const expected = this.expectedChunkBytes(session, index);
    if (!chunk || chunk.length !== expected) {
      throw new BadRequestException(
        `Chunk ${index} must be exactly ${expected} bytes`,
      );
    }

    await fs.promises.mkdir(this.sessionDir(session.id), { recursive: true });
    await fs.promises.writeFile(this.partPath(session.id, index), chunk);

    // Re-sending the same index (a retry that half-succeeded) is
    // idempotent — the part file is simply overwritten.
    const receivedChunks = session.receivedChunks.includes(index)
      ? session.receivedChunks
      : [...session.receivedChunks, index].sort((a, b) => a - b);

    await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: { receivedChunks },
    });

    return { receivedChunks };
  }

  async complete(
    orderId: string,
    uploadId: string,
    caller: Caller,
  ): Promise<OrderFileResponseDto> {
    this.orders.ensureCanCreateOrModify(caller);
    const order = await this.orders.findAccessibleOrder(orderId, caller);
    this.orders.ensureOrderNotLockedByPayment(order, caller);
    const session = await this.findSession(orderId, uploadId);
    this.ensureActive(session);

    if (session.receivedChunks.length !== session.totalChunks) {
      throw new BadRequestException(
        `Upload incomplete: ${session.receivedChunks.length}/${session.totalChunks} chunks received`,
      );
    }

    await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: UploadSessionStatus.assembling },
    });

    const assembledPath = path.join(
      this.sessionDir(session.id),
      `assembled${path.extname(session.originalName).toLowerCase()}`,
    );

    try {
      await this.assembleParts(session, assembledPath);

      const verdict = await scanUploadFile(assembledPath, session.originalName);
      if (!verdict.safe) {
        const suffix = verdict.detail ? `: ${verdict.detail.slice(0, 120)}` : '';
        throw new BadRequestException(
          `${verdict.reason ?? 'This file was rejected for security reasons.'}${suffix}`,
        );
      }

      const file = await this.orders.registerAssembledFile(
        order,
        session.category,
        {
          originalName: session.originalName,
          mimeType: session.mimeType ?? undefined,
          sizeBytes: Number(session.totalBytes),
        },
        assembledPath,
      );

      await this.destroySession(session.id);
      return file;
    } catch (error) {
      // Keep the parts (the payload bytes are still valid — only the
      // finalization failed) but surface a failed state the client can
      // read; a fresh complete() call may retry after the cause is fixed,
      // and the TTL sweeper reclaims the disk if it never is.
      await this.prisma.uploadSession
        .update({
          where: { id: session.id },
          data: { status: UploadSessionStatus.active },
        })
        .catch(() => undefined);
      await fs.promises.rm(assembledPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async abort(
    orderId: string,
    uploadId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    await this.orders.findAccessibleOrder(orderId, caller);
    const session = await this.findSession(orderId, uploadId);
    await this.destroySession(session.id);
    return { message: 'Upload aborted' };
  }

  // ── Stale-session sweep (called by UploadCleanupService) ─────────

  async cleanupStaleSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - UPLOAD_SESSION_TTL_MS);
    const stale = await this.prisma.uploadSession.findMany({
      where: { updatedAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const { id } of stale) {
      await this.destroySession(id).catch(() => undefined);
    }

    // Orphan directories (crash between mkdir and row creation, or a
    // deleted row whose rm failed) — anything without a session row goes.
    try {
      const entries = await fs.promises.readdir(CHUNKED_TMP_ROOT);
      const live = new Set(
        (
          await this.prisma.uploadSession.findMany({ select: { id: true } })
        ).map((s) => s.id),
      );
      for (const entry of entries) {
        if (!live.has(entry)) {
          await fs.promises
            .rm(path.join(CHUNKED_TMP_ROOT, entry), {
              recursive: true,
              force: true,
            })
            .catch(() => undefined);
        }
      }
    } catch {
      // tmp root does not exist yet — nothing to sweep.
    }

    if (stale.length > 0) {
      this.logger.log(`Swept ${stale.length} stale upload session(s)`);
    }
    return stale.length;
  }

  // ── Internals ────────────────────────────────────────────────────

  private async findSession(
    orderId: string,
    uploadId: string,
  ): Promise<UploadSession> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: uploadId, orderId },
    });
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }
    return session;
  }

  private ensureActive(session: UploadSession): void {
    if (session.status !== UploadSessionStatus.active) {
      throw new ConflictException(
        `Upload session is ${session.status} and cannot accept changes`,
      );
    }
  }

  private expectedChunkBytes(session: UploadSession, index: number): number {
    const total = Number(session.totalBytes);
    if (index < session.totalChunks - 1) return session.chunkSize;
    return total - session.chunkSize * (session.totalChunks - 1);
  }

  /** Stream every part, in order, into the assembled file. Never RAM. */
  private async assembleParts(
    session: UploadSession,
    assembledPath: string,
  ): Promise<void> {
    const out = fs.createWriteStream(assembledPath);
    try {
      for (let i = 0; i < session.totalChunks; i++) {
        const part = this.partPath(session.id, i);
        const stat = await fs.promises.stat(part).catch(() => null);
        if (!stat || stat.size !== this.expectedChunkBytes(session, i)) {
          throw new BadRequestException(
            `Chunk ${i} is missing or corrupt — re-upload it and complete again`,
          );
        }
        await new Promise<void>((resolve, reject) => {
          const read = fs.createReadStream(part);
          read.on('error', reject);
          read.on('end', resolve);
          read.pipe(out, { end: false });
        });
      }
    } finally {
      await new Promise<void>((resolve) => out.end(() => resolve()));
    }

    const assembled = await fs.promises.stat(assembledPath);
    if (assembled.size !== Number(session.totalBytes)) {
      throw new BadRequestException(
        'Assembled file size does not match the declared size',
      );
    }
  }

  private async destroySession(sessionId: string): Promise<void> {
    await fs.promises
      .rm(this.sessionDir(sessionId), { recursive: true, force: true })
      .catch(() => undefined);
    await this.prisma.uploadSession
      .delete({ where: { id: sessionId } })
      .catch(() => undefined);
  }

  private sessionDir(sessionId: string): string {
    return path.join(CHUNKED_TMP_ROOT, sessionId);
  }

  private partPath(sessionId: string, index: number): string {
    return path.join(this.sessionDir(sessionId), `part-${index}`);
  }

  private toStateDto(session: UploadSession): ChunkedSessionStateDto {
    return {
      uploadId: session.id,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks,
      status: session.status,
    };
  }
}
