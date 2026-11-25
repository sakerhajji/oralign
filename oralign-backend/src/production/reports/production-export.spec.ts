import {
  DeliveryRecipient,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  UserRole,
} from '@prisma/client';
import { CSV_BOM } from '../../common/csv/csv';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductionExportFormat } from '../dto';
import {
  DAILY_HEADER,
  dailyCsv,
  DETAIL_HEADER,
  detailCsv,
  productionExportFileName,
  type ExportDailyRow,
  type ExportDetailRow,
} from './production-export.csv';
import { ProductionExportService } from './production-export.service';
import {
  DAY_3_END,
  DAY_3_START,
  tunisNov3,
} from './report-fixtures.helper-spec';

function detailRow(over: Partial<ExportDetailRow> = {}): ExportDetailRow {
  return {
    type: ProductionEventType.aligner_delivered,
    arch: ProductionArch.upper,
    stepFrom: 1,
    stepTo: 4,
    quantity: 4,
    performedAt: tunisNov3('08:15'),
    createdAt: tunisNov3('08:20'),
    createdByName: 'Amira',
    createdByRole: UserRole.technician,
    deliveredTo: DeliveryRecipient.courier,
    deliveredToName: 'Rapid Poste',
    note: null,
    warnings: [],
    origin: ProductionEventOrigin.declared,
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    order: {
      orderCode: 'ORD-001',
      patient: { fullName: 'Zoé Ben Salah' },
      doctor: { fullName: 'Dr Karim Haddad' },
    },
    ...over,
  };
}

/** The data lines of a CSV document, split into cells (no quoted ";" in these fixtures). */
function linesOf(content: string): string[][] {
  expect(content.startsWith(CSV_BOM)).toBe(true);
  expect(content.endsWith('\r\n')).toBe(true);
  return content
    .slice(1, -2)
    .split('\r\n')
    .map((line) => line.split(';'));
}

describe('detail CSV', () => {
  it('has the French header of the contract, in order', () => {
    expect(DETAIL_HEADER.join(';')).toBe(
      "Jour;Heure;Référence;Patient;Praticien;Acte;Arcade;Étape de;Étape à;Quantité;Destinataire;Nom du destinataire;Saisi par;Rôle;Saisi le;Note;Avertissements;Origine;Annulé le;Annulé par;Motif d'annulation",
    );
  });

  it('one line per event with French labels and Tunis day / time', () => {
    const [header, line] = linesOf(detailCsv([detailRow()]));
    expect(header).toHaveLength(21);
    expect(line).toEqual([
      '2026-11-03',
      '08:15',
      'ORD-001',
      'Zoé Ben Salah',
      'Dr Karim Haddad',
      'Aligneurs livrés',
      'Supérieure',
      '1',
      '4',
      '4',
      'Coursier',
      'Rapid Poste',
      'Amira',
      'Technicienne',
      '2026-11-03 08:20',
      '',
      '',
      'Saisie',
      '',
      '',
      '',
    ]);
  });

  it('flags cancelled and legacy rows, lists the warnings, keeps empty recipient cells off deliveries', () => {
    const [, cancelled, legacy] = linesOf(
      detailCsv([
        detailRow({
          type: ProductionEventType.aligner_thermoformed,
          arch: ProductionArch.lower,
          deliveredTo: null,
          deliveredToName: null,
          warnings: ['quantity_differs', 'previous_stage_missing', 'unknown'],
          note: 'Plaque fissurée',
          createdByRole: UserRole.admin,
          cancelledAt: tunisNov3('14:05'),
          cancelledByName: 'Sami',
          cancelReason: 'Erreur de cas',
        }),
        detailRow({
          origin: ProductionEventOrigin.legacy_batch,
          createdByName: 'Historique',
          createdByRole: null,
          deliveredTo: DeliveryRecipient.practitioner,
          deliveredToName: null,
        }),
      ]),
    );
    expect(cancelled[5]).toBe('Aligneurs thermoformés');
    expect(cancelled[6]).toBe('Inférieure');
    expect(cancelled[10]).toBe('');
    expect(cancelled[13]).toBe('Administrateur');
    expect(cancelled[15]).toBe('Plaque fissurée');
    expect(cancelled[16]).toBe('previous_stage_missing, quantity_differs');
    expect(cancelled.slice(17)).toEqual([
      'Saisie',
      '2026-11-03 14:05',
      'Sami',
      'Erreur de cas',
    ]);
    expect(legacy[10]).toBe('Praticien');
    expect(legacy[13]).toBe('');
    expect(legacy[17]).toBe('Historique');
  });

  it('neutralises formula injection and quotes the separator in free text', () => {
    const content = detailCsv([
      detailRow({
        note: '=HYPERLINK("http://x")',
        deliveredToName: '+216 1; 2',
        cancelReason: '@SUM(A1)',
        order: {
          orderCode: 'ORD-001',
          patient: { fullName: '-Zoé' },
          doctor: { fullName: 'Dr K' },
        },
      }),
    ]);
    expect(content).toContain(`;"'=HYPERLINK(""http://x"")";`);
    expect(content).toContain(`;"'+216 1; 2";`);
    expect(content).toContain(`;'@SUM(A1)\r\n`);
    expect(content).toContain(`;'-Zoé;`);
  });

  it('an empty period is the header alone', () => {
    expect(detailCsv([])).toBe(`${CSV_BOM}${DETAIL_HEADER.join(';')}\r\n`);
  });

  it('prints the Tunis day and time: 23:30 UTC is already the next day', () => {
    const [, line] = linesOf(
      detailCsv([
        detailRow({
          performedAt: new Date('2026-11-03T23:30:00.000Z'),
          createdAt: new Date('2026-11-03T23:45:00.000Z'),
        }),
      ]),
    );
    expect(line.slice(0, 2)).toEqual(['2026-11-04', '00:30']);
    expect(line[14]).toBe('2026-11-04 00:45');
  });
});

