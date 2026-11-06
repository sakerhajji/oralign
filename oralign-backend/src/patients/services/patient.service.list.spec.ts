import { Gender, OrderStatus, Prisma, UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import {
  PatientOrderState,
  PatientSortField,
  PatientSortOrder,
  type PatientFilterDto,
} from '../dto/patient.dto';
import { PatientService } from './patient.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

/** A dentist's list reads their own orders, archived ones excluded. */
const DOCTOR_ORDERS: Prisma.DentalOrderWhereInput = {
  doctorId: doctor.userId,
  deletedAt: null,
};
/** An admin's list reads every order, archived ones still excluded. */
const ADMIN_ORDERS: Prisma.DentalOrderWhereInput = { deletedAt: null };

/** The statuses that do not make an order active, as the contract lists them. */
const NOT_ACTIVE = [
  OrderStatus.draft,
  OrderStatus.finished,
  OrderStatus.canceled,
  OrderStatus.cancelled,
  OrderStatus.rejected,
];

/**
 * Exactly the NOT_ACTIVE statuses, in any order: the order of the
 * service's constant means nothing, so reordering it must not fail a test.
 */
const notActive = {
  asymmetricMatch: (actual: unknown) =>
    Array.isArray(actual) &&
    actual.length === NOT_ACTIVE.length &&
    NOT_ACTIVE.every((status) => actual.includes(status)),
  toString: () => `NotActive<${NOT_ACTIVE.join(', ')}>`,
};

/** The include every page query must send, for a given order scope. */
const listInclude = (orders: Prisma.DentalOrderWhereInput) => ({
  doctor: { select: { id: true, fullName: true, email: true } },
  _count: { select: { orders: { where: orders } } },
  orders: {
    where: orders,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { id: true, orderCode: true, status: true, createdAt: true },
  },
});

function makeService(rows: unknown[] = [], total = rows.length) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(total);
  const prisma = { patient: { findMany, count } } as unknown as PrismaService;
  const service = new PatientService(prisma, new OrderAccessPolicy(prisma));
  return { service, findMany, count };
}

const findManyArgs = (findMany: jest.Mock) =>
  (findMany.mock.calls as unknown[][])[0][0] as Prisma.PatientFindManyArgs;

/**
 * The `where` of one list call. Checks on the way that the total is
 * counted on that very filter, so every case using it covers the count.
 */
async function listWhere(
  filters: PatientFilterDto,
  caller: Caller = doctor,
): Promise<Prisma.PatientWhereInput | undefined> {
  const { service, findMany, count } = makeService();
  await service.getPatients(1, 10, filters, caller);
  const { where } = findManyArgs(findMany);
  expect(count).toHaveBeenCalledWith({ where });
  return where;
}

/** The OR list of the search, wherever it sits in the AND list. */
function searchOr(
  where: Prisma.PatientWhereInput | undefined,
): Prisma.PatientWhereInput[] {
  const and = (where?.AND ?? []) as Prisma.PatientWhereInput[];
  return and.find((c) => c.OR)?.OR ?? [];
}

const createdAt = new Date('2026-10-01T08:00:00.000Z');

/** A patient row as the list query returns it (include applied). */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  doctorId: doctor.userId,
  fullName: 'Sarah Morgan',
  email: null,
  phone: '+21650339214',
  gender: Gender.female,
  dateOfBirth: null,
  address: null,
  notes: null,
  profilePhotoUrl: null,
  clinicalConditions: ['Crowding'],
  clinicalConditionsOther: null,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  doctor: {
    id: doctor.userId,
    fullName: 'Dr Amine Ben Ali',
    email: 'amine@example.com',
  },
  _count: { orders: 0 },
  orders: [],
  ...over,
});

