import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlogController } from './controllers/blog.controller';
import { PublicBlogController } from './controllers/public-blog.controller';
import { BlogService } from './services/blog.service';

/**
 * Practitioner blog module.
 *
 * Two controllers front the module, mirroring the packs convention:
 *   • BlogController        — admin CRUD + status transitions + image
 *                             upload, guarded by JWT + roles.
 *   • PublicBlogController  — `@Public()` reads used by the marketing
 *                             showcase. Separated so the public surface
 *                             is unambiguous and the role guard never
 *                             short-circuits unauthenticated reads.
 *
 * MediaModule is @Global, so BlogService injects MediaProcessingService
 * directly to enqueue blog-image variant generation after upload.
 */
@Module({
  controllers: [BlogController, PublicBlogController],
  providers: [BlogService, PrismaService],
  exports: [BlogService],
})
export class BlogModule {}
