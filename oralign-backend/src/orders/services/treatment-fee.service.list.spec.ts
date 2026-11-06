import {
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import { SortOrder } from '../dto/order.dto';
import {
  TreatmentFeeSortBy,
  type TreatmentFeeFilterDto,
} from '../dto/treatment-fee.dto';
import type { OrderAuditService } from './order-audit.service';
import type { OrderService } from './order.service';
import { TreatmentFeeService } from './treatment-fee.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };

/** Every order whose fee has a payment on record, archived ones left out. */
const RECORDED = {
  deletedAt: null,
  treatmentFeePaymentMethod: { not: null },
};

function makeService(rows: unknown[] = [], total = rows.length) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(total);
  const prisma = { dentalOrder: { findMany, count } };
  const service = new TreatmentFeeService(
    prisma as unknown as PrismaService,
    {} as OrderService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {} as OrderAuditService,
  );
  return { service, findMany, count };
}

const findManyArgs = (findMany: jest.Mock) =>
  (findMany.mock.calls as unknown[][])[0][0] as Prisma.DentalOrderFindManyArgs;

/** The arguments of one list call; checks on the way that the total counts that very filter. */
async function listArgs(
  filters: TreatmentFeeFilterDto,
  caller: Caller = admin,
): Promise<Prisma.DentalOrderFindManyArgs> {
  const { service, findMany, count } = makeService();
  await service.listTreatmentFees(filters, caller);
  const args = findManyArgs(findMany);
  expect(count).toHaveBeenCalledWith({ where: args.where });
  return args;
}

const text = (term: string) => ({ contains: term, mode: 'insensitive' });

