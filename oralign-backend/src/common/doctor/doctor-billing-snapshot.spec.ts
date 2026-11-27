import {
  buildDoctorBillingSnapshot,
  invoiceClientSnapshotColumns,
  isPractitionerName,
  manualInvoiceClient,
  practitionerInvoiceClient,
  type DoctorBillingSource,
} from './doctor-billing-snapshot';

const ROW: DoctorBillingSource = {
  id: 'doc-1',
  fullName: 'Dr Amel Ben Salah',
  email: 'amel@mail.tn',
  phone: '+21620000000',
  dentistProfile: {
    clinicName: 'Cabinet Les Pins',
    clinicAddress: '12 rue des Pins',
    city: 'Tunis',
    country: 'TN',
    clinicPhone: '+21671000000',
    clinicEmail: 'contact@lespins.tn',
    taxId: '1234567/A',
    registrationNumber: 'CNOMDT-42',
    logoUrl: 'dentists/doc-1/logo.png',
    deletedAt: null,
  },
};

const snapshot = (over: Partial<DoctorBillingSource> = {}) =>
  buildDoctorBillingSnapshot({ ...ROW, ...over });

describe('buildDoctorBillingSnapshot', () => {
  it('freezes the practice, the account and the contact rule (practice first)', () => {
    expect(snapshot()).toEqual({
      doctorId: 'doc-1',
      fullName: 'Dr Amel Ben Salah',
      accountEmail: 'amel@mail.tn',
      accountPhone: '+21620000000',
      clinicName: 'Cabinet Les Pins',
      clinicAddress: '12 rue des Pins',
      city: 'Tunis',
      country: 'TN',
      clinicPhone: '+21671000000',
      clinicEmail: 'contact@lespins.tn',
      contactPhone: '+21671000000',
      contactEmail: 'contact@lespins.tn',
      taxId: '1234567/A',
      registrationNumber: 'CNOMDT-42',
      logoUrl: 'dentists/doc-1/logo.png',
    });
  });

  it('falls back to the account contact when the practice has none (blank counts as none)', () => {
    const s = snapshot({
      dentistProfile: {
        ...ROW.dentistProfile!,
        clinicPhone: '  ',
        clinicEmail: null,
      },
    });
    expect(s.contactPhone).toBe('+21620000000');
    expect(s.contactEmail).toBe('amel@mail.tn');
    expect(s.clinicPhone).toBeNull();
  });

  it('a deleted practice profile is no practice: account contact, no clinic, no tax id', () => {
    const s = snapshot({
      dentistProfile: { ...ROW.dentistProfile!, deletedAt: new Date() },
    });
    expect(s.clinicName).toBeNull();
    expect(s.taxId).toBeNull();
    expect(s.registrationNumber).toBeNull();
    expect(s.contactPhone).toBe('+21620000000');
  });

  it('no profile at all, and columns a caller did not select, read as empty', () => {
    const s = buildDoctorBillingSnapshot({ id: 'doc-2', fullName: ' Dr X ' });
    expect(s.fullName).toBe('Dr X');
    expect(s.contactEmail).toBeNull();
    expect(s.clinicName).toBeNull();
  });
});

describe('isPractitionerName (the frozen PDF rule)', () => {
  it('trims both sides, then compares exactly', () => {
    expect(
      isPractitionerName('  Dr Amel Ben Salah\t', 'Dr Amel Ben Salah'),
    ).toBe(true);
    expect(isPractitionerName('Dr Amel Ben Salah ', ' Dr Amel Ben Salah')).toBe(
      true,
    );
    expect(isPractitionerName('dr amel ben salah', 'Dr Amel Ben Salah')).toBe(
      false,
    );
    expect(isPractitionerName('Cabinet Les Pins', 'Dr Amel Ben Salah')).toBe(
      false,
    );
  });

  it('an empty practitioner name never matches', () => {
    expect(isPractitionerName('', '')).toBe(false);
    expect(isPractitionerName('x', '   ')).toBe(false);
    expect(isPractitionerName('x', null)).toBe(false);
  });
});

