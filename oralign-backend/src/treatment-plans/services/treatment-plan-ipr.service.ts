import { Injectable } from '@nestjs/common';
import { Prisma, TreatmentPlanIpr, UserRole } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertTreatmentPlanIprDto } from '../dto/treatment-plan-ipr.dto';

type Caller = { userId: string; role: UserRole };

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];
const PLANNER_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

/**
 * Service for the new `TreatmentPlanIpr` table — IPR / stripping
 * entries lifted out of OrderToothInstruction so the order odontogram
 * and the treatment odontogram own genuinely independent data.
 *
 * All writes flow through `prisma.treatmentPlanIpr.upsert` keyed on
 * (treatmentPlanId, fromTooth, toTooth), so saving the same contact
 * twice is idempotent. P2002 unique-constraint races are structurally
 * impossible — there's nothing to race against because the conflict
 * resolution is built into the database operation.
 */
@Injectable()
export class TreatmentPlanIprService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Auth helpers ────────────────────────────────────────────────────────

  private isAdmin(caller: Caller): boolean {
    return ADMIN_ROLES.includes(caller.role);
  }

  private isPlanner(caller: Caller): boolean {
    return PLANNER_ROLES.includes(caller.role);
  }

  /**
   * Load a TreatmentPlan with the minimum order context needed for
   * authorization, throwing the same error shape the rest of the
   * domain uses.
   */
  private async loadPlanForAuth(treatmentPlanId: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: {
        id: true,
        deletedAt: true,
        orderId: true,
        order: {
          select: {
            doctorId: true,
            assignedDesignerId: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException('Treatment plan not found.');
    }
    return plan;
  }

  /**
   * Read access — anyone who can read the parent order. Used by `list`.
   */
  private async assertReadable(
    treatmentPlanId: string,
    caller: Caller,
  ): Promise<{ id: string; orderId: string }> {
    const plan = await this.loadPlanForAuth(treatmentPlanId);
    if (this.isAdmin(caller)) return plan;
    if (
      caller.role === UserRole.dentist &&
      plan.order.doctorId === caller.userId
    ) {
      return plan;
    }
    if (
      caller.role === UserRole.designer &&
      plan.order.assignedDesignerId === caller.userId
    ) {
      return plan;
    }
    throw new ForbiddenException('You cannot access this treatment plan.');
  }

  /**
   * Write access — admin, super_admin, or the designer assigned to the
   * parent order. Doctors do NOT edit IPR — that's a planner job.
   */
  private async assertWritable(
    treatmentPlanId: string,
    caller: Caller,
  ): Promise<{ id: string; orderId: string }> {
    const plan = await this.loadPlanForAuth(treatmentPlanId);
    if (this.isAdmin(caller)) return plan;
    if (
      caller.role === UserRole.designer &&
      plan.order.assignedDesignerId === caller.userId
    ) {
      return plan;
    }
    throw new ForbiddenException(
      'Only admins or the assigned designer can edit IPR / stripping on this plan.',
    );
  }

  /**
   * Validate / normalize a (fromTooth, toTooth) pair coming from the
   * client. Returns the pair as-supplied so the caller is in control
   * of the canonical ordering — IPR slots are always rendered with a
   * specific "from" on the left and "to" on the right matching the
   * arch's natural reading order.
   */
  private normalizeContact(
    dto: Pick<UpsertTreatmentPlanIprDto, 'fromTooth' | 'toTooth'>,
  ): { fromTooth: number; toTooth: number } {
    const { fromTooth, toTooth } = dto;
    if (fromTooth === toTooth) {
      throw new BadRequestException(
        'IPR contacts must be between two DIFFERENT teeth.',
      );
    }
    // FDI sanity — the DTO already clamps to 11..48, but we don't
    // allow obviously non-adjacent pairs to slip in. Adjacency is
    // a soft check (legal contacts are within the same arch half
    // OR the two midline pairs 11↔21 and 31↔41).
    const inSameHalf = (a: number, b: number): boolean => {
      const half = (n: number) => Math.floor(n / 10);
      return half(a) === half(b) && Math.abs(a - b) === 1;
    };
    const isMidline = (a: number, b: number): boolean => {
      const pair = [a, b].sort((x, y) => x - y).join('-');
      return pair === '11-21' || pair === '31-41';
    };
    if (!inSameHalf(fromTooth, toTooth) && !isMidline(fromTooth, toTooth)) {
      throw new BadRequestException(
        `IPR contact ${fromTooth}–${toTooth} isn't between adjacent teeth.`,
      );
    }
    return { fromTooth, toTooth };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * List every IPR entry on the plan, sorted by fromTooth/toTooth for
   * stable iteration on the front-end (the odontogram renders these in
   * arch order, so a stable sort avoids re-render churn).
   */
  async list(
    treatmentPlanId: string,
    caller: Caller,
  ): Promise<TreatmentPlanIpr[]> {
    await this.assertReadable(treatmentPlanId, caller);
    return this.prisma.treatmentPlanIpr.findMany({
      where: { treatmentPlanId },
      orderBy: [{ fromTooth: 'asc' }, { toTooth: 'asc' }],
    });
  }

  /**
   * Idempotent write — create the contact if it doesn't exist, update
   * its value/note otherwise. Re-saving the same contact carries no
   * risk of P2002 because the upsert resolves the conflict atomically
   * inside Postgres.
   */
  async upsert(
    treatmentPlanId: string,
    dto: UpsertTreatmentPlanIprDto,
    caller: Caller,
  ): Promise<TreatmentPlanIpr> {
    if (!this.isPlanner(caller)) {
      throw new ForbiddenException(
        'Only planners can edit IPR / stripping entries.',
      );
    }
    await this.assertWritable(treatmentPlanId, caller);
    const { fromTooth, toTooth } = this.normalizeContact(dto);

    const trimmedValue = dto.value?.trim() ?? '';
    if (!trimmedValue) {
      throw new BadRequestException(
        'IPR value (mm) is required. To clear a contact, use DELETE instead.',
      );
    }
    const note = dto.note?.trim();

    return this.prisma.treatmentPlanIpr.upsert({
      where: {
        treatmentPlanId_fromTooth_toTooth: {
          treatmentPlanId,
          fromTooth,
          toTooth,
        },
      },
      create: {
        treatmentPlanId,
        fromTooth,
        toTooth,
        value: trimmedValue,
        note: note && note.length > 0 ? note : null,
        createdById: caller.userId,
      },
      update: {
        value: trimmedValue,
        note: note && note.length > 0 ? note : null,
      },
    });
  }

  /**
   * Idempotent delete — removes one specific contact. Missing rows are
   * a soft success so the front-end's "clear" button is safe under
   * stale state (clicking Clear on an already-cleared contact is a
   * no-op instead of a 404).
   */
  async remove(
    treatmentPlanId: string,
    fromTooth: number,
    toTooth: number,
    caller: Caller,
  ): Promise<{ deleted: boolean }> {
    if (!this.isPlanner(caller)) {
      throw new ForbiddenException(
        'Only planners can edit IPR / stripping entries.',
      );
    }
    await this.assertWritable(treatmentPlanId, caller);
    const contact = this.normalizeContact({ fromTooth, toTooth });

    try {
      await this.prisma.treatmentPlanIpr.delete({
        where: {
          treatmentPlanId_fromTooth_toTooth: {
            treatmentPlanId,
            fromTooth: contact.fromTooth,
            toTooth: contact.toTooth,
          },
        },
      });
      return { deleted: true };
    } catch (err) {
      // P2025 = "Record to delete does not exist" — soft success.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return { deleted: false };
      }
      throw err;
    }
  }
}
