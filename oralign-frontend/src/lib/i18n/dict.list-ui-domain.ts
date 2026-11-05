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
  },
};
