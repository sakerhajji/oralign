import { ArchTreatment, BatchStatus, BatchUnlockSource } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  motifSuffix,
  pendingDeskLink,
  releasedStepsSentence,
  stepsReleasedByPayment,
  treatmentFeeEventSubject,
} from './transfer-notices';

describe('motifSuffix', () => {
  it('appends the trimmed reason in both languages', () => {
    expect(motifSuffix('  Montant illisible ')).toEqual({
      en: ' Reason: Montant illisible',
      fr: ' Motif : Montant illisible',
    });
  });

  it.each([null, undefined, '', '   '])('adds nothing for %p', (reason) => {
    expect(motifSuffix(reason)).toEqual({ en: '', fr: '' });
  });
});

describe('releasedStepsSentence', () => {
  it('names a range, or a single step', () => {
    expect(releasedStepsSentence({ fromStep: 5, toStep: 7 })).toEqual({
      en: ' Steps 5–7 unlocked.',
      fr: ' Étapes 5–7 débloquées.',
    });
    expect(releasedStepsSentence({ fromStep: 4, toStep: 4 })).toEqual({
      en: ' Step 4 unlocked.',
      fr: ' Étape 4 débloquée.',
    });
    expect(releasedStepsSentence(null)).toEqual({ en: '', fr: '' });
  });

  it('marks a range that is not final yet', () => {
    expect(
      releasedStepsSentence({ fromStep: 11, toStep: 20, provisional: true }),
    ).toEqual({
      en: ' Steps 11–20 unlocked (provisional).',
      fr: ' Étapes 11–20 débloquées (provisoire).',
    });
    expect(
      releasedStepsSentence({ fromStep: 4, toStep: 4, provisional: true }),
    ).toEqual({
      en: ' Step 4 unlocked (provisional).',
      fr: ' Étape 4 débloquée (provisoire).',
    });
  });
});

describe('stepsReleasedByPayment', () => {
  const db = (row: unknown) =>
    ({
      payment: { findUnique: jest.fn().mockResolvedValue(row) },
    }) as unknown as Pick<PrismaService, 'payment'>;
  const batch = (
    status: BatchStatus,
    unlockSource: BatchUnlockSource | null,
    range: { fromStep: number; toStep: number } = { fromStep: 5, toStep: 7 },
  ) => ({ ...range, status, unlockSource });
  /** The order's planned totals: pack 20 per arch, the approved plan's totals. */
  const order = (
    plan: { upper: number | null; lower: number | null } | null = {
      upper: 14,
      lower: 14,
    },
  ) => ({
    archTreatment: ArchTreatment.both,
    treatBothArch: true,
    totalAligners: null,
    treatmentPlans: plan
      ? [{ totalUpperAligners: plan.upper, totalLowerAligners: plan.lower }]
      : [],
    quotation: {
      maxStepsPerArch: 20,
      isUnlimitedSteps: false,
      deletedAt: null,
    },
  });
  const paid = (
    range?: { fromStep: number; toStep: number },
    plan?: { upper: number | null; lower: number | null } | null,
  ) => ({
    quotation: { isUnlimitedSteps: false },
    order: order(plan),
    installment: {
      stepBatch: batch(BatchStatus.unlocked, BatchUnlockSource.payment, range),
    },
  });

  it('reads the batch THIS settlement unlocked', async () => {
    await expect(stepsReleasedByPayment(db(paid()), 'pay-1')).resolves.toEqual({
      fromStep: 5,
      toStep: 7,
    });
  });

  it('keeps a delivered batch released by the payment', async () => {
    await expect(
      stepsReleasedByPayment(
        db({
          ...paid(),
          installment: {
            stepBatch: batch(BatchStatus.delivered, BatchUnlockSource.payment),
          },
        }),
        'pay-1',
      ),
    ).resolves.toEqual({ fromStep: 5, toStep: 7 });
  });

  it('trims the range to the approved plan, as the technician card does (pack 20, plan 14)', async () => {
    await expect(
      stepsReleasedByPayment(db(paid({ fromStep: 11, toStep: 20 })), 'pay-1'),
    ).resolves.toEqual({ fromStep: 11, toStep: 14 });
  });

  it('trims to the highest approved total of the treated arches', async () => {
    await expect(
      stepsReleasedByPayment(
        db(paid({ fromStep: 11, toStep: 20 }, { upper: 18, lower: 12 })),
        'pay-1',
      ),
    ).resolves.toEqual({ fromStep: 11, toStep: 18 });
  });

  it('names nothing for a batch wholly beyond the approved plan', async () => {
    await expect(
      stepsReleasedByPayment(db(paid({ fromStep: 15, toStep: 20 })), 'pay-1'),
    ).resolves.toBeNull();
  });

  it('without an approved plan the range is not trimmed and is marked provisional', async () => {
    await expect(
      stepsReleasedByPayment(
        db(paid({ fromStep: 11, toStep: 20 }, null)),
        'pay-1',
      ),
    ).resolves.toEqual({ fromStep: 11, toStep: 20, provisional: true });
  });

  it.each([
    ['no payment', null],
    [
      'no batch',
      {
        quotation: { isUnlimitedSteps: false },
        order: order(),
        installment: { stepBatch: null },
      },
    ],
    [
      'still locked',
      {
        quotation: { isUnlimitedSteps: false },
        order: order(),
        installment: { stepBatch: batch(BatchStatus.locked, null) },
      },
    ],
    [
      'released by hand',
      {
        quotation: { isUnlimitedSteps: false },
        order: order(),
        installment: {
          stepBatch: batch(BatchStatus.unlocked, BatchUnlockSource.manual),
        },
      },
    ],
    [
      'an unlimited-step pack',
      {
        quotation: { isUnlimitedSteps: true },
        order: order(),
        installment: {
          stepBatch: batch(BatchStatus.unlocked, BatchUnlockSource.payment),
        },
      },
    ],
  ])('names nothing for %s', async (_label, row) => {
    await expect(stepsReleasedByPayment(db(row), 'pay-1')).resolves.toBeNull();
  });
});

describe('treatmentFeeEventSubject', () => {
  it('builds the subject from the declaration instant', () => {
    expect(
      treatmentFeeEventSubject({
        orderId: 'order-1',
        declaredAt: '2026-11-27T09:30:00.000Z',
      }),
    ).toBe(`treatment_fee:order-1:${Date.parse('2026-11-27T09:30:00.000Z')}`);
  });

  it('is null without a usable instant or id', () => {
    expect(treatmentFeeEventSubject({ orderId: 'order-1' })).toBeNull();
    expect(
      treatmentFeeEventSubject({ orderId: 'order-1', declaredAt: 'garbage' }),
    ).toBeNull();
    expect(
      treatmentFeeEventSubject({
        orderId: 'a/b',
        declaredAt: '2026-11-27T09:30:00Z',
      }),
    ).toBeNull();
  });
});

describe('pendingDeskLink', () => {
  it('opens the transfer on the desk, its key URL-encoded', () => {
    expect(pendingDeskLink('installment:pay-1')).toBe(
      '/dashboard/payments/pending?review=installment%3Apay-1',
    );
    expect(pendingDeskLink('treatment_fee:order-1:1795777200000')).toBe(
      '/dashboard/payments/pending?review=treatment_fee%3Aorder-1%3A1795777200000',
    );
  });

  it('leads to the desk itself without a subject', () => {
    expect(pendingDeskLink(null)).toBe('/dashboard/payments/pending');
  });
});
