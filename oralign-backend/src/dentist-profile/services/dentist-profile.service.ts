import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '../../common/exceptions/app.exception';
import { DentistProfileRepository } from '../repositories/dentist-profile.repository';
import {
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  DentistProfileResponseDto,
  SetupClinicDto,
} from '../dto/dentist-profile.dto';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TTL, dpKey, whKey } from '../../common/cache/cache-keys';

type ProfileWithUser = {
  id: string;
  userId: string;
  clinicName: string;
  clinicAddress: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  description: string | null;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user?: { fullName: string; avatarUrl: string | null } | null;
};

type Caller = { userId: string; role: string };

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];

@Injectable()
export class DentistProfileService {
  private readonly logger = new Logger(DentistProfileService.name);

  constructor(
    private profileRepository: DentistProfileRepository,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Onboarding-friendly atomic upsert:
   *   • create or update the dentist profile
   *   • replace the entire weekly schedule
   * in a single Postgres transaction so the frontend doesn't have to juggle
   * two separate mutations / cache invalidations.
   *
   * Caller is the authenticated user — they own the profile. Admins setting
   * up a clinic for someone else should use the dedicated admin endpoint.
   */
  async setupClinic(
    userId: string,
    dto: SetupClinicDto,
  ): Promise<DentistProfileResponseDto> {
    // Validate hours pairs up-front so the transaction never starts on bad
    // data (open >= close on an open day is the most common authoring error).
    for (const day of dto.workingHours) {
      if (!day.isClosed && day.openTime >= day.closeTime) {
        throw new BadRequestException(
          `Open time must be before close time for ${day.dayOfWeek}.`,
        );
      }
    }

    const { workingHours, ...profileFields } = dto;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dentistProfile.findUnique({
        where: { userId },
      });

      const profile = existing
        ? await tx.dentistProfile.update({
            where: { userId },
            data: { ...profileFields, deletedAt: null },
            include: {
              user: { select: { fullName: true, avatarUrl: true } },
            },
          })
        : await tx.dentistProfile.create({
            data: { userId, ...profileFields },
            include: {
              user: { select: { fullName: true, avatarUrl: true } },
            },
          });

      // Replace-all is the simplest semantics here — keeps the UI's
      // "the form is the source of truth" model intact.
      await tx.workingHours.deleteMany({
        where: { dentistProfileId: profile.id },
      });
      if (workingHours.length > 0) {
        await tx.workingHours.createMany({
          data: workingHours.map((d) => ({
            dentistProfileId: profile.id,
            dayOfWeek: d.dayOfWeek,
            openTime: d.openTime,
            closeTime: d.closeTime,
            isClosed: d.isClosed,
          })),
        });
      }

      return profile;
    });

    // Invalidate every cache layer that touched this profile / its hours.
    await Promise.all([
      this.invalidateProfile({ id: result.id, userId }),
      this.safeDel(whKey.byProfile(result.id)),
    ]);

