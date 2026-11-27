import {
  DevisLanguage,
  Prisma,
  type CompanyBillingSettings,
} from '@prisma/client';
import {
  buildQuoteClinicSnapshot,
  buildQuoteCompanySnapshot,
  readQuoteSnapshots,
} from './quotation-snapshots';

const D = (v: string) => new Prisma.Decimal(v);
const AT = new Date('2026-11-27T10:00:00.000Z');

const SETTINGS = {
  companyName: 'Oralign',
  companyLogoPath: null,
  companyAddress: '1 rue du Lac',
  companyCity: 'Tunis',
  companyCountry: 'Tunisie',
  companyPhone: null,
  companyEmail: null,
  taxRegistrationNumber: '1234567/A',
  stampDuty: D('1.000'),
  withholdingEnabled: true,
  withholdingRate: D('1.00'),
  withholdingThreshold: D('1000.000'),
  legalTextTranslations: { fr: 'Mentions', en: 'Notice' },
  footerTextTranslations: null,
  bankDetails: { bankName: 'BIAT' },
} as unknown as CompanyBillingSettings;

const DOCTOR = {
  id: 'doc-1',
  fullName: 'Dr Amel Ben Salah',
  email: 'amel@mail.tn',
  phone: '+21620000000',
  dentistProfile: {
    clinicName: 'Cabinet Les Pins',
    clinicAddress: '12 rue des Pins',
    city: 'Tunis',
    country: 'TN',
    clinicPhone: null,
    clinicEmail: 'contact@lespins.tn',
    taxId: '1234567/B',
    registrationNumber: 'CNOMDT-42',
    logoUrl: 'dentists/doc-1/logo.png',
    deletedAt: null,
  },
};

describe('buildQuoteCompanySnapshot', () => {
  it('freezes the stamp and the retenue rule with the company block', () => {
    const snapshot = buildQuoteCompanySnapshot(
      SETTINGS,
      DevisLanguage.fr,
      'TND',
      19,
      AT,
    );
    expect(snapshot).toMatchObject({
      companyName: 'Oralign',
      tvaRate: 19,
      stampDuty: 1,
      withholdingEnabled: true,
      withholdingRate: 1,
      withholdingThreshold: 1000,
      currency: 'TND',
      selectedLanguage: DevisLanguage.fr,
      legalText: 'Mentions',
      generatedAt: AT.toISOString(),
    });
  });
});

describe('buildQuoteClinicSnapshot', () => {
  it('the practice, THE contact (practice first, account fallback) and the patient', () => {
    expect(buildQuoteClinicSnapshot(DOCTOR, { fullName: 'Sami' }, AT)).toEqual({
      doctorId: 'doc-1',
      doctorFullName: 'Dr Amel Ben Salah',
      doctorEmail: 'amel@mail.tn',
      doctorPhone: '+21620000000',
      patientFullName: 'Sami',
      clinicName: 'Cabinet Les Pins',
      clinicAddress: '12 rue des Pins',
      city: 'Tunis',
      country: 'TN',
      clinicPhone: null,
      clinicEmail: 'contact@lespins.tn',
      // No practice phone: the account one is the contact.
      contactPhone: '+21620000000',
      contactEmail: 'contact@lespins.tn',
      taxId: '1234567/B',
      logoUrl: 'dentists/doc-1/logo.png',
      generatedAt: AT.toISOString(),
    });
  });

  it('never copies the private registration number (the devis never prints it)', () => {
    expect(buildQuoteClinicSnapshot(DOCTOR, null, AT)).not.toHaveProperty(
      'registrationNumber',
    );
  });
});

describe('readQuoteSnapshots', () => {
  it('one read of the order, both snapshots as of the given instant', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      doctor: DOCTOR,
      patient: { fullName: 'Sami' },
    });
    const out = await readQuoteSnapshots(
      { dentalOrder: { findUniqueOrThrow } } as never,
      SETTINGS,
      {
        orderId: 'o-1',
        language: DevisLanguage.en,
        currency: 'TND',
        tvaRate: 19,
      },
      AT,
    );
    expect(findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o-1' } }),
    );
    expect(out.patientFullName).toBe('Sami');
    expect(out.companySnapshot).toMatchObject({ selectedLanguage: 'en' });
    expect(out.clinicSnapshot).toMatchObject({
      doctorFullName: 'Dr Amel Ben Salah',
    });
  });
});
