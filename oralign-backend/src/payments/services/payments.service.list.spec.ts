import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentGateway } from '../gateways/payment-gateway.interface';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. The list never touches it.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import type { QuotationService } from '../../quotations/services/quotation.service';
import { PaymentsService } from './payments.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

type ListOptions = Omit<
  Parameters<PaymentsService['listPayments']>[0],
  'caller'
>;

/** A dentist's list reads their own orders, archived ones excluded. */
const DOCTOR_ORDERS = { deletedAt: null, doctorId: doctor.userId };

/** 2026-11-06 in Tunis, as the UTC instants Prisma receives. */
const NOV_6 = {
  gte: new Date('2026-11-05T23:00:00.000Z'),
  lt: new Date('2026-11-06T23:00:00.000Z'),
};

/** The relations every page query sends, unchanged by the filters. */
const LIST_INCLUDE = {
  quotation: { select: { id: true, orderId: true, packName: true } },
  order: {
    select: {
      id: true,
      orderCode: true,
      doctor: { select: { id: true, fullName: true } },
      patient: { select: { id: true, fullName: true } },
    },
  },
  installment: {
    select: { id: true, installmentNumber: true, amount: true },
  },
};

function makeService(rows: unknown[] = [], total = rows.length) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(total);
  const prisma = { payment: { findMany, count } } as unknown as PrismaService;
  const service = new PaymentsService(
    prisma,
    {} as EventEmitter2,
    {} as PaymentGateway,
    {} as QuotationService,
  );
  return { service, findMany, count };
}

const findManyArgs = (findMany: jest.Mock) =>
  (findMany.mock.calls as unknown[][])[0][0] as Prisma.PaymentFindManyArgs;

/** A case-insensitive substring match, as the search sends it. */
const text = (term: string) => ({ contains: term, mode: 'insensitive' });

/** The arguments of one list call; checks on the way that the total counts that very filter. */
async function listArgs(
  options: ListOptions,
  caller: Caller = doctor,
): Promise<Prisma.PaymentFindManyArgs> {
  const { service, findMany, count } = makeService();
  await service.listPayments({ ...options, caller });
  const args = findManyArgs(findMany);
  expect(count).toHaveBeenCalledWith({ where: args.where });
  return args;
}

/** The OR list of the search, wherever it sits in the AND list. */
async function searchOr(search: string): Promise<Prisma.PaymentWhereInput[]> {
  const { where } = await listArgs({ search });
  const and = (where?.AND ?? []) as Prisma.PaymentWhereInput[];
  return and.find((condition) => condition.OR)?.OR ?? [];
}

