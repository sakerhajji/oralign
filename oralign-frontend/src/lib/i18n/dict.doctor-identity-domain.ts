/**
 * Doctor identity (spec §6): the optional private registration number of
 * the three clinic forms (/account/clinic, /account/settings, onboarding)
 * and the hints that say which phone a document prints (practice first,
 * account as fallback). Owned by P-F (doctor-identity-freshness).
 *
 * An empty-then-filled, unique top-level namespace (`doctorIdentity`),
 * spread into dict (`...doctorIdentityDomainDict`) by the main dictionary,
 * which shallow-spreads its domains, so no other file may use this key.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
import type { Lang } from './dict';

type T = Record<Lang, string>;

export const doctorIdentityDomainDict = {
  doctorIdentity: {
    registrationNumber: {
      label: {
        en: 'Professional registration number',
        fr: 'Numéro d’inscription à l’Ordre',
      } as T,
      optional: { en: '(optional)', fr: '(facultatif)' } as T,
      placeholder: { en: 'e.g. 1234', fr: 'ex. 1234' } as T,
      help: {
        en: 'Your registration number with the professional order. Private: only you and the Oralign team see it, never the public directory, and it is not printed on your documents.',
        fr: 'Votre numéro d’inscription au Conseil de l’Ordre. Privé : seuls vous et l’équipe Oralign le voyez, jamais l’annuaire public, et il n’est pas imprimé sur vos documents.',
      } as T,
      // The same field in the admin users sheet (Clinic tab).
      adminHelp: {
        en: 'The practitioner’s registration number with the professional order. Private: only the practitioner and the Oralign team see it, never the public directory; it is not printed on documents. Empty the field to remove it.',
        fr: 'Numéro d’inscription du praticien au Conseil de l’Ordre. Privé : seuls le praticien et l’équipe Oralign le voient, jamais l’annuaire public ; il n’est pas imprimé sur les documents. Videz le champ pour le retirer.',
      } as T,
      tooLong: {
        en: '{max} characters at most.',
        fr: '{max} caractères au maximum.',
      } as T,
    },
    contact: {
      accountPhoneHint: {
        en: 'Your personal number. Quotes and invoices print the clinic phone first.',
        fr: 'Votre numéro personnel. Les devis et factures impriment d’abord le téléphone du cabinet.',
      } as T,
      clinicPhoneHint: {
        en: 'Printed on your quotes and invoices (your account phone otherwise).',
        fr: 'Imprimé sur vos devis et factures (à défaut, le téléphone de votre compte).',
      } as T,
    },
  },
};
