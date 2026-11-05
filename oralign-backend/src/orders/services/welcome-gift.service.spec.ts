import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from '../../common/access/caller';
import type { OrderAuditService } from './order-audit.service';
import {
  WELCOME_GIFT_AUDIT_ACTION,
  WelcomeGiftService,
} from './welcome-gift.service';

const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const D = (v: string | number) => new Prisma.Decimal(v);

type OrderRow = {
  doctorId: string;
  useCbctWithScans: boolean;
  cbctFeeAmount: Prisma.Decimal | null;
  treatmentFeePaidAt: Date | null;
  treatmentFeePaymentMethod: PaymentMethod | null;
  welcomeGiftAppliedAt: Date | null;
};

/** The order being submitted: a CBCT draft priced 50 on its snapshot. */
const draft = (over: Partial<OrderRow> = {}): OrderRow => ({
  doctorId: 'u-doc',
  useCbctWithScans: true,
  cbctFeeAmount: D('50.000'),
  treatmentFeePaidAt: null,
  treatmentFeePaymentMethod: null,
  welcomeGiftAppliedAt: null,
  ...over,
});

const settingsRow = (over: Record<string, unknown> = {}) => ({
  welcomeGiftEnabled: true,
  defaultTreatmentFee: D('300.000'),
  defaultCurrency: 'TND',
  cbctSupplementEnabled: true,
  cbctSupplementFee: D('50.000'),
  ...over,
});

type DoctorRow = { welcomeGiftUsedAt: Date | null };

/** Hand-made transaction client: one knob per rule. */
function makeTx(
  opts: {
    order?: OrderRow | null;
    settings?: Record<string, unknown> | null;
    /** The doctor's mark row; default = an unmarked doctor. */
    doctor?: DoctorRow | null;
    /**
     * An order of this doctor already carrying a gift. It must NOT matter:
     * the mark alone decides (a doctor reset by an admin may hold one).
     */
    giftOrder?: { id: string } | null;
    /** An OTHER case of this doctor ever submitted (firstCase). */
    earlier?: { id: string } | null;
    liveCard?: { id: string } | null;
    /** Rows the mark compare-and-set flips (0 = someone claimed it first). */
    claimed?: number;
  } = {},
) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    dentalOrder: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.order === undefined ? draft() : opts.order),
      // Told apart by their filter: a gift-order lookup (must not happen
      // any more) or an earlier submitted case.
      findFirst: jest.fn((args: { where: Prisma.DentalOrderWhereInput }) =>
        Promise.resolve(
          args.where.welcomeGiftAppliedAt
            ? (opts.giftOrder ?? null)
            : (opts.earlier ?? null),
        ),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.doctor === undefined ? { welcomeGiftUsedAt: null } : opts.doctor,
        ),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
    },
    companyBillingSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.settings === undefined ? settingsRow() : opts.settings,
        ),
    },
    payment: { findFirst: jest.fn().mockResolvedValue(opts.liveCard ?? null) },
    orderAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}
type Tx = ReturnType<typeof makeTx>;

function makeService(prisma: Record<string, unknown> = {}) {
  // Same shape OrderAuditService.entry returns: actor + action + metadata.
  const entry = jest.fn(
    (
      caller: Caller,
      action: string,
      _changes: unknown,
      metadata: Record<string, unknown>,
    ) =>
      Promise.resolve({
        actorId: caller.userId,
        actorName: 'Dr Test',
        actorRole: caller.role,
        action,
        metadata,
      }),
  );
  const service = new WelcomeGiftService(
    prisma as unknown as PrismaService,
    { entry } as unknown as OrderAuditService,
  );
  return { service, entry };
}

const apply = (service: WelcomeGiftService, tx: Tx, caller: Caller = doctor) =>
  service.applyOnSubmit(
    tx as unknown as Prisma.TransactionClient,
    'o-1',
    'u-doc',
    caller,
  );

/** The `data` written on the order by the (single) gift update. */
const written = (tx: Tx) =>
  (tx.dentalOrder.update.mock.calls as unknown[][])[0][0] as {
    where: { id: string };
    data: Record<string, unknown>;
  };

