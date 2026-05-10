import { Injectable } from '@nestjs/common';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '../../common/exceptions/app.exception';
import { DentistProfileRepository } from '../repositories/dentist-profile.repository';
import {
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  DentistProfileResponseDto,
} from '../dto/dentist-profile.dto';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { UserRole } from '@prisma/client';

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
  constructor(private profileRepository: DentistProfileRepository) {}

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

    return this.mapToDto(profile as ProfileWithUser);
  }

  async getProfileById(id: string): Promise<DentistProfileResponseDto> {
    const profile = await this.profileRepository.findById(id);

    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    return this.mapToDto(profile as ProfileWithUser);
  }

  async getProfileByUserId(userId: string): Promise<DentistProfileResponseDto> {
    const profile = await this.profileRepository.findByUserId(userId);

    if (!profile || profile.deletedAt) {
      throw new NotFoundException('Dentist profile not found');
    }

    return this.mapToDto(profile as ProfileWithUser);
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
    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findByCity(
      city,
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

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm = 5,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResponse<DentistProfileResponseDto>> {
    const skip = (page - 1) * limit;
    const { profiles, total } = await this.profileRepository.findNearby(
      latitude,
      longitude,
      radiusKm,
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

    return { message: 'Dentist profile deleted successfully' };
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
