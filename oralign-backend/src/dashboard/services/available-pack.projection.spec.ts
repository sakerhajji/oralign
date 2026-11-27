import { Prisma } from '@prisma/client';
import {
  AVAILABLE_PACK_SELECT,
  localizedText,
  toAvailablePack,
  type AvailablePackRow,
} from './available-pack.projection';
import { DoctorDashboardService } from './doctor-dashboard.service';
import type { PrismaService } from '../../prisma/prisma.service';

const row = (overrides: Partial<AvailablePackRow> = {}): AvailablePackRow => ({
  id: 'pack-1',
  name: 'Forfait Confort',
  description: 'Traitement complet',
  nameI18n: { fr: 'Forfait Confort', en: 'Comfort pack' },
  descriptionI18n: { fr: 'Traitement complet', en: 'Full treatment' },
  treatmentExpirationLabel: { fr: '2 ans', en: '2 years' },
  finishingIncludedLabel: { fr: '2 finitions incluses' },
  treatmentValidityMonths: 24,
  maxStepsPerArch: 30,
  includedCorrections: 2,
  isUnlimitedSteps: false,
  isUnlimitedCorrections: false,
  isForOrthodontists: false,
  prices: [
    {
      archType: 'two_arches',
      price: new Prisma.Decimal('2380.000'),
      currency: 'TND',
    },
    {
      archType: 'single_arch',
      price: new Prisma.Decimal('1500.5'),
      currency: 'TND',
    },
  ],
  ...overrides,
});

describe('localizedText', () => {
  it('keeps the French and English strings, trimmed', () => {
    expect(localizedText({ fr: ' 2 ans ', en: '2 years' })).toEqual({
      fr: '2 ans',
      en: '2 years',
    });
  });

  it('drops blank texts, other keys and non-string values', () => {
    expect(
      localizedText({ fr: '   ', en: 'Comfort', ar: 'x', extra: { a: 1 } }),
    ).toEqual({ en: 'Comfort' });
    expect(localizedText({ fr: 12, en: true })).toBeNull();
  });

  it('is null for an empty bag, null, numbers and arrays', () => {
    expect(localizedText({})).toBeNull();
    expect(localizedText({ fr: '' })).toBeNull();
    expect(localizedText(null)).toBeNull();
    expect(localizedText(undefined)).toBeNull();
    expect(localizedText(3)).toBeNull();
    expect(localizedText(['2 ans'])).toBeNull();
  });

  it('reads a bare legacy string as French', () => {
    expect(localizedText(' 1 an ')).toEqual({ fr: '1 an' });
    expect(localizedText('  ')).toBeNull();
  });
});

describe('toAvailablePack', () => {
  it('returns the catalogue fields, validity and localized texts', () => {
    expect(toAvailablePack(row(), null)).toEqual({
      id: 'pack-1',
      name: 'Forfait Confort',
      description: 'Traitement complet',
      nameI18n: { fr: 'Forfait Confort', en: 'Comfort pack' },
      descriptionI18n: { fr: 'Traitement complet', en: 'Full treatment' },
      treatmentExpirationLabel: { fr: '2 ans', en: '2 years' },
      finishingIncludedLabel: { fr: '2 finitions incluses' },
      treatmentValidityMonths: 24,
      maxStepsPerArch: 30,
      includedCorrections: 2,
      isUnlimitedSteps: false,
      isUnlimitedCorrections: false,
      isForOrthodontists: false,
      priceTwoArches: 2380,
      priceSingleArch: 1500.5,
      price: 2380,
      currency: 'TND',
      isCurrent: false,
    });
  });

  it('gives null for an arch the pack does not offer, and keeps the legacy price', () => {
    const singleOnly = toAvailablePack(
      row({
        prices: [
          {
            archType: 'single_arch',
            price: new Prisma.Decimal('990'),
            currency: 'EUR',
          },
        ],
      }),
      null,
    );
    expect(singleOnly.priceTwoArches).toBeNull();
    expect(singleOnly.priceSingleArch).toBe(990);
    expect(singleOnly.price).toBe(990);
    expect(singleOnly.currency).toBe('EUR');

    const unpriced = toAvailablePack(row({ prices: [] }), null);
    expect(unpriced.priceTwoArches).toBeNull();
    expect(unpriced.priceSingleArch).toBeNull();
    expect(unpriced.price).toBe(0);
    expect(unpriced.currency).toBe('TND');
  });

  it('keeps amounts exact to the millime', () => {
    const pack = toAvailablePack(
      row({
        prices: [
          {
            archType: 'two_arches',
            price: new Prisma.Decimal('1234.567'),
            currency: 'TND',
          },
        ],
      }),
      null,
    );
    expect(pack.priceTwoArches).toBe(1234.567);
  });

  it('passes legacy packs through: no bags, no validity', () => {
    const legacy = toAvailablePack(
      row({
        nameI18n: null,
        descriptionI18n: null,
        treatmentExpirationLabel: null,
        finishingIncludedLabel: null,
        treatmentValidityMonths: null,
        description: null,
      }),
      null,
    );
    expect(legacy.nameI18n).toBeNull();
    expect(legacy.descriptionI18n).toBeNull();
    expect(legacy.treatmentExpirationLabel).toBeNull();
    expect(legacy.finishingIncludedLabel).toBeNull();
    expect(legacy.treatmentValidityMonths).toBeNull();
    expect(legacy.name).toBe('Forfait Confort');
    expect(legacy.description).toBeNull();
  });

  it('marks the current pack only', () => {
    expect(toAvailablePack(row(), 'pack-1').isCurrent).toBe(true);
    expect(toAvailablePack(row(), 'other').isCurrent).toBe(false);
    expect(toAvailablePack(row(), null).isCurrent).toBe(false);
  });

  it('carries no internal pack columns', () => {
    const keys = Object.keys(toAvailablePack(row(), null));
    for (const internal of [
      'displayOrder',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'isActive',
      'prices',
    ]) {
      expect(keys).not.toContain(internal);
    }
  });
});

describe('DoctorDashboardService.listAvailablePacks', () => {
  const setup = (packs: AvailablePackRow[], currentPackId: string | null) => {
    const packFindMany = jest.fn().mockResolvedValue(packs);
    const quotationFindFirst = jest
      .fn()
      .mockResolvedValue(currentPackId ? { packId: currentPackId } : null);
    const prisma = {
      pack: { findMany: packFindMany },
      quotation: { findFirst: quotationFindFirst },
    } as unknown as PrismaService;
    const service = new DoctorDashboardService(prisma, {} as never);
    return { service, packFindMany, quotationFindFirst };
  };

  it('reads the active catalogue in the admin order, with the projection select', async () => {
    const { service, packFindMany } = setup([row()], null);
    await service.listAvailablePacks('doctor-1');
    expect(packFindMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: AVAILABLE_PACK_SELECT,
    });
  });

  it("scopes the current pack to the caller's own paid quotes", async () => {
    const { service, quotationFindFirst } = setup([row()], 'pack-1');
    const result = await service.listAvailablePacks('doctor-1');
    expect(quotationFindFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        order: { doctorId: 'doctor-1' },
        packId: { not: null },
        paymentStatus: 'paid',
      },
      orderBy: { sentAt: 'desc' },
      select: { packId: true },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.isCurrent).toBe(true);
  });

  it('returns an empty catalogue when no pack is active', async () => {
    const { service } = setup([], null);
    await expect(service.listAvailablePacks('doctor-1')).resolves.toEqual([]);
  });
});
