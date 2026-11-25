import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { OrderAccessPolicy } from './order-access.policy';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from './caller';

/**
 * The ONE order authorization rule. These tests are the executable
 * version of the matrix in the class doc — if a rule changes here, every
 * service that delegates (orders, files, quotations, payment plans,
 * treatment plans, treatment chat) changes with it.
 */
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-super', role: UserRole.super_admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-doc-2', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };
const otherDesigner: Caller = { userId: 'u-des-2', role: UserRole.designer };

const order = { doctorId: doctor.userId, assignedDesignerId: designer.userId };
const unassigned = { doctorId: doctor.userId, assignedDesignerId: null };

function makePolicy(findUnique: jest.Mock = jest.fn()) {
  const prisma = { dentalOrder: { findUnique } } as unknown as PrismaService;
  return { policy: new OrderAccessPolicy(prisma), findUnique };
}

describe('OrderAccessPolicy', () => {
  describe('scope() - the SQL-side filter', () => {
    it('admins see everything (empty where)', () => {
      const { policy } = makePolicy();
      expect(policy.scope(admin)).toEqual({});
      expect(policy.scope(superAdmin)).toEqual({});
    });

    it('a dentist is scoped to their own orders', () => {
      const { policy } = makePolicy();
      expect(policy.scope(doctor)).toEqual({ doctorId: doctor.userId });
    });

    it('a designer is scoped to orders assigned to them', () => {
      const { policy } = makePolicy();
      expect(policy.scope(designer)).toEqual({
        assignedDesignerId: designer.userId,
      });
    });

    it('any other role is refused outright (403)', () => {
      const { policy } = makePolicy();
      expect(() =>
        policy.scope({ userId: 'x', role: 'patient' as UserRole }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanRead() - decision on a loaded row', () => {
    it.each([
      ['admin', admin],
      ['super_admin', superAdmin],
      ['owning dentist', doctor],
      ['assigned designer', designer],
    ])('allows the %s', (_label, caller) => {
      const { policy } = makePolicy();
      expect(() => policy.assertCanRead(order, caller)).not.toThrow();
    });

    it.each([
      ['another dentist', otherDoctor],
      ['another designer', otherDesigner],
    ])('refuses %s with 403', (_label, caller) => {
      const { policy } = makePolicy();
      expect(() => policy.assertCanRead(order, caller)).toThrow(
        ForbiddenException,
      );
    });

    it('a designer cannot read an order that has no assignee', () => {
      const { policy } = makePolicy();
      expect(() => policy.assertCanRead(unassigned, designer)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertCanPlan() - the write side is narrower than read', () => {
    it('allows admins and the assigned designer', () => {
      const { policy } = makePolicy();
      expect(() => policy.assertCanPlan(order, admin)).not.toThrow();
      expect(() => policy.assertCanPlan(order, superAdmin)).not.toThrow();
      expect(() => policy.assertCanPlan(order, designer)).not.toThrow();
    });

    it('refuses the OWNING dentist - planning is a lab job, the doctor reviews', () => {
      const { policy } = makePolicy();
      expect(() => policy.assertCanPlan(order, doctor)).toThrow(
        ForbiddenException,
      );
    });

    it('refuses an unassigned designer and surfaces the custom message', () => {
      const { policy } = makePolicy();
      expect(() =>
        policy.assertCanPlan(order, otherDesigner, 'custom message'),
      ).toThrow('custom message');
    });
  });

  describe('requireReadable() - load + enforce in one call', () => {
    const row = {
      id: 'o1',
      doctorId: doctor.userId,
      assignedDesignerId: designer.userId,
      status: 'draft',
      orderCode: 'ORD-1',
      deletedAt: null,
    };

    it('returns the projection for an allowed caller', async () => {
      const { policy, findUnique } = makePolicy(jest.fn().mockResolvedValue(row));
      await expect(policy.requireReadable('o1', doctor)).resolves.toEqual(row);
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1' } }),
      );
    });

    it('404s when the order does not exist', async () => {
      const { policy } = makePolicy(jest.fn().mockResolvedValue(null));
      await expect(policy.requireReadable('nope', admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s (not 403) for a soft-deleted order - never leaks existence', async () => {
      const { policy } = makePolicy(
        jest.fn().mockResolvedValue({ ...row, deletedAt: new Date() }),
      );
      await expect(policy.requireReadable('o1', otherDoctor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403s when the order exists but the caller may not see it', async () => {
      const { policy } = makePolicy(jest.fn().mockResolvedValue(row));
      await expect(policy.requireReadable('o1', otherDoctor)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('the lab technician (production rule, separate on purpose)', () => {
    const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
    const inQueue = {
      status: OrderStatus.fabrication,
      deletedAt: null,
      hasReleasedBatch: false,
      hasDeclaredEvent: false,
    };
    /** A finished case whose only events are the go-live import (D5). */
    const legacyOnly = {
      status: OrderStatus.finished,
      deletedAt: null,
      hasReleasedBatch: true,
      hasDeclaredEvent: false,
    };
    const history = { ...legacyOnly, hasDeclaredEvent: true };
    const errorCodeOf = (run: () => void): unknown => {
      try {
        run();
      } catch (error) {
        return (error as { getResponse(): { error?: string } }).getResponse()
          .error;
      }
      return undefined;
    };

    it('never reaches the order rule: scope() and assertCanRead() refuse her', () => {
      const { policy } = makePolicy();
      expect(() => policy.scope(technician)).toThrow(ForbiddenException);
      expect(() => policy.assertCanRead(order, technician)).toThrow(
        ForbiddenException,
      );
    });

    it('her production scope is the queue plus the cases declared through the module', () => {
      const { policy } = makePolicy();
      const scope = policy.productionReadScope(technician);
      expect(scope).toMatchObject({ deletedAt: null });
      expect(JSON.stringify(scope)).toContain('"origin":"declared"');
      expect(policy.productionReadScope(admin)).toEqual({ deletedAt: null });
      expect(() => policy.productionReadScope(doctor)).toThrow(
        ForbiddenException,
      );
      expect(() => policy.productionReadScope(designer)).toThrow(
        ForbiddenException,
      );
    });

    it('an order with only legacy_batch events is a 403 for her, readable by an admin', () => {
      const { policy } = makePolicy();
      expect(() =>
        policy.assertCanReadForProduction(legacyOnly, technician),
      ).toThrow(ForbiddenException);
      expect(
        errorCodeOf(() =>
          policy.assertCanReadForProduction(legacyOnly, technician),
        ),
      ).toBe('ORDER_NOT_IN_PRODUCTION');
      expect(() =>
        policy.assertCanReadForProduction(legacyOnly, admin),
      ).not.toThrow();
      expect(() =>
        policy.assertCanReadForProduction(legacyOnly, superAdmin),
      ).not.toThrow();
    });

    it('reads the queue and her history, 404 on an archived order', () => {
      const { policy } = makePolicy();
      expect(() =>
        policy.assertCanReadForProduction(inQueue, technician),
      ).not.toThrow();
      expect(() =>
        policy.assertCanReadForProduction(history, technician),
      ).not.toThrow();
      expect(() =>
        policy.assertCanReadForProduction(
          { ...inQueue, deletedAt: new Date() },
          admin,
        ),
      ).toThrow(NotFoundException);
      expect(() => policy.assertCanReadForProduction(inQueue, doctor)).toThrow(
        ForbiddenException,
      );
    });

    it('declares on the queue only (409 ORDER_NOT_IN_PRODUCTION on her history)', () => {
      const { policy } = makePolicy();
      expect(policy.canProduce(inQueue, technician)).toBe(true);
      expect(policy.canProduce(history, technician)).toBe(false);
      expect(
        errorCodeOf(() => policy.assertCanProduce(history, technician)),
      ).toBe('ORDER_NOT_IN_PRODUCTION');
      expect(() => policy.assertCanProduce(history, technician)).toThrow(
        ConflictException,
      );
      // An installment case still paying, with a released batch, is in the queue.
      expect(
        policy.canProduce(
          {
            status: OrderStatus.payment_pending,
            deletedAt: null,
            hasReleasedBatch: true,
          },
          technician,
        ),
      ).toBe(true);
    });

    it('nobody declares on a draft or cancelled case; admins on any other', () => {
      const { policy } = makePolicy();
      for (const status of [OrderStatus.draft, OrderStatus.canceled]) {
        const facts = { status, deletedAt: null, hasReleasedBatch: true };
        expect(policy.canProduce(facts, admin)).toBe(false);
        expect(errorCodeOf(() => policy.assertCanProduce(facts, admin))).toBe(
          'ORDER_NOT_IN_PRODUCTION',
        );
      }
      expect(policy.canProduce(history, admin)).toBe(true);
      expect(policy.canProduce(inQueue, doctor)).toBe(false);
      expect(() => policy.assertCanProduce(inQueue, doctor)).toThrow(
        ForbiddenException,
      );
    });
  });
});
