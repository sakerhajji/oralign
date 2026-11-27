import type { Prisma } from '@prisma/client';
import { doctorContact } from './doctor-identity';

/**
 * Doctor billing snapshot (spec §6): what a financial document (a devis,
 * a facture) freezes about the practitioner it is addressed to, built in
 * ONE place from the live User + DentistProfile rows.
 *
 * Live screens read the doctor through `doctor-identity.ts`; documents
 * keep a copy taken at issue time instead, so renaming a practice or
 * moving it never rewrites a facture already issued. The three writers
 * (QuotationService on draft -> sent, InvoiceAutoService, the manual
 * InvoiceService.create) all go through `buildDoctorBillingSnapshot`, and
 * the contact they print follows THE contact rule (`doctorContact`): the
 * practice phone and e-mail first, the account ones as fallback.
 *
 * The registration number is snapshotted but never printed (DECISIONS §6:
 * private like the tax id until the owner decides otherwise).
 */

/** Everything a document snapshot reads about the doctor, in one select. */
export const DOCTOR_BILLING_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  dentistProfile: {
    select: {
      clinicName: true,
      clinicAddress: true,
      city: true,
      country: true,
      clinicPhone: true,
      clinicEmail: true,
      taxId: true,
      registrationNumber: true,
      logoUrl: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type DoctorBillingRow = Prisma.UserGetPayload<{
  select: typeof DOCTOR_BILLING_SELECT;
}>;

/**
 * The structural input of the builder: a row read with
 * DOCTOR_BILLING_SELECT, or any wider select. Columns a caller did not
 * read count as empty.
 */
export interface DoctorBillingSource {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  dentistProfile?: {
    clinicName?: string | null;
    clinicAddress?: string | null;
    city?: string | null;
    country?: string | null;
    clinicPhone?: string | null;
    clinicEmail?: string | null;
    taxId?: string | null;
    registrationNumber?: string | null;
    logoUrl?: string | null;
    deletedAt?: Date | null;
  } | null;
}

/** What a document freezes about its practitioner. Blank values are null. */
export interface DoctorBillingSnapshot {
  doctorId: string;
  fullName: string;
  /** The login e-mail and the account phone (personal). */
  accountEmail: string | null;
  accountPhone: string | null;
  /** null when the doctor has no practice profile, or deleted it. */
  clinicName: string | null;
  clinicAddress: string | null;
  city: string | null;
  country: string | null;
  /** The practice's own phone and e-mail, as stored. */
  clinicPhone: string | null;
  clinicEmail: string | null;
  /** The contact a document prints: practice first, account fallback. */
  contactPhone: string | null;
  contactEmail: string | null;
  /** Matricule fiscal (printed on factures and devis). */
  taxId: string | null;
  /** Professional registration number: snapshotted, never printed. */
  registrationNumber: string | null;
  logoUrl: string | null;
}

/** A trimmed, non-empty string, or null. */
function filled(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * THE builder. A soft-deleted practice profile is no practice at all (as
 * on the live screens): the document then carries the account contact
 * only.
 */
export function buildDoctorBillingSnapshot(
  row: DoctorBillingSource,
): DoctorBillingSnapshot {
  const profile =
    row.dentistProfile && !row.dentistProfile.deletedAt
      ? row.dentistProfile
      : null;
  const clinicPhone = filled(profile?.clinicPhone);
  const clinicEmail = filled(profile?.clinicEmail);
  const accountPhone = filled(row.phone);
  const accountEmail = filled(row.email);
  return {
    doctorId: row.id,
    fullName: row.fullName.trim(),
    accountEmail,
    accountPhone,
    clinicName: filled(profile?.clinicName),
    clinicAddress: filled(profile?.clinicAddress),
    city: filled(profile?.city),
    country: filled(profile?.country),
    clinicPhone,
    clinicEmail,
    ...doctorContact(
      { phone: accountPhone, email: accountEmail },
      { clinicPhone, clinicEmail },
    ),
    taxId: filled(profile?.taxId),
    registrationNumber: filled(profile?.registrationNumber),
    logoUrl: filled(profile?.logoUrl),
  };
}

/**
 * True when a client name is the practitioner's own name, the rule the
 * PDF used to apply live and the 2026-11-27 backfill froze: both trimmed
 * like JavaScript's String.prototype.trim, then compared exactly.
 */
export function isPractitionerName(
  clientName: string | null | undefined,
  practitionerName: string | null | undefined,
): boolean {
  const name = filled(practitionerName);
  return name !== null && filled(clientName) === name;
}

/** The client block every invoice stores (Invoice.client*). */
export interface InvoiceClientBlock {
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientCountry: string | null;
  clientTaxId: string | null;
  /** The practice name, printed under "Docteur : X" (practitioner invoices only). */
  clientClinicName: string | null;
  /** Billed to its practitioner in his own name: decided at creation. */
  clientIsPractitioner: boolean;
  /** Snapshot of the registration number (practitioner invoices only, not printed). */
  clientRegistrationNumber: string | null;
}

/** Name printed when an automatic invoice's practitioner is gone. */
export const UNKNOWN_PRACTITIONER_NAME = 'Docteur';

/**
 * The client block of an invoice billed to the practitioner in his own
 * name (every automatic invoice: owner decision, "the customer is the
 * practitioner"). Without a practitioner the block says "Docteur" and is
 * not a practitioner invoice: the PDF then prints the plain name.
 */
export function practitionerInvoiceClient(
  practitioner: DoctorBillingSnapshot | null,
): InvoiceClientBlock {
  if (!practitioner) {
    return {
      clientName: UNKNOWN_PRACTITIONER_NAME,
      clientEmail: null,
      clientPhone: null,
      clientAddress: null,
      clientCity: null,
      clientCountry: null,
      clientTaxId: null,
      clientClinicName: null,
      clientIsPractitioner: false,
      clientRegistrationNumber: null,
    };
  }
  return {
    clientName: practitioner.fullName,
    clientEmail: practitioner.contactEmail,
    clientPhone: practitioner.contactPhone,
    clientAddress: practitioner.clinicAddress,
    clientCity: practitioner.city,
    clientCountry: practitioner.country,
    clientTaxId: practitioner.taxId,
    clientClinicName: practitioner.clinicName,
    clientIsPractitioner: true,
    clientRegistrationNumber: practitioner.registrationNumber,
  };
}

/** What an admin may type in the client block of a manual invoice. */
export interface InvoiceClientInput {
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientCountry?: string | null;
  clientTaxId?: string | null;
}

/**
 * The client block of a manual invoice. A typed value is an override and
 * always wins (a blank one clears the field); a field left out (undefined
 * or null) is filled from the linked practitioner's snapshot, but only
 * when the invoice is billed to that practitioner in his own name (the
 * form sends the practitioner plus the fields the admin changed). An
 * invoice addressed to anyone else (a company, an old patient invoice)
 * keeps exactly what was typed, and carries no practice name nor
 * registration number: the PDF prints its plain name.
 */
export function manualInvoiceClient(
  input: InvoiceClientInput,
  practitioner: DoctorBillingSnapshot | null,
): InvoiceClientBlock {
  const name = filled(input.clientName) ?? practitioner?.fullName ?? '';
  const billsPractitioner =
    practitioner !== null && isPractitionerName(name, practitioner.fullName);
  const from = billsPractitioner
    ? practitionerInvoiceClient(practitioner)
    : null;
  const pick = (
    typed: string | null | undefined,
    snapshot: string | null | undefined,
  ): string | null =>
    typed === undefined || typed === null ? (snapshot ?? null) : filled(typed);
  return {
    clientName: name,
    clientEmail: pick(input.clientEmail, from?.clientEmail),
    clientPhone: pick(input.clientPhone, from?.clientPhone),
    clientAddress: pick(input.clientAddress, from?.clientAddress),
    clientCity: pick(input.clientCity, from?.clientCity),
    clientCountry: pick(input.clientCountry, from?.clientCountry),
    clientTaxId: pick(input.clientTaxId, from?.clientTaxId),
    clientClinicName: from?.clientClinicName ?? null,
    clientIsPractitioner: billsPractitioner,
    clientRegistrationNumber: from?.clientRegistrationNumber ?? null,
  };
}

/**
 * The three snapshot columns of an invoice whose practitioner or client
 * name was edited: re-decided from the (new) practitioner, the rest of the
 * client block staying as typed.
 */
export function invoiceClientSnapshotColumns(
  clientName: string,
  practitioner: DoctorBillingSnapshot | null,
): Pick<
  InvoiceClientBlock,
  'clientClinicName' | 'clientIsPractitioner' | 'clientRegistrationNumber'
> {
  const billsPractitioner =
    practitioner !== null &&
    isPractitionerName(clientName, practitioner.fullName);
  return {
    clientIsPractitioner: billsPractitioner,
    clientClinicName: billsPractitioner ? practitioner.clinicName : null,
    clientRegistrationNumber: billsPractitioner
      ? practitioner.registrationNumber
      : null,
  };
}
