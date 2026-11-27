import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { UpsertCompanyBillingSettingsDto } from '../dto/company-billing-settings.dto';
import { CompanyBillingSettingsService } from './company-billing-settings.service';

/**
 * The retenue and inactivity rules of the settings (spec §4-§5): the four
 * new fields through the DTO, the service and the response, and the
 * history written in the update's transaction.
 */

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const body: ArgumentMetadata = {
  type: 'body',
  metatype: UpsertCompanyBillingSettingsDto,
};
const parse = (raw: Record<string, unknown>) =>
  pipe.transform(raw, body) as Promise<UpsertCompanyBillingSettingsDto>;

const d = (value: string) => new Prisma.Decimal(value);

const stored = {
  id: 's-1',
  companyName: 'Aura Aligners',
  defaultTvaRate: 19,
  defaultTreatmentFee: d('300'),
  stampDuty: d('1'),
  withholdingRate: d('1'),
  withholdingEnabled: false,
  withholdingThreshold: d('1000'),
  inactivityRuleEnabled: false,
  inactivityMonths: 6,
  cbctSupplementEnabled: false,
  cbctSupplementFee: d('0'),
  refinementTwoArchesFee: d('0'),
  refinementSingleArchFee: d('0'),
  replacementAlignerFee: d('0'),
  retainersFee: d('0'),
  loyaltyEnabled: true,
  welcomeGiftEnabled: true,
  defaultCurrency: 'TND',
  devisPrefix: 'DEV',
  devisNextNumber: 1,
  isActive: true,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};

function makeService(current: Record<string, unknown> | null = stored) {
  const calls: string[] = [];
  const update = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    calls.push('update');
    return Promise.resolve({ ...current, ...data });
  });
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    calls.push('create');
    return Promise.resolve({ id: 's-new', ...data });
  });
  const createMany = jest.fn(({ data }: { data: unknown[] }) => {
    calls.push('audit');
    return Promise.resolve({ count: data.length });
  });
  const tx = {
    $queryRaw: jest.fn(() => {
      calls.push('lock');
      return Promise.resolve([]);
    }),
    companyBillingSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue(current ? { id: current.id } : null),
      findUnique: jest.fn(() => {
        calls.push('read');
        return Promise.resolve(current);
      }),
      update,
      create,
    },
    billingSettingsAuditLog: { createMany },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    billingSettingsAuditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return {
    service: new CompanyBillingSettingsService(
      prisma as unknown as PrismaService,
    ),
    prisma,
    tx,
    update,
    create,
    createMany,
    calls,
  };
}

const auditRows = (createMany: jest.Mock) =>
  (createMany.mock.calls[0] as [{ data: Array<Record<string, unknown>> }])[0]
    .data;
