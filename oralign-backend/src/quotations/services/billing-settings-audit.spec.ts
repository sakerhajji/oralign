import { Prisma } from '@prisma/client';
import {
  AUDITED_BILLING_SETTINGS_FIELDS,
  auditValueOf,
  diffBillingSettings,
  toBillingSettingsAuditEntryJson,
  writeBillingSettingsAudit,
  type AuditedBillingSettings,
} from './billing-settings-audit';

const d = (value: string) => new Prisma.Decimal(value);

const row = (
  overrides: Partial<AuditedBillingSettings> = {},
): AuditedBillingSettings => ({
  withholdingEnabled: false,
  withholdingRate: d('1'),
  withholdingThreshold: d('1000'),
  stampDuty: d('1'),
  defaultTvaRate: 19,
  inactivityRuleEnabled: false,
  inactivityMonths: 6,
  ...overrides,
});

describe('billing settings history: values', () => {
  it('stores Decimals as strings at their column scale, never floats', () => {
    expect(auditValueOf('withholdingThreshold', d('1000'))).toBe('1000.000');
    expect(auditValueOf('withholdingThreshold', '1500.5')).toBe('1500.500');
    expect(auditValueOf('stampDuty', 0.6)).toBe('0.600');
    expect(auditValueOf('withholdingRate', d('1.5'))).toBe('1.50');
  });

  it('keeps switches as booleans and the period / TVA as numbers', () => {
    expect(auditValueOf('withholdingEnabled', true)).toBe(true);
    expect(auditValueOf('inactivityRuleEnabled', false)).toBe(false);
    expect(auditValueOf('inactivityMonths', 6)).toBe(6);
    expect(auditValueOf('defaultTvaRate', 19)).toBe(19);
    expect(auditValueOf('defaultTvaRate', null)).toBeNull();
    expect(auditValueOf('inactivityMonths', undefined)).toBeNull();
  });
});

describe('diffBillingSettings', () => {
  it('lists only the audited fields that moved, in display order', () => {
    const changes = diffBillingSettings(
      row(),
      row({
        withholdingEnabled: true,
        withholdingThreshold: d('1500'),
        inactivityMonths: 12,
      }),
    );
    expect(changes).toEqual([
      { field: 'withholdingEnabled', before: false, after: true },
      {
        field: 'withholdingThreshold',
        before: '1000.000',
        after: '1500.000',
      },
      { field: 'inactivityMonths', before: 6, after: 12 },
    ]);
  });

  it('a Decimal re-saved at another scale is not a change', () => {
    expect(
      diffBillingSettings(
        row({ stampDuty: d('1') }),
        row({ stampDuty: d('1.000') }),
      ),
    ).toEqual([]);
  });

  it('nothing moved, nothing to write', () => {
    expect(diffBillingSettings(row(), row())).toEqual([]);
  });

  it('the first save records every initial value (before = null)', () => {
    const changes = diffBillingSettings(null, row());
    expect(changes.map((c) => c.field)).toEqual([
      ...AUDITED_BILLING_SETTINGS_FIELDS,
    ]);
    expect(changes.every((c) => c.before === null)).toBe(true);
    expect(changes.find((c) => c.field === 'withholdingEnabled')?.after).toBe(
      false,
    );
  });
});

describe('writeBillingSettingsAudit', () => {
  const makeTx = (fullName: string | null) => ({
    billingSettingsAuditLog: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(fullName === null ? null : { fullName }),
    },
  });

  it('writes one row per change with the actor and the name snapshot', async () => {
    const tx = makeTx('  Admin One ');
    const count = await writeBillingSettingsAudit(
      tx as never,
      { userId: 'a-1' },
      [
        { field: 'withholdingEnabled', before: false, after: true },
        { field: 'withholdingThreshold', before: null, after: '1000.000' },
      ],
    );
    expect(count).toBe(2);
    expect(tx.billingSettingsAuditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          actorId: 'a-1',
          actorName: 'Admin One',
          field: 'withholdingEnabled',
          before: false,
          after: true,
        },
        {
          actorId: 'a-1',
          actorName: 'Admin One',
          field: 'withholdingThreshold',
          before: Prisma.JsonNull,
          after: '1000.000',
        },
      ],
    });
  });

  it('a system write has no actor; no change writes nothing', async () => {
    const tx = makeTx(null);
    await writeBillingSettingsAudit(tx as never, null, [
      { field: 'inactivityMonths', before: 6, after: 12 },
    ]);
    const data = (
      tx.billingSettingsAuditLog.createMany.mock.calls[0] as [
        { data: Array<Record<string, unknown>> },
      ]
    )[0].data;
    expect(data[0]).toMatchObject({ actorId: null, actorName: null });
    expect(tx.user.findUnique).not.toHaveBeenCalled();

    const empty = makeTx('x');
    await expect(
      writeBillingSettingsAudit(empty as never, { userId: 'a-1' }, []),
    ).resolves.toBe(0);
    expect(empty.billingSettingsAuditLog.createMany).not.toHaveBeenCalled();
    expect(empty.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('toBillingSettingsAuditEntryJson', () => {
  it('returns scalars only (anything else reads as null)', () => {
    const createdAt = new Date('2026-11-27T10:00:00Z');
    expect(
      toBillingSettingsAuditEntryJson({
        id: 'h-1',
        field: 'withholdingThreshold',
        before: { odd: true },
        after: '1000.000',
        actorName: 'Admin One',
        createdAt,
      }),
    ).toEqual({
      id: 'h-1',
      field: 'withholdingThreshold',
      before: null,
      after: '1000.000',
      actorName: 'Admin One',
      createdAt,
    });
  });
});
