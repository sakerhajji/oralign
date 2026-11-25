import {
  DeliveryRecipient,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  UserRole,
} from '@prisma/client';
import { csvDocument, csvLine } from '../../common/csv/csv';
import { ProductionExportFormat } from '../dto';
import { PRODUCTION_ACTS } from '../production.constants';
import { BusinessClock } from './report-clock';
import { compareText, warningCodesOf } from './report-views';

/**
 * The lab's CSV exports (GET production/admin/export.csv), in the
 * workshop's French whatever the admin's UI language: the file is read in
 * Excel, next to the invoices journal. Days and times are Africa/Tunis.
 * Pure: the service hands in the rows, already in journal order.
 */

/** Same words as the production screens (dict production.acts, fr). */
export const ACT_LABEL: Readonly<Record<ProductionEventType, string>> = {
  [ProductionEventType.model_printed]: 'Modèles imprimés',
  [ProductionEventType.aligner_thermoformed]: 'Aligneurs thermoformés',
  [ProductionEventType.aligner_cut]: 'Aligneurs découpés',
  [ProductionEventType.aligner_delivered]: 'Aligneurs livrés',
};

export const ARCH_LABEL: Readonly<Record<ProductionArch, string>> = {
  [ProductionArch.upper]: 'Supérieure',
  [ProductionArch.lower]: 'Inférieure',
};

export const RECIPIENT_LABEL: Readonly<Record<DeliveryRecipient, string>> = {
  [DeliveryRecipient.practitioner]: 'Praticien',
  [DeliveryRecipient.courier]: 'Coursier',
  [DeliveryRecipient.patient]: 'Patient',
};

/** dict usersUi.roles, fr. */
export const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  [UserRole.dentist]: 'Praticien',
  [UserRole.admin]: 'Administrateur',
  [UserRole.designer]: 'Designer',
  [UserRole.super_admin]: 'Super administrateur',
  [UserRole.technician]: 'Technicienne',
};

export const ORIGIN_LABEL: Readonly<Record<ProductionEventOrigin, string>> = {
  [ProductionEventOrigin.declared]: 'Saisie',
  [ProductionEventOrigin.legacy_batch]: 'Historique',
};

export const DETAIL_HEADER: readonly string[] = [
  'Jour',
  'Heure',
  'Référence',
  'Patient',
  'Praticien',
  'Acte',
  'Arcade',
  'Étape de',
  'Étape à',
  'Quantité',
  'Destinataire',
  'Nom du destinataire',
  'Saisi par',
  'Rôle',
  'Saisi le',
  'Note',
  'Avertissements',
  'Origine',
  'Annulé le',
  'Annulé par',
  "Motif d'annulation",
];

export const DAILY_HEADER: readonly string[] = [
  'Jour',
  ...PRODUCTION_ACTS.map((act) => ACT_LABEL[act]),
  'Plaques',
  'Modèles',
  'Saisies annulées',
];

export const DAILY_TOTAL_LABEL = 'Total';

/** One row of the detail export (every event of the period). */
export interface ExportDetailRow {
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  quantity: number;
  performedAt: Date;
  createdAt: Date;
  createdByName: string | null;
  createdByRole: UserRole | null;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
  note: string | null;
  warnings: readonly string[];
  origin: ProductionEventOrigin;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  order: {
    orderCode: string;
    patient: { fullName: string };
    doctor: { fullName: string };
  };
}

/** What the daily export needs: no names, notes or relations. */
export type ExportDailyRow = Pick<
  ExportDetailRow,
  'type' | 'quantity' | 'performedAt' | 'origin' | 'cancelledAt'
>;

/** Lines of the detail export, in the rows' order (performedAt, createdAt, arch, id). */
export function detailCsvLines(rows: readonly ExportDetailRow[]): string[] {
  const clock = new BusinessClock();
  return rows.map((row) =>
    csvLine([
      clock.dayOf(row.performedAt),
      clock.timeOf(row.performedAt),
      row.order.orderCode,
      row.order.patient.fullName,
      row.order.doctor.fullName,
      ACT_LABEL[row.type],
      ARCH_LABEL[row.arch],
      row.stepFrom,
      row.stepTo,
      row.quantity,
      row.deliveredTo ? RECIPIENT_LABEL[row.deliveredTo] : '',
      row.deliveredToName,
      row.createdByName,
      row.createdByRole ? ROLE_LABEL[row.createdByRole] : '',
      clock.stampOf(row.createdAt),
      row.note,
      warningCodesOf(row.warnings).join(', '),
      ORIGIN_LABEL[row.origin],
      clock.stampOf(row.cancelledAt),
      row.cancelledByName,
      row.cancelReason,
    ]),
  );
}

interface DayCounts {
  quantity: Record<ProductionEventType, number>;
  cancelled: number;
}

function emptyDay(): DayCounts {
  const quantity = {} as Record<ProductionEventType, number>;
  for (const act of PRODUCTION_ACTS) quantity[act] = 0;
  return { quantity, cancelled: 0 };
}

function dailyCells(label: string, day: DayCounts): (string | number)[] {
  return [
    label,
    ...PRODUCTION_ACTS.map((act) => day.quantity[act]),
    day.quantity[ProductionEventType.aligner_thermoformed],
    day.quantity[ProductionEventType.model_printed],
    day.cancelled,
  ];
}

/**
 * Lines of the daily export: one per Tunis day (of performedAt) with
 * counted rows (live, `declared`) or cancelled rows, ascending, then the
 * total. The act columns are Σ quantity of the counted rows; Plaques /
 * Modèles repeat thermoformed / printed (consumption) so the sheet reads
 * alone; "Saisies annulées" counts the cancelled rows of the day. A day
 * with cancellations only still gets its line, so the total line is
 * always the sum of the lines above it.
 */
export function dailyCsvLines(rows: readonly ExportDailyRow[]): string[] {
  const clock = new BusinessClock();
  const days = new Map<string, DayCounts>();
  const total = emptyDay();
  for (const row of rows) {
    const counted =
      row.cancelledAt === null && row.origin === ProductionEventOrigin.declared;
    if (!counted && row.cancelledAt === null) continue; // a live legacy import
    const key = clock.dayOf(row.performedAt);
    let day = days.get(key);
    if (!day) {
      day = emptyDay();
      days.set(key, day);
    }
    if (counted) {
      day.quantity[row.type] += row.quantity;
      total.quantity[row.type] += row.quantity;
    } else {
      day.cancelled += 1;
      total.cancelled += 1;
    }
  }
  return [
    ...[...days.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([key, day]) => csvLine(dailyCells(key, day))),
    csvLine(dailyCells(DAILY_TOTAL_LABEL, total)),
  ];
}

export function detailCsv(rows: readonly ExportDetailRow[]): string {
  return csvDocument(DETAIL_HEADER, detailCsvLines(rows));
}

export function dailyCsv(rows: readonly ExportDailyRow[]): string {
  return csvDocument(DAILY_HEADER, dailyCsvLines(rows));
}

/** production_<from>_<to>_<format>.csv */
export function productionExportFileName(
  from: string,
  to: string,
  format: ProductionExportFormat,
): string {
  return `production_${from}_${to}_${format}.csv`;
}
