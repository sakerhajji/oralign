import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  BadRequestException,
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

    // ── Per-doctor duplicate guard ─────────────────────────────────
    // This is a healthcare platform: every doctor maintains their own
    // patient list, and the same human can legitimately exist for
    // multiple doctors at the same clinic. So the check is *scoped to
    // the target doctorId*, never global — Doctor B can register a
    // patient that Doctor A already has; only the SAME doctor is
    // blocked from creating two records that point at the same person.
    //
    // The match key is fullName (case-insensitive) AND — when the
    // client provided either — phone OR dateOfBirth. That avoids
    // bouncing legitimate name-collisions (siblings, common names)
    // while still catching the "I forgot I already added them" case
    // that motivated this guard.
    const dedupeMatches = await this.findPotentialDuplicates({
      doctorId,
      fullName: createPatientDto.fullName,
      phone: createPatientDto.phone ?? null,
      dateOfBirth: createPatientDto.dateOfBirth ?? null,
    });
    if (dedupeMatches.length > 0) {
      const existing = dedupeMatches[0]!;
      throw new BadRequestException(
        `You already have a patient named "${existing.fullName}" in your list` +
          (existing.phone ? ` (phone ${existing.phone})` : '') +
          '. Open that record instead of creating a new one.',
      );
    }

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
        // Default to empty array when the client omits the field so we
        // never produce a row with NULL in a NOT NULL TEXT[] column.
        clinicalConditions: createPatientDto.clinicalConditions ?? [],
        clinicalConditionsOther: createPatientDto.clinicalConditionsOther,
      },
      include: this.includeDoctor,
    });

    return this.mapToDto(patient);
  }

  /**
   * Look for non-deleted patients in the target doctor's list that
   * share the same fullName (case-insensitive). When the new record
   * carries a phone or date-of-birth we also require those to match —
   * so we catch the "same person, same doctor" case without bouncing
   * the "doctor has two unrelated patients with the same first/last
   * name" case (siblings, common names).
   */
  private async findPotentialDuplicates(args: {
    doctorId: string;
    fullName: string;
    phone: string | null;
    dateOfBirth: Date | string | null;
  }) {
    const trimmedName = args.fullName.trim();
    if (!trimmedName) return [];
    const where: Prisma.PatientWhereInput = {
      doctorId: args.doctorId,
      deletedAt: null,
      fullName: { equals: trimmedName, mode: 'insensitive' },
    };
    // Only narrow when the client *gave* us the disambiguator —
    // requiring a NULL match would force callers to send a phone even
    // when they don't have one, which is hostile UX.
    if (args.phone && args.phone.trim()) {
      where.phone = args.phone.trim();
    } else if (args.dateOfBirth) {
      where.dateOfBirth = new Date(args.dateOfBirth);
    }
    return this.prisma.patient.findMany({
      where,
      select: { id: true, fullName: true, phone: true },
      take: 1,
    });
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

    // Sort whitelist already enforced by the DTO enum — Prisma will
    // throw on any unexpected key, but the runtime validation is the
    // real safety net.
    const sortField = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.PatientOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take,
        orderBy,
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
        // Only overwrite when the client actually sent the field —
        // PATCH semantics. Sending an empty array MUST clear the list,
        // so we distinguish "field omitted" (undefined) from "sent as
        // []" (clear), which is the natural Prisma update behaviour.
        clinicalConditions: updatePatientDto.clinicalConditions,
        clinicalConditionsOther: updatePatientDto.clinicalConditionsOther,
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

  /**
   * Permanently remove a patient (hard delete). Admin-only.
   *
   * Refuses when the patient still has ANY order: `DentalOrder.patientId`
   * cascades on delete, so purging a patient with orders would silently
   * wipe their clinical orders AND orphan the (potentially GB-sized)
   * uploaded files on disk. We require the admin to permanently delete
   * those orders first (that path cleans the disk blobs), then the
   * patient row can be removed safely.
   */
  async permanentDeletePatient(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanPermanentDelete(caller);

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: { id: true, _count: { select: { orders: true } } },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (patient._count.orders > 0) {
      throw new BadRequestException(
        'This patient still has orders. Permanently delete the patient’s orders first, then delete the patient.',
      );
    }

    await this.prisma.patient.delete({ where: { id } });
    return { message: 'Patient permanently deleted successfully' };
  }

  /** Admin-only gate for irreversible (hard) deletes. */
  private ensureCanPermanentDelete(caller: Caller): void {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can permanently delete patients',
      );
    }
  }

  /**
   * Soft-delete multiple patients in parallel.
   * Patients the caller cannot access are silently skipped —
   * the count in the response reflects only those successfully deleted.
   */
  async bulkDeletePatients(
    ids: string[],
    caller: Caller,
  ): Promise<{ message: string; deleted: number }> {
    this.ensureCanManagePatients(caller);

    const results = await Promise.allSettled(
      ids.map((id) => this.deletePatient(id, caller)),
    );

    const deleted = results.filter((r) => r.status === 'fulfilled').length;
    return {
      message: `${deleted} patient(s) deleted successfully`,
      deleted,
    };
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

    if (filters.gender) {
      where.gender = filters.gender;
    }

    // Inclusive [from, to] range on createdAt. Strings come straight
    // from the client (ISO 8601) — `new Date(str)` honours the timezone
    // suffix if present, otherwise treats the string as local. We pass
    // through invalid dates as `undefined` so a malformed query param
    // doesn't crash the request — at worst it widens the result set.
    const createdRange: Prisma.DateTimeFilter = {};
    if (filters.createdFrom) {
      const d = new Date(filters.createdFrom);
      if (!Number.isNaN(d.getTime())) createdRange.gte = d;
    }
    if (filters.createdTo) {
      const d = new Date(filters.createdTo);
      if (!Number.isNaN(d.getTime())) {
        // End-of-day so "to Sep 30" includes anything created that
        // calendar date in UTC.
        d.setUTCHours(23, 59, 59, 999);
        createdRange.lte = d;
      }
    }
    if (createdRange.gte || createdRange.lte) {
      where.createdAt = createdRange;
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
        ...(ADMIN_ROLES.includes(caller.role)
          ? {}
          : { doctorId: caller.userId }),
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
    // Cast `patient` to a wider shape because the Prisma client we
    // currently have generated still predates the
    // `clinicalConditions` + `clinicalConditionsOther` columns. After
    // `prisma generate` the cast becomes a no-op; the cast lets the
    // service compile against the new schema without forcing a
    // generate step in every developer's editor first.
    const p = patient as PatientWithDoctor & {
      clinicalConditions?: string[];
      clinicalConditionsOther?: string | null;
    };
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
      clinicalConditions: p.clinicalConditions ?? [],
      clinicalConditionsOther: p.clinicalConditionsOther ?? undefined,
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
