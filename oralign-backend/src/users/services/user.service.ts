import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  NotFoundException,
  ConflictException,
} from '../../common/exceptions/app.exception';
import {
  UserRepository,
  type UserWithProfile,
} from '../repositories/user.repository';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserListQueryDto,
  UsersStatsDto,
} from '../dto/user.dto';
import { UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { MailService } from '../../mail/mail.service';
import { Logger } from '@nestjs/common';
import { env } from '../../common/config/env';
import { assertNoDependents } from '../../common/deletion/deletion-blocked';
import { type Caller } from '../../common/access/caller';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private userRepository: UserRepository,
    private readonly mailService: MailService,
  ) {}

  /**
   * Admin creates an account with the requested role (dentist when
   * omitted). Only a super admin may create another super admin: the role
   * field must not become a way around the hierarchy.
   */
  async createUser(
    createUserDto: CreateUserDto,
    caller: Caller,
  ): Promise<UserResponseDto> {
    if (
      createUserDto.role === UserRole.super_admin &&
      caller.role !== UserRole.super_admin
    ) {
      throw new ForbiddenException(
        'Only a super admin can create a super admin account.',
      );
    }

    const existingUser = await this.userRepository.findByEmail(
      createUserDto.email,
    );

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Phone is unique when present — blank input becomes null (no clash).
    const phone = createUserDto.phone?.trim() || undefined;
    if (phone && (await this.userRepository.findByPhone(phone))) {
      throw new ConflictException('Phone number already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = await this.userRepository.create({
      email: createUserDto.email,
      fullName: createUserDto.fullName,
      passwordHash: hashedPassword,
      phone,
      country: createUserDto.country,
      avatarUrl: createUserDto.avatarUrl,
      role: createUserDto.role,
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

  /**
   * `GET /users`: one page of non-deleted accounts, newest first. `page`
   * and `limit` arrive validated (UserListQueryDto: page ≥ 1, limit within
   * bounds), so `skip` is never NaN or negative.
   */
  async getAllUsers(
    query: UserListQueryDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const { page, limit } = query;
    const { users, total } = await this.userRepository.findAll(
      (page - 1) * limit,
      limit,
      query,
    );
    return this.toPage(users, total, page, limit);
  }

  /** `GET /users/stats`: counts over non-deleted accounts (admin KPIs). */
  async getStats(): Promise<UsersStatsDto> {
    return this.userRepository.countStats();
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
      phone?: string | null;
      country?: string | null;
      avatarUrl?: string;
      preferredLanguage?: string;
      passwordHash?: string;
      tokenVersion?: { increment: number };
      role?: UserRole;
      isEmailVerified?: boolean;
    } = {};

    // Basic fields that both admins and users can update
    if (updateUserDto.fullName !== undefined)
      updateData.fullName = updateUserDto.fullName;
    if (updateUserDto.phone !== undefined) {
      // The DTO already turned a blank value into null ("clear"); a set
      // number must not be held by a DIFFERENT user (unique when present).
      const phone = updateUserDto.phone?.trim() || null;
      if (phone) {
        const owner = await this.userRepository.findByPhone(phone);
        if (owner && owner.id !== id) {
          throw new ConflictException('Phone number already exists');
        }
      }
      updateData.phone = phone;
    }
    if (updateUserDto.country !== undefined)
      updateData.country = updateUserDto.country;
    if (updateUserDto.avatarUrl !== undefined)
      updateData.avatarUrl = updateUserDto.avatarUrl;
    if (updateUserDto.preferredLanguage !== undefined)
      updateData.preferredLanguage = updateUserDto.preferredLanguage;

    // Password via PUT /users/:id is ADMIN-ONLY (force reset). Self-service
    // changes must go through POST /auth/change-password, which verifies the
    // current password. Letting a self-edit set a password here turned any
    // stolen 15-min access token into a permanent takeover (no current-
    // password check, no session revocation). Force-resets also bump
    // tokenVersion so every existing session of that user is revoked.
    if (updateUserDto.password && updateUserDto.password.trim() !== '') {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Use the change-password endpoint to update your own password.',
        );
      }
      updateData.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
      updateData.tokenVersion = { increment: 1 };
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

  /**
   * Soft delete (archive). The account disappears from every normal list
   * and can no longer sign in; everything it owns or authored stays put
   * and remains visible to admins. Restore is always possible.
   */
  async deleteUser(
    id: string,
    callerUserId?: string,
  ): Promise<{ message: string }> {
    if (callerUserId && callerUserId === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.delete(id);

    return { message: 'User deleted successfully' };
  }

  /**
   * Bulk archive. The caller's own row is dropped from the target list —
   * an admin must not lock the platform out of its own account, the same
   * rule `deleteUser` enforces with a 403.
   *
   * `skippedSelf` is REPORTED rather than silently swallowed: "select all
   * → delete" used to answer "N users deleted" for N+1 selected rows,
   * which reads as success for something that partly did not happen.
   */
  async bulkDeleteUsers(
    ids: string[],
    callerUserId?: string,
  ): Promise<{ message: string; count: number; skippedSelf: boolean }> {
    const targets = callerUserId ? ids.filter((id) => id !== callerUserId) : ids;
    const skippedSelf = targets.length !== ids.length;
    const count = await this.userRepository.bulkDelete(targets);
    return {
      message: `${count} users deleted successfully`,
      count,
      skippedSelf,
    };
  }

  async bulkUpdateStatus(
    ids: string[],
    isActive: boolean,
  ): Promise<{ message: string; count: number }> {
    const count = await this.userRepository.bulkUpdateStatus(ids, isActive);
    const action = isActive ? 'activated' : 'blocked';
    return { message: `${count} users ${action} successfully`, count };
  }

  /**
   * Same hierarchy as createUser: only a super admin may grant the super
   * admin role or change the role of an existing super admin.
   */
  async updateUserRole(
    id: string,
    role: UserRole,
    caller: Caller,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (
      caller.role !== UserRole.super_admin &&
      (role === UserRole.super_admin || user.role === UserRole.super_admin)
    ) {
      throw new ForbiddenException(
        'Only a super admin can grant or change a super admin role.',
      );
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
      const frontendUrl = env.frontendUrl;
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

  /** `GET /users/deleted/list`: same query and filters as the live list. */
  async getDeletedUsers(
    query: UserListQueryDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const { page, limit } = query;
    const { users, total } = await this.userRepository.findAllDeleted(
      (page - 1) * limit,
      limit,
      query,
    );
    return this.toPage(users, total, page, limit);
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

  /**
   * Permanent (hard) delete. Trash-first: the account must already be
   * soft-deleted. Refused with 409 while the account owns patients or
   * orders — that history can only be archived, never destroyed. The DB
   * enforces the same rule (onDelete: Restrict) as a last line of
   * defence; this check exists to give a useful message.
   */
  async permanentlyDeleteUser(
    id: string,
    callerUserId?: string,
  ): Promise<{ message: string }> {
    if (callerUserId && callerUserId === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    const user = await this.userRepository.findById(id);

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }

    await this.assertUserPurgeable(id);
    await this.userRepository.hardDelete(id);
    this.logger.warn(`User ${id} PERMANENTLY deleted by ${callerUserId ?? 'system'}`);
    return { message: 'User permanently deleted' };
  }

  /**
   * Bulk permanent delete. Each id is checked independently; blocked
   * ones are skipped and counted so the admin sees "3 deleted, 2 kept
   * (have history)" instead of an all-or-nothing failure.
   */
  async bulkPermanentlyDeleteUsers(
    ids: string[],
    callerUserId?: string,
  ): Promise<{ message: string; count: number; blocked: number }> {
    const purgeable: string[] = [];
    let blocked = 0;
    for (const id of ids) {
      if (callerUserId && id === callerUserId) {
        blocked += 1;
        continue;
      }
      const deps = await this.userRepository.countProtectedDependents(id);
      if (!deps) continue; // unknown id → nothing to do
      if (deps.patients > 0 || deps.orders > 0) {
        blocked += 1;
        continue;
      }
      purgeable.push(id);
    }
    const count = purgeable.length
      ? await this.userRepository.bulkHardDelete(purgeable)
      : 0;
    if (count > 0) {
      this.logger.warn(
        `${count} user(s) PERMANENTLY deleted by ${callerUserId ?? 'system'}: ${purgeable.join(', ')}`,
      );
    }
    return {
      message:
        blocked > 0
          ? `${count} users permanently deleted, ${blocked} kept because history depends on them`
          : `${count} users permanently deleted`,
      count,
      blocked,
    };
  }

  private async assertUserPurgeable(id: string): Promise<void> {
    const deps = await this.userRepository.countProtectedDependents(id);
    if (!deps) throw new NotFoundException('User not found');
    assertNoDependents('This account', [
      { label: 'patients', count: deps.patients },
      { label: 'orders', count: deps.orders },
    ]);
  }

  private toPage(
    users: UserWithProfile[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponse<UserResponseDto> {
    return new PaginatedResponse(
      users.map((user) => this.mapToDto(user)),
      total,
      page,
      limit,
      Math.ceil(total / limit),
    );
  }

  private mapToDto(user: UserWithProfile): UserResponseDto {
    const giftOrder =
      user.role === UserRole.dentist ? user.doctorOrders[0] : undefined;
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
      // Welcome gift: the doctor mark and the most recent gift order (the
      // repository loads at most one, id + code). Only practitioners
      // receive the gift. An archived gift order stays (the gift was used
      // on it) but is flagged: the order page 404s on it, so no link.
      welcomeGiftUsedAt: user.welcomeGiftUsedAt ?? null,
      welcomeGiftOrder: giftOrder
        ? {
            id: giftOrder.id,
            orderCode: giftOrder.orderCode,
            archived: giftOrder.deletedAt !== null,
          }
        : null,
    };
  }
}
