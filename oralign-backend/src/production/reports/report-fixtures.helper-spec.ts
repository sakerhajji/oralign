import {
  OrderType,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  UserRole,
} from '@prisma/client';
import type { ReportEventRow } from './report-views';

/**
 * Shared fixtures of the admin-desk specs (not a spec itself). Instants
 * are Tunis wall clocks written in UTC: Africa/Tunis is UTC+1, so
 * 2026-11-03 runs from 2026-11-02T23:00Z to 2026-11-03T23:00Z.
 */
export const DAY_3_START = new Date('2026-11-02T23:00:00.000Z');
export const DAY_3_END = new Date('2026-11-03T23:00:00.000Z');

/** 'HH:mm' on 2026-11-03 Tunis as a UTC instant. */
export function tunisNov3(time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 3, hour - 1, minute));
}

let sequence = 0;

/** A full ProductionEvent row with its order ref, every column filled. */
export function eventRow(over: Partial<ReportEventRow> = {}): ReportEventRow {
  sequence += 1;
  const id = over.id ?? `e${String(sequence).padStart(3, '0')}`;
  return {
    id,
    orderId: 'o1',
    declarationId: `d-${id}`,
    type: ProductionEventType.model_printed,
    arch: ProductionArch.upper,
    stepFrom: 1,
    stepTo: 5,
    quantity: 5,
    performedAt: tunisNov3('09:00'),
    createdAt: tunisNov3('09:05'),
    createdById: 'u-tech',
    createdByName: 'Amira Technicienne',
    createdByRole: UserRole.technician,
    deliveredTo: null,
    deliveredToName: null,
    note: null,
    warnings: [],
    origin: ProductionEventOrigin.declared,
    notifiedAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelReason: null,
    order: {
      orderCode: 'ORD-001',
      orderType: OrderType.initial,
      patient: { fullName: 'Zoé Ben Salah' },
    },
    ...over,
  };
}
