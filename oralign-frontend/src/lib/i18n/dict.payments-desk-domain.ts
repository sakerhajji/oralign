import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * The payments desk (app/dashboard/payments/history, components/payments/
 * history) and the one payment status vocabulary every payments screen
 * shows (components/payments/payment-status-badge.tsx) — spread into dict
 * (`...paymentsDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
export const paymentsDeskDomainDict = {
  paymentsDesk: {
    title: { en: 'Payments', fr: 'Paiements' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    // Beside the refresh button: when the figures on screen were fetched.
    updatedAt: { en: 'Updated {time}', fr: 'Mis à jour à {time}' } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,

    // PaymentRecordStatus → the badge's label. Masculine in French: the
    // noun is "un paiement".
    status: {
      success: { en: 'Paid', fr: 'Payé' } as T,
      awaiting_confirmation: { en: 'To be confirmed', fr: 'À confirmer' } as T,
      pending: { en: 'In progress', fr: 'En cours' } as T,
      unknown: { en: 'Being verified', fr: 'En vérification' } as T,
      failed: { en: 'Failed', fr: 'Échoué' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulé' } as T,
      expired: { en: 'Expired', fr: 'Expiré' } as T,
    },
    method: {
      cash: { en: 'Cash', fr: 'Espèces' } as T,
      card: { en: 'Card', fr: 'Carte' } as T,
      bank_transfer: { en: 'Bank transfer', fr: 'Virement' } as T,
    },

    // The figures over the list: the money received, by method. An admin
    // received it; a dentist paid it.
    takings: {
      admin: {
        today: { en: 'Received today · {date}', fr: 'Encaissé aujourd’hui · {date}' } as T,
        yesterday: { en: 'Received yesterday · {date}', fr: 'Encaissé hier · {date}' } as T,
        day: { en: 'Received on {date}', fr: 'Encaissé le {date}' } as T,
        range: { en: 'Received {range}', fr: 'Encaissé {range}' } as T,
        since: { en: 'Received since {date}', fr: 'Encaissé depuis le {date}' } as T,
        until: { en: 'Received up to {date}', fr: 'Encaissé jusqu’au {date}' } as T,
      },
      dentist: {
        today: { en: 'Paid today · {date}', fr: 'Réglé aujourd’hui · {date}' } as T,
        yesterday: { en: 'Paid yesterday · {date}', fr: 'Réglé hier · {date}' } as T,
        day: { en: 'Paid on {date}', fr: 'Réglé le {date}' } as T,
        range: { en: 'Paid {range}', fr: 'Réglé {range}' } as T,
        since: { en: 'Paid since {date}', fr: 'Réglé depuis le {date}' } as T,
        until: { en: 'Paid up to {date}', fr: 'Réglé jusqu’au {date}' } as T,
      },
      range: { en: '{from} – {to}', fr: 'du {from} au {to}' } as T,
      total: { en: 'Total', fr: 'Total' } as T,
      error: { en: 'Couldn’t load the totals.', fr: 'Impossible de charger les totaux.' } as T,
      // A figure is a toggle that lists its payments below.
      showAria: {
        en: '{label}: {amount} ({count}). Show these payments in the list',
        fr: '{label} : {amount} ({count}). Afficher ces paiements dans la liste',
      } as T,
    },

    tabs: {
      aria: { en: 'Kind of payment', fr: 'Type de paiement' } as T,
      installments: { en: 'Installments', fr: 'Échéances' } as T,
      fees: { en: 'Treatment fees', fr: 'Frais de traitement' } as T,
    },

    filters: {
      // Short enough for a phone's search box. "Ref." covers receipt
      // numbers and gateway references; an amount matches exactly.
      searchPh: {
        en: 'Patient, order, ref. or amount…',
        fr: 'Patient, commande, réf. ou montant…',
      } as T,
      searchAria: { en: 'Search payments', fr: 'Rechercher des paiements' } as T,
      period: { en: 'Period', fr: 'Période' } as T,
      periodAll: { en: 'Any date', fr: 'Toutes les dates' } as T,
      periodToday: { en: 'Today', fr: 'Aujourd’hui' } as T,
      periodYesterday: { en: 'Yesterday', fr: 'Hier' } as T,
      period7d: { en: 'Last 7 days', fr: '7 derniers jours' } as T,
      periodMonth: { en: 'This month', fr: 'Ce mois-ci' } as T,
      periodLastMonth: { en: 'Last month', fr: 'Mois dernier' } as T,
      periodCustom: { en: 'Custom dates', fr: 'Dates personnalisées' } as T,
      from: { en: 'From', fr: 'Du' } as T,
      to: { en: 'To', fr: 'Au' } as T,
      method: { en: 'Payment method', fr: 'Mode de paiement' } as T,
      methodAll: { en: 'All methods', fr: 'Tous les modes' } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      statusAll: { en: 'All statuses', fr: 'Tous les statuts' } as T,
      statusPaid: { en: 'Paid', fr: 'Payés' } as T,
      statusPending: { en: 'Pending', fr: 'En attente' } as T,
      statusFailed: { en: 'Failed or cancelled', fr: 'Échoués ou annulés' } as T,
      statusToConfirm: { en: 'To be confirmed', fr: 'À confirmer' } as T,
      dentist: { en: 'Dentist', fr: 'Praticien' } as T,
      dentistAll: { en: 'All dentists', fr: 'Tous les praticiens' } as T,
      dentistUnlisted: { en: 'Selected dentist', fr: 'Praticien sélectionné' } as T,
      clear: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,
    },
    sort: {
      label: { en: 'Sort', fr: 'Trier' } as T,
      recent: { en: 'Newest first', fr: 'Plus récents' } as T,
      oldest: { en: 'Oldest first', fr: 'Plus anciens' } as T,
      amountDesc: { en: 'Highest amount', fr: 'Montant décroissant' } as T,
      amountAsc: { en: 'Lowest amount', fr: 'Montant croissant' } as T,
    },

    list: {
      captionInstallments: { en: 'Installment payments', fr: 'Paiements des échéances' } as T,
      captionFees: { en: 'Treatment fees', fr: 'Frais de traitement' } as T,
      colDate: { en: 'Date', fr: 'Date' } as T,
      colDentist: { en: 'Dentist', fr: 'Praticien' } as T,
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
      // Only a bank transfer waits for confirmation (cash is recorded by
      // an admin, card settles through ClicToPay), and "frais" has no
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
      // Only a period is set and nothing falls in it.
      periodTitle: { en: 'No payments in this period', fr: 'Aucun paiement sur cette période' } as T,
      filteredTitle: { en: 'No payment matches', fr: 'Aucun paiement ne correspond' } as T,
      filteredBody: {
        en: 'Try another search or clear the filters.',
        fr: 'Essayez une autre recherche ou effacez les filtres.',
      } as T,
      filteredBodyNoSearch: {
        en: 'Change the filters or clear them.',
        fr: 'Changez les filtres ou effacez-les.',
      } as T,
      installmentsTitle: {
        en: 'No installment payments yet',
        fr: 'Aucun paiement d’échéance pour l’instant',
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
        fr: 'Aucun frais de traitement pour l’instant',
      } as T,
      feesBodyAdmin: {
        en: 'Treatment fees paid or waiting for confirmation show up here.',
        fr: 'Les frais de traitement réglés ou à confirmer apparaissent ici.',
      } as T,
      feesBodyDentist: {
        en: 'The treatment fees of your orders and their receipts will show up here.',
        fr: 'Les frais de traitement de vos commandes et leurs reçus apparaîtront ici.',
      } as T,
      // "To be confirmed" with a period on the fees tab: such a fee has
      // no payment date, so no period can hold it.
      undatedTitle: {
        en: 'Fees to confirm have no date yet',
        fr: 'Les frais à confirmer n’ont pas encore de date',
      } as T,
      undatedBody: {
        en: 'Until their transfer is confirmed, these fees have no payment date: they only show with “Any date”.',
        fr: 'Tant que leur virement n’est pas confirmé, ces frais n’ont pas de date de paiement : ils n’apparaissent qu’avec « Toutes les dates ».',
      } as T,
      errorTitle: {
        en: 'Couldn’t load the payments',
        fr: 'Impossible de charger les paiements',
      } as T,
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
