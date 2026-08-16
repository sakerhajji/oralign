import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DentistProfile,
  DayOfWeek,
  Prisma,
  VerificationStatus,
} from '@prisma/client';

/** A public directory row: profile scalars + the safe user projection. */
export type PublicProfileRow = DentistProfile & {
  user: { fullName: string; avatarUrl: string | null } | null;
};

/** Same as PublicProfileRow but with the weekly schedule attached. */
export type PublicProfileWithHours = PublicProfileRow & {
  workingHours: {
    dayOfWeek: DayOfWeek;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
};

@Injectable()
export class DentistProfileRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    clinicName: string;
    clinicAddress?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    clinicPhone?: string;
    clinicEmail?: string;
    taxId?: string;
    description?: string;
    logoUrl?: string;
    specialty?: string;
    isListedPublicly?: boolean;
  }): Promise<DentistProfile> {
    return this.prisma.dentistProfile.create({ data });
  }

  async findById(id: string): Promise<DentistProfile | null> {
    return this.prisma.dentistProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findByUserId(userId: string): Promise<DentistProfile | null> {
    return this.prisma.dentistProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findAll(
    skip: number,
    take: number,
  ): Promise<{
    profiles: DentistProfile[];
    total: number;
  }> {
    const [profiles, total] = await Promise.all([
      this.prisma.dentistProfile.findMany({
        where: { deletedAt: null },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.dentistProfile.count({ where: { deletedAt: null } }),
    ]);

    return { profiles, total };
  }

  async findByCity(
    city: string,
    skip: number,
    take: number,
  ): Promise<{
    profiles: DentistProfile[];
    total: number;
  }> {
    const [profiles, total] = await Promise.all([
      this.prisma.dentistProfile.findMany({
        where: {
          city: { contains: city, mode: 'insensitive' },
          deletedAt: null,
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.dentistProfile.count({
        where: {
          city: { contains: city, mode: 'insensitive' },
          deletedAt: null,
        },
      }),
    ]);

    return { profiles, total };
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm: number,
    skip: number,
    take: number,
  ): Promise<{
    profiles: DentistProfile[];
    total: number;
  }> {
    // Simple bounding box query (replace with proper geo query if using PostGIS)
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

    const [profiles, total] = await Promise.all([
      this.prisma.dentistProfile.findMany({
        where: {
          AND: [
            {
              latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
            },
            {
              longitude: {
                gte: longitude - lonDelta,
                lte: longitude + lonDelta,
              },
            },
            { deletedAt: null },
          ],
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.dentistProfile.count({
        where: {
          AND: [
            {
              latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
            },
            {
              longitude: {
                gte: longitude - lonDelta,
                lte: longitude + lonDelta,
              },
            },
            { deletedAt: null },
          ],
        },
      }),
    ]);

    return { profiles, total };
  }

  // ─── Public "Trouver un praticien" directory ──────────────────────────────
  //
  // STRICT public filter applied to every read here — the same predicate the
  // list and single-profile endpoints share: the row must be undeleted, the
  // clinic must have opted in (isListedPublicly), and the owning user must be
  // an approved AND active account. Anything failing this is invisible.

  private publicWhere(query?: {
    city?: string;
    specialty?: string;
    search?: string;
  }): Prisma.DentistProfileWhereInput {
    const where: Prisma.DentistProfileWhereInput = {
      deletedAt: null,
      isListedPublicly: true,
      user: {
        verificationStatus: VerificationStatus.approved,
        isActive: true,
        // A soft-deleted dentist must vanish from the public directory
        // even though their profile row (config) is left untouched.
        deletedAt: null,
      },
    };

    if (query?.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query?.specialty) {
      where.specialty = { contains: query.specialty, mode: 'insensitive' };
    }
    if (query?.search) {
      where.OR = [
        { clinicName: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  /**
   * List publicly-listed practitioners matching the (optional) filters.
   * When `skip`/`take` are omitted every matching row is returned — the
   * service uses that path for the geo-distance ranking, which must sort the
   * whole result set in memory before paginating.
   */
  async findPublic(query: {
    skip?: number;
    take?: number;
    city?: string;
    specialty?: string;
    search?: string;
  }): Promise<{ profiles: PublicProfileRow[]; total: number }> {
    const where = this.publicWhere(query);

    const [profiles, total] = await Promise.all([
      this.prisma.dentistProfile.findMany({
        where,
        ...(query.skip !== undefined ? { skip: query.skip } : {}),
        ...(query.take !== undefined ? { take: query.take } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.dentistProfile.count({ where }),
    ]);

    return { profiles: profiles as PublicProfileRow[], total };
  }

  /**
   * Single publicly-listed practitioner by id, with the weekly schedule.
   * Returns null when the row exists but fails the strict public filter, so
   * the service can 404 without leaking whether the profile exists at all.
   */
  async findPublicById(id: string): Promise<PublicProfileWithHours | null> {
    const profile = await this.prisma.dentistProfile.findFirst({
      where: { ...this.publicWhere(), id },
      include: {
        user: { select: { fullName: true, avatarUrl: true } },
        workingHours: {
          select: {
            dayOfWeek: true,
            openTime: true,
            closeTime: true,
            isClosed: true,
          },
        },
      },
    });

    return profile as PublicProfileWithHours | null;
  }

  async update(
    id: string,
    data: Partial<{
      clinicName: string;
      clinicAddress?: string;
      city?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      clinicPhone?: string;
      clinicEmail?: string;
      taxId?: string;
      description?: string;
      logoUrl?: string;
      specialty?: string;
      isListedPublicly?: boolean;
    }>,
  ): Promise<DentistProfile> {
    return this.prisma.dentistProfile.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<DentistProfile> {
    return this.prisma.dentistProfile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
