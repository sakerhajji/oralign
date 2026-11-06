import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import { PaymentsSummaryService } from './payments-summary.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

/** 2026-11-06 in Tunis, as the UTC instants Prisma receives. */
const NOV_6 = {
  gte: new Date('2026-11-05T23:00:00.000Z'),
  lt: new Date('2026-11-06T23:00:00.000Z'),
};

const installments = (
  method: PaymentMethod,
  amount: string,
  count: number,
) => ({
  paymentMethod: method,
  _sum: { amount: new Prisma.Decimal(amount) },
  _count: { _all: count },
});

const fees = (method: PaymentMethod | null, amount: string, count: number) => ({
  treatmentFeePaymentMethod: method,
  _sum: { treatmentFeeAmount: new Prisma.Decimal(amount) },
  _count: { _all: count },
});

function makeService(
  installmentGroups: unknown[] = [],
  feeGroups: unknown[] = [],
) {
  const paymentGroupBy = jest.fn().mockResolvedValue(installmentGroups);
  const orderGroupBy = jest.fn().mockResolvedValue(feeGroups);
  const prisma = {
    payment: { groupBy: paymentGroupBy },
    dentalOrder: { groupBy: orderGroupBy },
  } as unknown as PrismaService;
  return {
    service: new PaymentsSummaryService(prisma),
    paymentGroupBy,
    orderGroupBy,
  };
}

type GroupByCall = { where: Record<string, unknown> };
const whereOf = (groupBy: jest.Mock) =>
  (groupBy.mock.calls as GroupByCall[][])[0][0].where;

const zero = { amount: '0.000', count: 0 };
const zeroMethods = { cash: zero, card: zero, bank_transfer: zero };

