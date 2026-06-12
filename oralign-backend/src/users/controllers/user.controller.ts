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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from '../services/user.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserFilterDto,
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
import { ForbiddenException } from '../../common/exceptions/app.exception';
import {
  STORAGE_SERVICE,
  StorageService,
} from '../../storage/storage.interface';

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
    description: 'User created successfully',
    type: UserResponseDto,
  })
  async createUser(
    @Body() createUserDto: CreateUserDto,
  ): Promise<UserResponseDto> {
    return this.userService.createUser(createUserDto);
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
  async restoreUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.restoreUser(id);
  }

  @Post('bulk-restore')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk restore deleted users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users restored successfully' })
  async bulkRestoreUsers(
    @Body() bulkActionDto: BulkActionDto,
  ): Promise<{ message: string; count: number }> {
    return this.userService.bulkRestoreUsers(bulkActionDto.ids);
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
  ): Promise<{ message: string }> {
    return this.userService.permanentlyDeleteUser(id);
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
  ): Promise<{ message: string; count: number }> {
    return this.userService.bulkPermanentlyDeleteUsers(bulkActionDto.ids);
  }

  @Get()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all users with pagination and filters (admin only)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: UserRole,
    description: 'Filter by role',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({
    name: 'isEmailVerified',
    required: false,
    type: Boolean,
    description: 'Filter by email verified status',
  })
  @ApiResponse({
    status: 200,
    description: 'Users fetched successfully',
  })
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('isActive') isActive?: string,
    @Query('isEmailVerified') isEmailVerified?: string,
  ) {
    const filters: UserFilterDto = {};
    if (search) filters.search = search;
    if (role) filters.role = role;
    if (isActive !== undefined && isActive !== '')
      filters.isActive = isActive === 'true';
    if (isEmailVerified !== undefined && isEmailVerified !== '')
      filters.isEmailVerified = isEmailVerified === 'true';

    return this.userService.getAllUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      filters,
    );
  }

  @Get('me')
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
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: UserRole,
    description: 'Filter by role',
  })
  @ApiResponse({
    status: 200,
    description: 'Deleted users fetched successfully',
  })
  async getDeletedUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    const filters: UserFilterDto = {};
    if (search) filters.search = search;
    if (role) filters.role = role;

    return this.userService.getDeletedUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      filters,
    );
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
      role: currentUser.role as UserRole,
    });
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user by ID (admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(@Param('id') id: string): Promise<{ message: string }> {
    return this.userService.deleteUser(id);
  }

  @Delete()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users deleted successfully' })
  async bulkDeleteUsers(
    @Body() bulkActionDto: BulkActionDto,
  ): Promise<{ message: string; count: number }> {
    return this.userService.bulkDeleteUsers(bulkActionDto.ids);
  }

  @Patch('bulk-status')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk update user status (admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  async bulkUpdateStatus(
    @Body() bulkUpdateStatusDto: BulkUpdateStatusDto,
  ): Promise<{ message: string; count: number }> {
    return this.userService.bulkUpdateStatus(
      bulkUpdateStatusDto.ids,
      bulkUpdateStatusDto.isActive,
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
  ): Promise<UserResponseDto> {
    return this.userService.updateUserRole(id, updateRoleDto.role);
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
  ): Promise<UserResponseDto> {
    return this.userService.updateApproval(id, dto.verificationStatus);
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
  ): Promise<UserResponseDto> {
    return this.userService.updateEmailVerification(
      id,
      updateVerificationDto.isEmailVerified,
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
        role: currentUser.role as UserRole,
      },
    );
  }
}
