import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunitySubmissionFormat,
  CommunitySubmissionRole,
  CommunitySubmissionStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminCreateCommunitySubmissionDto,
  CreateCommunitySubmissionDto,
  CommunitySubmissionListDto,
  RejectCommunitySubmissionDto,
  UpdateCommunitySubmissionDto,
} from '../dto/community-submission.dto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_STORED_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 82;

type UploadedMedia = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class CommunitySubmissionService {
  private readonly logger = new Logger(CommunitySubmissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCommunitySubmissionDto, files: UploadedMedia[]) {
    if (!dto.consent) {
      throw new BadRequestException('Consent is required before submitting.');
    }
    if (dto.role === CommunitySubmissionRole.parent && !dto.childName) {
      throw new BadRequestException(
        'Child name is required for a parent submission.',
      );
    }
    this.validateFiles(dto.format, files);

    const id = randomUUID();
    const submission = await this.prisma.communitySubmission.create({
      data: {
        id,
        format: dto.format,
        firstName: dto.firstName,
        lastNameInitial: dto.lastNameInitial,
        phone: dto.phone,
        email: dto.email.toLowerCase(),
        city: dto.city || null,
        role: dto.role,
        childName: dto.childName || null,
        childAge: dto.childAge ?? null,
        treatmentStatus: dto.treatmentStatus,
        why: dto.why,
        journey: dto.journey,
        satisfied: dto.satisfied || null,
        message: dto.message || null,
        consent: true,
        contactConsent: dto.contactConsent ?? false,
      },
    });

    const savedPaths: string[] = [];
    try {
      for (const file of files) {
        const stored = await this.storeMedia(id, file);
        savedPaths.push(stored.relativePath);
        await this.prisma.communitySubmissionMedia.create({
          data: {
            submissionId: id,
            relativePath: stored.relativePath,
            originalName: file.originalname.slice(0, 255),
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            width: stored.width,
            height: stored.height,
            durationSeconds: stored.durationSeconds,
          },
        });
      }
    } catch (error) {
      await this.prisma.communitySubmission
        .delete({ where: { id } })
        .catch(() => undefined);
      await Promise.all(
        savedPaths.map((filePath) => this.deleteStoredFile(filePath)),
      );
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Community media storage failed: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'The uploaded media could not be processed.',
      );
    }

    return {
      id: submission.id,
      status: submission.status,
      message: 'Your story was received and is awaiting review.',
    };
  }

  async listApproved() {
    const rows = await this.prisma.communitySubmission.findMany({
      where: { status: CommunitySubmissionStatus.approved, deletedAt: null },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 24,
      include: { media: { orderBy: { createdAt: 'asc' } } },
    });

    return rows.map((row) => this.toPublic(row));
  }

  async listForAdmin(filters: CommunitySubmissionListDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const where: Prisma.CommunitySubmissionWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communitySubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          media: { orderBy: { createdAt: 'asc' } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.communitySubmission.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createForAdmin(
    dto: AdminCreateCommunitySubmissionDto,
    files: UploadedMedia[],
    reviewerId: string,
  ) {
    const created = await this.create(dto, files);
    if (dto.status === CommunitySubmissionStatus.approved) {
      return this.approve(created.id, reviewerId);
    }
    return this.getForAdmin(created.id);
  }

  async update(id: string, dto: UpdateCommunitySubmissionDto) {
    const existing = await this.getForAdmin(id);

    if (dto.format && dto.format !== existing.format) {
      throw new BadRequestException(
        'The submission format cannot be changed after creation.',
      );
    }

    const nextRole = dto.role ?? existing.role;
    const nextChildName =
      dto.childName === undefined ? existing.childName : dto.childName || null;
    if (nextRole === CommunitySubmissionRole.parent && !nextChildName) {
      throw new BadRequestException(
        'Child name is required for a parent submission.',
      );
    }

    return this.prisma.communitySubmission.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastNameInitial: dto.lastNameInitial ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ? dto.email.toLowerCase() : undefined,
        city: dto.city === undefined ? undefined : dto.city || null,
        role: dto.role ?? undefined,
        childName: dto.childName === undefined ? undefined : nextChildName,
        childAge:
          dto.childAge === undefined ? undefined : (dto.childAge ?? null),
        treatmentStatus: dto.treatmentStatus ?? undefined,
        why: dto.why ?? undefined,
        journey: dto.journey ?? undefined,
        satisfied:
          dto.satisfied === undefined ? undefined : dto.satisfied || null,
        message: dto.message === undefined ? undefined : dto.message || null,
        contactConsent: dto.contactConsent ?? undefined,
      },
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async getForAdmin(id: string) {
    const row = await this.prisma.communitySubmission.findFirst({
      where: { id, deletedAt: null },
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Community submission not found.');
    return row;
  }

  async approve(id: string, reviewerId: string) {
    const existing = await this.getForAdmin(id);
    if (existing.status === CommunitySubmissionStatus.approved) return existing;
    return this.prisma.communitySubmission.update({
      where: { id },
      data: {
        status: CommunitySubmissionStatus.approved,
        publishedAt: new Date(),
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewNote: null,
      },
      include: { media: true },
    });
  }

  async reject(
    id: string,
    reviewerId: string,
    dto: RejectCommunitySubmissionDto,
  ) {
    await this.getForAdmin(id);
    return this.prisma.communitySubmission.update({
      where: { id },
      data: {
        status: CommunitySubmissionStatus.rejected,
        publishedAt: null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewNote: dto.reviewNote || null,
      },
      include: { media: true },
    });
  }

  async softDelete(id: string) {
    await this.getForAdmin(id);
    return this.prisma.communitySubmission.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  private validateFiles(
    format: CommunitySubmissionFormat,
    files: UploadedMedia[],
  ) {
    const images = files.filter((file) => file.mimetype.startsWith('image/'));
    const videos = files.filter((file) => file.mimetype.startsWith('video/'));
    if (format === CommunitySubmissionFormat.text && files.length > 0) {
      throw new BadRequestException(
        'Written submissions cannot contain media.',
      );
    }
    if (
      format === CommunitySubmissionFormat.photo &&
      (images.length < 1 || videos.length > 0 || images.length > 4)
    ) {
      throw new BadRequestException(
        'Photo stories accept up to four image files only.',
      );
    }
    if (
      format === CommunitySubmissionFormat.video &&
      (videos.length !== 1 || images.length > 1)
    ) {
      throw new BadRequestException(
        'Video stories accept one video and one optional cover image.',
      );
    }
  }

  private async storeMedia(submissionId: string, file: UploadedMedia) {
    const directory = path.join(UPLOAD_ROOT, 'community', submissionId);
    await fs.promises.mkdir(directory, { recursive: true });

    if (file.mimetype.startsWith('image/')) {
      const result = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({
          width: MAX_IMAGE_DIMENSION,
          height: MAX_IMAGE_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_QUALITY })
        .toBuffer({ resolveWithObject: true });
      const fileName = `${randomUUID()}.webp`;
      const relativePath = `/uploads/community/${submissionId}/${fileName}`;
      await fs.promises.writeFile(path.join(directory, fileName), result.data);
      return {
        relativePath,
        mimeType: 'image/webp',
        sizeBytes: result.data.byteLength,
        width: result.info.width,
        height: result.info.height,
        durationSeconds: undefined,
      };
    }

    const video = await this.optimizeVideo(file.buffer);
    if (video.byteLength > MAX_STORED_VIDEO_BYTES) {
      throw new BadRequestException(
        'The optimized video is still too large. Please choose a shorter video.',
      );
    }
    const fileName = `${randomUUID()}.mp4`;
    const relativePath = `/uploads/community/${submissionId}/${fileName}`;
    await fs.promises.writeFile(path.join(directory, fileName), video);
    return {
      relativePath,
      mimeType: 'video/mp4',
      sizeBytes: video.byteLength,
      width: undefined,
      height: undefined,
      durationSeconds: undefined,
    };
  }

  private optimizeVideo(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const binary = ffmpegPath ?? 'ffmpeg';
      const process = spawn(binary, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vf',
        'scale=min(1080\\,iw):-2',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-movflags',
        '+frag_keyframe+empty_moov',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-f',
        'mp4',
        'pipe:1',
      ]);
      const chunks: Buffer[] = [];
      let stderr = '';
      process.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      process.once('error', (error) =>
        reject(
          new BadRequestException(
            `Video processing is unavailable: ${error.message}`,
          ),
        ),
      );
      process.once('close', (code) => {
        if (code === 0) return resolve(Buffer.concat(chunks));
        reject(
          new BadRequestException(
            stderr.trim() || 'The video could not be processed.',
          ),
        );
      });
      process.stdin.end(input);
    });
  }

  private async deleteStoredFile(relativePath: string) {
    const absolute = path.resolve(
      process.cwd(),
      relativePath.replace(/^\/+/, ''),
    );
    const root = path.resolve(UPLOAD_ROOT) + path.sep;
    if (!absolute.startsWith(root)) return;
    await fs.promises.unlink(absolute).catch(() => undefined);
  }

  private toPublic(
    row: Prisma.CommunitySubmissionGetPayload<{ include: { media: true } }>,
  ) {
    return {
      id: row.id,
      format: row.format,
      firstName: row.firstName,
      lastNameInitial: row.lastNameInitial,
      city: row.city,
      role: row.role,
      childAge: row.childAge,
      treatmentStatus: row.treatmentStatus,
      why: row.why,
      journey: row.journey,
      satisfied: row.satisfied,
      message: row.message,
      publishedAt: row.publishedAt,
      media: row.media.map((media) => ({
        id: media.id,
        relativePath: media.relativePath,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
      })),
    };
  }
}
