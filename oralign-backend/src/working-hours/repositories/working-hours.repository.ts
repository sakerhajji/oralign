import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkingHours, DayOfWeek } from '@prisma/client';

@Injectable()
export class WorkingHoursRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    dentistProfileId: string;
    dayOfWeek: DayOfWeek;
    openTime: string;
    closeTime: string;
    isClosed?: boolean;
  }): Promise<WorkingHours> {
    return this.prisma.workingHours.create({ data });
  }

  async findById(id: string): Promise<WorkingHours | null> {
    return this.prisma.workingHours.findUnique({ where: { id } });
  }

  async findByDentistProfile(
    dentistProfileId: string,
  ): Promise<WorkingHours[]> {
    return this.prisma.workingHours.findMany({
      where: { dentistProfileId },
      orderBy: {
        dayOfWeek: 'asc',
      },
    });
  }

  async findByDentistProfileAndDay(
    dentistProfileId: string,
    dayOfWeek: DayOfWeek,
  ): Promise<WorkingHours | null> {
    return this.prisma.workingHours.findUnique({
      where: {
        dentistProfileId_dayOfWeek: {
          dentistProfileId,
          dayOfWeek,
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      openTime?: string;
      closeTime?: string;
      isClosed?: boolean;
    },
  ): Promise<WorkingHours> {
    return this.prisma.workingHours.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<WorkingHours> {
    return this.prisma.workingHours.delete({ where: { id } });
  }

  async deleteByDentistProfile(
    dentistProfileId: string,
  ): Promise<{ count: number }> {
    return this.prisma.workingHours.deleteMany({
      where: { dentistProfileId },
    });
  }
}
