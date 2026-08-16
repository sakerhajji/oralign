import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Caller, isAdmin } from './caller';

/**
 * THE authorization rule for anything hanging off a dental order (the
 * order itself, its files, quotations, payment plans, treatment plans,
 * treatment-chat messages):
 *
 *   • admin / super_admin  → every order
 *   • dentist              → orders they own (`doctorId`)
 *   • designer             → orders assigned to them (`assignedDesignerId`)
 *   • anything else        → 403
 *   • missing / soft-deleted order → 404 (never leak existence)
 *
 * This used to be re-implemented in five services (order, quotation,
 * quotation-payment-plan, treatment-plan, treatment-message) — three of
 * the security audit's BOLA findings came from copies that had drifted.
 * Every caller now delegates here, so a change to the rule is a change in
 * one place.
 */
@Injectable()
export class OrderAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prisma `where` fragment restricting a DentalOrder query to what the
   * caller may see. Use in list/find queries so filtering happens in SQL.
   * Throws 403 for roles that can never see orders.
   */
  scope(caller: Caller): Prisma.DentalOrderWhereInput {
    if (isAdmin(caller)) return {};
    if (caller.role === UserRole.dentist) return { doctorId: caller.userId };
    if (caller.role === UserRole.designer) {
      return { assignedDesignerId: caller.userId };
    }
    throw new ForbiddenException('You cannot access orders');
  }

  /**
   * Pure decision on an already-loaded order row. Returns silently when
   * allowed; throws 403 otherwise. Kept separate from `scope()` so services
   * that already hold the row (via their own include) don't re-query.
   */
  assertCanRead(
    order: { doctorId: string; assignedDesignerId: string | null },
    caller: Caller,
  ): void {
    if (isAdmin(caller)) return;
    if (caller.role === UserRole.dentist && order.doctorId === caller.userId) {
      return;
    }
    if (
      caller.role === UserRole.designer &&
      order.assignedDesignerId === caller.userId
    ) {
      return;
    }
    throw new ForbiddenException('You cannot access this order');
  }

  /**
   * The PLANNER rule (write side of the treatment plan): admin / super_admin
   * or the designer assigned to the order. Deliberately excludes the owning
   * dentist — planning is a lab job; the doctor reviews and approves. Keep
   * this next to the read rule so the two are visibly different on purpose.
   */
  assertCanPlan(
    order: { assignedDesignerId: string | null },
    caller: Caller,
    message = 'Only admins or the assigned designer can plan this treatment.',
  ): void {
    if (isAdmin(caller)) return;
    if (
      caller.role === UserRole.designer &&
      order.assignedDesignerId === caller.userId
    ) {
      return;
    }
    throw new ForbiddenException(message);
  }

  /**
   * Load the minimal order projection and enforce read access in one call.
   * 404 when the order does not exist or is soft-deleted; 403 when it
   * exists but the caller may not see it.
   */
  async requireReadable(orderId: string, caller: Caller) {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        doctorId: true,
        assignedDesignerId: true,
        status: true,
        orderCode: true,
        deletedAt: true,
      },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }
    this.assertCanRead(order, caller);
    return order;
  }
}
