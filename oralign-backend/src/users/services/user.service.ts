import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '../../common/exceptions/app.exception';
import {
  UserRepository,
  type UserWithProfile,
} from '../repositories/user.repository';
import {
  CreateUserDto,
  CreateUserResponseDto,
  TemporaryPasswordResponseDto,
  UpdateUserDto,
  UserResponseDto,
  UserListQueryDto,
  UsersStatsDto,
} from '../dto/user.dto';
import { generateTemporaryPassword } from '../temporary-password';
import { PRODUCTION_ERROR } from '../../production/production.contract';
import { type Prisma, UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { MailService } from '../../mail/mail.service';
import { Logger } from '@nestjs/common';
import { env } from '../../common/config/env';
import { assertNoDependents } from '../../common/deletion/deletion-blocked';
import { type Caller } from '../../common/access/caller';
import type { Lang } from '../../common/i18n/lang';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  type UserProfileChangedEvent,
} from '../../notifications/events/notification-events';
import { DoctorActivityService } from '../activity/doctor-activity.service';
import type {
  AccountActivityEventDto,
  DoctorActivitySummary,
} from '../activity/doctor-activity.contract';

/** preferredLanguage of an account an admin creates (POST /users). */
const ADMIN_CREATED_ACCOUNT_LANGUAGE: Lang = 'fr';

/**
 * Account fields whose change announces user.profileChanged (the cached
 * doctor identity is dropped). Secrets and the password trail never are.
 */
