import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
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
import { TTL, whKey } from '../../common/cache/cache-keys';

type Caller = { userId: string; role: string };

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];

@Injectable()
export class WorkingHoursService {
  private readonly logger = new Logger(WorkingHoursService.name);

  constructor(
    private readonly workingHoursRepository: WorkingHoursRepository,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
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

    await this.invalidate(dentistProfileId, workingHours.id);

    return this.mapToDto(workingHours);
  }

  async getWorkingHoursById(id: string): Promise<WorkingHoursResponseDto> {
    const key = whKey.byId(id);
    const cached = await this.safeGet<WorkingHoursResponseDto>(key);
    if (cached) return cached;

    const workingHours = await this.workingHoursRepository.findById(id);
    if (!workingHours) {
      throw new NotFoundException('Working hours not found');
    }

    const dto = this.mapToDto(workingHours);
    await this.safeSet(key, dto, TTL.cold);
    return dto;
  }

  async getWorkingHoursByDentistProfile(
    dentistProfileId: string,
  ): Promise<WorkingHoursResponseDto[]> {
    const key = whKey.byProfile(dentistProfileId);
    const cached = await this.safeGet<WorkingHoursResponseDto[]>(key);
    if (cached) return cached;

    const workingHours =
      await this.workingHoursRepository.findByDentistProfile(dentistProfileId);

    const dtos = workingHours.map((hours) => this.mapToDto(hours));
    // Cold cache — working hours change a handful of times per year at most.
    await this.safeSet(key, dtos, TTL.cold);
    return dtos;
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

    await this.invalidate(workingHours.dentistProfileId, id);

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
    await this.invalidate(workingHours.dentistProfileId, id);

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

  private async invalidate(
    dentistProfileId: string,
    id: string,
  ): Promise<void> {
    await Promise.all([
      this.safeDel(whKey.byProfile(dentistProfileId)),
      this.safeDel(whKey.byId(id)),
    ]);
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

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