describe('TreatmentFeeService.listTreatmentFees (treatment-fee history)', () => {
  describe('scope', () => {
    it('a dentist reads their own orders, whatever doctorId they send', async () => {
      const { where } = await listArgs({ doctorId: 'u-other' }, doctor);
      expect(where).toEqual({ ...RECORDED, doctorId: doctor.userId });
    });

    it("an admin reads every order, or one dentist's", async () => {
      expect((await listArgs({})).where).toEqual(RECORDED);
      expect((await listArgs({ doctorId: 'u-doc' })).where).toEqual({
        ...RECORDED,
        doctorId: 'u-doc',
      });
    });

    it('refuses any other role before a query', async () => {
      const { service, findMany } = makeService();
      await expect(
        service.listTreatmentFees({}, designer),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    it('methods and statuses narrow the fee columns', async () => {
      const { where } = await listArgs({
        methods: [PaymentMethod.cash, PaymentMethod.bank_transfer],
        statuses: [PaymentRecordStatus.awaiting_confirmation],
      });
      expect(where).toEqual({
        deletedAt: null,
        treatmentFeePaymentMethod: {
          in: [PaymentMethod.cash, PaymentMethod.bank_transfer],
        },
        treatmentFeePaymentStatus: {
          in: [PaymentRecordStatus.awaiting_confirmation],
        },
      });
    });

    it('a period filters the Tunis day the fee was paid (an unpaid fee has none, so it leaves)', async () => {
      const { where } = await listArgs({
        from: '2026-11-01',
        to: '2026-11-06',
      });
      expect(where).toEqual({
        ...RECORDED,
        treatmentFeePaidAt: {
          gte: new Date('2026-10-31T23:00:00.000Z'),
          lt: new Date('2026-11-06T23:00:00.000Z'),
        },
      });
    });

    it('a period ending before it starts is a 400 INVALID_DATE_RANGE, before any query', async () => {
      const { service, findMany } = makeService();
      await expect(
        service.listTreatmentFees(
          { from: '2026-11-07', to: '2026-11-06' },
          admin,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('the search matches order code, both names and the TF- receipt number, in an AND list', async () => {
      const { where } = await listArgs(
        { search: 'TF-0000', statuses: [PaymentRecordStatus.success] },
        doctor,
      );
      expect(where).toEqual({
        ...RECORDED,
        doctorId: doctor.userId,
        treatmentFeePaymentStatus: { in: [PaymentRecordStatus.success] },
        AND: [
          {
            OR: [
              { orderCode: text('TF-0000') },
              { doctor: { fullName: text('TF-0000') } },
              { patient: { fullName: text('TF-0000') } },
              { treatmentFeeInvoiceNumber: text('TF-0000') },
            ],
          },
        ],
      });
    });

    it('the search also compares the exact amount when the term is one', async () => {
      const { where } = await listArgs({ search: '1 350,000' });
      const [{ OR: or = [] }] = where?.AND as Prisma.DentalOrderWhereInput[];
      const byAmount = or.find(
        (condition) => 'treatmentFeeAmount' in condition,
      );
      expect((byAmount?.treatmentFeeAmount as Prisma.Decimal).toFixed(3)).toBe(
        '1350.000',
      );
    });
  });

  describe('sort', () => {
    it.each<
      [TreatmentFeeFilterDto, Prisma.DentalOrderOrderByWithRelationInput[]]
    >([
      [
        {},
        [
          { treatmentFeePaidAt: { sort: 'desc', nulls: 'first' } },
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
      ],
      [
        { sortBy: TreatmentFeeSortBy.paidAt, sortOrder: SortOrder.asc },
        [
          { treatmentFeePaidAt: { sort: 'asc', nulls: 'last' } },
          { updatedAt: 'asc' },
          { id: 'asc' },
        ],
      ],
      [
        { sortBy: TreatmentFeeSortBy.amount },
        [{ treatmentFeeAmount: 'desc' }, { id: 'desc' }],
      ],
      [
        { sortBy: TreatmentFeeSortBy.amount, sortOrder: SortOrder.asc },
        [{ treatmentFeeAmount: 'asc' }, { id: 'asc' }],
      ],
    ])(
      '%p: newest first puts the fees awaiting confirmation on top, every sort ends on the id',
      async (filters, orderBy) => {
        expect((await listArgs(filters)).orderBy).toEqual(orderBy);
      },
    );
  });

  describe('page', () => {
    it('defaults to page 1 of 25', async () => {
      expect(await listArgs({})).toMatchObject({ skip: 0, take: 25 });
    });

    it('pages with skip / take and counts the pages of the whole filter, 0 when empty', async () => {
      const { service, findMany } = makeService([], 21);
      await expect(
        service.listTreatmentFees({ page: 3, limit: 10 }, admin),
      ).resolves.toMatchObject({
        total: 21,
        page: 3,
        limit: 10,
        totalPages: 3,
      });
      expect(findManyArgs(findMany)).toMatchObject({ skip: 20, take: 10 });

      const empty = makeService([], 0);
      await expect(
        empty.service.listTreatmentFees({}, admin),
      ).resolves.toMatchObject({ total: 0, totalPages: 0 });
    });

    it("keeps today's row fields and adds the receipt number", async () => {
      const paidAt = new Date('2026-11-06T09:15:00.000Z');
      const updatedAt = new Date('2026-11-06T09:15:01.000Z');
      const row = {
        id: 'o-1',
        orderCode: 'Sarah_Morgan_20261106',
        treatmentFeeAmount: new Prisma.Decimal('350.000'),
        treatmentFeePaymentMethod: PaymentMethod.cash,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: paidAt,
        treatmentFeeProofPath: null,
        treatmentFeeInvoiceNumber: 'TF-000042',
        submittedAt: null,
        updatedAt,
        doctor: { id: 'u-doc', fullName: 'Dr Amine', email: 'a@example.com' },
        patient: { id: 'p-1', fullName: 'Sarah Morgan' },
      };
      const { service, findMany } = makeService([
        row,
        { ...row, id: 'o-2', treatmentFeeInvoiceNumber: null },
      ]);

      const page = await service.listTreatmentFees({}, admin);

      expect(findManyArgs(findMany).select).toMatchObject({
        treatmentFeeInvoiceNumber: true,
      });
      expect(page.data[0]).toEqual({
        orderId: 'o-1',
        orderCode: 'Sarah_Morgan_20261106',
        amount: 350,
        method: PaymentMethod.cash,
        status: PaymentRecordStatus.success,
        paidAt,
        proofPath: null,
        submittedAt: null,
        updatedAt,
        invoiceNumber: 'TF-000042',
        doctor: { id: 'u-doc', fullName: 'Dr Amine', email: 'a@example.com' },
        patient: { id: 'p-1', fullName: 'Sarah Morgan' },
      });
      expect(page.data[1].invoiceNumber).toBeNull();
    });
  });
});

describe('TreatmentFeeService.listPendingTreatmentFees (confirmation queue)', () => {
  /** The fee transfers waiting for an admin, archived orders left out. */
  const AWAITING = {
    deletedAt: null,
    treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
    treatmentFeePaidAt: null,
  };

  it('pages the transfers awaiting confirmation, 20 by default', async () => {
    const { service, findMany, count } = makeService([], 45);
    await expect(
      service.listPendingTreatmentFees({ caller: admin }),
    ).resolves.toMatchObject({ total: 45, page: 1, limit: 20, totalPages: 3 });
    expect(findManyArgs(findMany)).toMatchObject({
      where: AWAITING,
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where: AWAITING });
  });

  it('counts 0 pages when nothing waits, like every other list', async () => {
    const { service } = makeService([], 0);
    await expect(
      service.listPendingTreatmentFees({ caller: admin, page: 1, limit: 20 }),
    ).resolves.toMatchObject({ data: [], total: 0, totalPages: 0 });
  });

  it('reads page and limit as given', async () => {
    const { service, findMany } = makeService([], 12);
    await expect(
      service.listPendingTreatmentFees({ caller: admin, page: 3, limit: 5 }),
    ).resolves.toMatchObject({ page: 3, limit: 5, totalPages: 3 });
    expect(findManyArgs(findMany)).toMatchObject({ skip: 10, take: 5 });
  });

  it('is admin-only', async () => {
    const { service, findMany } = makeService();
    await expect(
      service.listPendingTreatmentFees({ caller: doctor }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
