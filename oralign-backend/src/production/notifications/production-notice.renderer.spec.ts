import {
  DeliveryRecipient,
  ProductionArch,
  ProductionNoticeKind,
} from '@prisma/client';
import type {
  ActCounters,
  ArchPair,
  PlannedTotals,
} from '../production.contract';
import {
  archProgressOf,
  buildNoticeFacts,
  noticeLabels,
  renderEmailNotice,
  renderInAppNotice,
  type NoticeRow,
} from './production-notice.renderer';

const counters = (upper: number, lower: number): ArchPair<ActCounters> => ({
  upper: { printed: upper, thermoformed: upper, cut: upper, delivered: upper },
  lower: { printed: lower, thermoformed: lower, cut: lower, delivered: lower },
});

const finalTotals = (
  upper: number | null,
  lower: number | null,
): PlannedTotals => ({
  upper:
    upper === null
      ? null
      : { total: upper, source: 'approved_plan', provisional: false },
  lower:
    lower === null
      ? null
      : { total: lower, source: 'approved_plan', provisional: false },
});

/** 13:30 UTC = 14:30 in Tunis (UTC+1, no DST). */
const PERFORMED_AT = new Date('2026-11-25T13:30:00.000Z');

const row = (over: Partial<NoticeRow> = {}): NoticeRow => ({
  arch: ProductionArch.upper,
  stepFrom: 1,
  stepTo: 10,
  quantity: 10,
  performedAt: PERFORMED_AT,
  deliveredTo: DeliveryRecipient.practitioner,
  deliveredToName: null,
  ...over,
});

const facts = (over: Partial<Parameters<typeof buildNoticeFacts>[0]> = {}) =>
  buildNoticeFacts({
    kind: ProductionNoticeKind.delivered,
    orderCode: 'ORD-0012',
    patientName: 'Amel Ben Salah',
    rows: [row({ arch: ProductionArch.lower }), row()],
    planned: finalTotals(24, 20),
    counters: counters(10, 20),
    ...over,
  });

describe('archProgressOf — per treated arch', () => {
  it('partial, complete and "to date" from the approved plan total', () => {
    expect(archProgressOf(finalTotals(24, 20), counters(10, 20))).toEqual([
      {
        arch: 'upper',
        state: 'partial',
        delivered: 10,
        total: 24,
        remaining: 14,
      },
      { arch: 'lower', state: 'complete', delivered: 20, total: 20 },
    ]);
  });

  it('a delivery beyond the total still reads complete (never a negative remainder)', () => {
    expect(archProgressOf(finalTotals(24, null), counters(26, 0))).toEqual([
      { arch: 'upper', state: 'complete', delivered: 26, total: 24 },
    ]);
  });

  it('skips an untreated arch', () => {
    expect(
      archProgressOf(finalTotals(null, 20), counters(0, 5)).map((p) => p.arch),
    ).toEqual(['lower']);
  });

  it('an unknown or PROVISIONAL total reads "X delivered to date"', () => {
    const planned: PlannedTotals = {
      upper: { total: null, source: null, provisional: true },
      lower: { total: 30, source: 'pack', provisional: true },
    };
    expect(archProgressOf(planned, counters(4, 6))).toEqual([
      { arch: 'upper', state: 'to_date', delivered: 4 },
      { arch: 'lower', state: 'to_date', delivered: 6 },
    ]);
  });
});

