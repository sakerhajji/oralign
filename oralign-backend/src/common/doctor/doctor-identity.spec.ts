import {
  DOCTOR_NAME_SELECT,
  DOCTOR_PUBLIC_SELECT,
  DOCTOR_SUMMARY_PRIVATE_SELECT,
  DOCTOR_SUMMARY_SELECT,
  doctorContact,
  toDoctorPublicIdentity,
  toDoctorSummary,
  type DoctorIdentityRow,
} from './doctor-identity';

const clinic = {
  clinicName: 'Cabinet Les Berges',
  clinicAddress: '12 rue du Lac',
  city: 'Tunis',
  country: 'TN',
  clinicPhone: '+21671000000',
  clinicEmail: 'cabinet@example.tn',
  logoUrl: '/uploads/logos/a.png',
  specialty: 'Orthodontie',
  deletedAt: null,
};

const row = (over: Partial<DoctorIdentityRow> = {}): DoctorIdentityRow => ({
  id: 'u-doc',
  fullName: 'Dr Amel Ben Salah',
  email: 'amel@example.tn',
  phone: '+21650000000',
  avatarUrl: '/uploads/avatars/u-doc.png',
  isActive: true,
  deletedAt: null,
  dentistProfile: clinic,
  ...over,
});

describe('doctorContact', () => {
  it('prints the practice phone and e-mail first', () => {
    expect(
      doctorContact(
        { phone: '+21650000000', email: 'amel@example.tn' },
        { clinicPhone: '+21671000000', clinicEmail: 'cabinet@example.tn' },
      ),
    ).toEqual({
      contactPhone: '+21671000000',
      contactEmail: 'cabinet@example.tn',
    });
  });

  it('falls back to the account when the practice has none', () => {
    expect(
      doctorContact(
        { phone: '+21650000000', email: 'amel@example.tn' },
        { clinicPhone: null, clinicEmail: null },
      ),
    ).toEqual({
      contactPhone: '+21650000000',
      contactEmail: 'amel@example.tn',
    });
    expect(
      doctorContact({ phone: '+21650000000', email: 'amel@example.tn' }, null),
    ).toEqual({
      contactPhone: '+21650000000',
      contactEmail: 'amel@example.tn',
    });
  });

  it('treats a blank practice value as missing and trims what it prints', () => {
    expect(
      doctorContact(
        { phone: ' +21650000000 ', email: 'amel@example.tn' },
        { clinicPhone: '   ', clinicEmail: '' },
      ),
    ).toEqual({
      contactPhone: '+21650000000',
      contactEmail: 'amel@example.tn',
    });
  });

  it('answers null when nobody has a phone', () => {
    expect(
      doctorContact({ phone: null, email: 'amel@example.tn' }, null)
        .contactPhone,
    ).toBeNull();
  });
});

describe('toDoctorSummary', () => {
  it('joins the person and the practice, with the printed contact', () => {
    expect(toDoctorSummary(row())).toEqual({
      id: 'u-doc',
      fullName: 'Dr Amel Ben Salah',
      email: 'amel@example.tn',
      phone: '+21650000000',
      avatarUrl: '/uploads/avatars/u-doc.png',
      isActive: true,
      deletedAt: null,
      clinic: {
        clinicName: 'Cabinet Les Berges',
        clinicAddress: '12 rue du Lac',
        city: 'Tunis',
        country: 'TN',
        clinicPhone: '+21671000000',
        clinicEmail: 'cabinet@example.tn',
        logoUrl: '/uploads/logos/a.png',
        specialty: 'Orthodontie',
      },
      contactPhone: '+21671000000',
      contactEmail: 'cabinet@example.tn',
    });
  });

  it('never invents private identifiers the row did not select', () => {
    const summary = toDoctorSummary(row());
    expect(summary.clinic).not.toHaveProperty('taxId');
    expect(summary.clinic).not.toHaveProperty('registrationNumber');
  });

  it('copies the private identifiers of a private-select row', () => {
    const summary = toDoctorSummary(
      row({
        dentistProfile: {
          ...clinic,
          taxId: '1234567/A/M/000',
          registrationNumber: null,
        },
      }),
    );
    expect(summary.clinic).toMatchObject({
      taxId: '1234567/A/M/000',
      registrationNumber: null,
    });
  });

  it('has no practice when the profile is missing or soft-deleted', () => {
    expect(toDoctorSummary(row({ dentistProfile: null })).clinic).toBeNull();
    const deleted = toDoctorSummary(
      row({
        dentistProfile: { ...clinic, deletedAt: new Date('2026-10-01') },
      }),
    );
    expect(deleted.clinic).toBeNull();
    // ... and the contact falls back to the account.
    expect(deleted.contactPhone).toBe('+21650000000');
    expect(deleted.contactEmail).toBe('amel@example.tn');
  });
});

describe('toDoctorPublicIdentity', () => {
  it('keeps only the name and the practice name', () => {
    expect(
      toDoctorPublicIdentity({
        fullName: ' Dr Amel Ben Salah ',
        dentistProfile: { clinicName: 'Cabinet Les Berges', deletedAt: null },
      }),
    ).toEqual({
      fullName: 'Dr Amel Ben Salah',
      clinicName: 'Cabinet Les Berges',
    });
  });

  it('drops a deleted practice and answers undefined without a doctor', () => {
    expect(
      toDoctorPublicIdentity({
        fullName: 'Dr Amel Ben Salah',
        dentistProfile: {
          clinicName: 'Cabinet Les Berges',
          deletedAt: new Date('2026-10-01'),
        },
      }),
    ).toEqual({ fullName: 'Dr Amel Ben Salah', clinicName: null });
    expect(toDoctorPublicIdentity(null)).toBeUndefined();
  });
});

describe('selects', () => {
  // Leak guard of production (production.constants.ts PRODUCTION_FORBIDDEN_KEY):
  // the name-only select must never read a contact column.
  const FORBIDDEN = /phone|email|address/i;
  const keysOf = (select: object): string[] =>
    Object.entries(select).flatMap(([key, value]: [string, unknown]) =>
      value && typeof value === 'object' && 'select' in value
        ? [key, ...keysOf((value as { select: object }).select)]
        : [key],
    );

  it('reads no contact column for production or anonymous pages', () => {
    expect(keysOf(DOCTOR_NAME_SELECT).filter((k) => FORBIDDEN.test(k))).toEqual(
      [],
    );
    expect(
      keysOf(DOCTOR_PUBLIC_SELECT).filter((k) => FORBIDDEN.test(k)),
    ).toEqual([]);
  });

  it('reads the private identifiers only in the private select', () => {
    expect(keysOf(DOCTOR_SUMMARY_SELECT)).not.toContain('taxId');
    expect(keysOf(DOCTOR_SUMMARY_SELECT)).not.toContain('registrationNumber');
    expect(keysOf(DOCTOR_SUMMARY_PRIVATE_SELECT)).toEqual(
      expect.arrayContaining(['taxId', 'registrationNumber']),
    );
  });
});