/** The `where` of the dentalOrder.findFirst lookups, by purpose. */
const lookups = (tx: Tx) => {
  const wheres = tx.dentalOrder.findFirst.mock.calls.map((c) => c[0].where);
  return {
    gift: wheres.find((w) => w.welcomeGiftAppliedAt),
    earlier: wheres.find((w) => !w.welcomeGiftAppliedAt),
  };
};

const expectNothingWritten = (tx: Tx) => {
  expect(tx.dentalOrder.update).not.toHaveBeenCalled();
  expect(tx.user.updateMany).not.toHaveBeenCalled();
  expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
};

describe('WelcomeGiftService.applyOnSubmit', () => {
  it('waives the live treatment fee + the CBCT snapshot on a new doctor’s first case', async () => {
    const { service, entry } = makeService();
    const tx = makeTx();

    await expect(apply(service, tx)).resolves.toBe(true);

    const { where, data } = written(tx);
    expect(where).toEqual({ id: 'o-1' });
    expect(data.welcomeGiftAppliedAt).toBeInstanceOf(Date);
    expect((data.welcomeGiftTreatmentFee as Prisma.Decimal).toNumber()).toBe(
      300,
    );
    expect((data.welcomeGiftCbctFee as Prisma.Decimal).toNumber()).toBe(50);
    expect(data.welcomeGiftCurrency).toBe('TND');
    expect(data.welcomeGiftFirstCase).toBe(true);
    // The payment columns are never touched: nothing was paid.
    expect(Object.keys(data).some((k) => k.startsWith('treatmentFee'))).toBe(
      false,
    );

    expect(entry).toHaveBeenCalledWith(
      doctor,
      WELCOME_GIFT_AUDIT_ACTION,
      null,
      {
        treatmentFee: 300,
        cbctFee: 50,
        total: 350,
        currency: 'TND',
        firstCase: true,
      },
    );
    const auditRow = (
      tx.orderAuditLog.create.mock.calls as unknown[][]
    )[0][0] as {
      data: Record<string, unknown>;
    };
    expect(auditRow.data).toMatchObject({
      orderId: 'o-1',
      action: 'welcome_gift_applied',
      actorId: 'u-doc',
      metadata: {
        treatmentFee: 300,
        cbctFee: 50,
        total: 350,
        currency: 'TND',
        firstCase: true,
      },
    });
  });

  it('claims the doctor mark with a compare-and-set, BEFORE the order, at the same instant as the gift', async () => {
    const { service } = makeService();
    const tx = makeTx();

    await apply(service, tx);

    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
    const mark = (tx.user.updateMany.mock.calls as unknown[][])[0][0] as {
      where: Record<string, unknown>;
      data: { welcomeGiftUsedAt: Date };
    };
    // Only flips a CLEAR mark: a concurrent claim makes it match 0 rows.
    expect(mark.where).toEqual({ id: 'u-doc', welcomeGiftUsedAt: null });
    expect(mark.data.welcomeGiftUsedAt).toBeInstanceOf(Date);
    expect(mark.data.welcomeGiftUsedAt).toBe(
      written(tx).data.welcomeGiftAppliedAt,
    );
    // Only the mark: nothing else on the user row changes.
    expect(Object.keys(mark.data)).toEqual(['welcomeGiftUsedAt']);
    expect(tx.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.dentalOrder.update.mock.invocationCallOrder[0],
    );
  });

  it('compare-and-set lost (the mark was claimed meanwhile): writes nothing on the order', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({ claimed: 0 });

    await expect(apply(service, tx)).resolves.toBe(false);
    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
    expect(entry).not.toHaveBeenCalled();
  });

  it('takes the per-doctor advisory lock BEFORE reading anything', async () => {
    const { service } = makeService();
    const tx = makeTx();

    await apply(service, tx);

    const [strings, ...values] = (
      tx.$executeRaw.mock.calls as unknown[][]
    )[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect(values).toEqual(['welcome-gift:u-doc']);
    const lockedAt = tx.$executeRaw.mock.invocationCallOrder[0];
    expect(lockedAt).toBeLessThan(
      tx.dentalOrder.findUnique.mock.invocationCallOrder[0],
    );
    expect(lockedAt).toBeLessThan(
      tx.companyBillingSettings.findFirst.mock.invocationCallOrder[0],
    );
    expect(lockedAt).toBeLessThan(
      tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(lockedAt).toBeLessThan(
      tx.dentalOrder.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('reads the ACTIVE settings row, newest first', async () => {
    const { service } = makeService();
    const tx = makeTx();

    await apply(service, tx);

    expect(tx.companyBillingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('applies whoever presses submit (an admin on the doctor’s behalf)', async () => {
    const { service, entry } = makeService();
    const tx = makeTx();

    await expect(apply(service, tx, admin)).resolves.toBe(true);
    // The lock, the rules and the mark are about the DOCTOR; the audit
    // actor is the admin.
    const lockArgs = (tx.$executeRaw.mock.calls as unknown[][])[0];
    expect(lockArgs.slice(1)).toEqual(['welcome-gift:u-doc']);
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-doc' },
      select: { welcomeGiftUsedAt: true },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-doc', welcomeGiftUsedAt: null },
      }),
    );
    expect(entry.mock.calls[0][0]).toBe(admin);
  });

  it('waives the treatment fee only (cbctFee 0) when the order has no CBCT', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({
      order: draft({ useCbctWithScans: false, cbctFeeAmount: null }),
    });

    await expect(apply(service, tx)).resolves.toBe(true);
    expect(
      (written(tx).data.welcomeGiftCbctFee as Prisma.Decimal).toNumber(),
    ).toBe(0);
    expect(entry.mock.calls[0][3]).toEqual({
      treatmentFee: 300,
      cbctFee: 0,
      total: 300,
      currency: 'TND',
      firstCase: true,
    });
  });

  it('ignores a stale CBCT snapshot when the order no longer requests CBCT', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({
      order: draft({ useCbctWithScans: false, cbctFeeAmount: D(50) }),
    });

    await apply(service, tx);
    expect(entry.mock.calls[0][3]).toMatchObject({ cbctFee: 0, total: 300 });
  });

  it('prices CBCT from the ORDER snapshot, not the live supplement', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({
      order: draft({ cbctFeeAmount: D('120.500') }),
      settings: settingsRow({ cbctSupplementFee: D(200) }),
    });

    await apply(service, tx);
    expect(entry.mock.calls[0][3]).toMatchObject({
      cbctFee: 120.5,
      total: 420.5,
    });
  });

  it('falls back to TND when the settings carry no currency', async () => {
    const { service } = makeService();
    const tx = makeTx({ settings: settingsRow({ defaultCurrency: '' }) });

    await apply(service, tx);
    expect(written(tx).data.welcomeGiftCurrency).toBe('TND');
  });

  it('does nothing when the switch is off', async () => {
    const { service } = makeService();
    const tx = makeTx({ settings: settingsRow({ welcomeGiftEnabled: false }) });

    await expect(apply(service, tx)).resolves.toBe(false);
    expectNothingWritten(tx);
  });

  it('does nothing when no billing settings exist', async () => {
    const { service } = makeService();
    const tx = makeTx({ settings: null });

    await expect(apply(service, tx)).resolves.toBe(false);
    expectNothingWritten(tx);
  });

  it('gives it to a current doctor with earlier cases and no mark (firstCase false)', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({ earlier: { id: 'o-old' } });

    await expect(apply(service, tx)).resolves.toBe(true);

    expect(written(tx).data.welcomeGiftFirstCase).toBe(false);
    expect(entry.mock.calls[0][3]).toEqual({
      treatmentFee: 300,
      cbctFee: 50,
      total: 350,
      currency: 'TND',
      firstCase: false,
    });
    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('counts soft-deleted and canceled cases as earlier ones for firstCase', async () => {
    const { service } = makeService();
    const tx = makeTx({ earlier: { id: 'o-archived' } });

    await apply(service, tx);

    expect(lookups(tx).earlier).toEqual({
      doctorId: 'u-doc',
      id: { not: 'o-1' },
      OR: [
        { submittedAt: { not: null } },
        { status: { not: OrderStatus.draft } },
      ],
    });
    // No deletedAt filter: an archived case still was one of their cases.
    expect(lookups(tx).earlier).not.toHaveProperty('deletedAt');
    expect(written(tx).data.welcomeGiftFirstCase).toBe(false);
  });

  it.each([
    ['a marked doctor', { welcomeGiftUsedAt: new Date('2026-10-01') }],
    ['a doctor row that no longer exists', null],
  ])('never gives it to %s', async (_label, doctorRow) => {
    const { service } = makeService();
    const tx = makeTx({ doctor: doctorRow });

    await expect(apply(service, tx)).resolves.toBe(false);
    expectNothingWritten(tx);
  });

  it('the mark alone decides: a doctor reset to available gets a second gift on a later case', async () => {
    const { service, entry } = makeService();
    // An earlier case of theirs already carries a gift; an admin cleared
    // the mark since.
    const tx = makeTx({
      giftOrder: { id: 'o-gift' },
      earlier: { id: 'o-gift' },
    });

    await expect(apply(service, tx)).resolves.toBe(true);
    // No gift-order lookup any more: only the mark is read.
    expect(lookups(tx).gift).toBeUndefined();
    expect(written(tx).data.welcomeGiftFirstCase).toBe(false);
    expect(entry.mock.calls[0][3]).toMatchObject({ total: 350 });
    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['already paid', { treatmentFeePaidAt: new Date('2026-11-01') }],
    [
      'a declared bank transfer',
      { treatmentFeePaymentMethod: PaymentMethod.bank_transfer },
    ],
    [
      'a recorded cash payment',
      { treatmentFeePaymentMethod: PaymentMethod.cash },
    ],
  ])('keeps the normal flow for an order with %s', async (_label, over) => {
    const { service } = makeService();
    const tx = makeTx({ order: draft(over as Partial<OrderRow>) });

    await expect(apply(service, tx)).resolves.toBe(false);
    expectNothingWritten(tx);
  });

  it('keeps the normal flow while a hosted card attempt is still live', async () => {
    const { service } = makeService();
    const tx = makeTx({ liveCard: { id: 'pay-1' } });

    await expect(apply(service, tx)).resolves.toBe(false);
    expect(tx.payment.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: 'o-1',
        purpose: PaymentPurpose.treatment_fee,
        provider: PaymentProvider.clictopay,
        status: {
          in: [PaymentRecordStatus.pending, PaymentRecordStatus.unknown],
        },
      },
      select: { id: true },
    });
    expectNothingWritten(tx);
  });

  it('does nothing when there is nothing to waive (total 0)', async () => {
    const { service } = makeService();
    const tx = makeTx({
      order: draft({ useCbctWithScans: false, cbctFeeAmount: null }),
      settings: settingsRow({ defaultTreatmentFee: D(0) }),
    });

    await expect(apply(service, tx)).resolves.toBe(false);
    expectNothingWritten(tx);
  });

  it('still waives a CBCT-only charge when the treatment fee is 0', async () => {
    const { service, entry } = makeService();
    const tx = makeTx({ settings: settingsRow({ defaultTreatmentFee: D(0) }) });

    await expect(apply(service, tx)).resolves.toBe(true);
    expect(entry.mock.calls[0][3]).toEqual({
      treatmentFee: 0,
      cbctFee: 50,
      total: 50,
      currency: 'TND',
      firstCase: true,
    });
  });

  it('is idempotent: an order that already has the gift is never re-priced', async () => {
    const { service } = makeService();
    const tx = makeTx({
      order: draft({ welcomeGiftAppliedAt: new Date('2026-10-01') }),
      // Even a changed config must not touch the frozen gift.
      settings: settingsRow({ defaultTreatmentFee: D(999) }),
    });

    await expect(apply(service, tx)).resolves.toBe(false);
    expect(tx.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expectNothingWritten(tx);
  });

  it('does nothing for an order that is not this doctor’s (or no longer exists)', async () => {
    const { service } = makeService();
    const foreign = makeTx({ order: draft({ doctorId: 'u-other' }) });
    const missing = makeTx({ order: null });

    await expect(apply(service, foreign)).resolves.toBe(false);
    await expect(apply(service, missing)).resolves.toBe(false);
    expectNothingWritten(foreign);
    expectNothingWritten(missing);
  });
});

describe('WelcomeGiftService.getStatus', () => {
  /** prisma double: the doctor mark, the gift and "submitted once" lookups. */
  function statusPrisma(opts: {
    settings?: Record<string, unknown> | null;
    doctor?: DoctorRow | null;
    giftOrder?: { id: string } | null;
    submitted?: { id: string } | null;
  }) {
    const findFirst = jest.fn((args: { where: Prisma.DentalOrderWhereInput }) =>
      Promise.resolve(
        args.where.welcomeGiftAppliedAt
          ? (opts.giftOrder ?? null)
          : (opts.submitted ?? null),
      ),
    );
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        opts.doctor === undefined ? { welcomeGiftUsedAt: null } : opts.doctor,
      );
    return {
      prisma: {
        companyBillingSettings: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              opts.settings === undefined ? settingsRow() : opts.settings,
            ),
        },
        user: { findUnique },
        dentalOrder: { findFirst },
      },
      findFirst,
      findUnique,
    };
  }

  it('offers the treatment fee + the live CBCT supplement to a new doctor', async () => {
    const { prisma, findUnique } = statusPrisma({});
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toEqual({
      enabled: true,
      eligible: true,
      firstCase: true,
      currency: 'TND',
      treatmentFee: 300,
      cbctFee: 50,
      cbctOffered: true,
      total: 350,
      giftOrderId: null,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u-doc' },
      select: { welcomeGiftUsedAt: true },
    });
  });

  it('leaves CBCT out when the paid supplement is disabled or priced 0', async () => {
    for (const over of [
      { cbctSupplementEnabled: false },
      { cbctSupplementFee: D(0) },
    ]) {
      const { prisma } = statusPrisma({ settings: settingsRow(over) });
      const { service } = makeService(prisma);
      await expect(service.getStatus('u-doc')).resolves.toMatchObject({
        eligible: true,
        cbctFee: 0,
        cbctOffered: false,
        total: 300,
      });
    }
  });

  it('is no longer eligible once the gift was consumed, and names the order', async () => {
    const { prisma } = statusPrisma({
      doctor: { welcomeGiftUsedAt: new Date('2026-11-04') },
      giftOrder: { id: 'o-gift' },
      submitted: { id: 'o-gift' },
    });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      enabled: true,
      eligible: false,
      giftOrderId: 'o-gift',
    });
  });

  it('stays eligible for a current doctor with past cases and no mark (firstCase false)', async () => {
    const { prisma, findFirst } = statusPrisma({ submitted: { id: 'o-old' } });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      eligible: true,
      firstCase: false,
      giftOrderId: null,
    });
    // Drafts do not count as a case; archived / canceled ones do.
    const submittedQuery = findFirst.mock.calls
      .map((c) => c[0].where)
      .find((w) => !w.welcomeGiftAppliedAt);
    expect(submittedQuery).toEqual({
      doctorId: 'u-doc',
      OR: [
        { submittedAt: { not: null } },
        { status: { not: OrderStatus.draft } },
      ],
    });
  });

  it('is never eligible for a marked doctor, even without a gift order', async () => {
    const { prisma } = statusPrisma({
      doctor: { welcomeGiftUsedAt: new Date('2026-11-04') },
    });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      enabled: true,
      eligible: false,
      firstCase: true,
      giftOrderId: null,
    });
  });

  it('is eligible again once an admin cleared the mark, even with an earlier gift order', async () => {
    const { prisma, findFirst } = statusPrisma({
      giftOrder: { id: 'o-gift' },
      submitted: { id: 'o-gift' },
    });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      eligible: true,
      firstCase: false,
      giftOrderId: 'o-gift',
    });
    // giftOrderId = the doctor's MOST RECENT gift order (deterministic now
    // that a doctor may hold several).
    const giftQuery = findFirst.mock.calls
      .map((c) => c[0] as { where: Prisma.DentalOrderWhereInput })
      .find((a) => a.where.welcomeGiftAppliedAt);
    expect(giftQuery).toMatchObject({
      where: { doctorId: 'u-doc', welcomeGiftAppliedAt: { not: null } },
      orderBy: { welcomeGiftAppliedAt: 'desc' },
    });
  });

  it('is not eligible when the doctor row does not exist', async () => {
    const { prisma } = statusPrisma({ doctor: null });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      enabled: true,
      eligible: false,
    });
  });

  it('reports the switch off (amounts still shown) and is not eligible', async () => {
    const { prisma } = statusPrisma({
      settings: settingsRow({ welcomeGiftEnabled: false }),
    });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      enabled: false,
      eligible: false,
      total: 350,
    });
  });

  it('is not eligible when there is nothing to offer (total 0)', async () => {
    const { prisma } = statusPrisma({
      settings: settingsRow({
        defaultTreatmentFee: D(0),
        cbctSupplementEnabled: false,
      }),
    });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toMatchObject({
      enabled: true,
      eligible: false,
      total: 0,
    });
  });

  it('reads as disabled with zero amounts when no settings row exists', async () => {
    const { prisma } = statusPrisma({ settings: null });
    const { service } = makeService(prisma);

    await expect(service.getStatus('u-doc')).resolves.toEqual({
      enabled: false,
      eligible: false,
      firstCase: true,
      currency: 'TND',
      treatmentFee: 0,
      cbctFee: 0,
      cbctOffered: false,
      total: 0,
      giftOrderId: null,
    });
  });
});

