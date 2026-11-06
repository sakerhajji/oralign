import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * The payments desk (app/dashboard/payments/history, components/payments/
 * history) and the one payment status vocabulary every payments screen
 * shows (components/payments/payment-status-badge.tsx) — spread into dict
 * (`...paymentsDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 *
 * The vocabulary is the PDF report's too (backend payments-report.i18n):
 * a status, a method or a period reads the same on screen and on paper.
 */
export const paymentsDeskDomainDict = {
  paymentsDesk: {
    title: { en: 'Payment history', fr: 'Historique des paiements' } as T,
    subtitle: {
      en: 'View, filter and export every recorded payment.',
      fr: 'Consultez, filtrez et exportez l’ensemble des paiements enregistrés.',
    } as T,
    // "Label :" in French (a space before the colon), "Label:" in English.
    colon: { en: '{label}:', fr: '{label} :' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    // Beside the refresh button: when the figures on screen were fetched.
    updatedAt: { en: 'Updated {time}', fr: 'Mis à jour à {time}' } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,

    // PaymentRecordStatus → the badge's label. Masculine in French: the
    // noun is "un paiement".
    status: {
      success: { en: 'Successful', fr: 'Succès' } as T,
      awaiting_confirmation: { en: 'To be confirmed', fr: 'À confirmer' } as T,
      pending: { en: 'Pending', fr: 'En attente' } as T,
      unknown: { en: 'Verification required', fr: 'Vérification requise' } as T,
      failed: { en: 'Failed', fr: 'Échoué' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulé' } as T,
      expired: { en: 'Expired', fr: 'Expiré' } as T,
    },
    // Short, for the table cells and the filters.
    method: {
      cash: { en: 'Cash', fr: 'Espèces' } as T,
      card: { en: 'Card', fr: 'Carte' } as T,
      bank_transfer: { en: 'Bank transfer', fr: 'Virement' } as T,
    },
    // Full, for the takings cards (as the PDF summary names them).
    methodLong: {
      cash: { en: 'Cash', fr: 'Espèces' } as T,
      card: { en: 'Bank card', fr: 'Carte bancaire' } as T,
      bank_transfer: { en: 'Bank transfer', fr: 'Virement bancaire' } as T,
    },

    // The global date filter: it drives the cards and both tabs.
    period: {
      label: { en: 'Period', fr: 'Période' } as T,
      aria: { en: 'Reporting period', fr: 'Période du rapport' } as T,
      today: { en: 'Today', fr: 'Aujourd’hui' } as T,
      yesterday: { en: 'Yesterday', fr: 'Hier' } as T,
      '7d': { en: 'Last 7 days', fr: '7 derniers jours' } as T,
      '30d': { en: 'Last 30 days', fr: '30 derniers jours' } as T,
      month: { en: 'This month', fr: 'Ce mois' } as T,
      lastMonth: { en: 'Previous month', fr: 'Mois précédent' } as T,
      custom: { en: 'Custom range', fr: 'Période personnalisée' } as T,
      all: { en: 'All dates', fr: 'Toutes les dates' } as T,
      from: { en: 'From', fr: 'Du' } as T,
      to: { en: 'To', fr: 'Au' } as T,
      fromAria: { en: 'Start date', fr: 'Date de début' } as T,
      toAria: { en: 'End date', fr: 'Date de fin' } as T,
      apply: { en: 'Apply', fr: 'Appliquer' } as T,
      reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
      customHint: {
        en: 'Both days are included, in Tunis time.',
        fr: 'Les deux dates sont incluses, à l’heure de Tunis.',
      } as T,
      errors: {
        missingFrom: { en: 'Choose a start date.', fr: 'Choisissez une date de début.' } as T,
        missingTo: { en: 'Choose an end date.', fr: 'Choisissez une date de fin.' } as T,
        invalid: { en: 'Enter a valid date.', fr: 'Saisissez une date valide.' } as T,
        tooEarly: {
          en: 'Choose a date from 1 January 2020 on.',
          fr: 'Choisissez une date à partir du 1er janvier 2020.',
        } as T,
        endBeforeStart: {
          en: 'The end date cannot be before the start date.',
          fr: 'La date de fin ne peut pas précéder la date de début.',
        } as T,
      },
      // The active period, in words, under the filter.
      active: { en: 'Period: {range}', fr: 'Période : {range}' } as T,
      day: { en: '{date}', fr: '{date}' } as T,
      range: { en: '{from} – {to}', fr: 'du {from} au {to}' } as T,
      allUpTo: {
        en: 'all dates, up to {date}',
        fr: 'toutes les dates, jusqu’au {date}',
      } as T,
    },

    // The figures over the tabs: the money received, by method. An admin
    // received it; a dentist paid it.
    takings: {
      admin: {
        title: { en: 'Collected', fr: 'Encaissé' } as T,
        total: { en: 'Total collected', fr: 'Total encaissé' } as T,
      },
      dentist: {
        title: { en: 'Paid', fr: 'Réglé' } as T,
        total: { en: 'Total paid', fr: 'Total réglé' } as T,
      },
      count: { en: '{count} payments', fr: '{count} paiements' } as T,
      countOne: { en: '1 payment', fr: '1 paiement' } as T,
      countNone: { en: 'No payment', fr: 'Aucun paiement' } as T,
      note: {
        en: 'Successful payments only, both kinds together. The filters of the tabs do not change these figures.',
        fr: 'Paiements réussis uniquement, toutes catégories confondues. Les filtres des onglets ne modifient pas ces montants.',
      } as T,
      error: { en: 'Couldn’t load the totals.', fr: 'Impossible de charger les totaux.' } as T,
    },

    tabs: {
      aria: { en: 'Kind of payment', fr: 'Type de paiement' } as T,
      fees: { en: 'Treatment fees', fr: 'Honoraires de traitement' } as T,
      installments: { en: 'Installment payments', fr: 'Paiements échelonnés' } as T,
    },

    filters: {
      searchPhAdmin: {
        en: 'Practitioner, patient, order or reference…',
        fr: 'Praticien, patient, commande ou référence…',
      } as T,
      searchPhDentist: {
        en: 'Patient, order or reference…',
        fr: 'Patient, commande ou référence…',
      } as T,
      searchAriaFees: {
        en: 'Search the treatment fees',
        fr: 'Rechercher dans les honoraires de traitement',
      } as T,
      searchAriaInstallments: {
        en: 'Search the installment payments',
        fr: 'Rechercher dans les paiements échelonnés',
      } as T,
      practitioner: { en: 'Practitioner', fr: 'Praticien' } as T,
      practitionerAll: { en: 'All practitioners', fr: 'Tous les praticiens' } as T,
      practitionerNone: {
        en: 'No practitioner found',
        fr: 'Aucun praticien trouvé',
      } as T,
      practitionerUnlisted: { en: 'Selected practitioner', fr: 'Praticien sélectionné' } as T,
      more: { en: 'Filters', fr: 'Filtres' } as T,
      moreAria: { en: 'More filters ({count} on)', fr: 'Plus de filtres ({count} actifs)' } as T,
      moreTitle: { en: 'Filter the list', fr: 'Filtrer la liste' } as T,
      method: { en: 'Payment method', fr: 'Mode de paiement' } as T,
      methodAll: { en: 'All', fr: 'Tous' } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      statusAll: { en: 'All statuses', fr: 'Tous les statuts' } as T,
      rank: { en: 'Installment', fr: 'Échéance' } as T,
      rankAll: { en: 'All', fr: 'Toutes' } as T,
      rank1: { en: '1st', fr: '1re' } as T,
      rank2: { en: '2nd', fr: '2e' } as T,
      rank3: { en: '3rd', fr: '3e' } as T,
      rank4: { en: '4th and later', fr: '4e et suivantes' } as T,
      rankChip: {
        '1': { en: '1st installment', fr: '1re échéance' } as T,
        '2': { en: '2nd installment', fr: '2e échéance' } as T,
        '3': { en: '3rd installment', fr: '3e échéance' } as T,
        '4+': { en: '4th installment and later', fr: '4e échéance et suivantes' } as T,
      },
      done: { en: 'Done', fr: 'Terminé' } as T,
      clear: { en: 'Reset filters', fr: 'Réinitialiser les filtres' } as T,
      activeAria: { en: 'Active filters', fr: 'Filtres actifs' } as T,
      // A filter and its value, on a chip and in the export summary.
      chip: { en: '{label}: {value}', fr: '{label} : {value}' } as T,
      chipSearch: { en: 'Search: “{value}”', fr: 'Recherche : « {value} »' } as T,
      chipRemove: { en: 'Remove the filter {label}', fr: 'Retirer le filtre {label}' } as T,
    },
    sort: {
      label: { en: 'Sort by', fr: 'Trier par' } as T,
      recent: { en: 'Newest first', fr: 'Plus récents' } as T,
      oldest: { en: 'Oldest first', fr: 'Plus anciens' } as T,
      amountDesc: { en: 'Highest amount', fr: 'Montant décroissant' } as T,
      amountAsc: { en: 'Lowest amount', fr: 'Montant croissant' } as T,
    },

    list: {
      captionInstallments: { en: 'Installment payments', fr: 'Paiements échelonnés' } as T,
      captionFees: { en: 'Treatment fees', fr: 'Honoraires de traitement' } as T,
      colDate: { en: 'Date', fr: 'Date' } as T,
      colDentist: { en: 'Practitioner', fr: 'Praticien' } as T,
      colPatientOrder: { en: 'Patient · order', fr: 'Patient · commande' } as T,
      colInstallment: { en: 'Installment', fr: 'Échéance' } as T,
      colMethod: { en: 'Method', fr: 'Mode' } as T,
      colStatus: { en: 'Status', fr: 'Statut' } as T,
      colAmount: { en: 'Amount', fr: 'Montant' } as T,
      colReceipt: { en: 'Receipt', fr: 'Reçu' } as T,
      installmentNo: { en: 'No. {n}', fr: 'n° {n}' } as T,
      installmentInline: { en: 'installment {n}', fr: 'échéance {n}' } as T,
      // The date of a fee still to confirm: it has none yet.
      toConfirm: { en: 'To be confirmed', fr: 'À confirmer' } as T,
      viewReceipt: { en: 'View receipt', fr: 'Voir le reçu' } as T,
      receiptAria: { en: 'Open receipt {number}', fr: 'Ouvrir le reçu {number}' } as T,
      proofAria: {
        en: 'View the transfer proof',
        fr: 'Voir le justificatif du virement',
      } as T,
      // What a tap on a phone row opens (read by screen readers; the row
      // shows a chevron).
      actionReceipt: { en: 'Open the receipt', fr: 'Ouvrir le reçu' } as T,
      actionProof: { en: 'View the transfer proof', fr: 'Voir le justificatif' } as T,
      actionOrder: { en: 'Open the order', fr: 'Ouvrir la commande' } as T,
      // The proof viewer of an installment transfer, for an admin: it is
      // confirmed from the confirmation queue.
      confirmInQueue: { en: 'Confirm in the queue', fr: 'Confirmer dans la file d’attente' } as T,
      // Over the fees list when a period hides the fees still to confirm.
      // Only a bank transfer waits for confirmation, and "frais" has no
      // singular in French: the note counts transfers.
      undatedFeesOne: {
        en: '1 transfer to confirm has no payment date yet, so no period shows it.',
        fr: '1 virement à confirmer n’a pas encore de date de paiement : aucune période ne l’affiche.',
      } as T,
      undatedFeesMany: {
        en: '{count} transfers to confirm have no payment date yet, so no period shows them.',
        fr: '{count} virements à confirmer n’ont pas encore de date de paiement : aucune période ne les affiche.',
      } as T,
    },

    empty: {
      noMatch: {
        en: 'No payments found for the selected criteria.',
        fr: 'Aucun paiement trouvé pour les critères sélectionnés.',
      } as T,
      noMatchPeriod: {
        en: 'Choose another period, or show every date.',
        fr: 'Choisissez une autre période ou affichez toutes les dates.',
      } as T,
      noMatchFilters: {
        en: 'Change the search or the filters of this tab, or reset them.',
        fr: 'Modifiez la recherche ou les filtres de cet onglet, ou réinitialisez-les.',
      } as T,
      installmentsTitle: {
        en: 'No installment payments yet',
        fr: 'Aucun paiement échelonné pour l’instant',
      } as T,
      installmentsBodyAdmin: {
        en: 'Quote installments paid by card, in cash or by bank transfer show up here.',
        fr: 'Les échéances de devis réglées par carte, en espèces ou par virement apparaissent ici.',
      } as T,
      installmentsBodyDentist: {
        en: 'Your installment payments and their receipts will show up here.',
        fr: 'Vos paiements d’échéances et leurs reçus apparaîtront ici.',
      } as T,
      feesTitle: {
        en: 'No treatment fees yet',
        fr: 'Aucun honoraire de traitement pour l’instant',
      } as T,
      feesBodyAdmin: {
        en: 'Treatment fees paid or waiting for confirmation show up here.',
        fr: 'Les honoraires de traitement réglés ou à confirmer apparaissent ici.',
      } as T,
      feesBodyDentist: {
        en: 'The treatment fees of your orders and their receipts will show up here.',
        fr: 'Les honoraires de traitement de vos commandes et leurs reçus apparaîtront ici.',
      } as T,
      // "To be confirmed" with a period on the fees tab: such a fee has
      // no payment date, so no period can hold it.
      undatedTitle: {
        en: 'Fees to confirm have no date yet',
        fr: 'Les honoraires à confirmer n’ont pas encore de date',
      } as T,
      undatedBody: {
        en: 'Until their transfer is confirmed, these fees have no payment date: they only show with “All dates”.',
        fr: 'Tant que leur virement n’est pas confirmé, ces honoraires n’ont pas de date de paiement : ils n’apparaissent qu’avec « Toutes les dates ».',
      } as T,
      errorTitle: {
        en: 'Couldn’t load the payments',
        fr: 'Impossible de charger les paiements',
      } as T,
    },

    // The PDF report: built on the server from every matching row.
    report: {
      export: { en: 'Export PDF report', fr: 'Exporter le rapport PDF' } as T,
      exportShort: { en: 'PDF report', fr: 'Rapport PDF' } as T,
      title: { en: 'Export the payments report', fr: 'Exporter le rapport des paiements' } as T,
      description: {
        en: 'A branded PDF of every payment matching the period and the filters on screen — all pages, not only the one displayed.',
        fr: 'Un PDF aux couleurs d’Oralign de tous les paiements correspondant à la période et aux filtres affichés — toutes les pages, pas seulement celle affichée.',
      } as T,
      scope: { en: 'Report content', fr: 'Contenu du rapport' } as T,
      scopeFees: { en: 'Treatment fees', fr: 'Honoraires de traitement' } as T,
      scopeInstallments: { en: 'Installment payments', fr: 'Paiements échelonnés' } as T,
      scopeConsolidated: { en: 'Consolidated report', fr: 'Rapport consolidé' } as T,
      scopeConsolidatedHint: {
        en: 'Both kinds, each with its own tab’s filters, and an overall total.',
        fr: 'Les deux catégories, chacune avec les filtres de son onglet, et un total général.',
      } as T,
      rows: { en: '{count} rows', fr: '{count} lignes' } as T,
      rowsOne: { en: '1 row', fr: '1 ligne' } as T,
      rowsNone: { en: 'no rows', fr: 'aucune ligne' } as T,
      language: { en: 'Report language', fr: 'Langue du rapport' } as T,
      french: { en: 'French', fr: 'Français' } as T,
      english: { en: 'English', fr: 'Anglais' } as T,
      criteria: { en: 'Applied criteria', fr: 'Critères appliqués' } as T,
      noFilter: { en: 'No filter', fr: 'Aucun filtre' } as T,
      note: {
        en: 'Only successful payments count in the collected totals.',
        fr: 'Seuls les paiements réussis sont comptés dans les totaux encaissés.',
      } as T,
      download: { en: 'Download PDF', fr: 'Télécharger PDF' } as T,
      print: { en: 'Print', fr: 'Imprimer' } as T,
      generating: { en: 'Generating the report…', fr: 'Génération du rapport…' } as T,
      downloaded: { en: 'Report downloaded: {name}', fr: 'Rapport téléchargé : {name}' } as T,
      errors: {
        tooLarge: {
          en: 'This report would hold more than 5,000 payments. Narrow the period or add filters.',
          fr: 'Ce rapport dépasserait 5 000 paiements. Réduisez la période ou ajoutez des filtres.',
        } as T,
        generic: {
          en: 'Couldn’t generate the report. Please try again.',
          fr: 'Impossible de générer le rapport. Veuillez réessayer.',
        } as T,
      },
    },

    noAccess: {
      title: {
        en: 'Payments are handled by dentists and administrators',
        fr: 'Les paiements sont gérés par les praticiens et les administrateurs',
      } as T,
      body: {
        en: 'Your role doesn’t give access to payments.',
        fr: 'Votre rôle ne donne pas accès aux paiements.',
      } as T,
    },
  },
};
