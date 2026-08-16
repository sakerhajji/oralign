import {
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AdminCreateCommunitySubmissionDto,
  CommunitySubmissionListDto,
  RejectCommunitySubmissionDto,
  UpdateCommunitySubmissionDto,
} from '../dto/community-submission.dto';
import { COMMUNITY_UPLOAD } from './community-submission.controller';
import { CommunitySubmissionService } from '../services/community-submission.service';
import { ADMIN_ROLES } from '../../common/access/caller';

@ApiTags('community-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('admin/community-submissions')
export class AdminCommunitySubmissionController {
  constructor(private readonly service: CommunitySubmissionService) {}

  @Get()
  @ApiOperation({ summary: 'List community submissions awaiting moderation.' })
  async list(@Query() filters: CommunitySubmissionListDto) {
    return this.service.listForAdmin(filters);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a community story from the dashboard.' })
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
    @Body() dto: AdminCreateCommunitySubmissionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createForAdmin(dto, files ?? [], user.sub);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit a community story from the dashboard.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommunitySubmissionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: String })
  async get(@Param('id') id: string) {
    return this.service.getForAdmin(id);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a submission for public display.' })
  async approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approve(id, user.sub);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a submission and keep it out of public display.',
  })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCommunitySubmissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(id, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a community submission.' })
  async remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
