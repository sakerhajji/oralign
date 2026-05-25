import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SliderMediaDeviceTarget,
  SliderMediaSourceType,
  SliderMediaType,
  UserRole,
} from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateSliderMediaDto,
  ReorderSliderMediaDto,
  SliderMediaFilterDto,
  UpdateSliderMediaDto,
} from '../dto/slider-media.dto';
import { SliderMediaService } from '../services/slider-media.service';

// ─── Multer config ─────────────────────────────────────────────────────
//
// One destination for both desktop + mobile uploads. Filenames are UUID
// + original extension so we never collide and never leak the original
// filename onto the static URL (which would be served to anyone who
// can browse to /uploads/slider/...).

const SLIDER_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'slider');
if (!existsSync(SLIDER_UPLOAD_ROOT)) {
  mkdirSync(SLIDER_UPLOAD_ROOT, { recursive: true });
}

// Per-mime size caps. Videos get a generous bucket (50 MB) because
// short MP4s for the slider are commonly 10–25 MB.
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);
const ALLOWED_MIMES = new Set([...IMAGE_MIMES, ...VIDEO_MIMES]);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB envelope; multer enforces the absolute ceiling.

const SLIDER_MULTER = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, SLIDER_UPLOAD_ROOT),
    filename: (_req, file, cb) =>
      cb(
        null,
        `${randomUUID()}${extname(file.originalname || '').toLowerCase()}`,
      ),
  }),
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Unsupported file type. Use PNG/JPG/WebP for images or MP4/WebM for videos.',
        ),
        false,
      );
    }
  },
  limits: { fileSize: MAX_BYTES },
};

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

@ApiTags('slider-media')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('slider-media')
export class SliderMediaController {
  constructor(private readonly service: SliderMediaService) {}

  // ─── Doctor-facing read ────────────────────────────────────────────

  @Get('active')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @ApiOperation({
    summary:
      'Active slides for a device. Doctor dashboard hits this once per page paint; cached in Redis for 60 s.',
  })
  async listActive(
    @Query('device') deviceParam?: string,
  ) {
    // Coerce the device. The frontend already normalises this on the
    // client but be defensive — bad values default to desktop rather
    // than crashing.
    const device =
      deviceParam === 'mobile'
        ? SliderMediaDeviceTarget.mobile
        : SliderMediaDeviceTarget.desktop;
    return { device, data: await this.service.listActiveForDevice(device) };
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────

  @Get()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Admin: paginated list of slides with filters.' })
  async list(@Query() filter: SliderMediaFilterDto) {
    return this.service.listForAdmin(filter);
  }

  @Get(':id')
  @Roles(...ADMIN_ROLES)
  async getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Create a new slide. Pair an optional `desktop` and/or `mobile` file with the JSON metadata fields.',
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'desktop', maxCount: 1 },
        { name: 'mobile', maxCount: 1 },
      ],
      SLIDER_MULTER,
    ),
  )
  async create(
    @Body() dto: CreateSliderMediaDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFiles()
    files: { desktop?: Express.Multer.File[]; mobile?: Express.Multer.File[] },
  ) {
    this.enforceMediaTypeMimes(dto.mediaType, files);
    const uploadedUrls = this.resolveUploadedUrls(files);
    return this.service.create(dto, user.sub, uploadedUrls);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'desktop', maxCount: 1 },
        { name: 'mobile', maxCount: 1 },
      ],
      SLIDER_MULTER,
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSliderMediaDto,
    @UploadedFiles()
    files: { desktop?: Express.Multer.File[]; mobile?: Express.Multer.File[] },
  ) {
    if (dto.mediaType) this.enforceMediaTypeMimes(dto.mediaType, files);
    const uploadedUrls = this.resolveUploadedUrls(files);
    return this.service.update(id, dto, uploadedUrls);
  }

  @Patch(':id/activate')
  @Roles(...ADMIN_ROLES)
  async activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(...ADMIN_ROLES)
  async deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post('reorder')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Replace the ordering of every passed-in slide id. Unlisted slides keep their order.',
  })
  async reorder(@Body() dto: ReorderSliderMediaDto) {
    return this.service.reorder(dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  async softDelete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Post(':id/restore')
  @Roles(...ADMIN_ROLES)
  async restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /**
   * Reject mismatched MIME / media-type pairs. A row saying
   * `mediaType: 'image'` with a `.mp4` file would render a broken
   * `<img>` on the doctor side.
   */
  private enforceMediaTypeMimes(
    mediaType: SliderMediaType,
    files: { desktop?: Express.Multer.File[]; mobile?: Express.Multer.File[] },
  ): void {
    const all = [...(files.desktop ?? []), ...(files.mobile ?? [])];
    for (const f of all) {
      const isImage = IMAGE_MIMES.has(f.mimetype);
      const isVideo = VIDEO_MIMES.has(f.mimetype);
      if (mediaType === SliderMediaType.image && !isImage) {
        throw new BadRequestException(
          `mediaType=image but received a ${f.mimetype} file. Use a PNG/JPG/WebP.`,
        );
      }
      if (mediaType === SliderMediaType.video && !isVideo) {
        throw new BadRequestException(
          `mediaType=video but received a ${f.mimetype} file. Use an MP4 or WebM.`,
        );
      }
    }
  }

  private resolveUploadedUrls(files: {
    desktop?: Express.Multer.File[];
    mobile?: Express.Multer.File[];
  }): { desktopUrl?: string; mobileUrl?: string } {
    const out: { desktopUrl?: string; mobileUrl?: string } = {};
    const desktop = files.desktop?.[0];
    const mobile = files.mobile?.[0];
    if (desktop) out.desktopUrl = `/uploads/slider/${desktop.filename}`;
    if (mobile) out.mobileUrl = `/uploads/slider/${mobile.filename}`;
    return out;
  }
}
