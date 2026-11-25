import { OrderType, ProductionEventType, UserRole } from '@prisma/client';
import type { ProductionOrderRef } from '../production.contract';
import {
  summarizeCountedRows,
  type SummaryCountedRow,
} from './production-summary.aggregate';

const ORDER_A: ProductionOrderRef = {
  orderId: 'o-a',
  orderCode: 'ORD-002',
  kind: 'main',
  orderType: OrderType.initial,
  patientName: 'Zoé Ben Salah',
};
const ORDER_B: ProductionOrderRef = {
  orderId: 'o-b',
  orderCode: 'ORD-001',
  kind: 'supplemental',
  orderType: OrderType.additional_aligners,
  patientName: 'Ali Trabelsi',
};

function row(over: Partial<SummaryCountedRow> = {}): SummaryCountedRow {
  return {
    type: ProductionEventType.model_printed,
    quantity: 5,
    // 2026-11-03 10:00 Tunis.
    performedAt: new Date('2026-11-03T09:00:00.000Z'),
    createdAt: new Date('2026-11-03T09:05:00.000Z'),
    createdById: 'u-amira',
    createdByName: 'Amira',
    createdByRole: UserRole.technician,
    order: ORDER_A,
    ...over,
  };
}

describe('summarizeCountedRows', () => {
  it('an empty period has every act at zero and empty buckets', () => {
    const result = summarizeCountedRows([]);
    for (const act of Object.values(ProductionEventType)) {
      expect(result.totals[act]).toEqual({ entries: 0, quantity: 0 });
    }
    expect(result.consumption).toEqual({ plates: 0, models: 0 });
    expect(result.byDay).toEqual([]);
    expect(result.byCase).toEqual([]);
    expect(result.byAuthor).toEqual([]);
  });

  it('totals count entries and Σ quantity per act; consumption = thermoformed and printed quantities', () => {
    const result = summarizeCountedRows([
      row({ type: ProductionEventType.model_printed, quantity: 5 }),
      row({ type: ProductionEventType.model_printed, quantity: 3 }),
      row({ type: ProductionEventType.aligner_thermoformed, quantity: 7 }),
      row({ type: ProductionEventType.aligner_delivered, quantity: 2 }),
    ]);
    expect(result.totals.model_printed).toEqual({ entries: 2, quantity: 8 });
    expect(result.totals.aligner_thermoformed).toEqual({
      entries: 1,
      quantity: 7,
    });
    expect(result.totals.aligner_cut).toEqual({ entries: 0, quantity: 0 });
    expect(result.totals.aligner_delivered).toEqual({
      entries: 1,
      quantity: 2,
    });
    expect(result.consumption).toEqual({ plates: 7, models: 8 });
  });

  it('buckets by the Tunis day of performedAt, ascending: 23:30 UTC is already the next day', () => {
    const result = summarizeCountedRows([
      // 2026-11-04 00:30 Tunis.
      row({ performedAt: new Date('2026-11-03T23:30:00.000Z') }),
      // 2026-11-03 23:59 Tunis.
      row({ performedAt: new Date('2026-11-03T22:59:00.000Z') }),
      // 2026-11-01 08:00 Tunis.
      row({ performedAt: new Date('2026-11-01T07:00:00.000Z'), quantity: 1 }),
    ]);
    expect(result.byDay.map((day) => day.day)).toEqual([
      '2026-11-01',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(result.byDay[0].acts.model_printed).toEqual({
      entries: 1,
      quantity: 1,
    });
  });

  it('byCase keeps the order ref and sorts by orderCode', () => {
    const result = summarizeCountedRows([
      row({ order: ORDER_A, quantity: 4 }),
      row({ order: ORDER_B, quantity: 1 }),
      row({ order: ORDER_A, quantity: 2 }),
    ]);
    expect(result.byCase.map((item) => item.orderCode)).toEqual([
      'ORD-001',
      'ORD-002',
    ]);
    expect(result.byCase[0]).toMatchObject({
      orderId: 'o-b',
      kind: 'supplemental',
      patientName: 'Ali Trabelsi',
    });
    expect(result.byCase[1].acts.model_printed).toEqual({
      entries: 2,
      quantity: 6,
    });
  });

  it('byCase breaks an orderCode tie on orderId', () => {
    const twin = { ...ORDER_A, orderId: 'o-0' };
    const result = summarizeCountedRows([
      row({ order: ORDER_A }),
      row({ order: twin }),
    ]);
    expect(result.byCase.map((item) => item.orderId)).toEqual(['o-0', 'o-a']);
  });

  it('byAuthor groups by account, names it with its latest snapshot and sorts by name', () => {
    const result = summarizeCountedRows([
      // Renamed later and declared after the rename, although backdated:
      // the latest snapshot (createdAt, not performedAt) names the line.
      row({
        createdById: 'u-amira',
        createdByName: 'Amira B.',
        performedAt: new Date('2026-11-02T09:00:00.000Z'),
        createdAt: new Date('2026-11-04T08:00:00.000Z'),
      }),
      row({ createdById: 'u-amira', createdByName: 'Amira' }),
      row({
        createdById: 'u-admin',
        createdByName: 'Sami',
        createdByRole: UserRole.admin,
      }),
    ]);
    expect(result.byAuthor).toEqual([
      expect.objectContaining({
        userId: 'u-amira',
        name: 'Amira B.',
        role: UserRole.technician,
      }),
      expect.objectContaining({
        userId: 'u-admin',
        name: 'Sami',
        role: UserRole.admin,
      }),
    ]);
    expect(result.byAuthor[0].acts.model_printed.entries).toBe(2);
  });

  it('deleted accounts (createdById null) keep one line per name snapshot, after the live account of the same name', () => {
    const result = summarizeCountedRows([
      row({ createdById: null, createdByName: 'Nour' }),
      row({ createdById: null, createdByName: 'Leila' }),
      row({ createdById: null, createdByName: 'Nour' }),
      row({ createdById: 'u-nour', createdByName: 'Nour' }),
    ]);
    expect(
      result.byAuthor.map((author) => [author.name, author.userId]),
    ).toEqual([
      ['Leila', null],
      ['Nour', 'u-nour'],
      ['Nour', null],
    ]);
    expect(result.byAuthor[2].acts.model_printed.entries).toBe(2);
  });

  it('sorts names accent-insensitively, nulls last', () => {
    const result = summarizeCountedRows([
      row({ createdById: 'u3', createdByName: null }),
      row({ createdById: 'u2', createdByName: 'Émna' }),
      row({ createdById: 'u1', createdByName: 'Fatma' }),
      row({ createdById: 'u4', createdByName: 'Dalia' }),
    ]);
    expect(result.byAuthor.map((author) => author.name)).toEqual([
      'Dalia',
      'Émna',
      'Fatma',
      null,
    ]);
  });

  it('a missing snapshot never hides a known one', () => {
    const result = summarizeCountedRows([
      row({ createdByName: 'Amira' }),
      row({
        createdByName: null,
        createdByRole: null,
        createdAt: new Date('2026-11-05T09:00:00.000Z'),
      }),
    ]);
    expect(result.byAuthor).toEqual([
      expect.objectContaining({
        userId: 'u-amira',
        name: 'Amira',
        role: UserRole.technician,
      }),
    ]);
  });

  it('the result never depends on the row order (the recap loads its rows unsorted)', () => {
    const rows = [
      row({ quantity: 2, order: ORDER_B }),
      row({
        type: ProductionEventType.aligner_cut,
        quantity: 4,
        performedAt: new Date('2026-11-05T09:00:00.000Z'),
        createdAt: new Date('2026-11-05T09:10:00.000Z'),
      }),
      row({
        createdById: 'u-amira',
        createdByName: 'Amira B.',
        createdAt: new Date('2026-11-06T08:00:00.000Z'),
      }),
      // Same instant, two snapshots: still one deterministic winner.
      row({
        createdById: 'u-sami',
        createdByName: 'Sami',
        createdByRole: UserRole.admin,
      }),
      row({
        createdById: 'u-sami',
        createdByName: 'Sami K.',
        createdByRole: UserRole.admin,
      }),
      row({ createdById: null, createdByName: 'Nour', order: ORDER_B }),
      row({
        createdById: null,
        createdByName: 'Nour',
        createdByRole: UserRole.admin,
        performedAt: new Date('2026-11-03T23:30:00.000Z'),
      }),
      row({ type: ProductionEventType.aligner_thermoformed, quantity: 7 }),
    ];
    const expected = summarizeCountedRows(rows);
    // A fixed permutation, the reverse and a rotation: no Math.random.
    const shuffled = [5, 2, 7, 0, 3, 6, 1, 4].map((index) => rows[index]);
    const reversed = [...rows].reverse();
    const rotated = [...rows.slice(3), ...rows.slice(0, 3)];
    for (const input of [shuffled, reversed, rotated]) {
      expect(summarizeCountedRows(input)).toEqual(expected);
    }
    expect(
      expected.byAuthor.map((author) => [author.userId, author.name]),
    ).toEqual([
      ['u-amira', 'Amira B.'],
      [null, 'Nour'],
      [null, 'Nour'],
      ['u-sami', 'Sami K.'],
    ]);
  });

  it('the buckets add up to the totals', () => {
    const rows = [
      row({ quantity: 2, order: ORDER_B }),
      row({ quantity: 3, createdById: 'u-x', createdByName: 'X' }),
      row({
        type: ProductionEventType.aligner_cut,
        quantity: 4,
        performedAt: new Date('2026-11-05T09:00:00.000Z'),
      }),
    ];
    const result = summarizeCountedRows(rows);
    const sum = (list: { acts: typeof result.totals }[]) =>
      list.reduce(
        (acc, item) =>
          acc +
          item.acts.model_printed.quantity +
          item.acts.aligner_cut.quantity,
        0,
      );
    expect(sum(result.byDay)).toBe(9);
    expect(sum(result.byCase)).toBe(9);
    expect(sum(result.byAuthor)).toBe(9);
  });
});
