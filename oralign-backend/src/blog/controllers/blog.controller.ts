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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateBlogDto, BlogFilterDto, UpdateBlogDto } from '../dto/blog.dto';
import { BlogService } from '../services/blog.service';
import { ADMIN_ROLES } from '../../common/access/caller';

// ─── Multer config (blog image library) ─────────────────────────────────
//
// One destination for blog images. UUID + lowercased original extension
// filenames so we never collide and never leak the original filename
// onto the static URL served from /uploads/blog/...
const BLOG_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'blog');
if (!existsSync(BLOG_UPLOAD_ROOT)) {
  mkdirSync(BLOG_UPLOAD_ROOT, { recursive: true });
}

// Same processable-image allowlist as the rest of the media pipeline
// (HEIC excluded — libvips can't decode it; see PROCESSABLE_IMAGE_MIMES).
const BLOG_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap.

const BLOG_MULTER = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, BLOG_UPLOAD_ROOT),
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
    if (BLOG_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Unsupported image type. Use PNG, JPG, WebP, GIF, or AVIF.',
        ),
        false,
      );
    }
  },
  limits: { fileSize: MAX_BYTES },
};

/**
 * Admin-only blog management. `JwtAuthGuard` + `RolesGuard` are global on
 * the controller; every route requires admin or super_admin. The public
 * showcase reads through {@link PublicBlogController} instead.
 */
@ApiTags('blog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('admin/blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List blog posts with filters (admin).' })
  async list(@Query() filters: BlogFilterDto) {
    return this.blogService.list(filters);
  }

  // Static segment registered before the dynamic :id route so a POST to
  // /admin/blog/images is never captured as an id.
  @Post('images')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a single image into the blog media library.',
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', BLOG_MULTER))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded (field name 'file').");
    }
    return this.blogService.uploadImage(file, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a blog post.' })
  async create(
    @Body() dto: CreateBlogDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.blogService.create(dto, user.sub);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async get(@Param('id') id: string) {
    return this.blogService.get(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blogService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a blog post (sets deletedAt).' })
  @ApiParam({ name: 'id', type: String })
  async softDelete(@Param('id') id: string) {
    return this.blogService.softDelete(id);
  }

  @Patch(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async publish(@Param('id') id: string) {
    return this.blogService.publish(id);
  }

  @Patch(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async unpublish(@Param('id') id: string) {
    return this.blogService.unpublish(id);
  }

  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async archive(@Param('id') id: string) {
    return this.blogService.archive(id);
  }
}
