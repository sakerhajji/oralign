import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  NotFoundException,
  ConflictException,
} from '../../common/exceptions/app.exception';
import { UserRepository } from '../repositories/user.repository';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserFilterDto,
} from '../dto/user.dto';
import { Prisma, UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { MailService } from '../../mail/mail.service';
import { Logger } from '@nestjs/common';

type UserWithProfile = Prisma.UserGetPayload<{
  include: { dentistProfile: true };
}>;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private userRepository: UserRepository,
    private readonly mailService: MailService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.userRepository.findByEmail(
      createUserDto.email,
    );

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = await this.userRepository.create({
      email: createUserDto.email,
      fullName: createUserDto.fullName,
      passwordHash: hashedPassword,
      phone: createUserDto.phone,
      country: createUserDto.country,
      avatarUrl: createUserDto.avatarUrl,
    });

    return this.mapToDto(user);
  }

  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    return this.mapToDto(user);
  }

  async getAllUsers(
    page = 1,
    limit = 10,
    filters?: UserFilterDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const skip = (page - 1) * limit;
    const { users, total } = await this.userRepository.findAll(
      skip,
      limit,
      filters,
    );

    const totalPages = Math.ceil(total / limit);

    return new PaginatedResponse(
      users.map((user) => this.mapToDto(user)),
      total,
      page,
      limit,
      totalPages,
    );
  }

  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<UserResponseDto> {
    const targetUser = await this.userRepository.findById(id);

    if (!targetUser || targetUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    // Permission check: Only admins can edit other users, users can only edit themselves
    const isAdmin =
      currentUser.role === UserRole.admin ||
      (currentUser.role as string) === 'super_admin';
    const isSelfEdit = currentUser.id === id;

    if (!isAdmin && !isSelfEdit) {
      throw new ForbiddenException('You can only edit your own profile');
    }

    // Prepare update data object
    const updateData: {
      fullName?: string;
      phone?: string;
      country?: string;
      avatarUrl?: string;
      preferredLanguage?: string;
      passwordHash?: string;
      role?: UserRole;
      isEmailVerified?: boolean;
    } = {};

    // Basic fields that both admins and users can update
    if (updateUserDto.fullName !== undefined)
      updateData.fullName = updateUserDto.fullName;
    if (updateUserDto.phone !== undefined)
      updateData.phone = updateUserDto.phone;
    if (updateUserDto.country !== undefined)
      updateData.country = updateUserDto.country;
    if (updateUserDto.avatarUrl !== undefined)
      updateData.avatarUrl = updateUserDto.avatarUrl;
    if (updateUserDto.preferredLanguage !== undefined)
      updateData.preferredLanguage = updateUserDto.preferredLanguage;

    // Password update: Only if provided and not empty
    if (updateUserDto.password && updateUserDto.password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
    }

    // Admin-only fields
    if (isAdmin) {
      if (updateUserDto.role !== undefined)
        updateData.role = updateUserDto.role;
      if (updateUserDto.isEmailVerified !== undefined)
        updateData.isEmailVerified = updateUserDto.isEmailVerified;
    }

    const updatedUser = await this.userRepository.update(id, updateData);
    return this.mapToDto(updatedUser);
  }

  async deleteUser(id: string): Promise<{ message: string }> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.delete(id);

    return { message: 'User deleted successfully' };
  }

  async bulkDeleteUsers(
    ids: string[],
  ): Promise<{ message: string; count: number }> {
    const count = await this.userRepository.bulkDelete(ids);
    return { message: `${count} users deleted successfully`, count };
  }

  async bulkUpdateStatus(
    ids: string[],
    isActive: boolean,
  ): Promise<{ message: string; count: number }> {
    const count = await this.userRepository.bulkUpdateStatus(ids, isActive);
    const action = isActive ? 'activated' : 'blocked';
    return { message: `${count} users ${action} successfully`, count };
  }

  async updateUserRole(id: string, role: UserRole): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.userRepository.update(id, { role });
    return this.mapToDto(updatedUser);
  }

  async updateEmailVerification(
    id: string,
    isEmailVerified: boolean,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.userRepository.update(id, {
      isEmailVerified,
    });
    return this.mapToDto(updatedUser);
  }

  /**
   * Admin sets the account's approval state. The frontend uses this to gate
   * access to the dashboard until a human has reviewed the registration.
   * When the status transitions to `approved` we fire a welcome email; the
   * send is non-blocking so a misconfigured SMTP doesn't break the API call.
   */
  async updateApproval(
    id: string,
    verificationStatus: VerificationStatus,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const wasNotApproved =
      user.verificationStatus !== VerificationStatus.approved;
    const updatedUser = await this.userRepository.update(id, {
      verificationStatus,
    });

    if (wasNotApproved && verificationStatus === VerificationStatus.approved) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
      void this.mailService
        .sendApprovalGrantedEmail(
          updatedUser.email,
          updatedUser.fullName,
          `${frontendUrl}/dashboard`,
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to send approval email to ${updatedUser.email}: ${(err as Error).message}`,
          );
        });
    }

    return this.mapToDto(updatedUser);
  }

  async getDeletedUsers(
    page = 1,
    limit = 10,
    filters?: UserFilterDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const skip = (page - 1) * limit;
    const { users, total } = await this.userRepository.findAllDeleted(
      skip,
      limit,
      filters,
    );

    const totalPages = Math.ceil(total / limit);

    return new PaginatedResponse(
      users.map((user) => this.mapToDto(user)),
      total,
      page,
      limit,
      totalPages,
    );
  }

  async restoreUser(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }

    const restoredUser = await this.userRepository.restore(id);
    return this.mapToDto(restoredUser);
  }

  async bulkRestoreUsers(
    ids: string[],
  ): Promise<{ message: string; count: number }> {
    const count = await this.userRepository.bulkRestore(ids);
    return { message: `${count} users restored successfully`, count };
  }

  async permanentlyDeleteUser(id: string): Promise<{ message: string }> {
    const user = await this.userRepository.findById(id);

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }

    await this.userRepository.hardDelete(id);
    return { message: 'User permanently deleted' };
  }

  async bulkPermanentlyDeleteUsers(
    ids: string[],
  ): Promise<{ message: string; count: number }> {
    const count = await this.userRepository.bulkHardDelete(ids);
    return {
      message: `${count} users permanently deleted`,
      count,
    };
  }

  private mapToDto(user: UserWithProfile): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? undefined,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      avatarUrl: user.avatarUrl ?? undefined,
      country: user.country ?? undefined,
      // Drives the language of the dashboard UI, notifications and
      // emails for this user. Seeded into the frontend on login.
      preferredLanguage: user.preferredLanguage ?? undefined,
      lastLoginAt: user.lastLoginAt ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      verificationStatus: user.verificationStatus ?? undefined,
      dentistProfile: user.dentistProfile ?? null,
    };
  }
}
