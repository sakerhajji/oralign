import { Injectable } from '@nestjs/common';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '../../common/exceptions/app.exception';
import { WorkingHoursRepository } from '../repositories/working-hours.repository';
import {
  CreateWorkingHoursDto,
  UpdateWorkingHoursDto,
  WorkingHoursResponseDto,
} from '../dto/working-hours.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, WorkingHours } from '@prisma/client';

type Caller = { userId: string; role: string };

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];

@Injectable()
export class WorkingHoursService {
  constructor(
    private readonly workingHoursRepository: WorkingHoursRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createWorkingHours(
    dentistProfileId: string,
    createWorkingHoursDto: CreateWorkingHoursDto,
  ): Promise<WorkingHoursResponseDto> {
    this.validateTimeFormat(createWorkingHoursDto.openTime);
    this.validateTimeFormat(createWorkingHoursDto.closeTime);

    if (!createWorkingHoursDto.isClosed) {
      if (createWorkingHoursDto.openTime >= createWorkingHoursDto.closeTime) {
        throw new BadRequestException('Open time must be before close time');
      }
    }

    const workingHours = await this.workingHoursRepository.create({
      dentistProfileId,
      dayOfWeek: createWorkingHoursDto.dayOfWeek,
      openTime: createWorkingHoursDto.openTime,
      closeTime: createWorkingHoursDto.closeTime,
      isClosed: createWorkingHoursDto.isClosed || false,
    });

    return this.mapToDto(workingHours);
  }

  async getWorkingHoursById(id: string): Promise<WorkingHoursResponseDto> {
    const workingHours = await this.workingHoursRepository.findById(id);

    if (!workingHours) {
      throw new NotFoundException('Working hours not found');
    }

    return this.mapToDto(workingHours);
  }

  async getWorkingHoursByDentistProfile(
    dentistProfileId: string,
  ): Promise<WorkingHoursResponseDto[]> {
    const workingHours =
      await this.workingHoursRepository.findByDentistProfile(dentistProfileId);

    return workingHours.map((hours) => this.mapToDto(hours));
  }

  async updateWorkingHours(
    id: string,
    updateWorkingHoursDto: UpdateWorkingHoursDto,
    caller: Caller,
  ): Promise<WorkingHoursResponseDto> {
    const workingHours = await this.workingHoursRepository.findById(id);

    if (!workingHours) {
      throw new NotFoundException('Working hours not found');
    }

    await this.assertOwnership(workingHours.dentistProfileId, caller);

    if (updateWorkingHoursDto.openTime) {
      this.validateTimeFormat(updateWorkingHoursDto.openTime);
    }
    if (updateWorkingHoursDto.closeTime) {
      this.validateTimeFormat(updateWorkingHoursDto.closeTime);
    }

    const openTime = updateWorkingHoursDto.openTime || workingHours.openTime;
    const closeTime = updateWorkingHoursDto.closeTime || workingHours.closeTime;
    const isClosed =
      updateWorkingHoursDto.isClosed !== undefined
        ? updateWorkingHoursDto.isClosed
        : workingHours.isClosed;

    if (!isClosed && openTime >= closeTime) {
      throw new BadRequestException('Open time must be before close time');
    }

    const updatedWorkingHours = await this.workingHoursRepository.update(id, {
      openTime: updateWorkingHoursDto.openTime,
      closeTime: updateWorkingHoursDto.closeTime,
      isClosed: updateWorkingHoursDto.isClosed,
    });

    return this.mapToDto(updatedWorkingHours);
  }

  async deleteWorkingHours(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    const workingHours = await this.workingHoursRepository.findById(id);

    if (!workingHours) {
      throw new NotFoundException('Working hours not found');
    }

    await this.assertOwnership(workingHours.dentistProfileId, caller);

    await this.workingHoursRepository.delete(id);

    return { message: 'Working hours deleted successfully' };
  }

  private async assertOwnership(
    dentistProfileId: string,
    caller: Caller,
  ): Promise<void> {
    if (ADMIN_ROLES.includes(caller.role)) return;

    const profile = await this.prisma.dentistProfile.findUnique({
      where: { id: dentistProfileId },
      select: { userId: true },
    });

    if (!profile || profile.userId !== caller.userId) {
      throw new ForbiddenException(
        'You can only modify your own working hours',
      );
    }
  }

  private validateTimeFormat(time: string): void {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      throw new BadRequestException('Time must be in HH:mm format (24-hour)');
    }
  }

  private mapToDto(workingHours: WorkingHours): WorkingHoursResponseDto {
    return {
      id: workingHours.id,
      dentistProfileId: workingHours.dentistProfileId,
      dayOfWeek: workingHours.dayOfWeek,
      openTime: workingHours.openTime,
      closeTime: workingHours.closeTime,
      isClosed: workingHours.isClosed,
      createdAt: workingHours.createdAt,
      updatedAt: workingHours.updatedAt,
    };
  }
}
