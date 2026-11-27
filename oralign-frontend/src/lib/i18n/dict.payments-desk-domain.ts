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
  // The admin pending desk (app/dashboard/payments/pending,
  // components/payments/pending): the merged bank-transfer queue, its
  // review dialog and receipt viewer. Owned by P-B.
  pendingDesk: {
    title: { en: 'Pending payments', fr: 'Paiements en attente' } as T,
    subtitle: {
      en: 'Practitioners’ bank transfers to verify: pack installments and treatment fees.',
      fr: 'Les virements des praticiens à vérifier : échéances de forfait et honoraires de traitement.',
    } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    updatedAt: { en: 'Updated {time}', fr: 'Mis à jour à {time}' } as T,
    historyLink: { en: 'Payment history', fr: 'Historique des paiements' } as T,
    tabs: {
      aria: { en: 'Transfers by state', fr: 'Virements par état' } as T,
      nouveau: { en: 'New', fr: 'Nouveaux' } as T,
      a_verifier: { en: 'To verify', fr: 'À vérifier' } as T,
      valide: { en: 'Confirmed', fr: 'Validés' } as T,
      refuse: { en: 'Rejected', fr: 'Refusés' } as T,
    },
    tabHint: {
      nouveau: {
        en: 'Transfers awaiting confirmation that you have not opened yet.',
        fr: 'Les virements en attente que vous n’avez pas encore ouverts.',
      } as T,
      a_verifier: {
        en: 'Every transfer awaiting confirmation, newest first.',
        fr: 'Tous les virements en attente de confirmation, les plus récents d’abord.',
      } as T,
      recent: {
        en: 'The last {days} days. The full history is in',
        fr: 'Les {days} derniers jours. L’historique complet est dans',
      } as T,
    },
    col: {
      declared: { en: 'Declared', fr: 'Déclaré le' } as T,
      who: { en: 'Patient · practitioner', fr: 'Patient · praticien' } as T,
      subject: { en: 'For', fr: 'Objet' } as T,
      amount: { en: 'Transferred', fr: 'Montant viré' } as T,
      state: { en: 'State', fr: 'État' } as T,
      receipt: { en: 'Receipt', fr: 'Reçu' } as T,
      action: { en: 'Action', fr: 'Action' } as T,
    },
    caption: { en: 'Bank transfers to verify', fr: 'Virements bancaires à vérifier' } as T,
    kind: {
      installment: { en: 'Installment {n}', fr: 'Échéance n°{n}' } as T,
      installmentNoRank: { en: 'Pack installment', fr: 'Échéance de forfait' } as T,
      treatment_fee: { en: 'Treatment fee', fr: 'Honoraires de traitement' } as T,
    },
    seen: {
      new: { en: 'New', fr: 'Nouveau' } as T,
      seen: { en: 'Seen', fr: 'Consulté' } as T,
    },
    receipt: {
      attached: { en: 'Attached', fr: 'Joint' } as T,
      none: { en: 'No receipt', fr: 'Sans reçu' } as T,
    },
    action: {
      review: { en: 'Review', fr: 'Examiner' } as T,
      view: { en: 'View', fr: 'Voir' } as T,
      rowAria: {
        en: 'Open the transfer of {name}',
        fr: 'Ouvrir le virement de {name}',
      } as T,
    },
    processedOn: {
      valide: { en: 'Confirmed {date}', fr: 'Validé le {date}' } as T,
      refuse: { en: 'Rejected {date}', fr: 'Refusé le {date}' } as T,
    },
    empty: {
      nouveau: { en: 'No new transfer', fr: 'Aucun nouveau virement' } as T,
      nouveauBody: {
        en: 'Transfers you have not opened yet appear here.',
        fr: 'Les virements que vous n’avez pas encore ouverts apparaissent ici.',
      } as T,
      a_verifier: { en: 'Nothing to verify', fr: 'Rien à vérifier' } as T,
      a_verifierBody: {
        en: 'No transfer is awaiting confirmation.',
        fr: 'Aucun virement n’attend de confirmation.',
      } as T,
      valide: {
        en: 'No transfer confirmed in the last {days} days',
        fr: 'Aucun virement validé ces {days} derniers jours',
      } as T,
      refuse: {
        en: 'No transfer rejected in the last {days} days',
        fr: 'Aucun virement refusé ces {days} derniers jours',
      } as T,
    },
    loadError: {
      en: 'The transfers could not be loaded',
      fr: 'Impossible de charger les virements',
    } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    noAccess: {
      en: 'This desk is for administrators',
      fr: 'Cet écran est réservé aux administrateurs',
    } as T,
    noAccessBody: {
      en: 'Your payments are in the payment history.',
      fr: 'Vos paiements sont dans l’historique des paiements.',
    } as T,
    staleError: {
      en: 'The list could not be refreshed; it may be out of date.',
      fr: 'La liste n’a pas pu être actualisée ; elle peut ne plus être à jour.',
    } as T,
    // A notification's link to a transfer that is no longer in the queue.
    gone: {
      title: {
        en: 'This transfer is no longer awaiting',
        fr: 'Ce virement n’est plus en attente',
      } as T,
      body: {
        en: 'It is not in the list on screen: it may already have been processed, or the practitioner withdrew or replaced it.',
        fr: 'Il ne figure pas dans la liste affichée : il a peut-être déjà été traité, ou le praticien l’a retiré ou remplacé.',
      } as T,
      // The link named another tab (Validés, Refusés) and the transfer is
      // not in it: nothing is said about its state.
      notInTabTitle: {
        en: 'This transfer is not in this tab',
        fr: 'Ce virement ne figure pas dans cet onglet',
      } as T,
      notInTabBody: {
        en: 'Open “To verify” to see every transfer still awaiting.',
        fr: 'Ouvrez « À vérifier » pour voir tous les virements encore en attente.',
      } as T,
      dismiss: { en: 'Dismiss', fr: 'Masquer' } as T,
    },
    pager: {
      aria: { en: 'Pages of transfers', fr: 'Pages des virements' } as T,
      pageOf: {
        en: 'Page {page} of {total} · {count} transfers',
        fr: 'Page {page} sur {total} · {count} virements',
      } as T,
      previous: { en: 'Previous', fr: 'Précédente' } as T,
      next: { en: 'Next', fr: 'Suivante' } as T,
    },
    review: {
      titleInstallment: {
        en: 'Transfer · installment {n}',
        fr: 'Virement · échéance n°{n}',
      } as T,
      titleInstallmentNoRank: {
        en: 'Transfer · pack installment',
        fr: 'Virement · échéance de forfait',
      } as T,
      titleFee: {
        en: 'Transfer · treatment fee',
        fr: 'Virement · honoraires de traitement',
      } as T,
      order: { en: 'Order {code}', fr: 'Commande {code}' } as T,
      openOrder: { en: 'Open the order', fr: 'Ouvrir la commande' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
      doctor: { en: 'Practitioner', fr: 'Praticien' } as T,
      declaredAt: { en: 'Declared', fr: 'Déclaré le' } as T,
      openedAt: { en: 'First opened', fr: 'Ouvert pour la première fois le' } as T,
      processedValide: { en: 'Confirmed', fr: 'Validé le' } as T,
      processedRefuse: { en: 'Rejected', fr: 'Refusé le' } as T,
      reason: { en: 'Reason given', fr: 'Motif du refus' } as T,
      cash: { en: 'Expected on the statement', fr: 'À trouver sur le relevé' } as T,
      statementHint: {
        en: 'Check that this amount is on the bank statement before confirming.',
        fr: 'Vérifiez que ce montant figure sur le relevé bancaire avant de confirmer.',
      } as T,
      noProofWarning: {
        en: 'No receipt is attached. To confirm anyway, a justification note is required.',
        fr: 'Aucun reçu n’est joint. Pour confirmer quand même, une note justificative est obligatoire.',
      } as T,
      confirm: { en: 'Confirm transfer', fr: 'Confirmer le virement' } as T,
      reject: { en: 'Reject', fr: 'Refuser' } as T,
      close: { en: 'Close', fr: 'Fermer' } as T,
      back: { en: 'Back', fr: 'Retour' } as T,
      confirmTitle: { en: 'Confirm receipt of the money?', fr: 'Confirmer la réception ?' } as T,
      confirmBodyInstallment: {
        en: 'Installment {n} will be marked paid and its step range released. The practitioner is notified.',
        fr: 'L’échéance n°{n} sera marquée payée et sa tranche d’étapes débloquée. Le praticien en est informé.',
      } as T,
      confirmBodyInstallmentNoRank: {
        en: 'The installment will be marked paid and its step range released. The practitioner is notified.',
        fr: 'L’échéance sera marquée payée et sa tranche d’étapes débloquée. Le praticien en est informé.',
      } as T,
      confirmBodyFee: {
        en: 'The treatment fee will be marked paid and the treatment plan can be prepared. The practitioner is notified.',
        fr: 'Les honoraires seront marqués payés et le plan de traitement pourra être préparé. Le praticien en est informé.',
      } as T,
      notesLabel: { en: 'Internal note (optional)', fr: 'Note interne (facultatif)' } as T,
      notesPh: {
        en: 'e.g. matched on the statement of 26/11',
        fr: 'p. ex. rapproché sur le relevé du 26/11',
      } as T,
      notesHelp: {
        en: 'Seen by administrators only.',
        fr: 'Visible par les administrateurs uniquement.',
      } as T,
      overrideLabel: {
        en: 'Justification note (required without a receipt)',
        fr: 'Note justificative (obligatoire sans reçu)',
      } as T,
      overridePh: {
        en: 'e.g. transfer seen on the statement of 26/11, receipt not sent',
        fr: 'p. ex. virement vu sur le relevé du 26/11, reçu non transmis',
      } as T,
      overrideHelp: {
        en: 'Recorded in the order history. Between {min} and {max} characters.',
        fr: 'Consignée dans l’historique de la commande. Entre {min} et {max} caractères.',
      } as T,
      confirmSubmit: { en: 'Confirm', fr: 'Confirmer' } as T,
      rejectLabel: { en: 'Reason for rejection', fr: 'Motif du refus' } as T,
      rejectHelp: {
        en: 'The practitioner reads this reason. Between {min} and {max} characters.',
        fr: 'Le praticien lira ce motif. Entre {min} et {max} caractères.',
      } as T,
      rejectPh: {
        en: 'e.g. the amount does not match the statement',
        fr: 'p. ex. le montant ne correspond pas au relevé',
      } as T,
      rejectSubmit: { en: 'Reject the transfer', fr: 'Refuser le virement' } as T,
      counter: { en: '{count}/{max}', fr: '{count}/{max}' } as T,
      tooShort: { en: 'At least {min} characters.', fr: 'Au moins {min} caractères.' } as T,
      tooLong: { en: 'At most {max} characters.', fr: 'Au plus {max} caractères.' } as T,
      alreadyTitle: { en: 'Already processed', fr: 'Déjà traité' } as T,
      alreadyBody: {
        en: 'Another administrator already processed this transfer, or the practitioner withdrew or replaced it. The list has been refreshed.',
        fr: 'Un autre administrateur a déjà traité ce virement, ou le praticien l’a retiré ou remplacé. La liste a été actualisée.',
      } as T,
      failedTitle: { en: 'The action failed', fr: 'L’action a échoué' } as T,
    },
    viewer: {
      loading: { en: 'Loading the receipt…', fr: 'Chargement du reçu…' } as T,
      noneTitle: { en: 'No receipt attached', fr: 'Aucun reçu joint' } as T,
      noneBody: {
        en: 'This transfer was declared without a receipt.',
        fr: 'Ce virement a été déclaré sans reçu.',
      } as T,
      notFoundTitle: { en: 'Receipt not found', fr: 'Reçu introuvable' } as T,
      notFoundBody: {
        en: 'This receipt is no longer available.',
        fr: 'Ce reçu n’est plus disponible.',
      } as T,
      errorTitle: { en: 'The receipt cannot be shown', fr: 'Impossible d’afficher le reçu' } as T,
      noPreviewTitle: { en: 'No preview', fr: 'Aperçu indisponible' } as T,
      noPreviewBody: {
        en: 'This format cannot be shown here: download the file.',
        fr: 'Ce format ne s’affiche pas ici : téléchargez le fichier.',
      } as T,
      zoom: { en: 'Enlarge', fr: 'Agrandir' } as T,
      openTab: { en: 'Open in a new tab', fr: 'Ouvrir dans un onglet' } as T,
      download: { en: 'Download', fr: 'Télécharger' } as T,
      imgAlt: { en: 'Transfer receipt, order {code}', fr: 'Reçu de virement, commande {code}' } as T,
      iframeTitle: {
        en: 'Transfer receipt (PDF), order {code}',
        fr: 'Reçu de virement (PDF), commande {code}',
      } as T,
      lightboxCaption: { en: 'Receipt · {code}', fr: 'Reçu · {code}' } as T,
      pdfPhoneHint: {
        en: 'On a phone, open the PDF in a tab to read it in full.',
        fr: 'Sur téléphone, ouvrez le PDF dans un onglet pour le lire en entier.',
      } as T,
    },
    toast: {
      confirmed: { en: 'Transfer confirmed', fr: 'Virement confirmé' } as T,
      rejected: {
        en: 'Transfer rejected — the practitioner is notified',
        fr: 'Virement refusé — le praticien est informé',
      } as T,
    },
  },

  // What the sidebar's attention badges say to a screen reader and in their
  // tooltip (components/app-sidebar.tsx → nav-main.tsx). Owned by P-B.
  sidebarBadges: {
    support: { en: '{count} unread', fr: '{count} non lus' } as T,
    orders: { en: '{count} new orders', fr: '{count} nouvelles commandes' } as T,
    users: { en: '{count} accounts to approve', fr: '{count} comptes à approuver' } as T,
    transfers: { en: '{count} new transfers', fr: '{count} nouveaux virements' } as T,
  },

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
      cheque: { en: 'Cheque', fr: 'Chèque' } as T,
    },
    // Full, for the takings cards (as the PDF summary names them).
    methodLong: {
      cash: { en: 'Cash', fr: 'Espèces' } as T,
      card: { en: 'Bank card', fr: 'Carte bancaire' } as T,
      bank_transfer: { en: 'Bank transfer', fr: 'Virement bancaire' } as T,
      cheque: { en: 'Cheque', fr: 'Chèque' } as T,
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
      // When practitioners kept a retenue à la source back (spec §4): the
      // figures above are the net (the cash); brut = net + retenue.
      gross: { en: 'Gross {amount}', fr: 'Brut {amount}' } as T,
      withheld: { en: 'Withholding tax {amount}', fr: 'Retenue {amount}' } as T,
      net: { en: 'Net {amount}', fr: 'Net {amount}' } as T,
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
      colReceipt: { en: 'Invoice', fr: 'Facture' } as T,
      installmentNo: { en: 'No. {n}', fr: 'n° {n}' } as T,
      installmentInline: { en: 'installment {n}', fr: 'échéance {n}' } as T,
      // The date of a fee still to confirm: it has none yet.
      toConfirm: { en: 'To be confirmed', fr: 'À confirmer' } as T,
      viewReceipt: { en: 'View invoice', fr: 'Voir la facture' } as T,
      receiptAria: { en: 'Open invoice {number}', fr: 'Ouvrir la facture {number}' } as T,
      proofAria: {
        en: 'View the transfer proof',
        fr: 'Voir le justificatif du virement',
      } as T,
      // What a tap on a phone row opens (read by screen readers; the row
      // shows a chevron).
      actionReceipt: { en: 'Open the invoice', fr: 'Ouvrir la facture' } as T,
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
        en: 'Your installment payments and their invoices will show up here.',
        fr: 'Vos paiements d’échéances et leurs factures apparaîtront ici.',
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
        en: 'The treatment fees of your orders and their invoices will show up here.',
        fr: 'Les honoraires de traitement de vos commandes et leurs factures apparaîtront ici.',
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

  // What a payment charges — components/payments/withholding.tsx, shared
  // by the payment dialogs and the payments lists. Prices are TTC; the
  // droit de timbre is ADDED to every payment (each payment has its own
  // facture), and the practitioner may keep {rate} % of the TTC (stamp
  // excluded) back as retenue à la source:
  //   à payer = montant TTC + timbre - retenue
  withholdingUi: {
    apply: {
      en: 'Apply the withholding tax ({rate} %)',
      fr: 'Appliquer la retenue à la source ({rate} %)',
    } as T,
    helpPayer: {
      en: 'You keep {rate} % of the amount incl. tax (stamp excluded) and pay it to the tax office yourself. The invoice shows the amount withheld.',
      fr: 'Vous retenez {rate} % du montant TTC (hors timbre) et le reversez vous-même aux impôts. La facture indique la retenue.',
    } as T,
    helpAdmin: {
      en: 'Tick it when the practitioner kept {rate} % of the amount incl. tax (stamp excluded) as withholding tax.',
      fr: 'Cochez si le praticien a retenu {rate} % du montant TTC (hors timbre) au titre de la retenue à la source.',
    } as T,
    // First line of a breakdown: what the payment settles.
    dueInstallment: {
      en: 'Installment amount (incl. tax)',
      fr: 'Montant de l’échéance (TTC)',
    } as T,
    dueInstallments: {
      en: 'Installments amount (incl. tax)',
      fr: 'Montant des échéances (TTC)',
    } as T,
    dueFee: { en: 'Treatment fee (incl. tax)', fr: 'Honoraires (TTC)' } as T,
    // Added to every payment: "Droit de timbre" / "Droit de timbre (3 × 1,000)".
    stamp: { en: 'Stamp duty', fr: 'Droit de timbre' } as T,
    stampTimes: {
      en: 'Stamp duty ({count} × {stamp})',
      fr: 'Droit de timbre ({count} × {stamp})',
    } as T,
    // Under an installment still to pay, in a payment plan.
    stampHint: { en: '+ {stamp} stamp duty', fr: '+ {stamp} de timbre' } as T,
    // A plan's price with one stamp per payment.
    totalWithStamps: {
      en: 'Total to pay (stamp duty included)',
      fr: 'Total à payer (timbres compris)',
    } as T,
    withheld: { en: 'Withholding tax ({rate} %)', fr: 'Retenue à la source ({rate} %)' } as T,
    withheldNoRate: { en: 'Withholding tax', fr: 'Retenue à la source' } as T,
    // Last line: the cash.
    toPay: { en: 'To pay', fr: 'À payer' } as T,
    toTransfer: { en: 'To transfer', fr: 'À virer' } as T,
    // Last line when the admin records cash or a cheque.
    toCollect: { en: 'To collect', fr: 'À encaisser' } as T,
    received: { en: 'Received', fr: 'Encaissé' } as T,
    // Under an amount in the lists: "Échéance 1 000,000" / "Timbre 1,000" /
    // "Retenue 10,000"; the hover text joins them with "Encaissé 991,000".
    dueShortInstallment: { en: 'Installment {amount}', fr: 'Échéance {amount}' } as T,
    dueShortFee: { en: 'Fee {amount}', fr: 'Honoraires {amount}' } as T,
    stampShort: { en: 'Stamp {amount}', fr: 'Timbre {amount}' } as T,
    withheldShort: { en: 'Withheld {amount}', fr: 'Retenue {amount}' } as T,
    receivedShort: { en: 'Received {amount}', fr: 'Encaissé {amount}' } as T,
    // Where a price is announced: prices are TTC, the stamp comes on top.
    ttcNote: {
      en: 'Price incl. tax: {rate} % VAT included. A stamp duty of {stamp} is added to each payment.',
      fr: 'Prix TTC : TVA {rate} % incluse. Droit de timbre {stamp} ajouté à chaque paiement.',
    } as T,
    ttcNoteNoStamp: {
      en: 'Price incl. tax: {rate} % VAT included',
      fr: 'Prix TTC : TVA {rate} % incluse',
    } as T,
    // 409 WITHHOLDING_CHOICE_CONFLICT from a card session (installment or
    // treatment fee). PAYMENT_ATTEMPT_IN_PROGRESS refusals have their own
    // copy (transfers.inFlight.*, lib/payments/payment-refusals.ts).
    choiceConflict: {
      en: 'A card payment is already open for this amount with the other withholding tax choice. Finish it on the payment page you opened, or wait a few minutes for it to expire, then try again.',
      fr: 'Un paiement par carte est déjà ouvert pour ce montant avec un autre choix de retenue à la source. Terminez-le sur la page de paiement déjà ouverte, ou attendez quelques minutes qu’il expire, puis réessayez.',
    } as T,
  },
};