describe('PatientService.getPatients (patients list)', () => {
  describe('scope', () => {
    it('a dentist lists their own patients, counted from their own live orders', async () => {
      const { service, findMany, count } = makeService();
      // A doctorId sent by a dentist never widens the scope.
      await service.getPatients(3, 20, { doctorId: 'u-other' }, doctor);

      const args = findManyArgs(findMany);
      expect(args.where).toEqual({ deletedAt: null, doctorId: doctor.userId });
      expect(args.skip).toBe(40);
      expect(args.take).toBe(20);
      expect(args.include).toEqual(listInclude(DOCTOR_ORDERS));
      expect(count).toHaveBeenCalledWith({ where: args.where });
    });

    it('an admin lists every patient, counted from every live order', async () => {
      const { service, findMany } = makeService();
      await service.getPatients(1, 10, {}, admin);

      const args = findManyArgs(findMany);
      expect(args.where).toEqual({ deletedAt: null });
      expect(args.include).toEqual(listInclude(ADMIN_ORDERS));
    });

    it("an admin's doctorId filter narrows the patients, not the orders read", async () => {
      const { service, findMany } = makeService();
      await service.getPatients(1, 10, { doctorId: doctor.userId }, admin);

      const args = findManyArgs(findMany);
      expect(args.where).toEqual({ deletedAt: null, doctorId: doctor.userId });
      expect(args.include).toEqual(listInclude(ADMIN_ORDERS));
    });

    it('still refuses designers, before any query', async () => {
      const { service, findMany, count } = makeService();
      await expect(
        service.getPatients(
          1,
          10,
          {},
          { userId: 'u-des', role: UserRole.designer },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findMany).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
    });
  });

  describe('trash view', () => {
    it("an admin's includeDeleted lists only trashed patients, search kept in the AND", async () => {
      const where = await listWhere(
        {
          includeDeleted: true,
          search: 'Sarah',
          orderState: PatientOrderState.NONE,
        },
        admin,
      );
      expect(where).toEqual({
        deletedAt: { not: null },
        AND: [
          {
            OR: [
              { fullName: { contains: 'Sarah', mode: 'insensitive' } },
              { email: { contains: 'Sarah', mode: 'insensitive' } },
              {
                orders: {
                  some: {
                    ...ADMIN_ORDERS,
                    orderCode: { contains: 'Sarah', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
          { orders: { none: ADMIN_ORDERS } },
        ],
      });
    });

    it('a dentist asking for the trash still gets the live set', async () => {
      await expect(listWhere({ includeDeleted: true })).resolves.toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
      });
    });
  });

  describe('orderState', () => {
    it('active: a live order in scope that is neither a draft nor closed', async () => {
      await expect(
        listWhere({ orderState: PatientOrderState.ACTIVE }),
      ).resolves.toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
        AND: [
          {
            orders: {
              some: { ...DOCTOR_ORDERS, status: { notIn: notActive } },
            },
          },
        ],
      });
    });

    it('active, for an admin: an active order among every live order', async () => {
      await expect(
        listWhere({ orderState: PatientOrderState.ACTIVE }, admin),
      ).resolves.toEqual({
        deletedAt: null,
        AND: [
          {
            orders: {
              some: { ...ADMIN_ORDERS, status: { notIn: notActive } },
            },
          },
        ],
      });
    });

    it('none: no live order at all in scope', async () => {
      await expect(
        listWhere({ orderState: PatientOrderState.NONE }),
      ).resolves.toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
        AND: [{ orders: { none: DOCTOR_ORDERS } }],
      });
      await expect(
        listWhere({ orderState: PatientOrderState.NONE }, admin),
      ).resolves.toEqual({
        deletedAt: null,
        AND: [{ orders: { none: ADMIN_ORDERS } }],
      });
    });
  });

  describe('search', () => {
    it('matches name, e-mail, an order code in scope, and the phone without separators', async () => {
      await expect(listWhere({ search: '50 339 214' })).resolves.toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
        AND: [
          {
            OR: [
              { fullName: { contains: '50 339 214', mode: 'insensitive' } },
              { email: { contains: '50 339 214', mode: 'insensitive' } },
              {
                orders: {
                  some: {
                    ...DOCTOR_ORDERS,
                    orderCode: { contains: '50 339 214', mode: 'insensitive' },
                  },
                },
              },
              { phone: { contains: '50339214' } },
            ],
          },
        ],
      });
    });

    it.each([
      ['+216 50-339-214', '+21650339214'],
      ['(50) 339.214', '50339214'],
    ])(
      'strips the separators of a phone search: "%s"',
      async (term, digits) => {
        expect(searchOr(await listWhere({ search: term }))).toContainEqual({
          phone: { contains: digits },
        });
      },
    );

    it('finds a patient by order code, case-insensitive, among the orders an admin sees', async () => {
      expect(
        searchOr(await listWhere({ search: 'sarah_morgan_2026' }, admin)),
      ).toContainEqual({
        orders: {
          some: {
            ...ADMIN_ORDERS,
            orderCode: { contains: 'sarah_morgan_2026', mode: 'insensitive' },
          },
        },
      });
    });

    it('leaves the phone column out for a term without digits', async () => {
      const or = searchOr(await listWhere({ search: 'Sarah' }));
      expect(or).toHaveLength(3);
      expect(or.some((c) => 'phone' in c)).toBe(false);
    });

    it('trims the term', async () => {
      expect(searchOr(await listWhere({ search: '  Sarah  ' }))[0]).toEqual({
        fullName: { contains: 'Sarah', mode: 'insensitive' },
      });
    });

    it.each(['', '   '])(
      'adds no OR for an empty search (%j)',
      async (search) => {
        await expect(listWhere({ search })).resolves.toEqual({
          deletedAt: null,
          doctorId: doctor.userId,
        });
      },
    );

    describe('date added (Tunis business days)', () => {
      it('from and to are whole Tunis days, both included', async () => {
        await expect(
          listWhere({ createdFrom: '2026-11-01', createdTo: '2026-11-06' }),
        ).resolves.toEqual({
          deletedAt: null,
          doctorId: doctor.userId,
          // 1 Nov 00:00 Tunis → 7 Nov 00:00 Tunis (exclusive): a patient
          // added at 00:30 on the 7th, in Tunis, is outside.
          createdAt: {
            gte: new Date('2026-10-31T23:00:00.000Z'),
            lt: new Date('2026-11-06T23:00:00.000Z'),
          },
        });
      });

      it('one bound leaves the other side open', async () => {
        await expect(listWhere({ createdTo: '2026-11-06' })).resolves.toEqual({
          deletedAt: null,
          doctorId: doctor.userId,
          createdAt: { lt: new Date('2026-11-06T23:00:00.000Z') },
        });
      });

      it('a single day: from = to', async () => {
        await expect(
          listWhere({ createdFrom: '2026-11-06', createdTo: '2026-11-06' }),
        ).resolves.toMatchObject({
          createdAt: {
            gte: new Date('2026-11-05T23:00:00.000Z'),
            lt: new Date('2026-11-06T23:00:00.000Z'),
          },
        });
      });

      it('a range that ends before it starts is a 400 INVALID_DATE_RANGE', async () => {
        await expect(
          listWhere({ createdFrom: '2026-11-06', createdTo: '2026-11-01' }),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: 'INVALID_DATE_RANGE',
        });
      });
    });

    it('keeps the search OR, the order filter and the other filters side by side', async () => {
      await expect(
        listWhere({
          search: 'Sarah',
          orderState: PatientOrderState.ACTIVE,
          gender: Gender.female,
          createdFrom: '2026-01-01',
        }),
      ).resolves.toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
        gender: Gender.female,
        // Midnight in Tunis (UTC+1 in January), not UTC midnight.
        createdAt: { gte: new Date('2025-12-31T23:00:00.000Z') },
        AND: [
          {
            OR: [
              { fullName: { contains: 'Sarah', mode: 'insensitive' } },
              { email: { contains: 'Sarah', mode: 'insensitive' } },
              {
                orders: {
                  some: {
                    ...DOCTOR_ORDERS,
                    orderCode: { contains: 'Sarah', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
          {
            orders: {
              some: { ...DOCTOR_ORDERS, status: { notIn: notActive } },
            },
          },
        ],
      });
    });
  });

  describe('page', () => {
    it('breaks sort ties on id, in the direction of the sort', async () => {
      const byDefault = makeService();
      await byDefault.service.getPatients(1, 10, {}, doctor);
      expect(findManyArgs(byDefault.findMany).orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);

      const byName = makeService();
      await byName.service.getPatients(
        1,
        10,
        { sortBy: PatientSortField.fullName, sortOrder: PatientSortOrder.asc },
        doctor,
      );
      expect(findManyArgs(byName.findMany).orderBy).toEqual([
        { fullName: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('maps ordersCount and latestOrder on each row, latestOrder null without an order', async () => {
      const latestAt = new Date('2026-11-02T10:30:00.000Z');
      const { service } = makeService(
        [
          row({
            _count: { orders: 3 },
            orders: [
              {
                id: 'o3',
                orderCode: 'Sarah_Morgan_20261102',
                status: OrderStatus.paid,
                createdAt: latestAt,
              },
            ],
          }),
          row({ id: 'p2', fullName: 'Youssef Trabelsi', phone: null }),
        ],
        12,
      );

      const page = await service.getPatients(2, 2, {}, doctor);

      expect(page).toMatchObject({
        total: 12,
        page: 2,
        limit: 2,
        totalPages: 6,
      });
      // The full row: today's patient fields plus the two list fields, and
      // nothing of the raw relations (`_count`, `orders`).
      expect(page.data[0]).toEqual({
        id: 'p1',
        doctorId: doctor.userId,
        fullName: 'Sarah Morgan',
        phone: '+21650339214',
        gender: Gender.female,
        clinicalConditions: ['Crowding'],
        doctor: {
          id: doctor.userId,
          fullName: 'Dr Amine Ben Ali',
          email: 'amine@example.com',
        },
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        ordersCount: 3,
        latestOrder: {
          id: 'o3',
          orderCode: 'Sarah_Morgan_20261102',
          status: OrderStatus.paid,
          createdAt: latestAt,
        },
      });
      expect(page.data[1]).toMatchObject({
        id: 'p2',
        ordersCount: 0,
        latestOrder: null,
      });
    });
  });
});
