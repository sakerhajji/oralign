import {
  BatchStatus,
  OrderStatus,
  OrderType,
  type Prisma,
} from '@prisma/client';
import {
  addMonthsClamped,
  coverageWindowPatch,
  firstHandOverAt,
  startCoverageWindow,
  startsCoverageWindow,
  type CoverageWindowState,
} from './coverage-window';

const at = (iso: string) => new Date(iso);

describe('addMonthsClamped', () => {
  it.each([
    ['2027-01-31T10:15:00.000Z', 1, '2027-02-28T10:15:00.000Z'],
    ['2028-01-31T10:15:00.000Z', 1, '2028-02-29T10:15:00.000Z'],
    ['2026-08-31T00:00:00.000Z', 6, '2027-02-28T00:00:00.000Z'],
    ['2026-03-31T00:00:00.000Z', 1, '2026-04-30T00:00:00.000Z'],
    ['2026-11-15T08:00:00.000Z', 2, '2027-01-15T08:00:00.000Z'],
    ['2026-02-28T23:59:59.999Z', 12, '2027-02-28T23:59:59.999Z'],
    ['2026-05-10T00:00:00.000Z', 0, '2026-05-10T00:00:00.000Z'],
  ])('%s + %i month(s) = %s', (start, months, expected) => {
    expect(addMonthsClamped(at(start), months).toISOString()).toBe(expected);
  });

  it('never mutates the start date', () => {
    const start = at('2027-01-31T00:00:00.000Z');
    addMonthsClamped(start, 1);
    expect(start.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });

  it('refuses a fractional month count', () => {
    expect(() => addMonthsClamped(at('2026-01-01T00:00:00.000Z'), 1.5)).toThrow(
      RangeError,
    );
  });
});

describe('startsCoverageWindow', () => {
  it('is true for the hand-over statuses only', () => {
    const starting = Object.values(OrderStatus).filter(startsCoverageWindow);
    expect(starting.sort()).toEqual(
      [OrderStatus.finished, OrderStatus.shipped].sort(),
    );
  });
});

describe('coverageWindowPatch', () => {
  const handOver = at('2027-01-31T09:00:00.000Z');
  const fresh: CoverageWindowState = {
    orderType: OrderType.initial,
    coverageStartedAt: null,
    coverageExpiresAt: null,
    treatmentValidityMonths: 1,
  };

  it('starts the window of an initial case, expiry clamped', () => {
    expect(coverageWindowPatch(fresh, handOver)).toEqual({
      coverageStartedAt: handOver,
      coverageExpiresAt: at('2027-02-28T09:00:00.000Z'),
    });
  });

  it('starts the window without an expiry while the validity is unknown', () => {
    expect(
      coverageWindowPatch(
        { ...fresh, treatmentValidityMonths: null },
        handOver,
      ),
    ).toEqual({ coverageStartedAt: handOver, coverageExpiresAt: null });
  });

  it('is idempotent: a started window is never moved', () => {
    const started = {
      ...fresh,
      coverageStartedAt: at('2026-12-01T00:00:00.000Z'),
      coverageExpiresAt: at('2027-01-01T00:00:00.000Z'),
    };
    expect(coverageWindowPatch(started, handOver)).toBeNull();
  });

  it('completes the expiry from the ORIGINAL start once the validity is known', () => {
    const startedBlind = {
      ...fresh,
      coverageStartedAt: at('2026-08-31T00:00:00.000Z'),
      treatmentValidityMonths: 6,
    };
    expect(coverageWindowPatch(startedBlind, handOver)).toEqual({
      coverageExpiresAt: at('2027-02-28T00:00:00.000Z'),
    });
  });

  it('leaves a window started without validity alone while it stays unknown', () => {
    const startedBlind = {
      ...fresh,
      coverageStartedAt: at('2026-08-31T00:00:00.000Z'),
      treatmentValidityMonths: null,
    };
    expect(coverageWindowPatch(startedBlind, handOver)).toBeNull();
  });

  it.each([
    OrderType.additional_aligners,
    OrderType.replacement,
    OrderType.transfer_template,
    OrderType.warranty,
  ])('gives a %s child no window of its own', (orderType) => {
    expect(coverageWindowPatch({ ...fresh, orderType }, handOver)).toBeNull();
  });
});

type FakeOrder = {
  orderType: OrderType;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  quotation: {
    treatmentValidityMonths: number | null;
    deletedAt: Date | null;
  } | null;
};

/** One order row with the two calls the helper makes, compare-and-set honoured. */
function fakeTx(order: FakeOrder | null) {
  const row = order ? { ...order } : null;
  const updateMany = jest.fn(
    ({
      where,
      data,
    }: {
      where: { coverageStartedAt: Date | null; coverageExpiresAt: Date | null };
      data: Partial<FakeOrder>;
    }) => {
      const matches =
        row !== null &&
        row.coverageStartedAt?.getTime() ===
          where.coverageStartedAt?.getTime() &&
        row.coverageExpiresAt?.getTime() === where.coverageExpiresAt?.getTime();
      if (matches) Object.assign(row, data);
      return Promise.resolve({ count: matches ? 1 : 0 });
    },
  );
  const tx = {
    dentalOrder: {
      findUnique: jest.fn(() => Promise.resolve(row ? { ...row } : null)),
      updateMany,
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, row, updateMany };
}

describe('startCoverageWindow', () => {
  const delivered = at('2027-01-31T00:00:00.000Z');
  const initialCase: FakeOrder = {
    orderType: OrderType.initial,
    coverageStartedAt: null,
    coverageExpiresAt: null,
    quotation: { treatmentValidityMonths: 1, deletedAt: null },
  };

  it('starts the window on the first hand-over, then never again', async () => {
    const { tx, row, updateMany } = fakeTx(initialCase);

    await expect(startCoverageWindow(tx, 'o-1', delivered)).resolves.toBe(true);
    await expect(
      startCoverageWindow(tx, 'o-1', at('2027-03-15T00:00:00.000Z')),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', coverageStartedAt: null, coverageExpiresAt: null },
      data: {
        coverageStartedAt: delivered,
        coverageExpiresAt: at('2027-02-28T00:00:00.000Z'),
      },
    });
    expect(row).toMatchObject({
      coverageStartedAt: delivered,
      coverageExpiresAt: at('2027-02-28T00:00:00.000Z'),
    });
  });

  it('writes nothing when a concurrent hand-over started the window first', async () => {
    const { tx, row } = fakeTx(initialCase);
    // The other writer commits between our read and our write.
    (tx.dentalOrder.findUnique as jest.Mock).mockImplementationOnce(() => {
      const snapshot = { ...row };
      Object.assign(row!, {
        coverageStartedAt: at('2027-01-20T00:00:00.000Z'),
      });
      return Promise.resolve(snapshot);
    });

    await expect(startCoverageWindow(tx, 'o-1', delivered)).resolves.toBe(
      false,
    );
    expect(row?.coverageStartedAt).toEqual(at('2027-01-20T00:00:00.000Z'));
  });

  it('ignores the validity of an archived quotation', async () => {
    const { tx, updateMany } = fakeTx({
      ...initialCase,
      quotation: { treatmentValidityMonths: 12, deletedAt: at('2027-01-01') },
    });

    await startCoverageWindow(tx, 'o-1', delivered);

    expect(updateMany.mock.calls[0][0].data).toEqual({
      coverageStartedAt: delivered,
      coverageExpiresAt: null,
    });
  });

  it('is a no-op for a supplemental child and for a missing order', async () => {
    const child = fakeTx({ ...initialCase, orderType: OrderType.replacement });
    const missing = fakeTx(null);

    await expect(startCoverageWindow(child.tx, 'c-1', delivered)).resolves.toBe(
      false,
    );
    await expect(
      startCoverageWindow(missing.tx, 'x-1', delivered),
    ).resolves.toBe(false);
    expect(child.updateMany).not.toHaveBeenCalled();
    expect(missing.updateMany).not.toHaveBeenCalled();
  });
});

describe('firstHandOverAt', () => {
  function aggregates(delivery: Date | null, batch: Date | null) {
    const tx = {
      alignerDelivery: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _min: { deliveredAt: delivery } }),
      },
      quoteStepBatch: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _min: { deliveredAt: batch } }),
      },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, raw: tx };
  }

  it('is the earliest of the first delivery and the first delivered batch', async () => {
    const { tx, raw } = aggregates(
      at('2027-02-10T00:00:00.000Z'),
      at('2027-02-03T12:00:00.000Z'),
    );

    await expect(firstHandOverAt(tx, 'o-1')).resolves.toEqual(
      at('2027-02-03T12:00:00.000Z'),
    );
    expect(raw.quoteStepBatch.aggregate).toHaveBeenCalledWith({
      where: {
        status: BatchStatus.delivered,
        quotation: { orderId: 'o-1', deletedAt: null },
      },
      _min: { deliveredAt: true },
    });
  });

  it('is null when nothing was handed over yet', async () => {
    await expect(
      firstHandOverAt(aggregates(null, null).tx, 'o-1'),
    ).resolves.toBeNull();
  });
});
