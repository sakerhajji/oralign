import { Module } from '@nestjs/common';
import { AdminCommunitySubmissionController } from './controllers/admin-community-submission.controller';
import { CommunitySubmissionController } from './controllers/community-submission.controller';
import { CommunitySubmissionService } from './services/community-submission.service';

@Module({
  controllers: [
    CommunitySubmissionController,
    AdminCommunitySubmissionController,
  ],
  providers: [CommunitySubmissionService],
  exports: [CommunitySubmissionService],
})
export class CommunityModule {}
