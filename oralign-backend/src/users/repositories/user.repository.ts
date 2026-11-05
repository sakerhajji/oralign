import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, Prisma, VerificationStatus } from '@prisma/client';
import { UserFilterDto } from '../dto/user.dto';

/**
 * Relations every mapped user read carries: the clinic profile, and the
 * doctor's most recent order carrying the welcome gift (id + code only —
 * one indexed lookup per page, empty for non-dentists). Archived gift
 * orders are kept on purpose (the gift really was used on that case);
 * `deletedAt` lets mapToDto flag them, since GET /orders/:id 404s on them.
 */
const USER_INCLUDE = {
  dentistProfile: true,
  doctorOrders: {
    where: { welcomeGiftAppliedAt: { not: null } },
    orderBy: { welcomeGiftAppliedAt: 'desc' },
    take: 1,
    select: { id: true, orderCode: true, deletedAt: true },
  },
} satisfies Prisma.UserInclude;

export type UserWithProfile = Prisma.UserGetPayload<{
  include: typeof USER_INCLUDE;
}>;

/** Counts behind `GET /users/stats` (see UsersStatsDto). */
export type UserStats = {
  total: number;
  active: number;
  blocked: number;
  pending: number;
  dentists: number;
  admins: number;
  giftAvailable: number;
  giftUsed: number;
};

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  private readonly withProfile = USER_INCLUDE;

  async create(data: {
    email: string;
    fullName: string;
    passwordHash: string;
    phone?: string;
    country?: string;
    avatarUrl?: string;
    role?: UserRole;
  }): Promise<UserWithProfile> {
    return this.prisma.user.create({ data, include: this.withProfile });
  }

  async findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: this.withProfile,
    });
  }

  async findByEmail(email: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: this.withProfile,
    });
  }

  /**
   * Look up a user by their (unique) phone number. Used to enforce phone
   * uniqueness on create/update with a clean error instead of letting a
   * raw Prisma P2002 surface. Returns null for blank/undefined input.
   */
  async findByPhone(phone: string): Promise<UserWithProfile | null> {
    if (!phone) return null;
    return this.prisma.user.findUnique({
      where: { phone },
      include: this.withProfile,
    });
  }

  async findAll(
    skip: number,
    take: number,
    filters?: UserFilterDto,
  ): Promise<{
    users: UserWithProfile[];
    total: number;
  }> {
    const where = UserRepository.buildWhere({ deletedAt: null }, filters);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: this.withProfile,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async update(
    id: string,
    data: {
      fullName?: string;
      phone?: string | null;
      country?: string | null;
      avatarUrl?: string;
      passwordHash?: string;
      role?: UserRole;
      isEmailVerified?: boolean;
      isActive?: boolean;
      verificationStatus?: VerificationStatus;
    },
  ): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      include: this.withProfile,
    });
  }

  async delete(id: string): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: this.withProfile,
    });
  }

  async hardDelete(id: string): Promise<UserWithProfile> {
    return this.prisma.user.delete({
      where: { id },
      include: this.withProfile,
    });
  }

  /**
   * The rows that make a user hard-delete unsafe: the clinical /
   * financial trees rooted at this account. Counted regardless of the
   * children's own deletedAt — an archived order is still history.
   * (Actor references — createdQuotations, treatment plans, messages —
   * are NOT listed: they SetNull and keep a name snapshot.)
   */
  async countProtectedDependents(
    id: string,
  ): Promise<{ patients: number; orders: number } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        deletedAt: true,
        _count: { select: { patients: true, doctorOrders: true } },
      },
    });
    if (!row) return null;
    return { patients: row._count.patients, orders: row._count.doctorOrders };
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  async bulkUpdateStatus(ids: string[], isActive: boolean): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { isActive, updatedAt: new Date() },
    });
    return result.count;
  }

  async findAllDeleted(
    skip: number,
    take: number,
    filters?: UserFilterDto,
  ): Promise<{
    users: UserWithProfile[];
    total: number;
  }> {
    const where = UserRepository.buildWhere(
      { deletedAt: { not: null } },
      filters,
    );

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { deletedAt: 'desc' },
        include: this.withProfile,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Counts over non-deleted accounts, run in parallel. `blocked` and
   * `dentists` are derived (total - active, available + used) so the
   * numbers always add up on screen.
   */
  async countStats(): Promise<UserStats> {
    const live: Prisma.UserWhereInput = { deletedAt: null };
    const dentist: Prisma.UserWhereInput = {
      ...live,
      role: UserRole.dentist,
    };
    const [total, active, pending, admins, giftAvailable, giftUsed] =
      await Promise.all([
        this.prisma.user.count({ where: live }),
        this.prisma.user.count({ where: { ...live, isActive: true } }),
        this.prisma.user.count({
          where: { ...live, verificationStatus: VerificationStatus.pending },
        }),
        this.prisma.user.count({
          where: {
            ...live,
            role: { in: [UserRole.admin, UserRole.super_admin] },
          },
        }),
        this.prisma.user.count({
          where: { ...dentist, welcomeGiftUsedAt: null },
        }),
        this.prisma.user.count({
          where: { ...dentist, welcomeGiftUsedAt: { not: null } },
        }),
      ]);
    return {
      total,
      active,
      blocked: total - active,
      pending,
      dentists: giftAvailable + giftUsed,
      admins,
      giftAvailable,
      giftUsed,
    };
  }

  /**
   * The list `where`: the scope (live or deleted) AND every filter given.
   * Built as an AND list so the `welcomeGift` filter (dentists only) can
   * never overwrite a `role` filter — a non-dentist role simply matches
   * nothing.
   */
  static buildWhere(
    scope: Prisma.UserWhereInput,
    filters?: UserFilterDto,
  ): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [scope];
    const search = filters?.search?.trim();
    if (search) and.push({ OR: UserRepository.searchConditions(search) });
    if (filters?.role) and.push({ role: filters.role });
    if (filters?.isActive !== undefined) {
      and.push({ isActive: filters.isActive });
    }
    if (filters?.isEmailVerified !== undefined) {
      and.push({ isEmailVerified: filters.isEmailVerified });
    }
    if (filters?.verificationStatus) {
      and.push({ verificationStatus: filters.verificationStatus });
    }
    if (filters?.welcomeGift) {
      and.push({
        role: UserRole.dentist,
        welcomeGiftUsedAt:
          filters.welcomeGift === 'used' ? { not: null } : null,
      });
    }
    return and.length === 1 ? scope : { AND: and };
  }

  /**
   * Free-text search: name, email and clinic name (case-insensitive
   * substring), plus the phone. Phones are stored E.164 without
   * separators ("+21612345678"), so the term is matched with its spaces,
   * dashes, dots and parentheses stripped ("12 345 678" finds it); only
   * when it holds a digit, a name never needs the phone column.
   */
  static searchConditions(term: string): Prisma.UserWhereInput[] {
    const conditions: Prisma.UserWhereInput[] = [
      { fullName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      {
        dentistProfile: {
          is: { clinicName: { contains: term, mode: 'insensitive' } },
        },
      },
    ];
    const phone = term.replace(/[\s().-]/g, '');
    if (/\d/.test(phone)) conditions.push({ phone: { contains: phone } });
    return conditions;
  }

  async restore(id: string): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null, updatedAt: new Date() },
      include: this.withProfile,
    });
  }

  async bulkRestore(ids: string[]): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
      data: { deletedAt: null, updatedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Hard-delete only rows that are ALREADY soft-deleted (trash-first,
   * same rule as the single-row path) — a live account can never be
   * purged in bulk by accident.
   */
  async bulkHardDelete(ids: string[]): Promise<number> {
    const result = await this.prisma.user.deleteMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
    });
    return result.count;
  }
}