describe('daily CSV', () => {
  const day = (
    time: string,
    over: Partial<ExportDailyRow> = {},
  ): ExportDailyRow => ({
    type: ProductionEventType.model_printed,
    quantity: 1,
    performedAt: tunisNov3(time),
    origin: ProductionEventOrigin.declared,
    cancelledAt: null,
    ...over,
  });

  it('has the contract header', () => {
    expect(DAILY_HEADER.join(';')).toBe(
      'Jour;Modèles imprimés;Aligneurs thermoformés;Aligneurs découpés;Aligneurs livrés;Plaques;Modèles;Saisies annulées',
    );
  });

  it('one line per Tunis day, Σ quantity of counted rows per act, consumption repeated, cancellations counted, then the total', () => {
    const lines = linesOf(
      dailyCsv([
        day('08:00', { quantity: 5 }),
        day('09:00', {
          type: ProductionEventType.aligner_thermoformed,
          quantity: 7,
        }),
        day('10:00', { type: ProductionEventType.aligner_cut, quantity: 3 }),
        day('11:00', {
          type: ProductionEventType.aligner_delivered,
          quantity: 2,
        }),
        // Cancelled: counted in its own column, never in the sums.
        day('12:00', { quantity: 50, cancelledAt: tunisNov3('13:00') }),
        // A live legacy import is history, not this period's work.
        day('13:00', {
          type: ProductionEventType.aligner_delivered,
          quantity: 9,
          origin: ProductionEventOrigin.legacy_batch,
        }),
        // 2026-11-04 00:30 Tunis.
        {
          type: ProductionEventType.model_printed,
          quantity: 4,
          performedAt: new Date('2026-11-03T23:30:00.000Z'),
          origin: ProductionEventOrigin.declared,
          cancelledAt: null,
        },
      ]),
    );
    expect(lines.slice(1)).toEqual([
      ['2026-11-03', '5', '7', '3', '2', '7', '5', '1'],
      ['2026-11-04', '4', '0', '0', '0', '0', '4', '0'],
      ['Total', '9', '7', '3', '2', '7', '9', '1'],
    ]);
  });

  it('a day with cancellations only still has its line, so the total adds up', () => {
    const lines = linesOf(
      dailyCsv([day('08:00', { cancelledAt: tunisNov3('09:00') })]),
    );
    expect(lines.slice(1)).toEqual([
      ['2026-11-03', '0', '0', '0', '0', '0', '0', '1'],
      ['Total', '0', '0', '0', '0', '0', '0', '1'],
    ]);
  });

  it('an empty period is the header and a zero total', () => {
    expect(linesOf(dailyCsv([])).slice(1)).toEqual([
      ['Total', '0', '0', '0', '0', '0', '0', '0'],
    ]);
  });
});

describe('ProductionExportService.build', () => {
  type Args = {
    where: Record<string, unknown>;
    select: Record<string, unknown>;
    orderBy?: unknown;
  };

  function makeService(rows: unknown[]) {
    const findMany = jest.fn((_args: Args) => Promise.resolve(rows));
    const prisma = {
      productionEvent: { findMany },
    } as unknown as PrismaService;
    return { service: new ProductionExportService(prisma), findMany };
  }

  it('detail (the default): ONE call over every event of the period, journal order, with the practitioner', async () => {
    const { service, findMany } = makeService([detailRow()]);
    const file = await service.build({ from: '2026-11-03', to: '2026-11-03' });

    expect(findMany).toHaveBeenCalledTimes(1);
    const [args] = (findMany.mock.calls as [Args][])[0];
    // Cancelled and legacy rows included: no other filter.
    expect(args.where).toEqual({
      performedAt: { gte: DAY_3_START, lt: DAY_3_END },
    });
    expect(args.orderBy).toEqual([
      { performedAt: 'asc' },
      { createdAt: 'asc' },
      { arch: 'asc' },
      { id: 'asc' },
    ]);
    expect(args.select).toMatchObject({
      order: { select: { doctor: { select: { fullName: true } } } },
    });
    expect(file.fileName).toBe('production_2026-11-03_2026-11-03_detail.csv');
    expect(file.content).toContain('Dr Karim Haddad');
  });

  it('daily: ONE call with the five columns it sums, no relation', async () => {
    const { service, findMany } = makeService([]);
    const file = await service.build({
      from: '2026-11-01',
      to: '2026-11-30',
      format: ProductionExportFormat.daily,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const [args] = (findMany.mock.calls as [Args][])[0];
    expect(Object.keys(args.select).sort()).toEqual([
      'cancelledAt',
      'origin',
      'performedAt',
      'quantity',
      'type',
    ]);
    expect(file.fileName).toBe('production_2026-11-01_2026-11-30_daily.csv');
  });

  it('refuses a reversed period before querying', async () => {
    const { service, findMany } = makeService([]);
    await expect(
      service.build({ from: '2026-11-30', to: '2026-11-01' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_DATE_RANGE',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('names the file production_<from>_<to>_<format>.csv', () => {
    expect(
      productionExportFileName(
        '2026-11-01',
        '2026-11-30',
        ProductionExportFormat.detail,
      ),
    ).toBe('production_2026-11-01_2026-11-30_detail.csv');
  });
});
