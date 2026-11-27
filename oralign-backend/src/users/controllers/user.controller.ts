import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from '../services/user.service';
import {
  CreateUserDto,
  CreateUserResponseDto,
  TemporaryPasswordResponseDto,
  UpdateUserDto,
  UserResponseDto,
  UserListQueryDto,
  UsersStatsDto,
  BulkActionDto,
  BulkUpdateStatusDto,
  UpdateRoleDto,
  UpdateEmailVerificationDto,
  UpdateApprovalDto,
} from '../dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { type Caller } from '../../common/access/caller';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { AllowPendingPasswordChange } from '../../auth/guards/password-change.guard';
import {
  STORAGE_SERVICE,
  StorageService,
} from '../../storage/storage.interface';
import {
  ActivityEventsQueryDto,
  ReactivateDoctorDto,
} from '../activity/doctor-activity.dto';
import type { AccountActivityEventDto } from '../activity/doctor-activity.contract';
import type { PaginatedResponse } from '../../common/dto/response.dto';

/** The service-side principal of a verified token (the hierarchy needs the role). */
function callerOf(user: JwtPayload): Caller {
  return { userId: user.sub, role: user.role };
}

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  @Post()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiResponse({
    status: 201,
    description:
      'User created successfully. With generateTemporaryPassword, the response carries `temporaryPassword` once.',
    type: CreateUserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Both or neither of password / generateTemporaryPassword',
  })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CreateUserResponseDto> {
    return this.userService.createUser(createUserDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post(':id/temporary-password')
  @Roles(UserRole.admin)
  // Same ceiling as sign-in: each call revokes the account's sessions.
  @Throttle({ long: { limit: 10, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Issue a new temporary password to a technician account (admin only)',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, type: TemporaryPasswordResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 409,
    description:
      'TEMPORARY_PASSWORD_TECHNICIAN_ONLY: the account is not a live technician',
  })
  async issueTemporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TemporaryPasswordResponseDto> {
    return this.userService.issueTemporaryPassword(id, callerOf(user));
  }

  @Post(':id/reactivate')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reactivate a dormant practitioner (doctor inactivity, admin only). Reason required (3-500 characters), journaled; the doctor is notified. Idempotent: an account that is not dormant is answered as it is.',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'REACTIVATION_REASON_REQUIRED, ACCOUNT_ACTIVITY_NOT_A_DOCTOR',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async reactivateDoctor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateDoctorDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.reactivateDoctor(id, dto.reason, callerOf(user));
  }

  @Get(':id/activity-events')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activity journal of an account (inactivity warnings, deactivation, reactivation, block / unblock), newest first (admin only)',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async listActivityEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityEventsQueryDto,
  ): Promise<PaginatedResponse<AccountActivityEventDto>> {
    return this.userService.listActivityEvents(id, query.page, query.limit);
  }

  @Post(':id/restore')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a deleted user (admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User restored successfully',
    type: UserResponseDto,
  })
  async restoreUser(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.restoreUser(id, callerOf(user));
  }

  @Post('bulk-restore')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk restore deleted users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users restored successfully' })
  async bulkRestoreUsers(
    @Body() bulkActionDto: BulkActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; count: number; skippedSuperAdmins: number }> {
    return this.userService.bulkRestoreUsers(bulkActionDto.ids, callerOf(user));
  }

  @Delete(':id/permanent')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Permanently delete a user (hard delete - cannot be restored, admin only)',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User permanently deleted' })
  async permanentlyDeleteUser(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.userService.permanentlyDeleteUser(id, callerOf(user));
  }

  @Delete('bulk-permanent')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Permanently delete multiple users (hard delete - cannot be restored, admin only)',
  })
  @ApiResponse({ status: 200, description: 'Users permanently deleted' })
  async bulkPermanentlyDeleteUsers(
    @Body() bulkActionDto: BulkActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; count: number; blocked: number }> {
    return this.userService.bulkPermanentlyDeleteUsers(
      bulkActionDto.ids,
      callerOf(user),
    );
  }

  @Get()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all users with pagination and filters (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Users fetched successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid page, limit or filter' })
  async getAllUsers(@Query() query: UserListQueryDto) {
    return this.userService.getAllUsers(query);
  }

  // Static path: declared BEFORE the `:id` routes so "stats" is never
  // read as a user id.
  @Get('stats')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Account counts for the admin users page: total, active, blocked, pending approval, dentists, admins, welcome gift available / used (non-deleted accounts)',
  })
  @ApiResponse({ status: 200, type: UsersStatsDto })
  async getUsersStats(): Promise<UsersStatsDto> {
    return this.userService.getStats();
  }

  @Get('me')
  // The "choose your password" step reads the account it is changing.
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current logged-in user' })
  @ApiResponse({
    status: 200,
    description: 'Current user fetched successfully',
    type: UserResponseDto,
  })
  async getCurrentUser(
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.getUserById(user.sub);
  }

  @Get('deleted/list')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all deleted users with pagination and filters (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Deleted users fetched successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid page, limit or filter' })
  async getDeletedUsers(@Query() query: UserListQueryDto) {
    return this.userService.getDeletedUsers(query);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User fetched successfully',
    type: UserResponseDto,
  })
  async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.getUserById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.updateUser(id, updateUserDto, {
      id: currentUser.sub,
      role: currentUser.role,
    });
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user by ID (admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.userService.deleteUser(id, callerOf(user));
  }

  @Delete()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users deleted successfully' })
  async bulkDeleteUsers(
    @Body() bulkActionDto: BulkActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; count: number }> {
    return this.userService.bulkDeleteUsers(bulkActionDto.ids, callerOf(user));
  }

  @Patch('bulk-status')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk update user status (admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  async bulkUpdateStatus(
    @Body() bulkUpdateStatusDto: BulkUpdateStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; count: number; skippedSuperAdmins: number }> {
    return this.userService.bulkUpdateStatus(
      bulkUpdateStatusDto.ids,
      bulkUpdateStatusDto.isActive,
      callerOf(user),
    );
  }

  @Patch(':id/role')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user role (admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
    type: UserResponseDto,
  })
  async updateUserRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.updateUserRole(id, updateRoleDto.role, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Patch(':id/approval')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set the account approval status (admin only). The frontend gates ' +
      'dashboard access on this field reaching "approved".',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Approval status updated successfully',
    type: UserResponseDto,
  })
  async updateApproval(
    @Param('id') id: string,
    @Body() dto: UpdateApprovalDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.updateApproval(
      id,
      dto.verificationStatus,
      callerOf(user),
    );
  }

  @Patch(':id/email-verification')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user email verification status (admin only)',
  })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Email verification status updated successfully',
    type: UserResponseDto,
  })
  async updateEmailVerification(
    @Param('id') id: string,
    @Body() updateVerificationDto: UpdateEmailVerificationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.userService.updateEmailVerification(
      id,
      updateVerificationDto.isEmailVerified,
      callerOf(user),
    );
  }

  @Post(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploaded successfully',
    type: UserResponseDto,
  })
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    // Check permissions: only admin/super_admin or the user themselves can upload
    const isAdmin =
      currentUser.role === UserRole.admin || currentUser.role === 'super_admin';
    if (!isAdmin && currentUser.sub !== id) {
      throw new ForbiddenException('You can only update your own avatar');
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Upload the file — avatars are downscaled to ≤512px WebP at
    // write time (they render at 28-40px everywhere; the original
    // multi-MB phone photo would be pure waste on every page view).
    const avatarUrl = await this.storageService.uploadFile(file, 'avatars', {
      optimizeImage: true,
    });

    // Update user with new avatar URL
    return this.userService.updateUser(
      id,
      { avatarUrl },
      {
        id: currentUser.sub,
        role: currentUser.role,
      },
    );
  }
}
