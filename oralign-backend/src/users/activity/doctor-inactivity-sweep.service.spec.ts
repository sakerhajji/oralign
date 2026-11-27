import type { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AccountActivityEventKind,
  Prisma,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { PrismaService } from '../../prisma/prisma.service';
import { DAY_MS } from './doctor-activity.rules';
import { DoctorInactivitySweepService } from './doctor-inactivity-sweep.service';

const NOW = new Date('2026-12-01T06:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

type Row = Record<string, unknown>;

function doctor(over: Row = {}): Row {
  return {
    id: 'u-doc',
    role: UserRole.dentist,
    verificationStatus: VerificationStatus.approved,
    isActive: true,
    deletedAt: null,
    // Approved 8 months ago, never ordered: well past the 6-month deadline.
    createdAt: daysBefore(260),
    approvedAt: daysBefore(250),
    activityResetAt: null,
    inactiveSince: null,
    fullName: 'Dr Amel',
    email: 'amel@test.tn',
    preferredLanguage: 'fr',
    ...over,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/** An in-memory stand-in for the delegates the sweep touches. */
function fakeDb(input: {
  ruleEnabled?: boolean;
  /** CompanyBillingSettings.inactivityRuleEnabledAt (the last switch-on). */
  enabledAt?: Date | null;
  doctors?: Row[];
  /** _max per doctorId of the counted orders. */
  orders?: Record<string, { submittedAt: Date | null; createdAt: Date | null }>;
  /** Re-read under the lock (default: the same row). */
  fresh?: Row | null;
  /** Orders the locked re-read sees (a submission that raced the pass). */
  ordersUnderLock?: Record<
    string,
    { submittedAt: Date | null; createdAt: Date | null }
  >;
  events?: Row[];
}) {
  const events: Row[] = [...(input.events ?? [])];
  let underLock = false;
  const groupBy = jest.fn((args: { where: { doctorId: { in: string[] } } }) => {
    const source =
      underLock && input.ordersUnderLock
        ? input.ordersUnderLock
        : (input.orders ?? {});
    return Promise.resolve(
      args.where.doctorId.in
        .filter((id) => source[id])
        .map((id) => ({ doctorId: id, _max: source[id] })),
    );
  });
  const create = jest.fn((args: { data: Row }) => {
    const clash = events.some(
      (row) =>
        row.userId === args.data.userId &&
        row.kind === args.data.kind &&
        (row.anchorAt as Date).getTime() ===
          (args.data.anchorAt as Date).getTime(),
    );
    if (clash) return Promise.reject(uniqueViolation());
    const row = { id: `ev-${events.length + 1}`, ...args.data };
    events.push(row);
    return Promise.resolve({ id: row.id });
  });
  const forbidden = () => {
    throw new Error('the sweep never deletes');
  };
  const settings = {
    inactivityRuleEnabled: input.ruleEnabled ?? true,
    inactivityMonths: 6,
    inactivityRuleEnabledAt: input.enabledAt ?? null,
  };
  const db = {
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue(settings),
    },
    user: {
      findMany: jest.fn((args: { where: { id?: { gt: string } } }) =>
        Promise.resolve(args.where.id ? [] : (input.doctors ?? [doctor()])),
      ),
      findUnique: jest.fn(() =>
        Promise.resolve(
          input.fresh === undefined
            ? (input.doctors ?? [doctor()])[0]
            : input.fresh,
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(forbidden),
      deleteMany: jest.fn(forbidden),
    },
    dentalOrder: { groupBy, deleteMany: jest.fn(forbidden) },
    accountActivityEvent: {
      // Honours the query loadCycles sends: kind IN (...), anchorAt >= since.
      findMany: jest.fn(
        (args: {
          where: {
            kind: { in: AccountActivityEventKind[] };
            anchorAt?: { gte: Date };
          };
        }) =>
          Promise.resolve(
            events.filter(
              (row) =>
                args.where.kind.in.includes(
                  row.kind as AccountActivityEventKind,
                ) &&
                (!args.where.anchorAt ||
                  (row.anchorAt as Date).getTime() >=
                    args.where.anchorAt.gte.getTime()),
            ),
          ),
      ),
      create,
      deleteMany: jest.fn(forbidden),
    },
    $queryRaw: jest.fn(() => {
      underLock = true;
      return Promise.resolve([]);
    }),
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(<T>(run: (tx: typeof db) => Promise<T>) =>
      run(db).finally(() => {
        underLock = false;
      }),
    ),
  };
  return { db, prisma, events, settings };
}

function makeSweep(db: ReturnType<typeof fakeDb>) {
  const emit = jest.fn();
  const service = new DoctorInactivitySweepService(
    db.prisma as unknown as PrismaService,
    { emit } as unknown as EventEmitter2,
  );
  return { service, emit };
}

describe('DoctorInactivitySweepService', () => {
  it('does nothing while the rule is switched off', async () => {
    const db = fakeDb({ ruleEnabled: false });
    const { service, emit } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toEqual({
      ruleEnabled: false,
      scanned: 0,
      warned30: 0,
      warned7: 0,
      deactivated: 0,
    });
    expect(db.db.user.findMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('first pass on a doctor long past the deadline only warns (30 days of notice)', async () => {
    const db = fakeDb({});
    const { service, emit } = makeSweep(db);

    const result = await service.sweep(NOW);

    expect(result).toMatchObject({ scanned: 1, warned30: 1, deactivated: 0 });
    expect(db.db.user.updateMany).not.toHaveBeenCalled();
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({
      userId: 'u-doc',
      kind: AccountActivityEventKind.warning_30d,
      anchorAt: daysBefore(250),
      deadlineAt: new Date(NOW.getTime() + 30 * DAY_MS),
      createdAt: NOW,
    });
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.AccountInactivityWarning,
      expect.objectContaining({
        userId: 'u-doc',
        kind: AccountActivityEventKind.warning_30d,
        daysLeft: 30,
        email: 'amel@test.tn',
        preferredLanguage: 'fr',
      }),
    );
  });

  it('is idempotent: a second pass the same day writes and sends nothing', async () => {
    const db = fakeDb({});
    const { service, emit } = makeSweep(db);
    await service.sweep(NOW);
    emit.mockClear();

    const again = await service.sweep(new Date(NOW.getTime() + 60_000));

    expect(again).toMatchObject({ warned30: 0, warned7: 0, deactivated: 0 });
    expect(db.events).toHaveLength(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('a duplicate journal row (another instance won) is not re-sent', async () => {
    const db = fakeDb({});
    db.db.accountActivityEvent.create.mockRejectedValueOnce(uniqueViolation());
    const { service, emit } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toMatchObject({ warned30: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('walks 30 d → 7 d → deactivation, under the row lock, guarded', async () => {
    const anchor = daysBefore(250);
    const db = fakeDb({
      events: [
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_30d,
          anchorAt: anchor,
          createdAt: daysBefore(31),
        },
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_7d,
          anchorAt: anchor,
          createdAt: daysBefore(8),
        },
      ],
    });
    const { service, emit } = makeSweep(db);

    const result = await service.sweep(NOW);

    expect(result).toMatchObject({ deactivated: 1 });
    const lock = (db.db.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
    expect(lock.join('?')).toContain('FOR UPDATE');
    expect(db.db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-doc', inactiveSince: null },
      data: { inactiveSince: NOW },
    });
    expect(db.events[2]).toMatchObject({
      kind: AccountActivityEventKind.deactivated,
      anchorAt: anchor,
    });
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.AccountDeactivated,
      expect.objectContaining({
        userId: 'u-doc',
        kind: AccountActivityEventKind.deactivated,
      }),
    );
  });

  it('skips the deactivation when the doctor submitted an order meanwhile', async () => {
    const anchor = daysBefore(250);
    const db = fakeDb({
      events: [
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_30d,
          anchorAt: anchor,
          createdAt: daysBefore(31),
        },
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_7d,
          anchorAt: anchor,
          createdAt: daysBefore(8),
        },
      ],
      ordersUnderLock: {
        'u-doc': { submittedAt: NOW, createdAt: daysBefore(2) },
      },
    });
    const { service, emit } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toMatchObject({
      deactivated: 0,
    });
    expect(db.db.user.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips a doctor blocked or archived since the scan', async () => {
    const anchor = daysBefore(250);
    const db = fakeDb({
      fresh: doctor({ isActive: false }),
      events: [
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_30d,
          anchorAt: anchor,
          createdAt: daysBefore(31),
        },
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_7d,
          anchorAt: anchor,
          createdAt: daysBefore(8),
        },
      ],
    });
    const { service } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toMatchObject({
      deactivated: 0,
    });
    expect(db.db.user.updateMany).not.toHaveBeenCalled();
  });

  it('leaves a recently active doctor alone', async () => {
    const db = fakeDb({
      orders: { 'u-doc': { submittedAt: daysBefore(20), createdAt: null } },
    });
    const { service, emit } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toMatchObject({
      scanned: 1,
      warned30: 0,
      warned7: 0,
      deactivated: 0,
    });
    expect(db.events).toHaveLength(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('one doctor failing never stops the pass', async () => {
    const db = fakeDb({
      doctors: [doctor({ id: 'u-a' }), doctor({ id: 'u-b' })],
    });
    db.db.accountActivityEvent.create.mockRejectedValueOnce(new Error('boom'));
    const { service } = makeSweep(db);

    await expect(service.sweep(NOW)).resolves.toMatchObject({
      scanned: 2,
      warned30: 1,
    });
  });

  describe('cycle key: a switch-off or a block never leaves stale warnings behind', () => {
    const at = (days: number) => daysBefore(days);
    const kinds = (db: ReturnType<typeof fakeDb>) =>
      db.events.map((row) => row.kind);

    it('A. warned 30 d + 7 d, rule off, then on again months later: the first pass warns 30 days again, never deactivates', async () => {
      const firstOn = at(90);
      const db = fakeDb({ enabledAt: firstOn });
      const { service, emit } = makeSweep(db);

      await service.sweep(firstOn);
      await service.sweep(new Date(firstOn.getTime() + 24 * DAY_MS));
      expect(kinds(db)).toEqual([
        AccountActivityEventKind.warning_30d,
        AccountActivityEventKind.warning_7d,
      ]);
      expect(db.events[0].anchorAt).toEqual(firstOn);

      // Switched off before the deadline: nothing runs any more.
      db.settings.inactivityRuleEnabled = false;
      await expect(
        service.sweep(new Date(firstOn.getTime() + 40 * DAY_MS)),
      ).resolves.toMatchObject({ ruleEnabled: false, deactivated: 0 });

      // Switched on again yesterday.
      const secondOn = at(1);
      db.settings.inactivityRuleEnabled = true;
      db.settings.inactivityRuleEnabledAt = secondOn;
      emit.mockClear();

      const result = await service.sweep(NOW);

      expect(result).toMatchObject({ warned30: 1, warned7: 0, deactivated: 0 });
      expect(db.db.user.updateMany).not.toHaveBeenCalled();
      expect(db.events[2]).toMatchObject({
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: secondOn,
        deadlineAt: new Date(NOW.getTime() + 30 * DAY_MS),
      });
      expect(emit).toHaveBeenCalledWith(
        NotificationEvents.AccountInactivityWarning,
        expect.objectContaining({
          kind: AccountActivityEventKind.warning_30d,
          daysLeft: 30,
          // The notice still names the activity anchor, not the cycle key.
          anchorAt: daysBefore(250).toISOString(),
        }),
      );

      // And the new cycle walks on normally: 7 d, then the deactivation.
      await service.sweep(new Date(NOW.getTime() + 23 * DAY_MS));
      await service.sweep(new Date(NOW.getTime() + 30 * DAY_MS));
      expect(kinds(db).slice(2)).toEqual([
        AccountActivityEventKind.warning_30d,
        AccountActivityEventKind.warning_7d,
        AccountActivityEventKind.deactivated,
      ]);
      expect(db.events[4].anchorAt).toEqual(secondOn);
    });

    it('A bis. only the 30-day warning before the switch-off: the re-enabled rule starts again from the 30-day warning', async () => {
      const firstOn = at(90);
      const db = fakeDb({ enabledAt: firstOn });
      const { service } = makeSweep(db);
      await service.sweep(firstOn);
      db.settings.inactivityRuleEnabledAt = at(1);

      await expect(service.sweep(NOW)).resolves.toMatchObject({
        warned30: 1,
        warned7: 0,
      });
      expect(db.events[1]).toMatchObject({
        kind: AccountActivityEventKind.warning_30d,
        deadlineAt: new Date(NOW.getTime() + 30 * DAY_MS),
      });
    });

    it('B. warned, then blocked, then unblocked later: the next pass warns with the full 30-day notice', async () => {
      const anchor = daysBefore(250);
      const unblockedAt = at(2);
      const db = fakeDb({
        events: [
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.warning_30d,
            anchorAt: anchor,
            createdAt: at(90),
          },
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.warning_7d,
            anchorAt: anchor,
            createdAt: at(67),
          },
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.blocked,
            anchorAt: at(65),
            createdAt: at(65),
          },
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.unblocked,
            anchorAt: unblockedAt,
            createdAt: unblockedAt,
          },
        ],
      });
      const { service } = makeSweep(db);

      const result = await service.sweep(NOW);

      expect(result).toMatchObject({ warned30: 1, deactivated: 0 });
      expect(db.db.user.updateMany).not.toHaveBeenCalled();
      expect(db.events[4]).toMatchObject({
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: unblockedAt,
        deadlineAt: new Date(NOW.getTime() + 30 * DAY_MS),
      });
    });

    it('C. an untouched cycle still walks 30 d → 7 d → deactivated, under the switch-on key', async () => {
      const on = at(40);
      const db = fakeDb({ enabledAt: on });
      const { service } = makeSweep(db);

      await service.sweep(on);
      await service.sweep(new Date(on.getTime() + 23 * DAY_MS));
      const last = await service.sweep(new Date(on.getTime() + 30 * DAY_MS));

      expect(last).toMatchObject({ deactivated: 1 });
      expect(kinds(db)).toEqual([
        AccountActivityEventKind.warning_30d,
        AccountActivityEventKind.warning_7d,
        AccountActivityEventKind.deactivated,
      ]);
      expect(
        db.events.every(
          (row) => (row.anchorAt as Date).getTime() === on.getTime(),
        ),
      ).toBe(true);
    });

    it('skips the deactivation when the rule was switched off while the pass ran', async () => {
      const anchor = daysBefore(250);
      const db = fakeDb({
        events: [
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.warning_30d,
            anchorAt: anchor,
            createdAt: daysBefore(31),
          },
          {
            userId: 'u-doc',
            kind: AccountActivityEventKind.warning_7d,
            anchorAt: anchor,
            createdAt: daysBefore(8),
          },
        ],
      });
      db.db.companyBillingSettings.findFirst
        .mockResolvedValueOnce({ ...db.settings })
        .mockResolvedValueOnce({
          ...db.settings,
          inactivityRuleEnabled: false,
        });
      const { service, emit } = makeSweep(db);

      await expect(service.sweep(NOW)).resolves.toMatchObject({
        deactivated: 0,
      });
      expect(db.db.user.updateMany).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('a concurrent call shares the pass in progress', async () => {
    const db = fakeDb({});
    const { service } = makeSweep(db);
    const [a, b] = await Promise.all([service.sweep(NOW), service.sweep(NOW)]);
    expect(a).toBe(b);
    expect(db.db.companyBillingSettings.findFirst).toHaveBeenCalledTimes(1);
  });
});