describe('noticeLabels', () => {
  it('French: arches, steps, quantity per arch, Tunis date and time, recipient, progress', () => {
    expect(noticeLabels(facts(), 'fr')).toEqual({
      archLabel: 'Supérieure et inférieure',
      stepsLabel: '1 à 10',
      quantityLabel: '10 aligneurs par arcade (20 au total)',
      performedAtLabel: '25/11/2026 à 14:30',
      recipientLabel: 'Praticien',
      progress: [
        {
          label: 'Arcade supérieure',
          value: 'Livraison partielle : 10 sur 24, reste 14',
        },
        { label: 'Arcade inférieure', value: 'Livraison complète' },
      ],
    });
  });

  it('English, one arch, one step, a named courier, a total still unknown', () => {
    const one = facts({
      rows: [
        row({
          stepFrom: 7,
          stepTo: 7,
          quantity: 1,
          deliveredTo: DeliveryRecipient.courier,
          deliveredToName: '  Ali B.  ',
        }),
      ],
      planned: {
        upper: { total: null, source: null, provisional: true },
        lower: null,
      },
      counters: counters(7, 0),
    });
    expect(noticeLabels(one, 'en')).toEqual({
      archLabel: 'Upper',
      stepsLabel: '7',
      quantityLabel: '1 aligner',
      performedAtLabel: '25/11/2026 at 14:30',
      recipientLabel: 'Courier (Ali B.)',
      progress: [{ label: 'Upper arch', value: '7 delivered to date' }],
    });
  });

  it('per-arch steps and quantities when the two rows differ', () => {
    const uneven = facts({
      rows: [
        row(),
        row({ arch: ProductionArch.lower, stepTo: 8, quantity: 8 }),
      ],
    });
    expect(noticeLabels(uneven, 'fr')).toMatchObject({
      stepsLabel: 'sup. 1 à 10 · inf. 1 à 8',
      quantityLabel: 'sup. 10 aligneurs · inf. 8 aligneurs',
    });
  });

  it('French singular for 0 and 1', () => {
    const zero = facts({
      planned: {
        upper: { total: null, source: null, provisional: true },
        lower: null,
      },
      counters: counters(0, 0),
      rows: [row({ quantity: 1 })],
    });
    const labels = noticeLabels(zero, 'fr');
    expect(labels.quantityLabel).toBe('1 aligneur');
    expect(labels.progress[0].value).toBe('0 livré à ce jour');
  });

  it('sorts the rows upper first, whatever order they were loaded in', () => {
    expect(facts().rows.map((r) => r.arch)).toEqual(['upper', 'lower']);
  });

  it('refuses a notice without rows', () => {
    expect(() => facts({ rows: [] })).toThrow();
  });
});

describe('renderInAppNotice', () => {
  it('a delivery, in both languages', () => {
    const { title, message } = renderInAppNotice(facts());
    expect(title).toEqual({
      en: 'Aligners delivered — ORD-0012',
      fr: 'Aligneurs livrés — ORD-0012',
    });
    expect(message.fr).toBe(
      'Étapes 1 à 10 (supérieure et inférieure) livrées le 25/11/2026 à 14:30' +
        ' · Arcade supérieure — livraison partielle : 10 sur 24, reste 14' +
        ' · Arcade inférieure — livraison complète' +
        ' · patient Amel Ben Salah',
    );
    expect(message.en).toContain(
      'Steps 1 to 10 (upper and lower) delivered on 25/11/2026 at 14:30',
    );
    expect(message.en).toContain('partial delivery: 10 of 24, 14 remaining');
  });

  it('a correction says which delivery no longer holds, with the progress recomputed', () => {
    const { title, message } = renderInAppNotice(
      facts({
        kind: ProductionNoticeKind.correction,
        counters: counters(0, 10),
      }),
    );
    expect(title.fr).toBe('Livraison annulée — ORD-0012');
    expect(message.fr).toContain(
      'La livraison des étapes 1 à 10 (supérieure et inférieure) du 25/11/2026 à 14:30 a été annulée',
    );
    expect(message.fr).toContain('livraison partielle : 0 sur 24, reste 24');
    expect(title.en).toBe('Delivery cancelled — ORD-0012');
  });
});

describe('what a notice never carries (D8, no money)', () => {
  it('neither the cancel reason, the note nor any amount reaches the output', () => {
    // Extra columns on the input rows (as a careless select would load them)
    // are never read: only the NoticeRow fields are.
    const leaky = {
      ...row(),
      cancelReason: 'Erreur de saisie SECRET',
      note: 'Note interne SECRET',
      treatmentFeeAmount: 450,
    } as NoticeRow;
    const f = facts({ kind: ProductionNoticeKind.correction, rows: [leaky] });
    const output = JSON.stringify([
      renderInAppNotice(f),
      renderEmailNotice(f, 'fr', {
        doctorName: 'Dr Amel',
        dashboardUrl: 'https://app.example/dashboard/orders/o-1',
      }),
      renderEmailNotice(f, 'en', {
        doctorName: 'Dr Amel',
        dashboardUrl: 'https://app.example/dashboard/orders/o-1',
      }),
    ]);
    expect(output).not.toMatch(/SECRET|450|TND|prix|price|montant|amount/i);
  });
});

describe('renderEmailNotice', () => {
  it('hands the template the display-ready labels in the practitioner language', () => {
    expect(
      renderEmailNotice(facts(), 'fr', {
        doctorName: 'Dr Amel',
        dashboardUrl: 'https://app.example/dashboard/orders/o-1',
      }),
    ).toMatchObject({
      doctorName: 'Dr Amel',
      orderCode: 'ORD-0012',
      patientName: 'Amel Ben Salah',
      stepsLabel: '1 à 10',
      performedAtLabel: '25/11/2026 à 14:30',
      dashboardUrl: 'https://app.example/dashboard/orders/o-1',
    });
  });
});