const written = (update: jest.Mock) =>
  (update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
const admin = { userId: 'admin-1' };

describe('settings DTO: the retenue and inactivity fields', () => {
  it('accepts the four fields with their types', async () => {
    const dto = await parse({
      withholdingEnabled: true,
      withholdingThreshold: 1500.25,
      inactivityRuleEnabled: false,
      inactivityMonths: 12,
    });
    expect(dto).toMatchObject({
      withholdingEnabled: true,
      withholdingThreshold: 1500.25,
      inactivityRuleEnabled: false,
      inactivityMonths: 12,
    });
  });

  it('reads the string "false" as false (no implicit Boolean())', async () => {
    const dto = await parse({
      withholdingEnabled: 'false',
      inactivityRuleEnabled: 'false',
    });
    expect(dto.withholdingEnabled).toBe(false);
    expect(dto.inactivityRuleEnabled).toBe(false);
  });

  it.each([
    [{ withholdingThreshold: -1 }],
    [{ withholdingThreshold: 1000.0001 }],
    [{ withholdingThreshold: 1e12 }],
    [{ inactivityMonths: 0 }],
    [{ inactivityMonths: 25 }],
    [{ inactivityMonths: 6.5 }],
    [{ withholdingEnabled: 'yes' }],
    [{ inactivityRuleEnabled: 1 }],
  ])('refuses %p with a 400', async (raw) => {
    await expect(parse(raw)).rejects.toMatchObject({ status: 400 });
  });
});

describe('CompanyBillingSettingsService.upsert: rules and history', () => {
  it('locks the row, updates it, then writes one history row per moved field, in one transaction', async () => {
    const { service, prisma, update, createMany, calls } = makeService();

    const saved = await service.upsert(
      await parse({
        withholdingEnabled: true,
        withholdingThreshold: 1500,
        inactivityMonths: 9,
        // Unchanged values are not history.
        stampDuty: 1,
        defaultTvaRate: 19,
      }),
      admin,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['lock', 'read', 'update', 'audit']);
    const data = written(update);
    expect(data.withholdingEnabled).toBe(true);
    expect((data.withholdingThreshold as Prisma.Decimal).toFixed(3)).toBe(
      '1500.000',
    );
    expect(data.inactivityMonths).toBe(9);
    expect(auditRows(createMany)).toEqual([
      {
        actorId: 'admin-1',
        actorName: 'Admin One',
        field: 'withholdingEnabled',
        before: false,
        after: true,
      },
      {
        actorId: 'admin-1',
        actorName: 'Admin One',
        field: 'withholdingThreshold',
        before: '1000.000',
        after: '1500.000',
      },
      {
        actorId: 'admin-1',
        actorName: 'Admin One',
        field: 'inactivityMonths',
        before: 6,
        after: 9,
      },
    ]);
    // The response carries the four fields.
    expect(CompanyBillingSettingsService.toDto(saved as never)).toMatchObject({
      withholdingEnabled: true,
      withholdingThreshold: 1500,
      inactivityRuleEnabled: false,
      inactivityMonths: 9,
    });
  });

  it('a save that moves no fiscal field writes no history (the gift switch)', async () => {
    const { service, createMany, update } = makeService();
    await service.upsert(await parse({ welcomeGiftEnabled: false }), admin);
    expect(written(update).welcomeGiftEnabled).toBe(false);
    // Untouched rule fields keep their stored value.
    expect(written(update).withholdingEnabled).toBe(false);
    expect(written(update).withholdingThreshold).toBe(
      stored.withholdingThreshold,
    );
    expect(written(update).inactivityMonths).toBe(6);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('audits a rate and a stamp change too, as decimal strings', async () => {
    const { service, createMany } = makeService();
    await service.upsert(
      await parse({ withholdingRate: 1.5, stampDuty: 0.6 }),
      admin,
    );
    expect(
      auditRows(createMany).map((r) => [r.field, r.before, r.after]),
    ).toEqual([
      ['withholdingRate', '1.00', '1.50'],
      ['stampDuty', '1.000', '0.600'],
    ]);
  });

  it('refuses to switch the retenue on at 0 %, before writing anything', async () => {
    const { service, update, createMany } = makeService({
      ...stored,
      withholdingRate: d('0'),
    });
    await expect(
      service.upsert(await parse({ withholdingEnabled: true }), admin),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    // Nor by setting the rate to 0 while it is on.
    const on = makeService({ ...stored, withholdingEnabled: true });
    await expect(
      on.service.upsert(await parse({ withholdingRate: 0 }), admin),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('the first save creates the row with the rules off and records the initial values', async () => {
    const { service, create, createMany, calls } = makeService(null);
    await service.upsert(await parse({ companyName: 'Aura Aligners' }), admin);

    expect(calls).toEqual(['create', 'audit']);
    const data = (
      create.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.withholdingEnabled).toBe(false);
    expect((data.withholdingThreshold as Prisma.Decimal).toFixed(3)).toBe(
      '1000.000',
    );
    expect(data.inactivityRuleEnabled).toBe(false);
    expect(data.inactivityMonths).toBe(6);
    const rows = auditRows(createMany);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.before === Prisma.JsonNull)).toBe(true);
  });
});

describe('settings: inactivityRuleEnabledAt (a switch-on opens a fresh warning cycle)', () => {
  it('stamps the switch-on when the rule goes from off to on', async () => {
    const { service, update } = makeService();
    const before = Date.now();
    await service.upsert(await parse({ inactivityRuleEnabled: true }), admin);
    const stamp = written(update).inactivityRuleEnabledAt as Date;
    expect(stamp).toBeInstanceOf(Date);
    expect(stamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('keeps the stamp on any other save: on → on, on → off, untouched', async () => {
    const stamp = new Date('2026-11-20T08:00:00Z');
    for (const dto of [
      { inactivityRuleEnabled: true },
      { inactivityRuleEnabled: false },
      { inactivityMonths: 9 },
    ]) {
      const { service, update } = makeService({
        ...stored,
        inactivityRuleEnabled: true,
        inactivityRuleEnabledAt: stamp,
      });
      await service.upsert(await parse(dto), admin);
      expect(written(update)).not.toHaveProperty('inactivityRuleEnabledAt');
    }
  });

  it('the first save stamps it only when the rule is created switched on', async () => {
    const off = makeService(null);
    await off.service.upsert(
      await parse({ companyName: 'Aura Aligners' }),
      admin,
    );
    expect(
      (off.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data
        .inactivityRuleEnabledAt,
    ).toBeNull();

    const on = makeService(null);
    await on.service.upsert(
      await parse({
        companyName: 'Aura Aligners',
        inactivityRuleEnabled: true,
      }),
      admin,
    );
    expect(
      (on.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data
        .inactivityRuleEnabledAt,
    ).toBeInstanceOf(Date);
  });
});

describe('CompanyBillingSettingsService.listHistory', () => {
  it('pages the history newest first, with the scalar values only', async () => {
    const { service, prisma } = makeService();
    const createdAt = new Date('2026-11-27T09:00:00Z');
    prisma.billingSettingsAuditLog.findMany.mockResolvedValue([
      {
        id: 'h-1',
        field: 'withholdingEnabled',
        before: false,
        after: true,
        actorName: 'Admin One',
        createdAt,
      },
    ]);
    prisma.billingSettingsAuditLog.count.mockResolvedValue(41);

    const page = await service.listHistory(3, 20);

    expect(prisma.billingSettingsAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 40,
        take: 20,
      }),
    );
    expect(page).toEqual({
      data: [
        {
          id: 'h-1',
          field: 'withholdingEnabled',
          before: false,
          after: true,
          actorName: 'Admin One',
          createdAt,
        },
      ],
      total: 41,
      page: 3,
      limit: 20,
      totalPages: 3,
    });
  });

  it('clamps the page size', async () => {
    const { service, prisma } = makeService();
    await service.listHistory(0, 1000);
    expect(prisma.billingSettingsAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 }),
    );
  });
});
