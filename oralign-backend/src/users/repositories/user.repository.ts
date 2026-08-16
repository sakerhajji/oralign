import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, Prisma, VerificationStatus } from '@prisma/client';
import { UserFilterDto } from '../dto/user.dto';

type UserWithProfile = Prisma.UserGetPayload<{
  include: { dentistProfile: true };
}>;

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  private readonly withProfile = { dentistProfile: true } as const;

  async create(data: {
    email: string;
    fullName: string;
    passwordHash: string;
    phone?: string;
    country?: string;
    avatarUrl?: string;
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
    const where: Prisma.UserWhereInput = { deletedAt: null };

    // Apply filters
    if (filters) {
      if (filters.search) {
        where.OR = [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.role) {
        where.role = filters.role;
      }
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }
      if (filters.isEmailVerified !== undefined) {
        where.isEmailVerified = filters.isEmailVerified;
      }
    }

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
      phone?: string;
      country?: string;
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
    const where: Prisma.UserWhereInput = { deletedAt: { not: null } };

    // Apply filters
    if (filters) {
      if (filters.search) {
        where.OR = [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.role) {
        where.role = filters.role;
      }
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }
      if (filters.isEmailVerified !== undefined) {
        where.isEmailVerified = filters.isEmailVerified;
      }
    }

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
