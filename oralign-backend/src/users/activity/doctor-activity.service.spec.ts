import type { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AccountActivityEventKind,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActivityAccountRow } from './doctor-activity.repository';
import { DAY_MS, nominalDeadline } from './doctor-activity.rules';
import { DoctorActivityService } from './doctor-activity.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const NOW = new Date('2026-12-01T06:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const account = (
  over: Partial<ActivityAccountRow> = {},
): ActivityAccountRow => ({
  id: 'u-doc',
  role: UserRole.dentist,
  verificationStatus: VerificationStatus.approved,
  isActive: true,
  deletedAt: null,
  createdAt: daysBefore(400),
  approvedAt: daysBefore(390),
  activityResetAt: null,
  inactiveSince: null,
  ...over,
});

function fakeDb(input: {
  ruleEnabled?: boolean;
  /** CompanyBillingSettings.inactivityRuleEnabledAt. */
  enabledAt?: Date | null;
  /** AccountActivityEvent rows (loadCycles reads the warnings and unblocks). */
  events?: Array<Record<string, unknown>>;
  target?: Record<string, unknown> | null;
  locked?: Record<string, unknown> | null;
  orders?: Record<string, { submittedAt: Date | null; createdAt: Date | null }>;
  subjects?: ActivityAccountRow[];
}) {
  const db = {
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        inactivityRuleEnabled: input.ruleEnabled ?? true,
        inactivityMonths: 6,
        inactivityRuleEnabledAt: input.enabledAt ?? null,
      }),
    },
    user: {
      findUnique: jest.fn((args: { select: Record<string, boolean> }) =>
        Promise.resolve(
          args.select.fullName && !args.select.email
            ? { fullName: 'Admin Root' }
            : args.select.email
              ? (input.locked ?? null)
              : (input.target ?? null),
        ),
      ),
      findMany: jest.fn((args: { where: { id?: unknown } }) =>
        Promise.resolve(args.where.id ? [] : (input.subjects ?? [])),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dentalOrder: {
      groupBy: jest.fn((args: { where: { doctorId: { in: string[] } } }) =>
        Promise.resolve(
          args.where.doctorId.in
            .filter((id) => input.orders?.[id])
            .map((id) => ({ doctorId: id, _max: input.orders![id] })),
        ),
      ),
    },
    accountActivityEvent: {
      findMany: jest.fn(
        (args: { where: { kind?: { in: AccountActivityEventKind[] } } }) =>
          Promise.resolve(
            (input.events ?? []).filter(
              (row) =>
                !args.where.kind ||
                args.where.kind.in.includes(
                  row.kind as AccountActivityEventKind,
                ),
            ),
          ),
      ),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      createMany: jest.fn((args: { data: unknown[] }) =>
        Promise.resolve({ count: args.data.length }),
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(<T>(run: (tx: typeof db) => Promise<T>) => run(db)),
  };
  return { db, prisma };
}

function makeService(db: ReturnType<typeof fakeDb>) {
  const emit = jest.fn();
  const service = new DoctorActivityService(
    db.prisma as unknown as PrismaService,
    { emit } as unknown as EventEmitter2,
  );
  return { service, emit };
}

describe('DoctorActivityService.reactivate', () => {
  const dormant = {
    id: 'u-doc',
    role: UserRole.dentist,
    verificationStatus: VerificationStatus.approved,
    isActive: true,
    deletedAt: null,
    createdAt: daysBefore(400),
    approvedAt: daysBefore(390),
    activityResetAt: null,
    inactiveSince: daysBefore(3),
    fullName: 'Dr Amel',
    email: 'amel@test.tn',
    preferredLanguage: 'fr',
  };

  it('requires a 3-500 character reason (400 REACTIVATION_REASON_REQUIRED)', async () => {
    const db = fakeDb({ target: { role: UserRole.dentist, deletedAt: null } });
    const { service } = makeService(db);
    for (const reason of [undefined, '', '  ab  ', 'x'.repeat(501), 42]) {
      await expect(
        service.reactivate('u-doc', admin, reason),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'REACTIVATION_REASON_REQUIRED',
      });
    }
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a non-dentist (400 ACCOUNT_ACTIVITY_NOT_A_DOCTOR) and an unknown account (404)', async () => {
    const { service } = makeService(
      fakeDb({ target: { role: UserRole.admin, deletedAt: null } }),
    );
    await expect(
      service.reactivate('u-x', admin, 'Retour du praticien'),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'ACCOUNT_ACTIVITY_NOT_A_DOCTOR',
    });

    const missing = makeService(fakeDb({ target: null })).service;
    await expect(
      missing.reactivate('u-x', admin, 'Retour du praticien'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reactivates under the row lock: reset the clock, journal the reason, notify', async () => {
    const db = fakeDb({
      target: { role: UserRole.dentist, deletedAt: null },
      locked: dormant,
    });
    const { service, emit } = makeService(db);

    await expect(
      service.reactivate('u-doc', admin, '  Reprise des cas en janvier  '),
    ).resolves.toEqual({ changed: true });

    const lock = (db.db.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
    expect(lock.join('?')).toContain('FOR UPDATE');
    expect(db.db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-doc', inactiveSince: { not: null } },
      data: {
        inactiveSince: null,
        activityResetAt: expect.any(Date) as unknown as Date,
      },
    });
    const created = (
      db.db.accountActivityEvent.create.mock.calls as unknown[][]
    )[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data).toMatchObject({
      userId: 'u-doc',
      kind: AccountActivityEventKind.reactivated,
      actorId: 'u-admin',
      actorName: 'Admin Root',
      actorRole: UserRole.admin,
      reason: 'Reprise des cas en janvier',
    });
    // anchorAt is the event instant; the new deadline 6 months later.
    const anchor = created.data.anchorAt as Date;
    expect(created.data.deadlineAt).toEqual(
      new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth() + 6,
          anchor.getUTCDate(),
          anchor.getUTCHours(),
          anchor.getUTCMinutes(),
          anchor.getUTCSeconds(),
          anchor.getUTCMilliseconds(),
        ),
      ),
    );
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.AccountReactivated,
      expect.objectContaining({
        userId: 'u-doc',
        kind: AccountActivityEventKind.reactivated,
        reason: 'Reprise des cas en janvier',
      }),
    );
  });

  it('is idempotent: an account that is not dormant changes nothing', async () => {
    const db = fakeDb({
      target: { role: UserRole.dentist, deletedAt: null },
      locked: { ...dormant, inactiveSince: null },
    });
    const { service, emit } = makeService(db);

    await expect(
      service.reactivate('u-doc', admin, 'Retour du praticien'),
    ).resolves.toEqual({ changed: false });
    expect(db.db.user.updateMany).not.toHaveBeenCalled();
    expect(db.db.accountActivityEvent.create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('DoctorActivityService.summaries', () => {
  it('blocks dentists only, with the deadline when the rule runs', async () => {
    const db = fakeDb({
      orders: { 'u-doc': { submittedAt: daysBefore(170), createdAt: null } },
    });
    const { service } = makeService(db);

    const map = await service.summaries(
      [account(), account({ id: 'u-adm', role: UserRole.admin })],
      NOW,
    );

    expect(map.has('u-adm')).toBe(false);
    expect(map.get('u-doc')).toMatchObject({
      status: 'warned',
      lastSubmittedOrderAt: daysBefore(170).toISOString(),
      anchorAt: daysBefore(170).toISOString(),
      inactiveSince: null,
      ruleEnabled: true,
    });
    expect(map.get('u-doc')?.deadlineAt).not.toBeNull();
    // One aggregate for the whole page.
    expect(db.db.dentalOrder.groupBy).toHaveBeenCalledTimes(1);
  });

  it('shows no deadline while the rule is off, and dormancy whatever the switch', async () => {
    const { service } = makeService(fakeDb({ ruleEnabled: false }));
    const map = await service.summaries(
      [account(), account({ id: 'u-z', inactiveSince: daysBefore(1) })],
      NOW,
    );
    expect(map.get('u-doc')).toMatchObject({
      status: 'active',
      deadlineAt: null,
      ruleEnabled: false,
    });
    expect(map.get('u-z')).toMatchObject({
      status: 'inactive',
      deadlineAt: null,
    });
  });

  it('after the rule is switched on again, warnings of the earlier run are ignored: the desk shows the full 30-day notice', async () => {
    const firstOn = daysBefore(120);
    const warned = (kind: AccountActivityEventKind, days: number) => ({
      userId: 'u-doc',
      kind,
      anchorAt: firstOn,
      createdAt: daysBefore(days),
    });
    const events = [
      warned(AccountActivityEventKind.warning_30d, 120),
      warned(AccountActivityEventKind.warning_7d, 97),
    ];
    const stale = makeService(fakeDb({ enabledAt: firstOn, events })).service;
    const fresh = makeService(
      fakeDb({ enabledAt: daysBefore(1), events }),
    ).service;

    // Same rows, never switched off: the deadline is long past (shown as now).
    expect(
      (await stale.summaries([account()], NOW)).get('u-doc'),
    ).toMatchObject({ status: 'warned', deadlineAt: NOW.toISOString() });
    // Switched on again yesterday: a fresh cycle, the first warning still owed.
    expect(
      (await fresh.summaries([account()], NOW)).get('u-doc'),
    ).toMatchObject({
      status: 'warned',
      deadlineAt: new Date(NOW.getTime() + 30 * DAY_MS).toISOString(),
    });
  });

  it('costs nothing for a page without dentists', async () => {
    const db = fakeDb({});
    const { service } = makeService(db);
    await expect(
      service.summaries([account({ role: UserRole.technician })]),
    ).resolves.toEqual(new Map());
    expect(db.db.companyBillingSettings.findFirst).not.toHaveBeenCalled();
  });
});

describe('DoctorActivityService.listFilterWhere', () => {
  it('inactive is the dormant column', async () => {
    const { service } = makeService(fakeDb({}));
    await expect(service.listFilterWhere('inactive')).resolves.toEqual({
      role: UserRole.dentist,
      inactiveSince: { not: null },
    });
  });

  it('warned / active split the live dentists on the derived deadline', async () => {
    const db = fakeDb({
      subjects: [account({ id: 'u-old' }), account({ id: 'u-new' })],
      orders: { 'u-new': { submittedAt: daysBefore(10), createdAt: null } },
    });
    const { service } = makeService(db);

    await expect(service.listFilterWhere('warned', NOW)).resolves.toEqual({
      role: UserRole.dentist,
      inactiveSince: null,
      id: { in: ['u-old'] },
    });
    await expect(service.listFilterWhere('active', NOW)).resolves.toEqual({
      role: UserRole.dentist,
      inactiveSince: null,
      id: { notIn: ['u-old'] },
    });
  });

  it('nobody is warned while the rule is off', async () => {
    const { service } = makeService(fakeDb({ ruleEnabled: false }));
    await expect(service.listFilterWhere('warned')).resolves.toEqual({
      role: UserRole.dentist,
      inactiveSince: null,
      id: { in: [] },
    });
  });
});

describe('DoctorActivityService.journalStatusChange', () => {
  it('writes one blocked row per flipped account, deadline for dentists only', async () => {
    const db = fakeDb({});
    const { service } = makeService(db);
    const at = NOW;

    await service.journalStatusChange(
      db.prisma as never,
      [account(), account({ id: 'u-tech', role: UserRole.technician })],
      { isActive: false, caller: admin, at },
    );

    const { data } = db.db.accountActivityEvent.createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      userId: 'u-doc',
      kind: AccountActivityEventKind.blocked,
      anchorAt: at,
      actorId: 'u-admin',
      actorName: 'Admin Root',
    });
    expect((data[0].deadlineAt as Date).getTime()).not.toBe(at.getTime());
    expect(data[1]).toMatchObject({
      userId: 'u-tech',
      kind: AccountActivityEventKind.blocked,
      deadlineAt: at,
    });
  });

  it('an unblock records the deadline of the fresh cycle it opens (the nominal one, no warning yet)', async () => {
    // Approved 390 days ago: nominal deadline 390 d - 6 months, long past;
    // the warnings of the blocked-over cycle had pushed it to 60 days ago.
    const anchor = daysBefore(390);
    const db = fakeDb({
      events: [
        {
          userId: 'u-doc',
          kind: AccountActivityEventKind.warning_30d,
          anchorAt: anchor,
          createdAt: daysBefore(90),
        },
      ],
    });
    const { service } = makeService(db);

    await service.journalStatusChange(db.prisma as never, [account()], {
      isActive: true,
      caller: admin,
      at: NOW,
    });
    await service.journalStatusChange(db.prisma as never, [account()], {
      isActive: false,
      caller: admin,
      at: NOW,
    });

    const rows = db.db.accountActivityEvent.createMany.mock.calls.map(
      (call) => (call[0] as { data: Record<string, Date>[] }).data[0],
    );
    expect(rows[0].deadlineAt.getTime()).toBe(
      nominalDeadline(anchor, 6).getTime(),
    );
    // A block keeps the current (pushed) deadline.
    expect(rows[1].deadlineAt.getTime()).toBe(daysBefore(60).getTime());
  });
});