describe('PaymentsService.listPayments (payment history)', () => {
  describe('scope', () => {
    it('a dentist reads their own live orders, whatever doctorId they send', async () => {
      const args = await listArgs({ doctorId: 'u-other' });
      expect(args.where).toEqual({ order: DOCTOR_ORDERS });
      expect(args.include).toEqual(LIST_INCLUDE);
    });

    it("an admin reads every live order, or one dentist's", async () => {
      expect((await listArgs({}, admin)).where).toEqual({
        order: { deletedAt: null },
      });
      expect((await listArgs({ doctorId: 'u-doc' }, admin)).where).toEqual({
        order: { deletedAt: null, doctorId: 'u-doc' },
      });
    });

    it("a dentist's rows leave out the admin's notes, which admin acted, and the idempotency key", async () => {
      expect((await listArgs({})).omit).toEqual({
        notes: true,
        idempotencyKey: true,
        initiatedById: true,
        confirmedById: true,
        rejectedById: true,
      });
    });

    it('an admin keeps every column', async () => {
      expect((await listArgs({}, admin)).omit).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('purpose keeps one kind of payment', async () => {
      const { where } = await listArgs({ purpose: PaymentPurpose.installment });
      expect(where).toEqual({
        order: DOCTOR_ORDERS,
        purpose: PaymentPurpose.installment,
      });
    });

    it('status and method lists win over the legacy single values', async () => {
      const { where } = await listArgs({
        statuses: [PaymentRecordStatus.success, PaymentRecordStatus.pending],
        status: PaymentRecordStatus.failed,
        methods: [PaymentMethod.cash],
        paymentMethod: PaymentMethod.card,
      });
      expect(where).toMatchObject({
        status: {
          in: [PaymentRecordStatus.success, PaymentRecordStatus.pending],
        },
        paymentMethod: { in: [PaymentMethod.cash] },
      });
    });

    it('the period reads the date the payment happened: paid when it was, made otherwise, in Tunis days', async () => {
      const { where } = await listArgs({
        from: '2026-11-06',
        to: '2026-11-06',
      });
      expect(where).toEqual({
        order: DOCTOR_ORDERS,
        AND: [
          {
            OR: [{ paidAt: NOV_6 }, { paidAt: null, createdAt: NOV_6 }],
          },
        ],
      });
    });

    it('one bound leaves the period open on the other side', async () => {
      const since = { gte: new Date('2026-10-31T23:00:00.000Z') };
      expect((await listArgs({ from: '2026-11-01' })).where?.AND).toEqual([
        { OR: [{ paidAt: since }, { paidAt: null, createdAt: since }] },
      ]);
      const until = { lt: new Date('2026-11-06T23:00:00.000Z') };
      expect((await listArgs({ to: '2026-11-06' })).where?.AND).toEqual([
        { OR: [{ paidAt: until }, { paidAt: null, createdAt: until }] },
      ]);
    });

    it('the period and the search sit side by side in the AND list, never overwriting each other', async () => {
      const { where } = await listArgs({
        from: '2026-11-06',
        to: '2026-11-06',
        search: 'Sarah',
      });
      expect(where?.OR).toBeUndefined();
      const [period, search] = where?.AND as Prisma.PaymentWhereInput[];
      expect(period).toEqual({
        OR: [{ paidAt: NOV_6 }, { paidAt: null, createdAt: NOV_6 }],
      });
      expect(search.OR).toContainEqual({ transactionId: text('Sarah') });
    });

    it('a period ending before it starts is a 400 INVALID_DATE_RANGE, before any query', async () => {
      const { service, findMany, count } = makeService();
      await expect(
        service.listPayments({
          from: '2026-11-07',
          to: '2026-11-06',
          caller: doctor,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
      expect(findMany).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
    });

    it('the deprecated createdFrom / createdTo still filter whole UTC days of createdAt', async () => {
      const { where } = await listArgs({
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      });
      expect(where).toEqual({
        order: DOCTOR_ORDERS,
        createdAt: {
          gte: new Date('2025-01-01T00:00:00.000Z'),
          lte: new Date('2025-12-31T23:59:59.999Z'),
        },
      });
    });
  });

  describe('search', () => {
    it('matches the references, receipt and ClicToPay numbers, the order code and both names', async () => {
      expect(await searchOr('ORA-MHN2')).toEqual([
        { transactionId: text('ORA-MHN2') },
        { invoiceNumber: text('ORA-MHN2') },
        { merchantOrderNumber: text('ORA-MHN2') },
        {
          order: {
            OR: [
              { orderCode: text('ORA-MHN2') },
              { doctor: { fullName: text('ORA-MHN2') } },
              { patient: { fullName: text('ORA-MHN2') } },
            ],
          },
        },
      ]);
    });

    it.each([
      ['1500', '1500.000'],
      ['1500.5', '1500.500'],
      ['1500,5', '1500.500'],
      ['1 500,000', '1500.000'],
      // As the desk prints it, copied from the amount column.
      ['1 500,000 TND', '1500.000'],
    ])(
      'adds the exact amount when the term "%s" is one',
      async (term, amount) => {
        const or = await searchOr(term);
        const byAmount = or.find((condition) => 'amount' in condition);
        expect(byAmount?.amount).toBeInstanceOf(Prisma.Decimal);
        expect((byAmount?.amount as Prisma.Decimal).toFixed(3)).toBe(amount);
        expect(or).toContainEqual({ invoiceNumber: text(term) });
      },
    );

    it('a term that is no amount does not compare amounts', async () => {
      const or = await searchOr('FAC-000123');
      expect(or.some((condition) => 'amount' in condition)).toBe(false);
      expect(or).toContainEqual({ invoiceNumber: text('FAC-000123') });
    });

    it('keeps the scope on the outer where: a search never widens it', async () => {
      const { where } = await listArgs({ search: 'Sarah' });
      expect(where?.order).toEqual(DOCTOR_ORDERS);
    });

    it('trims the term, and a blank one adds nothing', async () => {
      expect((await searchOr('  Sarah  '))[0]).toEqual({
        transactionId: text('Sarah'),
      });
      expect((await listArgs({ search: '   ' })).where).toEqual({
        order: DOCTOR_ORDERS,
      });
    });
  });

  describe('sort', () => {
    it.each<[ListOptions, Prisma.PaymentOrderByWithRelationInput[]]>([
      [{}, [{ createdAt: 'desc' }, { id: 'desc' }]],
      [
        { sortBy: 'createdAt', sortOrder: 'asc' },
        [{ createdAt: 'asc' }, { id: 'asc' }],
      ],
      [
        { sortBy: 'paidAt', sortOrder: 'desc' },
        [
          { paidAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      ],
      [
        { sortBy: 'paidAt', sortOrder: 'asc' },
        [
          { paidAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      ],
      [
        { sortBy: 'amount', sortOrder: 'asc' },
        [{ amount: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ],
      [
        { sortBy: 'status', sortOrder: 'desc' },
        [{ status: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ],
    ])(
      '%p ends on the id, unpaid rows last on paidAt',
      async (options, orderBy) => {
        expect((await listArgs(options)).orderBy).toEqual(orderBy);
      },
    );
  });

  describe('page', () => {
    it('pages with skip / take and counts the pages of the whole filter', async () => {
      const { service, findMany } = makeService([], 41);
      const page = await service.listPayments({
        page: 3,
        limit: 20,
        caller: doctor,
      });
      expect(findManyArgs(findMany)).toMatchObject({ skip: 40, take: 20 });
      expect(page).toMatchObject({
        total: 41,
        page: 3,
        limit: 20,
        totalPages: 3,
      });
    });

    it('no row: 0 pages', async () => {
      const { service } = makeService([], 0);
      await expect(
        service.listPayments({ caller: admin }),
      ).resolves.toMatchObject({ total: 0, totalPages: 0, limit: 25, page: 1 });
    });
  });

  describe('sort on the date the payment happened (eventAt)', () => {
    type Run = { id: string; paidAt: Date | null; createdAt: Date };

    /** Declared on 3 Nov, confirmed on 6 Nov: it happened on 6 Nov. */
    const transfer: Run = {
      id: 'p-transfer',
      paidAt: new Date('2026-11-06T08:15:00.000Z'),
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
    };
    const card: Run = {
      id: 'p-card',
      paidAt: new Date('2026-11-05T10:00:00.000Z'),
      createdAt: new Date('2026-11-05T09:58:00.000Z'),
    };
    const attempt: Run = {
      id: 'p-attempt',
      paidAt: null,
      createdAt: new Date('2026-11-06T07:00:00.000Z'),
    };
    const failed: Run = {
      id: 'p-failed',
      paidAt: null,
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    };

    const PAID_RUN = { paidAt: { not: null } };
    const UNPAID_RUN = { paidAt: null };

    /**
     * The database: each run sorted as asked, cut at `take`; the page
     * rows come back by id in no particular order.
     */
    function makeEventService(paid: Run[], unpaid: Run[], total = 4) {
      const findMany = jest.fn((args: Prisma.PaymentFindManyArgs) => {
        if (args.select) {
          const [, run] = args.where?.AND as Prisma.PaymentWhereInput[];
          const rows = run.paidAt === null ? unpaid : paid;
          return Promise.resolve(rows.slice(0, args.take));
        }
        const { in: ids } = args.where?.id as { in: string[] };
        return Promise.resolve([...ids].reverse().map((id) => ({ id })));
      });
      const count = jest.fn().mockResolvedValue(total);
      const service = new PaymentsService(
        { payment: { findMany, count } } as unknown as PrismaService,
        {} as EventEmitter2,
        {} as PaymentGateway,
        {} as QuotationService,
      );
      const calls = () =>
        (findMany.mock.calls as [Prisma.PaymentFindManyArgs][]).map(
          ([args]) => args,
        );
      return { service, findMany, count, calls };
    }

    const ids = (page: { data: { id: string }[] }) =>
      page.data.map((row) => row.id);

    it('newest first follows the date the list shows, not the creation date', async () => {
      const { service, count, calls } = makeEventService(
        [transfer, card],
        [attempt, failed],
      );
      const page = await service.listPayments({
        purpose: PaymentPurpose.installment,
        sortBy: 'eventAt',
        caller: doctor,
      });

      expect(ids(page)).toEqual([
        'p-transfer',
        'p-attempt',
        'p-card',
        'p-failed',
      ]);
      const where = {
        order: DOCTOR_ORDERS,
        purpose: PaymentPurpose.installment,
      };
      const [paidRun, unpaidRun, pageRows] = calls();
      expect(paidRun).toEqual({
        where: { AND: [where, PAID_RUN] },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        take: 25,
        select: { id: true, paidAt: true, createdAt: true },
      });
      expect(unpaidRun).toEqual({
        where: { AND: [where, UNPAID_RUN] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 25,
        select: { id: true, paidAt: true, createdAt: true },
      });
      expect(pageRows).toEqual({
        where: {
          id: { in: ['p-transfer', 'p-attempt', 'p-card', 'p-failed'] },
        },
        include: LIST_INCLUDE,
        omit: {
          notes: true,
          idempotencyKey: true,
          initiatedById: true,
          confirmedById: true,
          rejectedById: true,
        },
      });
      expect(count).toHaveBeenCalledWith({ where });
      expect(page).toMatchObject({ total: 4, page: 1, totalPages: 1 });
    });

    it('a later page reads skip + take rows of each run and keeps the next ones', async () => {
      const { service, calls } = makeEventService(
        [transfer, card],
        [attempt, failed],
      );
      const page = await service.listPayments({
        sortBy: 'eventAt',
        page: 2,
        limit: 2,
        caller: admin,
      });

      expect(ids(page)).toEqual(['p-card', 'p-failed']);
      const [paidRun, unpaidRun, pageRows] = calls();
      expect(paidRun.take).toBe(4);
      expect(unpaidRun.take).toBe(4);
      expect(pageRows.omit).toBeUndefined();
    });

    it('oldest first, the period and the search stay in the where of both runs', async () => {
      const { service, calls } = makeEventService(
        [card, transfer],
        [failed, attempt],
      );
      const page = await service.listPayments({
        sortBy: 'eventAt',
        sortOrder: 'asc',
        from: '2026-11-06',
        to: '2026-11-06',
        search: 'Sarah',
        caller: doctor,
      });

      expect(ids(page)).toEqual([
        'p-failed',
        'p-card',
        'p-attempt',
        'p-transfer',
      ]);
      const [paidRun, unpaidRun] = calls();
      expect(paidRun.orderBy).toEqual([{ paidAt: 'asc' }, { id: 'asc' }]);
      expect(unpaidRun.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      const [where] = paidRun.where?.AND as Prisma.PaymentWhereInput[];
      const [period, search] = where.AND as Prisma.PaymentWhereInput[];
      expect(period).toEqual({
        OR: [{ paidAt: NOV_6 }, { paidAt: null, createdAt: NOV_6 }],
      });
      expect(search.OR).toContainEqual({ transactionId: text('Sarah') });
    });

    it('two payments of the same instant keep one order: the id decides, in the sort direction', async () => {
      const instant = new Date('2026-11-06T09:00:00.000Z');
      const paidThen: Run = {
        id: 'b-paid',
        paidAt: instant,
        createdAt: instant,
      };
      const madeThen: Run = { id: 'a-made', paidAt: null, createdAt: instant };

      const newest = makeEventService([paidThen], [madeThen], 2);
      const desc = await newest.service.listPayments({
        sortBy: 'eventAt',
        caller: admin,
      });
      expect(ids(desc)).toEqual(['b-paid', 'a-made']);

      const oldest = makeEventService([paidThen], [madeThen], 2);
      const asc = await oldest.service.listPayments({
        sortBy: 'eventAt',
        sortOrder: 'asc',
        caller: admin,
      });
      expect(ids(asc)).toEqual(['a-made', 'b-paid']);
    });

    it('past the last row: an empty page, no row fetched', async () => {
      const { service, findMany } = makeEventService(
        [transfer, card],
        [attempt, failed],
      );
      const page = await service.listPayments({
        sortBy: 'eventAt',
        page: 3,
        limit: 2,
        caller: admin,
      });
      expect(page.data).toEqual([]);
      expect(findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('pending confirmations queue (shares the executor)', () => {
    it('still defaults to awaiting_confirmation and keeps every admin column', async () => {
      const { service, findMany } = makeService();
      await service.listPendingConfirmations({ caller: admin });
      const args = findManyArgs(findMany);
      expect(args.where).toEqual({
        order: { deletedAt: null },
        status: { in: [PaymentRecordStatus.awaiting_confirmation] },
      });
      expect(args.omit).toBeUndefined();
    });

    it('honours the kind of payment and the period, like the history', async () => {
      const { service, findMany, count } = makeService();
      await service.listPendingConfirmations({
        purpose: PaymentPurpose.installment,
        from: '2026-11-06',
        to: '2026-11-06',
        caller: admin,
      });
      const { where } = findManyArgs(findMany);
      expect(where).toEqual({
        order: { deletedAt: null },
        status: { in: [PaymentRecordStatus.awaiting_confirmation] },
        purpose: PaymentPurpose.installment,
        AND: [{ OR: [{ paidAt: NOV_6 }, { paidAt: null, createdAt: NOV_6 }] }],
      });
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('is admin-only', async () => {
      const { service, findMany } = makeService();
      await expect(
        service.listPendingConfirmations({ caller: doctor }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
