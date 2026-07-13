import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '../../common/exceptions/app.exception';
import {
  DentistProfileRepository,
  PublicProfileRow,
} from '../repositories/dentist-profile.repository';
import {
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  DentistProfileResponseDto,
  SetupClinicDto,
  PublicFinderQueryDto,
  PublicDentistProfileDto,
  PublicFinderResponseDto,
} from '../dto/dentist-profile.dto';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { UserRole, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
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
  taxId: string | null;
  description: string | null;
  logoUrl: string | null;
  specialty: string | null;
  isListedPublicly: boolean;
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
    private readonly events: EventEmitter2,
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

    // True when this is the dentist's FIRST clinic setup — i.e. they just
    // completed onboarding. Drives the one-time admin "ready to approve"
    // notification below (so editing the clinic later never re-notifies).
    let wasFirstSetup = false;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dentistProfile.findUnique({
        where: { userId },
      });
      wasFirstSetup = !existing || !!existing.deletedAt;

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

    // First-time clinic setup == onboarding complete. Announce so admins
    // get the "review & approve" bell + email. Fire-and-forget; a
    // notification failure must never break clinic setup.
    if (wasFirstSetup) {
      void this.announcePendingApproval(userId, result.clinicName).catch(
        () => undefined,
      );
    }

    return this.mapToDto(result as ProfileWithUser);
  }

  /**
   * A dentist saved their clinic for the FIRST time → onboarding is
   * complete and the (still-unapproved) account is ready for admin
   * review. Emit the domain event so the notifications subsystem fans out
   * the admin bell + "review & approve" email. We re-load the user to
   * confirm they're a dentist still awaiting approval, so editing a clinic
   * after approval (or an admin setting one up) never pings the team.
   */
  private async announcePendingApproval(
    userId: string,
    clinicName?: string | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        verificationStatus: true,
      },
    });
    if (!user) return;
    if (user.role !== UserRole.dentist) return;
    if (user.verificationStatus === VerificationStatus.approved) return;

    this.events.emit(NotificationEvents.DentistOnboardingCompleted, {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      clinicName: clinicName ?? null,
    });
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
      taxId: profile.taxId ?? undefined,
      description: profile.description ?? undefined,
      logoUrl: profile.logoUrl ?? undefined,
      specialty: profile.specialty ?? undefined,
      isListedPublicly: profile.isListedPublicly,
      userFullName: profile.user?.fullName,
      userAvatarUrl: profile.user?.avatarUrl ?? undefined,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  // ─── Public "Trouver un praticien" directory ──────────────────────────────

  /**
   * Public practitioner finder. Applies the strict public filter in the
   * repository, then — when the query carries lat/lng — ranks the whole
   * matching set by haversine distance ascending and paginates in memory
   * (distance ordering can't be pushed into Postgres without PostGIS). With
   * no coordinates it falls back to the DB's createdAt-desc pagination.
   */
  async getPublicList(
    query: PublicFinderQueryDto,
  ): Promise<PublicFinderResponseDto> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 24;

    const hasGeo =
      typeof query.lat === 'number' &&
      typeof query.lng === 'number' &&
      Number.isFinite(query.lat) &&
      Number.isFinite(query.lng);

    if (hasGeo) {
      const lat = query.lat as number;
      const lng = query.lng as number;

      // Fetch every matching row (no skip/take) so the distance sort ranks
      // the full set before we slice the requested page out of it.
      const { profiles, total } = await this.profileRepository.findPublic({
        city: query.city,
        specialty: query.specialty,
        search: query.search,
      });

      const ranked = profiles
        .map((p) => ({
          row: p,
          distanceKm: this.distanceKm(lat, lng, p.latitude, p.longitude),
        }))
        // Rows without coordinates sink to the bottom (Infinity), stable
        // enough for a directory — createdAt-desc already broke ties.
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const start = (page - 1) * limit;
      const data = ranked
        .slice(start, start + limit)
        .map(({ row, distanceKm }) =>
          this.mapToPublic(
            row,
            Number.isFinite(distanceKm)
              ? Math.round(distanceKm * 10) / 10
              : undefined,
          ),
        );

      return { data, total, page, limit };
    }

    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findPublic({
      skip,
      take: limit,
      city: query.city,
      specialty: query.specialty,
      search: query.search,
    });

    return {
      data: profiles.map((p) => this.mapToPublic(p)),
      total,
      page,
      limit,
    };
  }

  /**
   * Single publicly-listed practitioner + their weekly schedule. 404s (via
   * the repository returning null) when the profile fails the strict public
   * filter, so unapproved / unlisted / deleted profiles stay invisible.
   */
  async getPublicById(id: string): Promise<PublicDentistProfileDto> {
    const profile = await this.profileRepository.findPublicById(id);
    if (!profile) {
      throw new NotFoundException('Practitioner not found');
    }

    const dto = this.mapToPublic(profile);
    dto.workingHours = (profile.workingHours ?? []).map((wh) => ({
      dayOfWeek: wh.dayOfWeek,
      openTime: wh.openTime,
      closeTime: wh.closeTime,
      isClosed: wh.isClosed,
    }));
    return dto;
  }

  /**
   * Map an internal profile row to the PUBLIC-SAFE shape. Deliberately drops
   * every private field — taxId, clinicEmail, userId — so they can never
   * leak through the unauthenticated directory.
   */
  private mapToPublic(
    p: PublicProfileRow,
    distanceKm?: number,
  ): PublicDentistProfileDto {
    return {
      id: p.id,
      practitionerName: p.user?.fullName ?? '',
      clinicName: p.clinicName,
      specialty: p.specialty ?? null,
      clinicAddress: p.clinicAddress ?? null,
      city: p.city ?? null,
      country: p.country ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      clinicPhone: p.clinicPhone ?? null,
      description: p.description ?? null,
      logoUrl: p.logoUrl ?? null,
      avatarUrl: p.user?.avatarUrl ?? null,
      ...(distanceKm !== undefined ? { distanceKm } : {}),
    };
  }

  /**
   * Great-circle distance in km between two points. Returns +Infinity when
   * the target has no coordinates so it sorts last in the finder ranking.
   */
  private distanceKm(
    lat1: number,
    lng1: number,
    lat2: number | null,
    lng2: number | null,
  ): number {
    if (
      lat2 === null ||
      lng2 === null ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      return Number.POSITIVE_INFINITY;
    }
    const R = 6371; // Earth radius, km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
}