const PROFILE_FIELDS = [
  'fullName',
  'phone',
  'country',
  'avatarUrl',
  'preferredLanguage',
  'role',
  'isEmailVerified',
] as const;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private userRepository: UserRepository,
    private readonly mailService: MailService,
    private readonly activity: DoctorActivityService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Admin creates an account with the requested role (dentist when
   * omitted). Only a super admin may create another super admin: the role
   * field must not become a way around the hierarchy.
   *
   * Password: typed by the admin, or generated (`generateTemporaryPassword`)
   * and returned ONCE in the response. A generated password is always
   * temporary, whatever the role, so the creating admin never keeps a
   * working password of the account; a technician's is temporary in any
   * case (`mustChangePassword`).
   *
   * A technician (lab account) is ready at once: e-mail verified, approved,
   * and no e-mail of any kind (there is none on this path, and
   * updateApproval skips her). Her first sign-in opens on the "choose your
   * password" step, never on the e-mail verification screen.
   *
   * Every account made here speaks French: the DTO takes no language, the
   * lab and the practitioners are francophone, and the schema's "en"
   * default is the self-signup's (left as is). The user changes it in her
   * account settings.
   */
  async createUser(
    createUserDto: CreateUserDto,
    caller: Caller,
  ): Promise<CreateUserResponseDto> {
    if (
      createUserDto.role === UserRole.super_admin &&
      caller.role !== UserRole.super_admin
    ) {
      throw new ForbiddenException(
        'Only a super admin can create a super admin account.',
      );
    }

    const generated = createUserDto.generateTemporaryPassword === true;
    if (generated && createUserDto.password) {
      throw new BadRequestException(
        'Send either a password or generateTemporaryPassword, not both.',
      );
    }
    if (!generated && !createUserDto.password) {
      throw new BadRequestException(
        'A password is required unless generateTemporaryPassword is true.',
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

    const temporaryPassword = generated
      ? generateTemporaryPassword()
      : undefined;
    const hashedPassword = await bcrypt.hash(
      temporaryPassword ?? createUserDto.password!,
      12,
    );
    const isTechnician = createUserDto.role === UserRole.technician;

    const user = await this.userRepository.create({
      email: createUserDto.email,
      fullName: createUserDto.fullName,
      passwordHash: hashedPassword,
      phone,
      country: createUserDto.country,
      avatarUrl: createUserDto.avatarUrl,
      role: createUserDto.role,
      preferredLanguage: ADMIN_CREATED_ACCOUNT_LANGUAGE,
      mustChangePassword: generated || isTechnician,
      ...(isTechnician && {
        isEmailVerified: true,
        verificationStatus: VerificationStatus.approved,
      }),
      ...(generated && {
        temporaryPasswordIssuedAt: new Date(),
        temporaryPasswordIssuedById: caller.userId,
      }),
    });

    if (!temporaryPassword) return this.mapToDto(user);
    this.logHandover(user, caller, 'create');
    return { ...this.mapToDto(user), temporaryPassword };
  }

  /**
   * POST users/:id/temporary-password: a technician who forgot her
   * password gets a new temporary one from an admin (she has no usable
   * mailbox for the forgot-password flow). Technician accounts only: an
   * admin must never be able to sign in as a practitioner or a colleague
   * this way (409 TEMPORARY_PASSWORD_TECHNICIAN_ONLY). One conditional
   * write on success; the account lookup only runs to explain a refusal.
   */
  async issueTemporaryPassword(
    id: string,
    caller: Caller,
  ): Promise<TemporaryPasswordResponseDto> {
    const temporaryPassword = generateTemporaryPassword();
    const issued = await this.userRepository.issueTechnicianPassword(id, {
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      issuedAt: new Date(),
      issuedById: caller.userId,
    });
    if (!issued) {
      const account = await this.userRepository.findAccountState(id);
      if (!account) throw new NotFoundException('User not found');
      throw new ConflictException(
        'A temporary password can only be issued to a technician account.',
        PRODUCTION_ERROR.TEMPORARY_PASSWORD_TECHNICIAN_ONLY,
      );
    }
    this.logHandover(
      { id, role: UserRole.technician },
      caller,
      'temporary-password',
    );
    return { temporaryPassword };
  }

  /**
   * The audit line of every password handover (CONTRACT.md §2.4): the
   * production journal attributes acts to the account, so who handed it a
   * password, and when, must be checkable. Never the password itself.
   */
  private logHandover(
    target: { id: string; role: UserRole },
    caller: Caller,
    via: 'create' | 'temporary-password' | 'force-reset',
  ): void {
    this.logger.warn(
      `Password handed over for user ${target.id} (${target.role}) by ${caller.userId} via ${via}`,
    );
  }

  /**
   * GET users/me and GET users/:id: the account with, for a dentist, his
   * activity block (the doctor's own dormant banner and the admin sheet).
   */
  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const activity = await this.activity.summaries([user]);
    return this.mapToDto(user, activity);
  }

  /**
   * `GET /users`: one page of non-deleted accounts, newest first. `page`
   * and `limit` arrive validated (UserListQueryDto: page ≥ 1, limit within
   * bounds), so `skip` is never NaN or negative. Dentist rows carry their
   * activity block (three batched queries per page, no N+1).
   */
  async getAllUsers(
    query: UserListQueryDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const { page, limit } = query;
    const { users, total } = await this.userRepository.findAll(
      (page - 1) * limit,
      limit,
      query,
      await this.activityWhere(query),
    );
    const activity = await this.activity.summaries(users);
    return this.toPage(users, total, page, limit, activity);
  }

  /** The `activity` filter as a `where` fragment (undefined = no filter). */
  private async activityWhere(
    query: UserListQueryDto,
  ): Promise<Prisma.UserWhereInput | undefined> {
    return query.activity
      ? this.activity.listFilterWhere(query.activity)
      : undefined;
  }

  /**
   * POST users/:id/reactivate: an admin reactivates a dormant doctor with
   * a reason (journaled, the doctor is notified). Idempotent: an account
   * that is not dormant is answered as it is, nothing written.
   */
  async reactivateDoctor(
    id: string,
    reason: unknown,
    caller: Caller,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });
    await this.activity.reactivate(id, caller, reason);
    return this.getUserById(id);
  }

  /** GET users/:id/activity-events: the account's activity journal. */
  async listActivityEvents(
    id: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<AccountActivityEventDto>> {
    return this.activity.listEvents(id, page, limit);
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

    // Same hierarchy as updateUserRole, on THIS path too: the user sheet
    // saves the role through PUT, so an admin could otherwise grant super
    // admin, demote one, or force-reset a super admin's password and sign
    // in as them. Checked before any write.
    if (isAdmin) {
      this.assertSuperAdminHierarchy(currentUser.role, targetUser.role, {
        editsAccount: !isSelfEdit,
        nextRole: updateUserDto.role,
      });
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
      mustChangePassword?: boolean;
      temporaryPasswordIssuedAt?: Date;
      temporaryPasswordIssuedById?: string;
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

    // Password via PUT /users/:id is an ADMIN force reset of ANOTHER
    // account. Every self-service change, admins and super admins
    // included, goes through POST /auth/change-password, which verifies
    // the current password: a self-edit here turned any stolen 15-min
    // access token into a permanent takeover (no current-password check,
    // and the real owner's sessions revoked). Force-resets also bump
    // tokenVersion so every existing session of that user is revoked.
    if (updateUserDto.password && updateUserDto.password.trim() !== '') {
      if (isSelfEdit || !isAdmin) {
        throw new ForbiddenException(
          'Use the change-password endpoint to update your own password.',
        );
      }
      updateData.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
      updateData.tokenVersion = { increment: 1 };
      // A handover like the other two (create, temporary-password): traced
      // on the row, and temporary for a technician (as she will be after
      // this write, if the same PUT changes the role).
      updateData.temporaryPasswordIssuedAt = new Date();
      updateData.temporaryPasswordIssuedById = currentUser.id;
      if ((updateUserDto.role ?? targetUser.role) === UserRole.technician) {
        updateData.mustChangePassword = true;
      }
    }

    // Admin-only fields
    if (isAdmin) {
      if (updateUserDto.role !== undefined)
        updateData.role = updateUserDto.role;
      if (updateUserDto.isEmailVerified !== undefined)
        updateData.isEmailVerified = updateUserDto.isEmailVerified;
    }

    const updatedUser = await this.userRepository.update(id, updateData);
    if (updateData.passwordHash) {
      this.logHandover(
        updatedUser,
        { userId: currentUser.id, role: currentUser.role },
        'force-reset',
      );
    }
    this.announceProfileChange(updatedUser, updateData, currentUser.id);
    return this.mapToDto(updatedUser);
  }

  /**
   * user.profileChanged after an identity write (this PUT, and the avatar
   * upload that goes through it): the cached doctor identity is dropped
   * (DentistProfileService). Only the field names travel, never values;
   * nothing is emitted when no identity field was written.
   */
  private announceProfileChange(
    user: UserWithProfile,
    written: Record<string, unknown>,
    actorId: string,
  ): void {
    const fields = PROFILE_FIELDS.filter(
      (field) => written[field] !== undefined,
    );
    if (fields.length === 0) return;
    const payload: UserProfileChangedEvent = {
      userId: user.id,
      dentistProfileId: user.dentistProfile?.id ?? null,
      fields: [...fields],
      actorId,
    };
    try {
      this.events.emit(NotificationEvents.UserProfileChanged, payload);
    } catch (error) {
      this.logger.warn(
        `user.profileChanged listener failed for user ${user.id}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Soft delete (archive). The account disappears from every normal list
   * and can no longer sign in; everything it owns or authored stays put
   * and remains visible to admins. Restore is always possible.
   */
  async deleteUser(id: string, caller: Caller): Promise<{ message: string }> {
    if (caller.userId === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });

    await this.userRepository.delete(id);

    return { message: 'User deleted successfully' };
  }

  /**
   * Bulk archive. The caller's own row is dropped from the target list —
   * an admin must not lock the platform out of its own account, the same
   * rule `deleteUser` enforces with a 403. Below super admin, super admin
   * accounts are spared too (the hierarchy, in the repository `where`).
   *
   * `skippedSelf` / `skippedSuperAdmins` are REPORTED rather than silently
   * swallowed: "select all → delete" used to answer "N users deleted" for
   * N+1 selected rows, which reads as success for something that partly
   * did not happen.
   */
  async bulkDeleteUsers(
    ids: string[],
    caller: Caller,
  ): Promise<{
    message: string;
    count: number;
    skippedSelf: boolean;
    skippedSuperAdmins: number;
  }> {
    const targets = ids.filter((id) => id !== caller.userId);
    const skippedSelf = targets.length !== ids.length;
    const spare = this.sparesSuperAdmins(caller);
    const skippedSuperAdmins = spare
      ? await this.userRepository.countSuperAdmins(targets, { deleted: false })
      : 0;
    const count = await this.userRepository.bulkDelete(targets, {
      spareSuperAdmins: spare,
    });
    return {
      message: `${count} users deleted successfully`,
      count,
      skippedSelf,
      skippedSuperAdmins,
    };
  }

  /**
   * Bulk block / unblock. Below super admin, super admin accounts are
   * spared: an admin blocking them would lock their own superiors out
   * (sign-in answers ACCOUNT_INACTIVE and every session is refused).
   * Every account the write really flips gets a `blocked` / `unblocked`
   * row in its activity journal, in the same transaction (who, when).
   */
  async bulkUpdateStatus(
    ids: string[],
    isActive: boolean,
    caller: Caller,
  ): Promise<{ message: string; count: number; skippedSuperAdmins: number }> {
    const spare = this.sparesSuperAdmins(caller);
    const skippedSuperAdmins = spare
      ? await this.userRepository.countSuperAdmins(ids, { deleted: false })
      : 0;
    const count = await this.userRepository.bulkUpdateStatus(
      ids,
      isActive,
      { spareSuperAdmins: spare },
      (tx, flipped, at) =>
        this.activity.journalStatusChange(tx, flipped, {
          isActive,
          caller,
          at,
        }),
    );
    const action = isActive ? 'activated' : 'blocked';
    return {
      message: `${count} users ${action} successfully`,
      count,
      skippedSuperAdmins,
    };
  }

  /** The bulk form of the hierarchy: below super admin, never touch one. */
  private sparesSuperAdmins(caller: Caller): boolean {
    return caller.role !== UserRole.super_admin;
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

    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
      nextRole: role,
    });

    const updatedUser = await this.userRepository.update(id, { role });
    return this.mapToDto(updatedUser);
  }

  /**
   * THE super admin hierarchy, shared by every admin route that writes an
   * account (role, PUT, e-mail verification, approval, archive, restore,
   * permanent delete; the bulk routes spare super admins in their
   * `where`): below super admin, nobody grants the role, changes the
   * role of a super admin, or (`editsAccount`) edits a super admin's
   * account at all (password reset, e-mail verification, profile). A
   * super admin passes.
   */
  private assertSuperAdminHierarchy(
    callerRole: UserRole,
    targetRole: UserRole,
    change: { editsAccount: boolean; nextRole?: UserRole },
  ): void {
    if (callerRole === UserRole.super_admin) return;
    const touchesRole =
      change.nextRole !== undefined && change.nextRole !== targetRole;
    if (
      touchesRole &&
      (change.nextRole === UserRole.super_admin ||
        targetRole === UserRole.super_admin)
    ) {
      throw new ForbiddenException(
        'Only a super admin can grant or change a super admin role.',
      );
    }
    if (change.editsAccount && targetRole === UserRole.super_admin) {
      throw new ForbiddenException(
        'Only a super admin can edit a super admin account.',
      );
    }
  }

  async updateEmailVerification(
    id: string,
    isEmailVerified: boolean,
    caller: Caller,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });

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
   * The same transition stamps `approvedAt`, the inactivity anchor of a
   * doctor who has not submitted an order yet (never cleared afterwards).
   */
  async updateApproval(
    id: string,
    verificationStatus: VerificationStatus,
    caller: Caller,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });

    const wasNotApproved =
      user.verificationStatus !== VerificationStatus.approved;
    const approvesNow =
      wasNotApproved && verificationStatus === VerificationStatus.approved;
    const updatedUser = await this.userRepository.update(id, {
      verificationStatus,
      ...(approvesNow ? { approvedAt: new Date() } : {}),
    });

    // The welcome mail is worded for practitioners; a lab account gets no
    // e-mail of any kind.
    if (approvesNow && updatedUser.role !== UserRole.technician) {
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
      await this.activityWhere(query),
    );
    return this.toPage(users, total, page, limit);
  }

  async restoreUser(id: string, caller: Caller): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });

    const restoredUser = await this.userRepository.restore(id);
    return this.mapToDto(restoredUser);
  }

  async bulkRestoreUsers(
    ids: string[],
    caller: Caller,
  ): Promise<{ message: string; count: number; skippedSuperAdmins: number }> {
    const spare = this.sparesSuperAdmins(caller);
    const skippedSuperAdmins = spare
      ? await this.userRepository.countSuperAdmins(ids, { deleted: true })
      : 0;
    const count = await this.userRepository.bulkRestore(ids, {
      spareSuperAdmins: spare,
    });
    return {
      message: `${count} users restored successfully`,
      count,
      skippedSuperAdmins,
    };
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
    caller: Caller,
  ): Promise<{ message: string }> {
    if (caller.userId === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    const user = await this.userRepository.findById(id);

    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }
    this.assertSuperAdminHierarchy(caller.role, user.role, {
      editsAccount: true,
    });

    await this.assertUserPurgeable(id);
    await this.userRepository.hardDelete(id);
    this.logger.warn(`User ${id} PERMANENTLY deleted by ${caller.userId}`);
    return { message: 'User permanently deleted' };
  }

  /**
   * Bulk permanent delete. Each id is checked independently; blocked
   * ones are skipped and counted so the admin sees "3 deleted, 2 kept
   * (have history)" instead of an all-or-nothing failure. Below super
   * admin, a super admin account is blocked like the caller's own.
   */
  async bulkPermanentlyDeleteUsers(
    ids: string[],
    caller: Caller,
  ): Promise<{ message: string; count: number; blocked: number }> {
    const spare = this.sparesSuperAdmins(caller);
    const purgeable: string[] = [];
    let blocked = 0;
    for (const id of ids) {
      if (id === caller.userId) {
        blocked += 1;
        continue;
      }
      const deps = await this.userRepository.countProtectedDependents(id);
      if (!deps) continue; // unknown id → nothing to do
      if (
        deps.patients > 0 ||
        deps.orders > 0 ||
        (spare && deps.role === UserRole.super_admin)
      ) {
        blocked += 1;
        continue;
      }
      purgeable.push(id);
    }
    const count = purgeable.length
      ? await this.userRepository.bulkHardDelete(purgeable, {
          spareSuperAdmins: spare,
        })
      : 0;
    if (count > 0) {
      this.logger.warn(
        `${count} user(s) PERMANENTLY deleted by ${caller.userId}: ${purgeable.join(', ')}`,
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
    activity?: ReadonlyMap<string, DoctorActivitySummary>,
  ): PaginatedResponse<UserResponseDto> {
    return new PaginatedResponse(
      users.map((user) => this.mapToDto(user, activity)),
      total,
      page,
      limit,
      Math.ceil(total / limit),
    );
  }

  /**
   * `activity`: the activity blocks computed for this read (summaries);
   * without it (write responses) the block is left out, and the client
   * refetches the detail.
   */
  private mapToDto(
    user: UserWithProfile,
    activity?: ReadonlyMap<string, DoctorActivitySummary>,
  ): UserResponseDto {
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
      // The handover trace (temporaryPasswordIssued*) stays server-side.
      mustChangePassword: user.mustChangePassword === true,
      // Doctor inactivity (spec §5): dormancy is NOT isActive.
      inactiveSince: user.inactiveSince ?? null,
      activityResetAt: user.activityResetAt ?? null,
      approvedAt: user.approvedAt ?? null,
      ...(activity ? { activity: activity.get(user.id) ?? null } : {}),
    };
  }
}
