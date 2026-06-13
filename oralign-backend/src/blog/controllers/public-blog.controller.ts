import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BlogAudience } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { BlogFilterDto } from '../dto/blog.dto';
import { BlogService } from '../services/blog.service';

/**
 * Public blog surface — backs the marketing showcase blog pages.
 *
 * A separate controller (no class guards) so the public reads are
 * unambiguous and the role guard never short-circuits unauthenticated
 * traffic. Every route is @Public(). Only published, non-deleted posts
 * are ever exposed here.
 *
 * The showcase has two audiences (patient | practitioner). Every read
 * accepts an optional `?audience=` filter; the slug lookup 404s when a
 * supplied audience doesn't match the post.
 */
@ApiTags('blog')
@Controller('blog')
export class PublicBlogController {
  constructor(private readonly blogService: BlogService) {}

  // Static segments are declared BEFORE the dynamic :slug route so
  // `/blog/published` and `/blog/categories` are never matched as slugs.

  @Public()
  @Get('published')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paginated published posts (newest first), filterable.',
  })
  async listPublished(@Query() filters: BlogFilterDto) {
    return this.blogService.listPublic(filters);
  }

  @Public()
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Distinct categories among published posts.' })
  @ApiQuery({ name: 'audience', enum: BlogAudience, required: false })
  async categories(@Query('audience') audience?: BlogAudience) {
    return this.blogService.listCategories(audience);
  }

  @Public()
  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'slug', type: String })
  @ApiQuery({ name: 'audience', enum: BlogAudience, required: false })
  @ApiOperation({
    summary:
      'Full published post by slug (404 on audience mismatch), with ' +
      'content image urls rewritten to ready variants in both languages ' +
      '+ up to 3 related posts of the same audience.',
  })
  async getBySlug(
    @Param('slug') slug: string,
    @Query('audience') audience?: BlogAudience,
  ) {
    return this.blogService.getPublicBySlug(slug, audience);
  }

  @Public()
  @Post(':slug/view')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'slug', type: String })
  @ApiOperation({
    summary: 'Best-effort increment of a published post view counter.',
  })
  async recordView(@Param('slug') slug: string) {
    return this.blogService.recordView(slug);
  }
}
