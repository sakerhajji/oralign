import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePatientDto,
  PatientFilterDto,
  PatientListItemDto,
  PatientOrderState,
  PatientResponseDto,
  UpdatePatientDto,
} from '../dto/patient.dto';
import { isAdmin, type Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { assertNoDependents } from '../../common/deletion/deletion-blocked';
import { INACTIVE_ORDER_STATUSES } from '../../orders/order-status-groups';

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

// Module level (not only a class field) so the list include below can
// extend it.
const INCLUDE_DOCTOR = {
  doctor: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

/**
 * A row of the patients list: the dentist, plus how many orders the caller
 * can see for the patient and the newest of them (createdAt then id, so two
 * orders created in the same instant always resolve the same way). Read by
 * the page query itself, like USER_INCLUDE in the users repository: no
 * extra query per patient.
 */
function listInclude(orderScope: Prisma.DentalOrderWhereInput) {
  return {
    ...INCLUDE_DOCTOR,
    _count: { select: { orders: { where: orderScope } } },
    orders: {
      where: orderScope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1,
      select: { id: true, orderCode: true, status: true, createdAt: true },
    },
  } satisfies Prisma.PatientInclude;
}

type PatientListRow = Prisma.PatientGetPayload<{
  include: ReturnType<typeof listInclude>;
}>;

@Injectable()
export class PatientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
  ) {}

  async createPatient(
    createPatientDto: CreatePatientDto,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);

    const doctorId = isAdmin(caller)
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
      const existing = dedupeMatches[0];
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
  ): Promise<PaginatedResponse<PatientListItemDto>> {
    this.ensureCanManagePatients(caller);

    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;
    // One set of orders behind every order-derived part of the list (the
    // count, the latest order, the orderState filter, the order-code
    // search), so the columns and the filters can never disagree.
    const orderScope = this.liveOrderScope(caller);
    const where = this.buildWhere(filters, caller, orderScope);

    // Sort whitelist already enforced by the DTO enum — Prisma will
    // throw on any unexpected key, but the runtime validation is the
    // real safety net. The id tie-breaker keeps pages stable when rows
    // share the sort value (same name, same creation instant): without
    // it a row could show on two pages, or on none.
    const sortField = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.PatientOrderByWithRelationInput[] = [
      { [sortField]: sortOrder },
      { id: sortOrder },
    ];

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take,
        orderBy,
        include: listInclude(orderScope),
      }),
      this.prisma.patient.count({ where }),
    ]);

    return new PaginatedResponse(
      patients.map((patient) => this.mapToListItem(patient)),
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

  async updateProfilePhoto(
    id: string,
    profilePhotoUrl: string,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);
    await this.findAccessiblePatient(id, caller);

    const patient = await this.prisma.patient.update({
      where: { id },
      // The checked-in generated Prisma client can lag behind the schema in
      // a local install. Docker regenerates it from schema.prisma at build
      // time; this cast keeps the service source compatible in both cases.
      data: { profilePhotoUrl } as unknown as Prisma.PatientUpdateInput,
      include: this.includeDoctor,
    });

    return this.mapToDto(patient as PatientWithDoctor);
  }

  async updatePatient(
    id: string,
    updatePatientDto: UpdatePatientDto,
    caller: Caller,
  ): Promise<PatientResponseDto> {
    this.ensureCanManagePatients(caller);
    await this.findAccessiblePatient(id, caller);

    const doctorId = isAdmin(caller) ? updatePatientDto.doctorId : undefined;

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

  /**
   * Soft delete (archive). Refused with 409 while the patient still has
   * LIVE orders — an order must not point at a patient the doctor can no
   * longer see; archive the orders first (or let the admin do it). Orders
   * already in the trash do not block. Restore is always possible.
   */
  async deletePatient(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanManagePatients(caller);
    await this.findAccessiblePatient(id, caller);

    const liveOrders = await this.prisma.dentalOrder.count({
      where: { patientId: id, deletedAt: null },
    });
    if (liveOrders > 0) {
      throw new ConflictException(
        `This patient still has ${liveOrders} active order(s). Archive those orders first, then archive the patient.`,
        'PATIENT_HAS_ACTIVE_ORDERS',
      );
    }

    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Patient deleted successfully' };
  }

  /** Bring a soft-deleted patient back. Idempotent on a live patient. */
  async restorePatient(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanManagePatients(caller);
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        ...(isAdmin(caller) ? {} : { doctorId: caller.userId }),
      },
      select: { id: true, deletedAt: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.deletedAt === null) {
      return { message: 'Patient is already active' };
    }
    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { message: 'Patient restored successfully' };
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
      select: {
        id: true,
        deletedAt: true,
        _count: { select: { orders: true } },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    // Trash-first: a live patient is never purged directly.
    if (patient.deletedAt === null) {
      throw new BadRequestException(
        'Archive the patient first; only archived patients can be permanently deleted.',
        'NOT_ARCHIVED',
      );
    }
    // Any order — live or archived — is clinical/financial history and
    // blocks the purge (409). The DB has onDelete: Restrict as backstop.
    assertNoDependents('This patient', [
      { label: 'orders', count: patient._count.orders },
    ]);

    await this.prisma.patient.delete({ where: { id } });
    return { message: 'Patient permanently deleted successfully' };
  }

  /** Admin-only gate for irreversible (hard) deletes. */
  private ensureCanPermanentDelete(caller: Caller): void {
    if (!isAdmin(caller)) {
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
  ): Promise<{ message: string; deleted: number; blocked: number }> {
    this.ensureCanManagePatients(caller);

    const results = await Promise.allSettled(
      ids.map((id) => this.deletePatient(id, caller)),
    );

    const deleted = results.filter((r) => r.status === 'fulfilled').length;
    const blocked = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
    ).length;
    return {
      message:
        blocked > 0
          ? `${deleted} patient(s) deleted, ${blocked} kept because they still have active orders`
          : `${deleted} patient(s) deleted successfully`,
      deleted,
      blocked,
    };
  }

  private readonly includeDoctor = INCLUDE_DOCTOR;

  /**
   * The orders the list reads for each patient: those the caller may see
   * (OrderAccessPolicy, the one order rule: own orders for a dentist,
   * every order for an admin), archived ones excluded.
   */
  private liveOrderScope(caller: Caller): Prisma.DentalOrderWhereInput {
    return { ...this.orderAccess.scope(caller), deletedAt: null };
  }

  private buildWhere(
    filters: PatientFilterDto,
    caller: Caller,
    orderScope: Prisma.DentalOrderWhereInput,
  ): Prisma.PatientWhereInput {
    // Trash-bin view: admin opted in via includeDeleted=true → ONLY
    // soft-deleted rows. Everyone else always sees the live set.
    const showOnlyDeleted = isAdmin(caller) && filters.includeDeleted === true;
    const where: Prisma.PatientWhereInput = showOnlyDeleted
      ? { deletedAt: { not: null } }
      : { deletedAt: null };

    if (isAdmin(caller)) {
      if (filters.doctorId) {
        where.doctorId = filters.doctorId;
      }
    } else {
      where.doctorId = caller.userId;
    }

    // Conditions carrying their own OR or their own `orders` filter go in
    // an AND list, so the search and the order filter can never overwrite
    // each other, nor anything else set on `where`.
    const and: Prisma.PatientWhereInput[] = [];

    const search = filters.search?.trim();
    if (search) {
      and.push({ OR: this.searchConditions(search, orderScope) });
    }

    if (filters.gender) {
      where.gender = filters.gender;
    }

    if (filters.orderState === PatientOrderState.ACTIVE) {
      and.push({
        orders: {
          some: {
            ...orderScope,
            status: { notIn: [...INACTIVE_ORDER_STATUSES] },
          },
        },
      });
    } else if (filters.orderState === PatientOrderState.NONE) {
      and.push({ orders: { none: orderScope } });
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

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  /**
   * Free-text search: name and e-mail (case-insensitive substring), the
   * phone, and the codes of the patient's orders. Phones are stored E.164
   * without separators ("+21650339214"), so the term is matched with its
   * spaces, dots, dashes and parentheses stripped ("50 339 214" finds it),
   * and only when it holds a digit: a name never needs the phone column
   * (the rule of UserRepository.searchConditions). Order codes are matched
   * within the caller's order scope: a patient is never found through an
   * order the caller cannot open.
   */
  private searchConditions(
    term: string,
    orderScope: Prisma.DentalOrderWhereInput,
  ): Prisma.PatientWhereInput[] {
    const conditions: Prisma.PatientWhereInput[] = [
      { fullName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      {
        orders: {
          some: {
            ...orderScope,
            orderCode: { contains: term, mode: 'insensitive' },
          },
        },
      },
    ];
    const phone = term.replace(/[\s().-]/g, '');
    if (/\d/.test(phone)) conditions.push({ phone: { contains: phone } });
    return conditions;
  }

  private async findAccessiblePatient(
    id: string,
    caller: Caller,
  ): Promise<PatientWithDoctor> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(isAdmin(caller) ? {} : { doctorId: caller.userId }),
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

    if (caller.role !== UserRole.dentist && !isAdmin(caller)) {
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
      profilePhotoUrl?: string | null;
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
      profilePhotoUrl: p.profilePhotoUrl ?? undefined,
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
      deletedAt: patient.deletedAt,
    };
  }

  private mapToListItem(patient: PatientListRow): PatientListItemDto {
    const latest = patient.orders.at(0);
    return {
      ...this.mapToDto(patient),
      ordersCount: patient._count.orders,
      latestOrder: latest
        ? {
            id: latest.id,
            orderCode: latest.orderCode,
            status: latest.status,
            createdAt: latest.createdAt,
          }
        : null,
    };
  }
}
