import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
  async categories() {
    return this.blogService.listCategories();
  }

  @Public()
  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'slug', type: String })
  @ApiOperation({
    summary:
      'Full published post by slug, with content image urls rewritten ' +
      'to ready variants + up to 3 related posts.',
  })
  async getBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublicBySlug(slug);
  }
}
