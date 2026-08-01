import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateCommunitySubmissionDto } from '../dto/community-submission.dto';
import { CommunitySubmissionService } from '../services/community-submission.service';

const COMMUNITY_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);

export const COMMUNITY_UPLOAD = {
  storage: memoryStorage(),
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (COMMUNITY_MIMES.has(file.mimetype)) return cb(null, true);
    return cb(
      new BadRequestException('Use JPG, PNG, WebP, MP4, or WebM files.'),
      false,
    );
  },
  limits: { files: 4, fileSize: 25 * 1024 * 1024 },
};

@ApiTags('community')
@Controller('community-submissions')
export class CommunitySubmissionController {
  constructor(private readonly service: CommunitySubmissionService) {}

  @Public()
  @Get('approved')
  @ApiOperation({ summary: 'Public approved community stories.' })
  async approved() {
    return this.service.listApproved();
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a patient story for moderation.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'format',
        'firstName',
        'lastNameInitial',
        'phone',
        'email',
        'role',
        'treatmentStatus',
        'why',
        'journey',
        'consent',
      ],
      properties: {
        media: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('media', 4, COMMUNITY_UPLOAD))
  async create(
    @Body() dto: CreateCommunitySubmissionDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.create(dto, files ?? []);
  }
}
