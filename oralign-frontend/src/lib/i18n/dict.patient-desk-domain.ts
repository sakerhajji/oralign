import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Patient forms (phone with country), order-wizard metadata labels, native gift note/detail texts —
 * spread into dict (`...patientDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
export const patientDeskDomainDict = {
  patientDesk: {
    // components/ui/phone-input.tsx — country picker
    phone: {
      searchNotFound: { en: 'No country found', fr: 'Aucun pays trouvé' } as T,
    },
    // createPatientSchema messages are these keys; the patient sheet and
    // the order wizard's inline form translate them where they render.
    validation: {
      fullName: {
        en: 'Patient name must be at least 2 characters.',
        fr: 'Le nom du patient doit contenir au moins 2 caractères.',
      } as T,
      email: { en: 'Invalid email address.', fr: 'Adresse e-mail invalide.' } as T,
      phone: {
        en: 'Enter a complete phone number with its country code (e.g. +216 22 123 456).',
        fr: 'Saisissez un numéro complet avec son indicatif (ex. +216 22 123 456).',
      } as T,
      otherDetail: {
        en: 'The detail must be 500 characters or fewer.',
        fr: 'Le détail doit contenir 500 caractères au maximum.',
      } as T,
    },
    // Order wizard, review step — "Order metadata" section
    wizardMeta: {
      status: { en: 'Status', fr: 'Statut' } as T,
      draftNotSaved: { en: 'Draft not saved yet', fr: 'Brouillon non enregistré' } as T,
    },
  },
};
