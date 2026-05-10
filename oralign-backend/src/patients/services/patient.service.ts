import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePatientDto,
  PatientFilterDto,
  PatientResponseDto,
  UpdatePatientDto,
} from '../dto/patient.dto';

type Caller = { userId: string; role: UserRole | string };

type PatientWithDoctor = Prisma.PatientGetPayload<{
  include: {
    doctor: {
      select: {
        id: true;
        fullName: true;
        email: true;
      };
    };
  };
}>;

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];

@Injectable()
export class PatientService {
  constructor(private readonly prisma: PrismaService) {}

  async createPatient(
    createPatientDto: CreatePatientDto,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? createPatientDto.doctorId
      : caller.userId;

    if (!doctorId) {
      throw new NotFoundException('Dentist not found');
    }

    await this.ensureDentistExists(doctorId);

    const patient = await this.prisma.patient.create({
      data: {
        doctorId,
        fullName: createPatientDto.fullName,
        email: createPatientDto.email,
        phone: createPatientDto.phone,
        gender: createPatientDto.gender,
        dateOfBirth: createPatientDto.dateOfBirth,
        address: createPatientDto.address,
        notes: createPatientDto.notes,
      },
      include: this.includeDoctor,
    });

    return this.mapToDto(patient);
  }

  async getPatients(
    page = 1,
    limit = 10,
    filters: PatientFilterDto,
    caller: Caller,
  ): Promise<PaginatedResponse<PatientResponseDto>> {
    this.ensureCanManagePatients(caller);

    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;
    const where = this.buildWhere(filters, caller);

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: this.includeDoctor,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return new PaginatedResponse(
      patients.map((patient) => this.mapToDto(patient)),
      total,
      currentPage,
      take,
      Math.ceil(total / take),
    );
  }

  async getPatientById(
    id: string,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);

    const patient = await this.findAccessiblePatient(id, caller);
    return this.mapToDto(patient);
  }

  async updatePatient(
    id: string,
    updatePatientDto: UpdatePatientDto,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);
    await this.findAccessiblePatient(id, caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? updatePatientDto.doctorId
      : undefined;

    if (doctorId) {
      await this.ensureDentistExists(doctorId);
    }

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        fullName: updatePatientDto.fullName,
        email: updatePatientDto.email,
        phone: updatePatientDto.phone,
        gender: updatePatientDto.gender,
        dateOfBirth: updatePatientDto.dateOfBirth,
        address: updatePatientDto.address,
        notes: updatePatientDto.notes,
        doctorId,
      },
      include: this.includeDoctor,
    });

    return this.mapToDto(patient);
  }

  async deletePatient(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanManagePatients(caller);
    await this.findAccessiblePatient(id, caller);

    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Patient deleted successfully' };
  }

  private readonly includeDoctor = {
    doctor: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    },
  } as const;

  private buildWhere(
    filters: PatientFilterDto,
    caller: Caller,
  ): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = { deletedAt: null };

    if (ADMIN_ROLES.includes(caller.role)) {
      if (filters.doctorId) {
        where.doctorId = filters.doctorId;
      }
    } else {
      where.doctorId = caller.userId;
    }

    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async findAccessiblePatient(
    id: string,
    caller: Caller,
  ): Promise<PatientWithDoctor> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(ADMIN_ROLES.includes(caller.role) ? {} : { doctorId: caller.userId }),
      },
      include: this.includeDoctor,
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private ensureCanManagePatients(caller: Caller): void {
    if (caller.role === UserRole.designer) {
      throw new ForbiddenException('Designers cannot manage patients directly');
    }

    if (
      caller.role !== UserRole.dentist &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException('You cannot manage patients');
    }
  }

  private async ensureDentistExists(doctorId: string): Promise<void> {
    const dentist = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        role: UserRole.dentist,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!dentist) {
      throw new NotFoundException('Dentist not found');
    }
  }

  private mapToDto(patient: PatientWithDoctor): PatientResponseDto {
    return {
      id: patient.id,
      doctorId: patient.doctorId,
      fullName: patient.fullName,
      email: patient.email ?? undefined,
      phone: patient.phone ?? undefined,
      gender: patient.gender ?? undefined,
      dateOfBirth: patient.dateOfBirth ?? undefined,
      address: patient.address ?? undefined,
      notes: patient.notes ?? undefined,
      doctor: patient.doctor
        ? {
            id: patient.doctor.id,
            fullName: patient.doctor.fullName,
            email: patient.doctor.email,
          }
        : undefined,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }
}
