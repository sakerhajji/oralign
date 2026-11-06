import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Strings of the shared list controls in components/shared (search box,
 * pagination), used by every dashboard list screen — spread into dict
 * (`...listUiDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
export const listUiDomainDict = {
  listUi: {
    search: {
      clear: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
      updating: { en: 'Updating results…', fr: 'Mise à jour des résultats…' } as T,
    },
    pagination: {
      aria: { en: 'Pagination', fr: 'Pagination' } as T,
      showing: {
        en: 'Showing {from} to {to} of {total} results',
        fr: 'Affichage de {from} à {to} sur {total} résultats',
      } as T,
      previous: { en: 'Previous', fr: 'Précédent' } as T,
      next: { en: 'Next', fr: 'Suivant' } as T,
      goTo: { en: 'Go to page {page}', fr: 'Aller à la page {page}' } as T,
      pageOf: { en: '{page} / {total}', fr: '{page} / {total}' } as T,
    },
    // A custom range of days (day-range-form.tsx), both days included.
    range: {
      from: { en: 'From', fr: 'Du' } as T,
      to: { en: 'To', fr: 'Au' } as T,
      fromAria: { en: 'Start date', fr: 'Date de début' } as T,
      toAria: { en: 'End date', fr: 'Date de fin' } as T,
      apply: { en: 'Apply', fr: 'Appliquer' } as T,
      reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
      hint: { en: 'Both days are included.', fr: 'Les deux jours sont inclus.' } as T,
      errors: {
        missingFrom: { en: 'Enter the start date.', fr: 'Indiquez la date de début.' } as T,
        missingTo: { en: 'Enter the end date.', fr: 'Indiquez la date de fin.' } as T,
        invalid: { en: 'This date does not exist.', fr: 'Cette date n’existe pas.' } as T,
        tooEarly: {
          en: 'Choose a date from 1 January 2020 on.',
          fr: 'Choisissez une date à partir du 1er janvier 2020.',
        } as T,
        endBeforeStart: {
          en: 'The end date comes before the start date.',
          fr: 'La date de fin précède la date de début.',
        } as T,
      },
    },
    // The searchable dentist filter (dentist-filter.tsx), admins only.
    dentist: {
      none: { en: 'No dentist matches', fr: 'Aucun praticien ne correspond' } as T,
      unlisted: { en: 'Selected dentist', fr: 'Praticien sélectionné' } as T,
      named: { en: '{label}: {value}', fr: '{label} : {value}' } as T,
    },
  },
};