describe('PaymentsSummaryService.summarise (takings)', () => {
  describe('queries', () => {
    it('sums the installments from Payment and the fees from the orders: two groupBy, success only, by paid date', async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      await service.summarise({ from: '2026-11-06', to: '2026-11-06' }, doctor);

      expect(paymentGroupBy).toHaveBeenCalledTimes(1);
      expect(paymentGroupBy).toHaveBeenCalledWith({
        by: ['paymentMethod'],
        where: {
          purpose: PaymentPurpose.installment,
          status: PaymentRecordStatus.success,
          paidAt: NOV_6,
          amount: { gt: 0 },
          order: { deletedAt: null, doctorId: doctor.userId },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(orderGroupBy).toHaveBeenCalledTimes(1);
      expect(orderGroupBy).toHaveBeenCalledWith({
        by: ['treatmentFeePaymentMethod'],
        where: {
          deletedAt: null,
          doctorId: doctor.userId,
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
          treatmentFeePaidAt: NOV_6,
          treatmentFeeAmount: { gt: 0 },
        },
        _sum: { treatmentFeeAmount: true },
        _count: { _all: true },
      });
    });

    it('never sums the card attempts of treatment fees, which duplicate the fee on the order', async () => {
      const { service, paymentGroupBy } = makeService();
      await service.summarise({}, admin);
      expect(whereOf(paymentGroupBy).purpose).toBe(PaymentPurpose.installment);
    });
  });

  describe('period', () => {
    afterEach(() => jest.useRealTimers());

    it('no date: today in Tunis (00:30 there is already the next day in UTC terms)', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-05T23:30:00.000Z') });
      const { service, paymentGroupBy, orderGroupBy } = makeService();

      const summary = await service.summarise({}, doctor);

      expect(summary).toMatchObject({ from: '2026-11-06', to: '2026-11-06' });
      expect(whereOf(paymentGroupBy).paidAt).toEqual(NOV_6);
      expect(whereOf(orderGroupBy).treatmentFeePaidAt).toEqual(NOV_6);
    });

    it('only from: from that day on, the end left open', async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      const summary = await service.summarise({ from: '2026-11-01' }, admin);

      expect(summary).toMatchObject({ from: '2026-11-01', to: null });
      const since = { gte: new Date('2026-10-31T23:00:00.000Z') };
      expect(whereOf(paymentGroupBy).paidAt).toStrictEqual(since);
      expect(whereOf(orderGroupBy).treatmentFeePaidAt).toStrictEqual(since);
    });

    it('only to: up to that day included, the start left open', async () => {
      const { service, paymentGroupBy } = makeService();
      const summary = await service.summarise({ to: '2026-11-06' }, admin);

      expect(summary).toMatchObject({ from: null, to: '2026-11-06' });
      expect(whereOf(paymentGroupBy).paidAt).toStrictEqual({
        lt: new Date('2026-11-06T23:00:00.000Z'),
      });
    });

    it('a period ending before it starts is a 400 INVALID_DATE_RANGE, before any query', async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      await expect(
        service.summarise({ from: '2026-11-07', to: '2026-11-06' }, admin),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
      expect(paymentGroupBy).not.toHaveBeenCalled();
      expect(orderGroupBy).not.toHaveBeenCalled();
    });
  });

  describe('scope', () => {
    it('a dentist sums their own orders, whatever doctorId they send', async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      await service.summarise({ doctorId: 'u-other' }, doctor);

      expect(whereOf(paymentGroupBy).order).toEqual({
        deletedAt: null,
        doctorId: doctor.userId,
      });
      expect(whereOf(orderGroupBy)).toMatchObject({
        deletedAt: null,
        doctorId: doctor.userId,
      });
    });

    it('an admin sums every live order', async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      await service.summarise({}, admin);

      expect(whereOf(paymentGroupBy).order).toEqual({ deletedAt: null });
      expect(whereOf(orderGroupBy)).not.toHaveProperty('doctorId');
      expect(whereOf(orderGroupBy)).toMatchObject({ deletedAt: null });
    });

    it("an admin's doctorId narrows the sums to that dentist", async () => {
      const { service, paymentGroupBy, orderGroupBy } = makeService();
      await service.summarise({ doctorId: 'u-doc' }, admin);

      expect(whereOf(paymentGroupBy).order).toEqual({
        deletedAt: null,
        doctorId: 'u-doc',
      });
      expect(whereOf(orderGroupBy)).toMatchObject({ doctorId: 'u-doc' });
    });
  });

  describe('figures', () => {
    it('totals per method and per kind, amounts as 3-decimal strings', async () => {
      const { service } = makeService(
        [
          installments(PaymentMethod.cash, '1500', 2),
          installments(PaymentMethod.card, '1250.5', 1),
        ],
        [
          fees(PaymentMethod.cash, '350', 1),
          fees(PaymentMethod.bank_transfer, '700.25', 2),
        ],
      );

      await expect(
        service.summarise({ from: '2026-11-06', to: '2026-11-06' }, admin),
      ).resolves.toEqual({
        from: '2026-11-06',
        to: '2026-11-06',
        timeZone: 'Africa/Tunis',
        currency: 'TND',
        total: { amount: '3800.750', count: 6 },
        methods: {
          cash: { amount: '1850.000', count: 3 },
          card: { amount: '1250.500', count: 1 },
          bank_transfer: { amount: '700.250', count: 2 },
        },
        purposes: {
          installment: {
            amount: '2750.500',
            count: 3,
            methods: {
              cash: { amount: '1500.000', count: 2 },
              card: { amount: '1250.500', count: 1 },
              bank_transfer: zero,
            },
          },
          treatment_fee: {
            amount: '1050.250',
            count: 3,
            methods: {
              cash: { amount: '350.000', count: 1 },
              card: zero,
              bank_transfer: { amount: '700.250', count: 2 },
            },
          },
        },
      });
    });

    it('adds millimes exactly, as Decimals', async () => {
      const { service } = makeService(
        [installments(PaymentMethod.card, '0.1', 1)],
        [fees(PaymentMethod.card, '0.2', 1)],
      );
      const summary = await service.summarise({}, admin);
      expect(summary.methods.card).toEqual({ amount: '0.300', count: 2 });
      expect(summary.total).toEqual({ amount: '0.300', count: 2 });
    });

    it('nothing received: every bucket present, at "0.000" and 0', async () => {
      const { service } = makeService();
      await expect(
        service.summarise({ from: '2026-11-06', to: '2026-11-06' }, doctor),
      ).resolves.toEqual({
        from: '2026-11-06',
        to: '2026-11-06',
        timeZone: 'Africa/Tunis',
        currency: 'TND',
        total: zero,
        methods: zeroMethods,
        purposes: {
          installment: { ...zero, methods: zeroMethods },
          treatment_fee: { ...zero, methods: zeroMethods },
        },
      });
    });

    it('leaves out a fee group without a method, so the totals still add up', async () => {
      const { service } = makeService([], [fees(null, '100', 1)]);
      const summary = await service.summarise({}, admin);
      expect(summary.total).toEqual(zero);
      expect(summary.purposes.treatment_fee).toEqual({
        ...zero,
        methods: zeroMethods,
      });
    });
  });
});