describe('practitionerInvoiceClient (automatic invoices)', () => {
  it('bills the practitioner in his own name, with his practice and contact', () => {
    expect(practitionerInvoiceClient(snapshot())).toEqual({
      clientName: 'Dr Amel Ben Salah',
      clientEmail: 'contact@lespins.tn',
      clientPhone: '+21671000000',
      clientAddress: '12 rue des Pins',
      clientCity: 'Tunis',
      clientCountry: 'TN',
      clientTaxId: '1234567/A',
      clientClinicName: 'Cabinet Les Pins',
      clientIsPractitioner: true,
      clientRegistrationNumber: 'CNOMDT-42',
    });
  });

  it('without a practitioner: "Docteur", not a practitioner invoice', () => {
    const block = practitionerInvoiceClient(null);
    expect(block.clientName).toBe('Docteur');
    expect(block.clientIsPractitioner).toBe(false);
    expect(block.clientClinicName).toBeNull();
  });
});

describe('manualInvoiceClient (the admin form: practitioner + overrides)', () => {
  it('only the practitioner and his name sent: everything else comes from the snapshot', () => {
    const block = manualInvoiceClient(
      { clientName: 'Dr Amel Ben Salah' },
      snapshot(),
    );
    expect(block).toEqual(practitionerInvoiceClient(snapshot()));
  });

  it('a typed value wins over the snapshot (an override); a blank one clears the field', () => {
    const block = manualInvoiceClient(
      {
        clientName: 'Dr Amel Ben Salah',
        clientEmail: 'compta@lespins.tn',
        clientPhone: '   ',
        clientCity: null,
      },
      snapshot(),
    );
    expect(block.clientEmail).toBe('compta@lespins.tn');
    expect(block.clientPhone).toBeNull();
    // null, like a field left out, takes the snapshot.
    expect(block.clientCity).toBe('Tunis');
    expect(block.clientIsPractitioner).toBe(true);
    expect(block.clientClinicName).toBe('Cabinet Les Pins');
  });

  it('billed under another name (a company): exactly what was typed, no practice, no registration', () => {
    const block = manualInvoiceClient(
      { clientName: 'Clinique Les Pins SARL', clientCity: 'Sfax' },
      snapshot(),
    );
    expect(block).toEqual({
      clientName: 'Clinique Les Pins SARL',
      clientEmail: null,
      clientPhone: null,
      clientAddress: null,
      clientCity: 'Sfax',
      clientCountry: null,
      clientTaxId: null,
      clientClinicName: null,
      clientIsPractitioner: false,
      clientRegistrationNumber: null,
    });
  });

  it('no practitioner linked: a plain client', () => {
    const block = manualInvoiceClient(
      { clientName: 'Labo Externe', clientTaxId: '99/B' },
      null,
    );
    expect(block.clientIsPractitioner).toBe(false);
    expect(block.clientTaxId).toBe('99/B');
  });
});

describe('invoiceClientSnapshotColumns (an edited invoice)', () => {
  it('re-decides the lead from the new name', () => {
    expect(
      invoiceClientSnapshotColumns('Dr Amel Ben Salah', snapshot()),
    ).toEqual({
      clientIsPractitioner: true,
      clientClinicName: 'Cabinet Les Pins',
      clientRegistrationNumber: 'CNOMDT-42',
    });
    expect(invoiceClientSnapshotColumns('Sami Trabelsi', snapshot())).toEqual({
      clientIsPractitioner: false,
      clientClinicName: null,
      clientRegistrationNumber: null,
    });
    expect(
      invoiceClientSnapshotColumns('Dr Amel Ben Salah', null)
        .clientIsPractitioner,
    ).toBe(false);
  });
});