    return this.mapToDto(result as ProfileWithUser);
  }

  async createProfile(
    userId: string,
    createProfileDto: CreateDentistProfileDto,
  ): Promise<DentistProfileResponseDto> {
    const existing = await this.profileRepository.findByUserId(userId);
    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        'A clinic profile already exists for this account.',
        'PROFILE_EXISTS',
      );
    }

    const profile = await this.profileRepository.create({
      userId,
      ...createProfileDto,
    });

    // Invalidate the user-keyed cache so the next read picks up the new row.
    await this.invalidateProfile({ userId });

    return this.mapToDto(profile as ProfileWithUser);
  }

  async getProfileById(id: string): Promise<DentistProfileResponseDto> {
    const key = dpKey.byId(id);
    const cached = await this.safeGet<DentistProfileResponseDto>(key);
    if (cached) return cached;

    const profile = await this.profileRepository.findById(id);
    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    const dto = this.mapToDto(profile as ProfileWithUser);
    await this.safeSet(key, dto, TTL.warm);
    return dto;
  }

  async getProfileByUserId(userId: string): Promise<DentistProfileResponseDto> {
    const key = dpKey.byUserId(userId);
    const cached = await this.safeGet<DentistProfileResponseDto>(key);
    if (cached) return cached;

    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    const dto = this.mapToDto(profile as ProfileWithUser);
    await this.safeSet(key, dto, TTL.warm);
    return dto;
  }

  async getAllProfiles(
    page = 1,
    limit = 10,
  ): Promise<PaginatedResponse<DentistProfileResponseDto>> {
    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findAll(
      skip,
      limit,
    );

    const totalPages = Math.ceil(total / limit);

    return new PaginatedResponse(
      profiles.map((p) => this.mapToDto(p as ProfileWithUser)),
      total,
      page,
      limit,
      totalPages,
    );
  }

  async searchByCity(
    city: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResponse<DentistProfileResponseDto>> {
    const key = dpKey.searchByCity(city, page, limit);
    const cached =
      await this.safeGet<PaginatedResponse<DentistProfileResponseDto>>(key);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findByCity(
      city,
      skip,
      limit,
    );

    const totalPages = Math.ceil(total / limit);
    const result = new PaginatedResponse(
      profiles.map((p) => this.mapToDto(p as ProfileWithUser)),
      total,
      page,
      limit,
      totalPages,
    );
    // Short TTL — searches stay correct without manual invalidation.
    await this.safeSet(key, result, TTL.warm);
    return result;
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm = 5,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResponse<DentistProfileResponseDto>> {
    const key = dpKey.nearby(latitude, longitude, radiusKm, page, limit);
    const cached =
      await this.safeGet<PaginatedResponse<DentistProfileResponseDto>>(key);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findNearby(
      latitude,
      longitude,
      radiusKm,
      skip,
      limit,
    );

    const totalPages = Math.ceil(total / limit);
    const result = new PaginatedResponse(
      profiles.map((p) => this.mapToDto(p as ProfileWithUser)),
      total,
      page,
      limit,
      totalPages,
    );
    await this.safeSet(key, result, TTL.warm);
    return result;
  }

  async updateProfile(
    id: string,
    updateProfileDto: UpdateDentistProfileDto,
    caller: Caller,
  ): Promise<DentistProfileResponseDto> {
    const profile = await this.profileRepository.findById(id);

    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    if (
      !ADMIN_ROLES.includes(caller.role) &&
      profile.userId !== caller.userId
    ) {
      throw new ForbiddenException(
        'You can only update your own clinic profile',
      );
    }

    const updatedProfile = await this.profileRepository.update(
      id,
      updateProfileDto,
    );

    await this.invalidateProfile({ id, userId: profile.userId });

    return this.mapToDto(updatedProfile as ProfileWithUser);
  }

  async deleteProfile(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    const profile = await this.profileRepository.findById(id);

    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    if (
      !ADMIN_ROLES.includes(caller.role) &&
      profile.userId !== caller.userId
    ) {
      throw new ForbiddenException(
        'You can only delete your own clinic profile',
      );
    }

    await this.profileRepository.delete(id);
    await this.invalidateProfile({ id, userId: profile.userId });

    return { message: 'Dentist profile deleted successfully' };
  }

  /**
   * Invalidate the per-profile caches after a write. Search/nearby caches
   * use short TTLs and aren't worth scanning Redis for — they self-expire.
   */
  private async invalidateProfile({
    id,
    userId,
  }: {
    id?: string;
    userId?: string;
  }): Promise<void> {
    const keys = [
      id ? dpKey.byId(id) : null,
      userId ? dpKey.byUserId(userId) : null,
    ].filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => this.safeDel(k)));
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────
  // Wrap cache ops in try/catch — Redis being briefly unreachable should
  // degrade to a direct DB hit, never break the request.

  private async safeGet<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cache.get<T>(key);
      return value ?? undefined;
    } catch (err) {
      this.logger.warn(`cache.get(${key}) failed: ${(err as Error).message}`);
      return undefined;
    }
  }

  private async safeSet<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
    } catch (err) {
      this.logger.warn(`cache.set(${key}) failed: ${(err as Error).message}`);
    }
  }

  private async safeDel(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`cache.del(${key}) failed: ${(err as Error).message}`);
    }
  }

  private mapToDto(profile: ProfileWithUser): DentistProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      clinicName: profile.clinicName,
      clinicAddress: profile.clinicAddress ?? undefined,
      city: profile.city ?? undefined,
      country: profile.country ?? undefined,
      latitude: profile.latitude ?? undefined,
      longitude: profile.longitude ?? undefined,
      clinicPhone: profile.clinicPhone ?? undefined,
      clinicEmail: profile.clinicEmail ?? undefined,
      description: profile.description ?? undefined,
      logoUrl: profile.logoUrl ?? undefined,
      userFullName: profile.user?.fullName,
      userAvatarUrl: profile.user?.avatarUrl ?? undefined,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
