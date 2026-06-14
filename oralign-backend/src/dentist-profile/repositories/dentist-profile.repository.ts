import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DentistProfile } from '@prisma/client';

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