describe('WelcomeGiftService.setDoctorMark', () => {
  type MarkRow = {
    role: UserRole;
    deletedAt: Date | null;
    welcomeGiftUsedAt: Date | null;
  };
  const dentistRow = (over: Partial<MarkRow> = {}): MarkRow => ({
    role: UserRole.dentist,
    deletedAt: null,
    welcomeGiftUsedAt: null,
    ...over,
  });

  /** prisma double: `$transaction(fn)` runs fn on a tiny tx client. */
  function markPrisma(row: MarkRow | null) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { prisma, tx };
  }

  it('clears a used mark: the doctor is available again', async () => {
    const { prisma, tx } = markPrisma(
      dentistRow({ welcomeGiftUsedAt: new Date('2026-10-01') }),
    );
    const { service } = makeService(prisma);

    await expect(service.setDoctorMark('u-doc', false, admin)).resolves.toEqual(
      { doctorId: 'u-doc', welcomeGiftUsedAt: null },
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-doc' },
      data: { welcomeGiftUsedAt: null },
    });
  });

  it('marks an available doctor as used (now)', async () => {
    const { prisma, tx } = markPrisma(dentistRow());
    const { service } = makeService(prisma);

    const res = await service.setDoctorMark('u-doc', true, admin);

    expect(res.doctorId).toBe('u-doc');
    expect(res.welcomeGiftUsedAt).toBeInstanceOf(Date);
    const written = (tx.user.update.mock.calls as unknown[][])[0][0] as {
      data: { welcomeGiftUsedAt: Date };
    };
    expect(written.data.welcomeGiftUsedAt).toBe(res.welcomeGiftUsedAt);
  });

  it('takes the same per-doctor advisory lock as the submit path, before reading', async () => {
    const { prisma, tx } = markPrisma(dentistRow());
    const { service } = makeService(prisma);

    await service.setDoctorMark('u-doc', true, admin);

    const [strings, ...values] = (
      tx.$executeRaw.mock.calls as unknown[][]
    )[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect(values).toEqual(['welcome-gift:u-doc']);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.findUnique.mock.invocationCallOrder[0],
    );
  });

  it('is idempotent: "used" on a used doctor keeps the ORIGINAL date and writes nothing', async () => {
    const original = new Date('2026-09-15T10:00:00Z');
    const { prisma, tx } = markPrisma(
      dentistRow({ welcomeGiftUsedAt: original }),
    );
    const { service } = makeService(prisma);

    await expect(service.setDoctorMark('u-doc', true, admin)).resolves.toEqual({
      doctorId: 'u-doc',
      welcomeGiftUsedAt: original,
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('is idempotent: "available" on an available doctor writes nothing', async () => {
    const { prisma, tx } = markPrisma(dentistRow());
    const { service } = makeService(prisma);

    await expect(service.setDoctorMark('u-doc', false, admin)).resolves.toEqual(
      { doctorId: 'u-doc', welcomeGiftUsedAt: null },
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown user', null],
    ['a soft-deleted dentist', dentistRow({ deletedAt: new Date() })],
    ['an admin', dentistRow({ role: UserRole.admin })],
    ['a designer', dentistRow({ role: UserRole.designer })],
  ])('404 for %s, nothing written', async (_label, row) => {
    const { prisma, tx } = markPrisma(row);
    const { service } = makeService(prisma);

    await expect(
      service.setDoctorMark('u-x', false, admin),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('WelcomeGiftService — the mark alone decides (stateful flow)', () => {
  /**
   * One in-memory doctor shared by the submit tx and the admin control:
   * first gift, then no gift while marked, then an admin reset, then a
   * second gift on a later case, then an admin "used" → no gift.
   */
  function world() {
    const state = { mark: null as Date | null, gifts: [] as string[] };
    let orderId = '';
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dentalOrder: {
        findUnique: jest.fn(() => Promise.resolve(draft())),
        findFirst: jest.fn(() =>
          Promise.resolve(state.gifts.length ? { id: state.gifts[0] } : null),
        ),
        update: jest.fn((args: { where: { id: string } }) => {
          state.gifts.push(args.where.id);
          return Promise.resolve({});
        }),
      },
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            role: UserRole.dentist,
            deletedAt: null,
            welcomeGiftUsedAt: state.mark,
          }),
        ),
        update: jest.fn(
          (args: { data: { welcomeGiftUsedAt: Date | null } }) => {
            state.mark = args.data.welcomeGiftUsedAt;
            return Promise.resolve({});
          },
        ),
        // Compare-and-set, like Postgres: only flips a NULL mark.
        updateMany: jest.fn((args: { data: { welcomeGiftUsedAt: Date } }) => {
          if (state.mark !== null) return Promise.resolve({ count: 0 });
          state.mark = args.data.welcomeGiftUsedAt;
          return Promise.resolve({ count: 1 });
        }),
      },
      companyBillingSettings: {
        findFirst: jest.fn().mockResolvedValue(settingsRow()),
      },
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      orderAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const { service } = makeService(prisma);
    const submit = (id: string) => {
      orderId = id;
      return service.applyOnSubmit(
        tx as unknown as Prisma.TransactionClient,
        orderId,
        'u-doc',
        doctor,
      );
    };
    return { state, service, submit };
  }

  it('gift → marked → admin reset → second gift → admin "used" → no gift', async () => {
    const { state, service, submit } = world();

    await expect(submit('o-1')).resolves.toBe(true);
    expect(state.mark).toBeInstanceOf(Date);
    await expect(submit('o-2')).resolves.toBe(false);

    await service.setDoctorMark('u-doc', false, admin);
    expect(state.mark).toBeNull();
    await expect(submit('o-3')).resolves.toBe(true);
    expect(state.gifts).toEqual(['o-1', 'o-3']);

    await service.setDoctorMark('u-doc', false, admin);
    await service.setDoctorMark('u-doc', true, admin);
    await expect(submit('o-4')).resolves.toBe(false);
    expect(state.gifts).toEqual(['o-1', 'o-3']);
  });
});
